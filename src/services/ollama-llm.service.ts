import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { InternalServerError } from '../lib/errors.js';
import type { GenerateResponseInput, LlmMessage, LlmService } from './llm.service.js';
import { CacheService } from './cache.service.js';

type OllamaTagsResponse = { models?: Array<{ name?: string }> };

const pickModel = (available: string[], preferred: string[]): string | null => {
  const set = new Set(available.map((m) => m.trim()).filter(Boolean));
  for (const p of preferred) {
    if (set.has(p)) return p;
    // handle "llama3:latest" vs "llama3"
    const alt = [...set].find((x) => x === p || x.startsWith(`${p}:`));
    if (alt) return alt;
  }
  return [...set][0] ?? null;
};

const messagesToPrompt = (messages: LlmMessage[]): string => {
  // Keep prompt ultra-minimal for latency.
  return messages
    .map((m) => {
      if (m.role === 'system') return `SYSTEM: ${m.content}`;
      if (m.role === 'user') return `USER: ${m.content}`;
      return `ASSISTANT: ${m.content}`;
    })
    .join('\n');
};

const clampResponse = (text: string): string => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const maxChars = 900;
  const clipped = s.length > maxChars ? s.slice(0, maxChars) : s;
  const m = clipped.match(/^(.+?[.!?])\s/);
  const firstSentence = m?.[1] ? m[1] : clipped;
  return firstSentence.trim();
};

const parseNdjsonLines = async function* (body: ReadableStream<Uint8Array>): AsyncIterable<any> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    while (true) {
      const idx = buf.indexOf('\n');
      if (idx < 0) break;
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      yield JSON.parse(line);
    }
  }
  const tail = buf.trim();
  if (tail) {
    yield JSON.parse(tail);
  }
};

export class OllamaLlmService implements LlmService {
  private readonly baseUrl = (env.OLLAMA_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
  private cachedModel: { name: string; at: number } | null = null;
  private readonly cache = new CacheService();

  private async resolveChatModel(): Promise<string> {
    if (env.OLLAMA_MODEL) return env.OLLAMA_MODEL;
    const now = Date.now();
    if (this.cachedModel && now - this.cachedModel.at < 60_000) {
      return this.cachedModel.name;
    }
    const url = `${this.baseUrl}/api/tags`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 200);
    try {
      const resp = await fetch(url, { method: 'GET', signal: ctrl.signal });
      const json = (await resp.json()) as OllamaTagsResponse;
      const names = (json.models ?? []).map((m) => String(m.name ?? '')).filter(Boolean);
      const picked = pickModel(names, ['llama3', 'mistral', 'qwen2.5', 'phi3']);
      if (!picked) {
        throw new Error('No Ollama models found');
      }
      this.cachedModel = { name: picked, at: now };
      return picked;
    } catch (e) {
      // If tags endpoint is slow/unavailable, fall back to a sensible default.
      this.cachedModel = { name: 'llama3', at: now };
      return 'llama3';
    } finally {
      clearTimeout(t);
    }
  }

  public async generateResponse(input: GenerateResponseInput): Promise<string> {
    const model = await this.resolveChatModel();
    const prompt = messagesToPrompt(input.messages);
    const promptKey = `ollama:resp:v1:${createHash('sha1').update(prompt).digest('hex')}`;

    const url = `${this.baseUrl}/api/generate`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6_000);
    try {
      const cached = await this.cache.get<string>(promptKey);
      if (cached) return cached;
      const resp = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature: input.temperature,
            num_predict: 220
          }
        })
      });
      if (!resp.ok) {
        throw new Error(`ollama http ${resp.status}`);
      }
      const json = (await resp.json()) as { response?: string };
      const out = clampResponse(String(json.response ?? ''));
      if (out) {
        await this.cache.set(promptKey, out, 60);
        return out;
      }
      return out;
    } catch (e) {
      const cached = await this.cache.get<string>(promptKey);
      if (cached) return cached;
      return 'Sorry—could you repeat that?';
    } finally {
      clearTimeout(t);
    }
  }

  public async *streamResponse(input: GenerateResponseInput): AsyncIterable<string> {
    const model = await this.resolveChatModel();
    const prompt = messagesToPrompt(input.messages);

    const url = `${this.baseUrl}/api/generate`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: true,
          options: {
            temperature: input.temperature,
            num_predict: 160
          }
        })
      });
      if (!resp.ok || !resp.body) {
        throw new Error(`ollama http ${resp.status}`);
      }

      for await (const obj of parseNdjsonLines(resp.body)) {
        const chunk = String(obj?.response ?? '');
        if (chunk) yield chunk;
        if (obj?.done) break;
      }
    } catch (e) {
      throw new InternalServerError('Ollama streaming request failed', e);
    } finally {
      clearTimeout(t);
    }
  }

  // Used by vector service for embedding caching keys.
  public static hashText(text: string): string {
    return createHash('sha1').update(text).digest('hex');
  }
}

