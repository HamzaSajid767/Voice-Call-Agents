import { events } from '../../lib/events.js';

type ActiveCall = { callSessionId: string; tenantId: string; startedAt: string };
type ActiveAgent = { agentId: string; tenantId: string; lastSeenAt: string };

export class MonitoringService {
  private readonly activeCalls = new Map<string, ActiveCall>();
  private readonly activeAgents = new Map<string, ActiveAgent>();
  private registered = false;

  public register(): void {
    if (this.registered) {
      return;
    }
    this.registered = true;

    events.on('call.started', (e) => {
      this.activeCalls.set(e.callSessionId, { callSessionId: e.callSessionId, tenantId: e.tenantId, startedAt: new Date().toISOString() });
    });
    events.on('call.ended', (e) => {
      this.activeCalls.delete(e.callSessionId);
      void e;
    });
    events.on('agent.response', (e) => {
      this.activeAgents.set(`${e.tenantId}:${e.agentId}`, { agentId: e.agentId, tenantId: e.tenantId, lastSeenAt: new Date().toISOString() });
    });
  }

  public getLiveSnapshot(): { activeCalls: ActiveCall[]; activeAgents: ActiveAgent[] } {
    return {
      activeCalls: [...this.activeCalls.values()],
      activeAgents: [...this.activeAgents.values()]
    };
  }
}

