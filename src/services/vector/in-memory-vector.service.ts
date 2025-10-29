import type { VectorDocument, VectorSearchResult, VectorService } from '../../interfaces/vector-service.interface.js';

type Stored = {
  embedding: number[];
  doc: VectorDocument;
};

const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);
const norm = (a: number[]) => Math.sqrt(dot(a, a)) || 1;
const cosine = (a: number[], b: number[]) => dot(a, b) / (norm(a) * norm(b));

/**
 * In-memory vector provider used for tests/dev.
 * Production providers (Qdrant/Pinecone) should implement the same `VectorService`.
 */
export class InMemoryVectorService implements VectorService {
  private readonly store = new Map<string, Stored[]>();

  private key(tenantId: string, agentId: string, callId: string) {
    return `${tenantId}:${agentId}:${callId}`;
  }

  public async embed(text: string): Promise<number[]> {
    // Tiny deterministic embedding for dev/tests (not semantic).
    const v = new Array<number>(32).fill(0);
    for (let i = 0; i < text.length; i += 1) {
      v[i % v.length] = (v[i % v.length] ?? 0) + (text.charCodeAt(i) % 31);
    }
    return v;
  }

  public async upsert(documents: VectorDocument[]): Promise<void> {
    // Generic upsert is unused by call memory in this provider.
    void documents;
  }

  public async storeCallMessage(params: {
    tenantId: string;
    agentId: string;
    callId: string;
    role: 'user' | 'assistant';
    content: string;
  }): Promise<void> {
    const embedding = await this.embed(params.content);
    const key = this.key(params.tenantId, params.agentId, params.callId);
    const list = this.store.get(key) ?? [];
    list.push({
      embedding,
      doc: {
        id: `${params.callId}:${list.length}`,
        content: params.content,
        metadata: { role: params.role }
      }
    });
    this.store.set(key, list);
  }

  public async search(query: string, topK: number): Promise<VectorSearchResult[]> {
    void query;
    void topK;
    return [];
  }

  public async searchRelevantContext(params: {
    tenantId: string;
    agentId: string;
    callId: string;
    query: string;
    topK: number;
  }): Promise<VectorSearchResult[]> {
    const key = this.key(params.tenantId, params.agentId, params.callId);
    const list = this.store.get(key) ?? [];
    const q = await this.embed(params.query);
    return list
      .map((s) => ({
        id: s.doc.id,
        score: cosine(q, s.embedding),
        ...(s.doc.metadata ? { metadata: s.doc.metadata } : {})
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, params.topK);
  }

  public async buildMemoryContext(params: { tenantId: string; agentId: string; callId: string; topK?: number }): Promise<string> {
    const topK = params.topK ?? 6;
    const key = this.key(params.tenantId, params.agentId, params.callId);
    const list = this.store.get(key) ?? [];
    const recent = list.slice(Math.max(0, list.length - topK));
    return recent.map((m) => `- (${String(m.doc.metadata?.role ?? 'unknown')}) ${m.doc.content}`).join('\n');
  }
}

