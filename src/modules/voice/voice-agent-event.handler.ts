import { events } from '../../lib/events.js';
import { logger } from '../../lib/logger.js';
import type { LiveKitAgentClient } from '../../services/voice/livekit-agent-client.service.js';

export class VoiceAgentEventHandler {
  private registered = false;

  public constructor(private readonly client: LiveKitAgentClient) {}

  public register(): void {
    if (this.registered) return;
    this.registered = true;

    events.on('call.started', (e) => {
      void this.client.joinCall({ tenantId: e.tenantId, callSessionId: e.callSessionId }).catch((err) =>
        logger.error({ err, tenantId: e.tenantId, callSessionId: e.callSessionId }, 'Voice agent join failed')
      );
    });

    events.on('call.ended', (e) => {
      void this.client.leaveCall({ callSessionId: e.callSessionId }).catch((err) =>
        logger.error({ err, tenantId: e.tenantId, callSessionId: e.callSessionId }, 'Voice agent leave failed')
      );
    });

    events.on('agent.response', (e) => {
      void this.client.speak({ callSessionId: e.callSessionId, text: e.content }).catch((err) =>
        logger.error({ err, tenantId: e.tenantId, callSessionId: e.callSessionId }, 'Voice agent speak failed')
      );
    });
  }
}

