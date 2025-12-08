import { describe, expect, it } from '@jest/globals';
import { redis } from '../src/lib/redis.js';
import { CacheService } from '../src/services/cache.service.js';

describe('Redis adapter + cache consistency (test env)', () => {
  it('supports cache get/set and NX+EX idempotency', async () => {
    const cache = new CacheService();
    await cache.set('k1', { a: 1 }, 10);
    const v = await cache.get<{ a: number }>('k1');
    expect(v?.a).toBe(1);

    const first = await cache.setIfNotExists('idem', 10);
    const second = await cache.setIfNotExists('idem', 10);
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('supports incr/expire primitives used by rate limiter', async () => {
    const key = `rl:test:${Date.now()}`;
    const n1 = await redis.incr(key);
    const n2 = await redis.incr(key);
    expect(n1).toBe(1);
    expect(n2).toBe(2);
    const exp = await redis.expire(key, 10);
    expect([0, 1]).toContain(exp);
  });
});

