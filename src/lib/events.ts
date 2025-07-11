import { EventEmitter } from 'node:events';

export type DomainEvents = {
  'call.created': { callSessionId: string; tenantId: string; direction: 'INBOUND' | 'OUTBOUND' };
  'call.started': { callSessionId: string; tenantId: string };
  'call.ended': { callSessionId: string; tenantId: string; status: string };
  'agent.joined': { callSessionId: string; tenantId: string };
  'call.message': {
    callSessionId: string;
    tenantId: string;
    agentId?: string;
    role: 'user' | 'assistant';
    content: string;
  };
  'agent.response': {
    callSessionId: string;
    tenantId: string;
    agentId: string;
    content: string;
  };
  'usage.metered': {
    tenantId: string;
    callSessionId?: string;
    agentId?: string;
    type: 'CALL_MINUTES' | 'LLM_TOKENS_INPUT' | 'LLM_TOKENS_OUTPUT' | 'VECTOR_SEARCHES' | 'VECTOR_UPSERTS';
    quantity: number;
    metadata?: Record<string, string | number | boolean>;
    occurredAt?: string;
  };
};

type EventName = keyof DomainEvents;

class TypedEventBus {
  private readonly emitter = new EventEmitter();

  public emit<TName extends EventName>(name: TName, payload: DomainEvents[TName]): void {
    this.emitter.emit(name, payload);
  }

  public on<TName extends EventName>(name: TName, handler: (payload: DomainEvents[TName]) => void): void {
    this.emitter.on(name, handler);
  }
}

export const events = new TypedEventBus();

