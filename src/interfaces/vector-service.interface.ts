export interface VectorDocument {
  id: string;
  content: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface VectorService {
  embed(text: string): Promise<number[]>;
  search(query: string, topK: number): Promise<VectorSearchResult[]>;
  upsert(documents: VectorDocument[]): Promise<void>;

  storeCallMessage(params: {
    tenantId: string;
    agentId: string;
    callId: string;
    role: 'user' | 'assistant';
    content: string;
  }): Promise<void>;

  searchRelevantContext(params: {
    tenantId: string;
    agentId: string;
    callId: string;
    query: string;
    topK: number;
  }): Promise<VectorSearchResult[]>;

  buildMemoryContext(params: { tenantId: string; agentId: string; callId: string; topK?: number }): Promise<string>;
}
