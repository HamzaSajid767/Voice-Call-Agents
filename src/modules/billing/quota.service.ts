import { prisma } from '../../lib/prisma.js';
import { BaseService } from '../../services/base.service.js';
import { ForbiddenError } from '../../lib/errors.js';

type Limits = {
  MAX_CALL_MINUTES_PER_MONTH?: number;
  MAX_LLM_TOKENS_PER_MONTH?: number;
};

const monthRangeUtc = (now = new Date()) => {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
  return { from, to };
};

export class QuotaService extends BaseService {
  private async getTenantLimits(tenantId: string): Promise<Limits> {
    const t = await prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null }, select: { settings: true } });
    const settings = (t?.settings ?? {}) as Record<string, unknown>;
    const limits = (settings['limits'] ?? {}) as Record<string, unknown>;
    const out: Limits = {};
    if (typeof limits['MAX_CALL_MINUTES_PER_MONTH'] === 'number') {
      out.MAX_CALL_MINUTES_PER_MONTH = limits['MAX_CALL_MINUTES_PER_MONTH'] as number;
    }
    if (typeof limits['MAX_LLM_TOKENS_PER_MONTH'] === 'number') {
      out.MAX_LLM_TOKENS_PER_MONTH = limits['MAX_LLM_TOKENS_PER_MONTH'] as number;
    }
    return out;
  }

  public enforceOutboundCallAllowed = (tenantId: string): Promise<void> => {
    return this.execute('quota.calls', async () => {
      const limits = await this.getTenantLimits(tenantId);
      if (!limits.MAX_CALL_MINUTES_PER_MONTH) {
        return;
      }
      const { from, to } = monthRangeUtc();
      const rows = await prisma.usageRecord.findMany({
        where: { tenantId, occurredAt: { gte: from, lte: to } },
        select: { quantity: true, metadata: true }
      });
      const used = rows.reduce((sum, r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        if (String(meta['type'] ?? '') !== 'CALL_MINUTES') {
          return sum;
        }
        return sum + Number(r.quantity);
      }, 0);
      if (used >= limits.MAX_CALL_MINUTES_PER_MONTH) {
        throw new ForbiddenError('Monthly call minutes quota exceeded');
      }
    });
  };

  public enforceLlmAllowed = (tenantId: string): Promise<void> => {
    return this.execute('quota.llm', async () => {
      const limits = await this.getTenantLimits(tenantId);
      if (!limits.MAX_LLM_TOKENS_PER_MONTH) {
        return;
      }
      const { from, to } = monthRangeUtc();
      const rows = await prisma.usageRecord.findMany({
        where: { tenantId, occurredAt: { gte: from, lte: to } },
        select: { quantity: true, metadata: true }
      });
      const used = rows.reduce((sum, r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        const t = String(meta['type'] ?? '');
        if (t !== 'LLM_TOKENS_INPUT' && t !== 'LLM_TOKENS_OUTPUT') {
          return sum;
        }
        return sum + Number(r.quantity);
      }, 0);
      if (used >= limits.MAX_LLM_TOKENS_PER_MONTH) {
        throw new ForbiddenError('Monthly LLM token quota exceeded');
      }
    });
  };
}

