import { events } from '../../lib/events.js';
import { logger } from '../../lib/logger.js';
import type { AgentRuntimeService } from './agent-runtime.service.js';
import { QuotaService } from '../billing/quota.service.js';
import { agentQueue } from '../../queues/queue.js';
import { env } from '../../config/env.js';

/**
 * Event-driven integration point.
 * Does not modify call orchestration; it only listens and reacts.
 */
export class AgentEventHandler {
  private registered = false;
  private readonly quota = new QuotaService();

  public constructor(private readonly runtime: AgentRuntimeService) {}

  public register(): void {
    if (this.registered) {
      return;
    }
    this.registered = true;

    events.on('call.started', (e) => {
      if (process.env.NODE_ENV === 'test' && !env.USE_REAL_REDIS_IN_TESTS) {
        void this.runtime.initializeForCall({ tenantId: e.tenantId, callSessionId: e.callSessionId }).catch((err) => logger.error({ err }, 'Agent runtime init failed'));
        return;
      }
      void agentQueue.add('initialize', { tenantId: e.tenantId, callSessionId: e.callSessionId }, { removeOnComplete: true, attempts: 3 }).catch((err) => logger.error({ err }, 'enqueue agent init failed'));
    });

    events.on('call.message', (e) => {
      if (!e.agentId) {
        return;
      }
      if (e.role !== 'user') {
        return;
      }
      const agentId = e.agentId;
      void this.quota
        .enforceLlmAllowed(e.tenantId)
        .then(async () => {
          if (process.env.NODE_ENV === 'test') {
            if (!env.USE_REAL_REDIS_IN_TESTS) {
              await this.runtime.handleMessage({ tenantId: e.tenantId, callSessionId: e.callSessionId, agentId, userText: e.content });
              return;
            }
          }
          await agentQueue.add('message', { tenantId: e.tenantId, callSessionId: e.callSessionId, agentId, userText: e.content }, { removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 500 } });
        })
        .catch((err) => {
          logger.error({ err }, 'Agent runtime message blocked/failed');
          // If blocked by quota, emit a graceful response.
          events.emit('agent.response', {
            callSessionId: e.callSessionId,
            tenantId: e.tenantId,
            agentId,
            content: 'Your plan quota has been reached. Please upgrade to continue.'
          });
        });
    });
  }
}

