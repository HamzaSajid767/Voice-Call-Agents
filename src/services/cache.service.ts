import { redis } from '../lib/redis.js';

export class CacheService {
  public async get<T>(key: string): Promise<T | null> {
    const raw = await redis.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  }

  public async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await redis.setEx(key, JSON.stringify(value), ttlSeconds);
  }

  public async setIfNotExists(key: string, ttlSeconds: number): Promise<boolean> {
    return redis.setNxEx(key, '1', ttlSeconds);
  }
}

