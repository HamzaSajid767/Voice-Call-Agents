import { events } from '../../lib/events.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { UsageService } from './usage.service.js';
import { billingQueue } from '../../queues/queue.js';
import { env } from '../../config/env.js';

export class BillingEventHandler {
  private registered = false;
  private readonly callStartTimes = new Map<string, number>();

  public constructor(private readonly usageService: UsageService) {}

  public register(): void {
    if (this.registered) {
      return;
    }
    this.registered = true;

    events.on('call.started', (e) => {
      this.callStartTimes.set(e.callSessionId, Date.now());
    });

    events.on('call.ended', (e) => {
      if (process.env.NODE_ENV === 'test' && !env.USE_REAL_REDIS_IN_TESTS) {
        void this.handleCallEnded(e.tenantId, e.callSessionId).catch((err) => logger.error({ err }, 'call billing failed'));
        return;
      }
      void billingQueue
        .add('call.ended', { tenantId: e.tenantId, callSessionId: e.callSessionId }, { removeOnComplete: true, attempts: 5, backoff: { type: 'exponential', delay: 1000 } })
        .catch((err) => logger.error({ err }, 'enqueue call billing failed'));
    });

    events.on('usage.metered', (e) => {
      const payload =
        e.occurredAt
          ? {
              tenantId: e.tenantId,
              ...(e.callSessionId ? { callSessionId: e.callSessionId } : {}),
              ...(e.agentId ? { agentId: e.agentId } : {}),
              type: e.type,
              quantity: e.quantity,
              ...(e.metadata ? { metadata: e.metadata } : {}),
              occurredAt: new Date(e.occurredAt)
            }
          : {
              tenantId: e.tenantId,
              ...(e.callSessionId ? { callSessionId: e.callSessionId } : {}),
              ...(e.agentId ? { agentId: e.agentId } : {}),
              type: e.type,
              quantity: e.quantity,
              ...(e.metadata ? { metadata: e.metadata } : {})
            };
      if (process.env.NODE_ENV === 'test') {
        if (!env.USE_REAL_REDIS_IN_TESTS) {
          void this.usageService.recordUsage(payload as any).catch((err) => logger.error({ err }, 'usage record write failed'));
          return;
        }
      }
      void billingQueue.add('usage.metered', payload, { removeOnComplete: true, attempts: 5, backoff: { type: 'exponential', delay: 1000 } }).catch((err) => logger.error({ err }, 'enqueue usage record failed'));
    });
  }

  public async handleCallEnded(tenantId: string, callSessionId: string): Promise<void> {
    // Prefer stored durationSeconds; fallback to local timestamps.
    const call = await prisma.callSession.findFirst({
      where: { id: callSessionId, tenantId, deletedAt: null },
      // NOTE: Avoid selecting UUID foreign keys (like agentId) here.
      // In test/dev databases we can end up with legacy/corrupt rows where a UUID column
      // contains non-UUID data; selecting it makes Prisma throw before we can bill usage.
      select: { durationSeconds: true, startedAt: true, endedAt: true }
    });
    if (!call) {
      return;
    }

    let seconds = call.durationSeconds ?? 0;
    if (!seconds && call.startedAt && call.endedAt) {
      seconds = Math.max(0, Math.floor((call.endedAt.getTime() - call.startedAt.getTime()) / 1000));
    }
    if (!seconds) {
      const localStart = this.callStartTimes.get(callSessionId);
      if (localStart) {
        seconds = Math.max(0, Math.floor((Date.now() - localStart) / 1000));
      }
    }
    this.callStartTimes.delete(callSessionId);

    const minutes = Math.max(0, Math.ceil(seconds / 60));
    if (minutes === 0) {
      return;
    }

    await this.usageService.recordUsage({
      tenantId,
      callSessionId,
      type: 'CALL_MINUTES',
      quantity: minutes,
      metadata: { durationSeconds: seconds }
    });
  }
}

