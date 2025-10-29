import { randomUUID, createHash } from 'node:crypto';
import type { VectorDocument, VectorSearchResult, VectorService } from '../../interfaces/vector-service.interface.js';
import { env } from '../../config/env.js';
import { CacheService } from '../cache.service.js';
import { InternalServerError } from '../../lib/errors.js';

type OllamaTagsResponse = { models?: Array<{ name?: string }> };

const pickModel = (available: string[], preferred: string[]): string | null => {
  const set = new Set(available.map((m) => m.trim()).filter(Boolean));
  for (const p of preferred) {
    if (set.has(p)) return p;
    const alt = [...set].find((x) => x === p || x.startsWith(`${p}:`));
    if (alt) return alt;
  }
  return [...set][0] ?? null;
};

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

const sanitizeCollection = (tenantId: string) => {
  // Qdrant collection name constraints are lenient but keep it safe and deterministic.
  return `tenant_${tenantId.replace(/[^a-zA-Z0-9_\\-]/g, '_')}`;
};

export class QdrantVectorService implements VectorService {
  private readonly qdrantUrl = (env.QDRANT_URL ?? 'http://localhost:6333').replace(/\/+$/, '');
  private readonly qdrantApiKey = env.QDRANT_API_KEY;
  private readonly ollamaUrl = (env.OLLAMA_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
  private readonly cache = new CacheService();

  private modelCache: { embedModel: string; at: number } | null = null;
  private collectionReady = new Set<string>(); // collection name
  private dimByCollection = new Map<string, number>();
  private readonly inflightEmbed = new Map<string, Promise<number[]>>();
  private readonly inflightSearch = new Map<string, Promise<VectorSearchResult[]>>();
  private prewarmed = false;

  public prewarm(): void {
    if (this.prewarmed) return;
    this.prewarmed = true;
    // Fire-and-forget: warm model discovery and first embedding cache.
    void this.resolveEmbedModel()
      .then(() => this.embed('hello'))
      .catch(() => undefined);
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { ...(extra ?? {}) };
    if (this.qdrantApiKey) h['api-key'] = this.qdrantApiKey;
    return h;
  }

  private async resolveEmbedModel(): Promise<string> {
    if (env.OLLAMA_EMBED_MODEL) return env.OLLAMA_EMBED_MODEL;
    const now = Date.now();
    if (this.modelCache && now - this.modelCache.at < 60_000) {
      return this.modelCache.embedModel;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 200);
    try {
      const resp = await fetch(`${this.ollamaUrl}/api/tags`, { method: 'GET', signal: ctrl.signal });
      const json = (await resp.json()) as OllamaTagsResponse;
      const names = (json.models ?? []).map((m) => String(m.name ?? '')).filter(Boolean);
      const picked = pickModel(names, ['nomic-embed-text', 'all-minilm', 'bge-small-en', 'mxbai-embed-large']);
      const embedModel = picked ?? 'nomic-embed-text';
      this.modelCache = { embedModel, at: now };
      return embedModel;
    } catch {
      this.modelCache = { embedModel: 'nomic-embed-text', at: now };
      return 'nomic-embed-text';
    } finally {
      clearTimeout(t);
    }
  }

  private async ensureCollection(params: { tenantId: string; dim: number }): Promise<string> {
    const collection = sanitizeCollection(params.tenantId);
    const dim = params.dim;
    const knownDim = this.dimByCollection.get(collection);
    if (knownDim && knownDim !== dim) {
      // Dimension mismatch implies a different embedding model was used; keep deterministic by failing fast.
      throw new InternalServerError(`Qdrant collection dim mismatch for ${collection}`);
    }
    this.dimByCollection.set(collection, dim);
    if (this.collectionReady.has(collection)) return collection;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 500);
    try {
      const get = await fetch(`${this.qdrantUrl}/collections/${collection}`, { method: 'GET', headers: this.headers(), signal: ctrl.signal });
      if (get.ok) {
        this.collectionReady.add(collection);
        return collection;
      }
    } catch {
      // ignore and try create
    } finally {
      clearTimeout(t);
    }

    const createCtrl = new AbortController();
    const t2 = setTimeout(() => createCtrl.abort(), 1000);
    try {
      const resp = await fetch(`${this.qdrantUrl}/collections/${collection}`, {
        method: 'PUT',
        signal: createCtrl.signal,
        headers: this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          vectors: { size: dim, distance: 'Cosine' }
        })
      });
      // 409 if already exists (race) is OK.
      if (!resp.ok && resp.status !== 409) {
        throw new Error(`qdrant http ${resp.status}`);
      }
      this.collectionReady.add(collection);
      return collection;
    } catch (e) {
      throw new InternalServerError('Qdrant collection init failed', e);
    } finally {
      clearTimeout(t2);
    }
  }

  public async embed(text: string): Promise<number[]> {
    const content = String(text ?? '');
    const key = `emb:v1:${sha1(content)}`;
    const cached = await this.cache.get<number[]>(key);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached;
    }

    const inflight = this.inflightEmbed.get(key);
    if (inflight) return inflight;

    const p = (async () => {
      const model = await this.resolveEmbedModel();
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2_000);
      try {
        const resp = await fetch(`${this.ollamaUrl}/api/embeddings`, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, prompt: content })
        });
        if (!resp.ok) throw new Error(`ollama embeddings http ${resp.status}`);
        const json = (await resp.json()) as { embedding?: number[] };
        const emb = (json.embedding ?? []).map((x) => Number(x));
        if (!emb.length) throw new Error('empty embedding');
        // Cache for 1 day (fast repeat lookups).
        await this.cache.set(key, emb, 60 * 60 * 24);
        return emb;
      } catch (e) {
        throw new InternalServerError('Embedding request failed', e);
      } finally {
        clearTimeout(t);
      }
    })();

    this.inflightEmbed.set(key, p);
    try {
      return await p;
    } finally {
      this.inflightEmbed.delete(key);
    }
  }

  public async upsert(documents: VectorDocument[]): Promise<void> {
    // Generic upsert path (not used in hot call flow yet).
    for (const d of documents) {
      await this.storeCallMessage({
        tenantId: String(d.metadata?.tenantId ?? ''),
        agentId: String(d.metadata?.agentId ?? ''),
        callId: String(d.metadata?.callId ?? ''),
        role: (String(d.metadata?.role ?? 'user') as 'user' | 'assistant'),
        content: d.content
      });
    }
  }

  public async storeCallMessage(params: {
    tenantId: string;
    agentId: string;
    callId: string;
    role: 'user' | 'assistant';
    content: string;
  }): Promise<void> {
    const embedding = await this.embed(params.content);
    const collection = await this.ensureCollection({ tenantId: params.tenantId, dim: embedding.length });

    const pointId = randomUUID();
    const payload = {
      tenantId: params.tenantId,
      agentId: params.agentId,
      callId: params.callId,
      role: params.role,
      content: params.content
    };

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 800);
    try {
      const resp = await fetch(`${this.qdrantUrl}/collections/${collection}/points?wait=false`, {
        method: 'PUT',
        signal: ctrl.signal,
        headers: this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          points: [{ id: pointId, vector: embedding, payload }]
        })
      });
      if (!resp.ok) throw new Error(`qdrant upsert http ${resp.status}`);
    } catch (e) {
      throw new InternalServerError('Qdrant upsert failed', e);
    } finally {
      clearTimeout(t);
    }
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
    const topK = Math.min(3, Math.max(1, params.topK));
    const cacheKey = `qdrant:ctx:v1:${sha1([params.tenantId, params.agentId, params.callId, params.query, String(topK)].join('|'))}`;
    const cached = await this.cache.get<VectorSearchResult[]>(cacheKey);
    if (cached && Array.isArray(cached)) {
      return cached;
    }

    const inflight = this.inflightSearch.get(cacheKey);
    if (inflight) return inflight;

    const p = (async () => {
    const embedding = await this.embed(params.query);
    const collection = await this.ensureCollection({ tenantId: params.tenantId, dim: embedding.length });

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 500);
    try {
      const resp = await fetch(`${this.qdrantUrl}/collections/${collection}/points/search`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          vector: embedding,
          limit: topK,
          with_payload: true,
          filter: {
            must: [
              { key: 'callId', match: { value: params.callId } },
              { key: 'agentId', match: { value: params.agentId } }
            ]
          }
        })
      });
      if (!resp.ok) throw new Error(`qdrant search http ${resp.status}`);
      const json = (await resp.json()) as { result?: Array<{ id: string | number; score: number; payload?: any }> };
      const result = json.result ?? [];
      const out = result.map((r) => {
        const out: VectorSearchResult = { id: String(r.id), score: Number(r.score ?? 0) };
        if (r.payload) {
          out.metadata = r.payload as Record<string, string | number | boolean>;
        }
        return out;
      });
      await this.cache.set(cacheKey, out, 30);
      return out;
    } catch (e) {
      throw new InternalServerError('Qdrant search failed', e);
    } finally {
      clearTimeout(t);
    }
    })();

    this.inflightSearch.set(cacheKey, p);
    try {
      return await p;
    } finally {
      this.inflightSearch.delete(cacheKey);
    }
  }

  public async buildMemoryContext(params: { tenantId: string; agentId: string; callId: string; topK?: number }): Promise<string> {
    const topK = Math.min(3, Math.max(1, params.topK ?? 3));
    // Use a light “recent summary” query key to avoid re-embedding large context.
    const query = 'conversation memory';
    const hits = await this.searchRelevantContext({ tenantId: params.tenantId, agentId: params.agentId, callId: params.callId, query, topK });
    return hits
      .map((h) => {
        const role = String(h.metadata?.role ?? 'unknown');
        const content = String(h.metadata?.content ?? '');
        return content ? `- (${role}) ${content}` : null;
      })
      .filter((x): x is string => Boolean(x))
      .join('\n');
  }
}

