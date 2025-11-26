import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BaseService } from '../../services/base.service.js';
import { NotFoundError } from '../../lib/errors.js';
import { BillingService } from '../billing/billing.service.js';
import { UsageAggregatorJob } from '../billing/usage-aggregator.job.js';
import { ConflictError } from '../../lib/errors.js';
import { slugify, uniqueSlugAttempt, isValidTenantSlug } from '../../utils/slugify.js';
import type { TwilioService } from '../../services/twilio.service.js';

const mergeSettings = (current: unknown, patch: Record<string, unknown>): Prisma.InputJsonValue => {
  const base = (current && typeof current === 'object' ? (current as Record<string, unknown>) : {}) as Record<string, unknown>;
  return { ...base, ...patch } as Prisma.InputJsonValue;
};

export class AdminService extends BaseService {
  public constructor(
    private readonly billing: BillingService,
    private readonly aggregator: UsageAggregatorJob,
    private readonly twilio: TwilioService
  ) {
    super();
  }

  public listTenants = (params: { page: number; pageSize: number }): Promise<{ data: any[]; total: number }> => {
    return this.execute('admin.tenants.list', async () => {
      const skip = (params.page - 1) * params.pageSize;
      const [rows, total] = await Promise.all([
        prisma.tenant.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: params.pageSize,
          skip,
          select: { id: true, name: true, slug: true, status: true, timezone: true, createdAt: true, updatedAt: true }
        }),
        prisma.tenant.count({ where: { deletedAt: null } })
      ]);
      return { data: rows, total };
    });
  };

  public createTenantOnboarding = (input: {
    name: string;
    email: string;
    plan: string;
    region: string;
  }): Promise<{
    tenant: { id: string; name: string; slug: string; region: string; status: string; createdAt: Date };
    ownerUser: { id: string; email: string; fullName: string; status: string };
    defaultAgent: { id: string; name: string };
    billing: { subscriptionId: string; planCode: string; status: string };
    vector: { namespace: string };
  }> => {
    return this.execute('admin.tenants.create', async () => {
      const email = input.email.trim().toLowerCase();
      const name = input.name.trim();
      const region = input.region.trim();
      const plan = input.plan.trim();

      // Ensure we don't accidentally attach to an existing account.
      const existingEmail = await prisma.user.findFirst({ where: { email, deletedAt: null }, select: { id: true } });
      if (existingEmail) {
        throw new ConflictError('Email is already in use');
      }

      const baseSlug = slugify(name);
      if (!isValidTenantSlug(baseSlug)) {
        throw new ConflictError('Invalid tenant name (cannot derive a valid slug)');
      }

      let attempt = 0;
      let slug = uniqueSlugAttempt(baseSlug, 0);
      for (;;) {
        const taken = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
        if (!taken) break;
        attempt += 1;
        if (attempt > 12) {
          throw new ConflictError('Could not allocate a unique tenant slug');
        }
        slug = uniqueSlugAttempt(baseSlug, attempt);
      }

      const vectorNamespace = `tenant_${slug}`;
      const derivedFullName = (() => {
        const local = email.split('@')[0] ?? 'Owner';
        const cleaned = local
          .replace(/[._-]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        return cleaned ? cleaned.split(' ').slice(0, 3).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') : 'Owner';
      })();

      const now = new Date();
      const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
      const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));

      const created = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name,
            slug,
            region,
            status: 'ACTIVE',
            timezone: 'UTC',
            settings: { plan }
          },
          select: { id: true, name: true, slug: true, region: true, status: true, createdAt: true }
        });

        const ownerUser = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email,
            fullName: derivedFullName || 'Owner',
            passwordHash: null,
            status: 'INVITED',
            isOwner: true,
            isSuperAdmin: false
          },
          select: { id: true, email: true, fullName: true, status: true }
        });

        const defaultAgent = await tx.agent.create({
          data: {
            tenantId: tenant.id,
            name: 'Default Assistant',
            status: 'ACTIVE',
            systemPrompt:
              'You are the default AI voice assistant for this tenant. Be helpful, concise, and stay within the tenant context.',
            temperature: new Prisma.Decimal(0.7),
            voiceConfig: { preset: 'default' },
            vectorNamespace
          },
          select: { id: true, name: true }
        });

        await tx.tenant.update({
          where: { id: tenant.id },
          data: { defaultAgentId: defaultAgent.id }
        });

        const subscription = await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            provider: 'internal',
            externalSubscriptionId: `internal_${tenant.id}`,
            planCode: plan,
            status: 'ACTIVE',
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            metadata: { region }
          },
          select: { id: true, planCode: true, status: true }
        });

        return { tenant, ownerUser, defaultAgent, subscription };
      });

      return {
        tenant: created.tenant,
        ownerUser: created.ownerUser,
        defaultAgent: created.defaultAgent,
        billing: { subscriptionId: created.subscription.id, planCode: created.subscription.planCode, status: created.subscription.status },
        vector: { namespace: vectorNamespace }
      };
    });
  };

  public getTenantDetails = (tenantId: string): Promise<any> => {
    return this.execute('admin.tenants.get', async () => {
      const tenant = await prisma.tenant.findFirst({
        where: { id: tenantId, deletedAt: null },
        include: {
          users: { where: { deletedAt: null }, select: { id: true, email: true, fullName: true, status: true, createdAt: true } }
        }
      });
      if (!tenant) {
        throw new NotFoundError('Tenant not found');
      }

      const summary = await this.billing.getTenantCostSummary(tenantId);
      const range = (() => {
        const now = new Date();
        const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
        const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
        return { from, to };
      })();
      const aggregated = await this.aggregator.runForTenant({ tenantId, ...range });

      return { tenant, billingSummary: summary, usage: aggregated };
    });
  };

  public patchTenant = (tenantId: string, patch: { status?: string; plan?: string; pricing?: any; limits?: any }): Promise<any> => {
    return this.execute('admin.tenants.patch', async () => {
      const existing = await prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null }, select: { settings: true } });
      if (!existing) {
        throw new NotFoundError('Tenant not found');
      }

      const settingsPatch: Record<string, unknown> = {};
      if (patch.plan) {
        settingsPatch['plan'] = patch.plan;
      }
      if (patch.pricing) {
        settingsPatch['pricing'] = patch.pricing;
      }
      if (patch.limits) {
        settingsPatch['limits'] = patch.limits;
      }

      const updated = await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          ...(patch.status ? { status: patch.status as any } : {}),
          ...(Object.keys(settingsPatch).length ? { settings: mergeSettings(existing.settings, settingsPatch) } : {})
        },
        select: { id: true, name: true, slug: true, status: true, settings: true, updatedAt: true }
      });
      return updated;
    });
  };

  public listUsers = (params: { page: number; pageSize: number; tenantId?: string }): Promise<{ data: any[]; total: number }> => {
    return this.execute('admin.users.list', async () => {
      const skip = (params.page - 1) * params.pageSize;
      const where: Prisma.UserWhereInput = { deletedAt: null, ...(params.tenantId ? { tenantId: params.tenantId } : {}) };
      const [rows, total] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: params.pageSize,
          skip,
          select: { id: true, tenantId: true, email: true, fullName: true, status: true, isOwner: true, createdAt: true }
        }),
        prisma.user.count({ where })
      ]);
      return { data: rows, total };
    });
  };

  public patchUser = (userId: string, patch: { status?: string }): Promise<any> => {
    return this.execute('admin.users.patch', async () => {
      const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true, tenantId: true } });
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(patch.status ? { status: patch.status as any } : {})
        },
        select: { id: true, tenantId: true, email: true, fullName: true, status: true }
      });
      return updated;
    });
  };

  public listCalls = (params: { page: number; pageSize: number; tenantId?: string; status?: string; from?: Date; to?: Date }): Promise<{ data: any[]; total: number }> => {
    return this.execute('admin.calls.list', async () => {
      const skip = (params.page - 1) * params.pageSize;
      const where: Prisma.CallSessionWhereInput = {
        deletedAt: null,
        ...(params.tenantId ? { tenantId: params.tenantId } : {}),
        ...(params.status ? { status: params.status as any } : {}),
        ...(params.from || params.to ? { createdAt: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) } } : {})
      };

      const [rows, total] = await Promise.all([
        prisma.callSession.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: params.pageSize,
          skip,
          select: { id: true, tenantId: true, direction: true, status: true, fromNumber: true, toNumber: true, twilioCallSid: true, livekitRoomName: true, durationSeconds: true, createdAt: true }
        }),
        prisma.callSession.count({ where })
      ]);
      return { data: rows, total };
    });
  };

  public getCallDetails = (callSessionId: string): Promise<any> => {
    return this.execute('admin.calls.get', async () => {
      const call = await prisma.callSession.findFirst({ where: { id: callSessionId, deletedAt: null } });
      if (!call) {
        throw new NotFoundError('Call not found');
      }
      const eventsTimeline = await prisma.callEvent.findMany({
        where: { callSessionId: call.id },
        orderBy: { eventTimestamp: 'asc' }
      });
      const transcript = eventsTimeline.filter((e) => e.eventType === 'TRANSCRIPT_SEGMENT');
      const billing = await this.billing.getCallCost(call.tenantId, call.id);
      return { call, timeline: eventsTimeline, transcript, cost: billing };
    });
  };

  public listAgents = (params: { page: number; pageSize: number; tenantId?: string }): Promise<{ data: any[]; total: number }> => {
    return this.execute('admin.agents.list', async () => {
      const skip = (params.page - 1) * params.pageSize;
      const where: Prisma.AgentWhereInput = { deletedAt: null, ...(params.tenantId ? { tenantId: params.tenantId } : {}) };
      const [rows, total] = await Promise.all([
        prisma.agent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: params.pageSize,
          skip,
          select: { id: true, tenantId: true, name: true, status: true, temperature: true, createdAt: true, updatedAt: true }
        }),
        prisma.agent.count({ where })
      ]);
      return { data: rows, total };
    });
  };

  public getAgentDetails = (agentId: string): Promise<any> => {
    return this.execute('admin.agents.get', async () => {
      const agent = await prisma.agent.findFirst({
        where: { id: agentId, deletedAt: null },
        select: { id: true, tenantId: true, name: true, status: true, systemPrompt: true, temperature: true, voiceConfig: true, toolConfig: true, providerConfig: true, updatedAt: true, createdAt: true }
      });
      if (!agent) {
        throw new NotFoundError('Agent not found');
      }
      return agent;
    });
  };

  public patchAgent = (agentId: string, patch: { status?: string; systemPrompt?: string; temperature?: number }): Promise<any> => {
    return this.execute('admin.agents.patch', async () => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, deletedAt: null }, select: { id: true } });
      if (!agent) {
        throw new NotFoundError('Agent not found');
      }
      const updated = await prisma.agent.update({
        where: { id: agentId },
        data: {
          ...(patch.status ? { status: patch.status as any } : {}),
          ...(patch.systemPrompt ? { systemPrompt: patch.systemPrompt } : {}),
          ...(patch.temperature !== undefined ? { temperature: new Prisma.Decimal(patch.temperature) } : {})
        },
        select: { id: true, tenantId: true, name: true, status: true, systemPrompt: true, temperature: true, updatedAt: true }
      });
      return updated;
    });
  };

  public listPhoneNumbers = (): Promise<{
    data: Array<{
      id: string;
      e164: string;
      provider: string;
      providerSid: string | null;
      isActive: boolean;
      tenantId: string | null;
      agentId: string | null;
      createdAt: Date;
    }>;
    total: number;
  }> => {
    return this.execute('admin.phoneNumbers.list', async () => {
      const [rows, total] = await Promise.all([
        prisma.phoneNumber.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { id: true, e164: true, provider: true, providerSid: true, isActive: true, tenantId: true, agentId: true, createdAt: true }
        }),
        prisma.phoneNumber.count({ where: { deletedAt: null } })
      ]);
      return { data: rows, total };
    });
  };

  public purchasePhoneNumber = (input: {
    e164?: string;
    country?: string;
    areaCode?: number;
    provider: 'TWILIO' | 'SIP';
  }): Promise<{ phoneNumber: any }> => {
    return this.execute('admin.phoneNumbers.purchase', async () => {
      if (input.provider === 'SIP') {
        if (!input.e164) {
          throw new ConflictError('e164 is required for SIP numbers');
        }
        const created = await prisma.phoneNumber.create({
          data: {
            e164: input.e164,
            provider: 'SIP',
            providerSid: null,
            isActive: true,
            tenantId: null,
            agentId: null
          }
        });
        return { phoneNumber: created };
      }

      const bought = input.e164
        ? { e164: input.e164, sid: `PN_MANUAL_${Date.now()}` }
        : await this.twilio.purchaseIncomingNumber({
            ...(input.country ? { country: input.country } : {}),
            ...(input.areaCode !== undefined ? { areaCode: input.areaCode } : {})
          });

      const created = await prisma.phoneNumber.create({
        data: {
          e164: bought.e164,
          provider: 'TWILIO',
          providerSid: bought.sid,
          isActive: true,
          tenantId: null,
          agentId: null,
          metadata: { purchasedAt: new Date().toISOString(), ...(input.country ? { country: input.country } : {}), ...(input.areaCode ? { areaCode: input.areaCode } : {}) }
        }
      });
      return { phoneNumber: created };
    });
  };

  public assignPhoneNumber = (input: { phoneNumberId: string; tenantId: string }): Promise<{ phoneNumber: any }> => {
    return this.execute('admin.phoneNumbers.assign', async () => {
      const tenant = await prisma.tenant.findFirst({
        where: { id: input.tenantId, deletedAt: null },
        select: { id: true, defaultAgentId: true }
      });
      if (!tenant) throw new NotFoundError('Tenant not found');
      if (!tenant.defaultAgentId) throw new ConflictError('Tenant has no default agent');

      const updated = await prisma.phoneNumber.update({
        where: { id: input.phoneNumberId },
        data: {
          tenantId: tenant.id,
          agentId: tenant.defaultAgentId,
          isActive: true
        }
      });
      return { phoneNumber: updated };
    });
  };
}

