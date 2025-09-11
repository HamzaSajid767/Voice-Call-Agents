import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import type { RedisLike } from './redis-adapter.js';
import { RedisAdapter } from './redis-adapter.js';

const globalForRedis = globalThis as unknown as { redis?: RedisLike };

class InMemoryRedis implements RedisLike {
  private readonly store = new Map<string, { value: string; expiresAt?: number }>();
  public on(): void {
    return;
  }
  private gc(key: string) {
    const v = this.store.get(key);
    if (v?.expiresAt && v.expiresAt < Date.now()) {
      this.store.delete(key);
    }
  }
  public async get(key: string): Promise<string | null> {
    this.gc(key);
    return this.store.get(key)?.value ?? null;
  }
  public async set(key: string, value: string): Promise<'OK'> {
    this.gc(key);
    this.store.set(key, { value });
    return 'OK';
  }
  public async setEx(key: string, value: string, ttlSeconds: number): Promise<'OK'> {
    this.gc(key);
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return 'OK';
  }
  public async setNxEx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    this.gc(key);
    if (this.store.has(key)) {
      return false;
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }
  public async incr(key: string): Promise<number> {
    this.gc(key);
    const current = Number(this.store.get(key)?.value ?? '0');
    const next = current + 1;
    const expiresAt = this.store.get(key)?.expiresAt;
    this.store.set(key, { value: String(next), ...(expiresAt ? { expiresAt } : {}) });
    return next;
  }
  public async expire(key: string, seconds: number): Promise<number> {
    this.gc(key);
    const v = this.store.get(key);
    if (!v) return 0;
    v.expiresAt = Date.now() + seconds * 1000;
    this.store.set(key, v);
    return 1;
  }
  public async ping(): Promise<string> {
    return 'PONG';
  }
}

const buildRedisClient = (): RedisLike => {
  if (env.NODE_ENV === 'test' && !env.USE_REAL_REDIS_IN_TESTS) {
    return new InMemoryRedis();
  }
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy(attempt: number) {
      const delay = Math.min(attempt * 100, 3000);
      return delay;
    }
  });

  client.on('connect', () => logger.info('Redis connection established'));
  client.on('reconnecting', () => logger.warn('Redis reconnecting'));
  client.on('error', (error: Error) => logger.error({ err: error }, 'Redis connection error'));

  return new RedisAdapter(client);
};

export const redis = globalForRedis.redis ?? buildRedisClient();

if (env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}
