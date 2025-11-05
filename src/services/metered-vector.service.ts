import { events } from '../lib/events.js';
import type { VectorSearchResult, VectorService } from '../interfaces/vector-service.interface.js';

export class MeteredVectorService implements VectorService {
  public constructor(
    private readonly inner: VectorService,
    private readonly context: { tenantId: string; callSessionId?: string; agentId?: string }
  ) {}

  public embed(text: string): Promise<number[]> {
    return this.inner.embed(text);
  }

  public search(query: string, topK: number): Promise<VectorSearchResult[]> {
    return this.inner.search(query, topK);
  }

  public upsert(documents: { id: string; content: string; metadata?: Record<string, string | number | boolean> }[]): Promise<void> {
    events.emit('usage.metered', {
      tenantId: this.context.tenantId,
      ...(this.context.callSessionId ? { callSessionId: this.context.callSessionId } : {}),
      ...(this.context.agentId ? { agentId: this.context.agentId } : {}),
      type: 'VECTOR_UPSERTS',
      quantity: documents.length
    });
    return this.inner.upsert(documents);
  }

  public async storeCallMessage(params: {
    tenantId: string;
    agentId: string;
    callId: string;
    role: 'user' | 'assistant';
    content: string;
  }): Promise<void> {
    events.emit('usage.metered', {
      tenantId: params.tenantId,
      callSessionId: params.callId,
      agentId: params.agentId,
      type: 'VECTOR_UPSERTS',
      quantity: 1,
      metadata: { role: params.role }
    });
    return this.inner.storeCallMessage(params);
  }

  public async searchRelevantContext(params: {
    tenantId: string;
    agentId: string;
    callId: string;
    query: string;
    topK: number;
  }): Promise<VectorSearchResult[]> {
    events.emit('usage.metered', {
      tenantId: params.tenantId,
      callSessionId: params.callId,
      agentId: params.agentId,
      type: 'VECTOR_SEARCHES',
      quantity: 1,
      metadata: { topK: params.topK }
    });
    return this.inner.searchRelevantContext(params);
  }

  public async buildMemoryContext(params: { tenantId: string; agentId: string; callId: string; topK?: number }): Promise<string> {
    // Treated as a search operation.
    events.emit('usage.metered', {
      tenantId: params.tenantId,
      callSessionId: params.callId,
      agentId: params.agentId,
      type: 'VECTOR_SEARCHES',
      quantity: 1,
      metadata: { topK: params.topK ?? 6 }
    });
    return this.inner.buildMemoryContext(params);
  }
}

