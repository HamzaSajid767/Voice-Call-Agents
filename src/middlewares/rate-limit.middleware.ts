import type { RequestHandler } from 'express';
import { redis } from '../lib/redis.js';
import { ForbiddenError } from '../lib/errors.js';
import { env } from '../config/env.js';

const windowSeconds = 60;
const globalLimitPerMinute = env.RATE_LIMIT_GLOBAL_PER_MINUTE ?? 600;
const tenantLimitPerMinute = env.RATE_LIMIT_TENANT_PER_MINUTE ?? 300;
const apiKeyLimitPerMinute = env.RATE_LIMIT_APIKEY_PER_MINUTE ?? 200;

const keyFor = (scope: string, id: string) => `ratelimit:${scope}:${id}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;

const withTimeout = async <T,>(p: Promise<T>, ms: number): Promise<T> => {
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error('timeout')), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
};

export const rateLimitMiddleware: RequestHandler = async (req, _res, next) => {
  try {
    const ip = req.ip || 'unknown';
    const globalKey = keyFor('ip', ip);
    const globalCount = await withTimeout(redis.incr(globalKey), 250);
    if (globalCount === 1) {
      await withTimeout(redis.expire(globalKey, windowSeconds), 250);
    }
    if (globalCount > globalLimitPerMinute) {
      throw new ForbiddenError('Rate limit exceeded');
    }

    const tenantId = req.auth?.tenantId;
    if (tenantId) {
      const tKey = keyFor('tenant', tenantId);
      const tCount = await withTimeout(redis.incr(tKey), 250);
      if (tCount === 1) {
        await withTimeout(redis.expire(tKey, windowSeconds), 250);
      }
      if (tCount > tenantLimitPerMinute) {
        throw new ForbiddenError('Tenant rate limit exceeded');
      }
    }

    if (req.auth?.type === 'apikey' && req.auth.apiKeyId) {
      const aKey = keyFor('apikey', req.auth.apiKeyId);
      const aCount = await withTimeout(redis.incr(aKey), 250);
      if (aCount === 1) {
        await withTimeout(redis.expire(aKey, windowSeconds), 250);
      }
      if (aCount > apiKeyLimitPerMinute) {
        throw new ForbiddenError('API key rate limit exceeded');
      }
    }

    next();
  } catch (e) {
    // Still enforce explicit rate-limit blocks, but fail-open on Redis/network issues.
    if (e instanceof ForbiddenError) {
      throw e;
    }
    next();
  }
};

