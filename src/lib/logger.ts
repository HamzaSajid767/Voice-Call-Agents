import pino from 'pino';
import { env } from '../config/env.js';
import { RequestContextStore } from './request-context.js';

export const logger = pino({
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label })
  },
  mixin() {
    const context = RequestContextStore.get();
    return context
      ? { requestId: context.requestId, tenantId: context.tenantId ?? 'unknown', userId: context.userId ?? 'unknown' }
      : { requestId: 'n/a', tenantId: 'n/a', userId: 'n/a' };
  },
  redact: {
    paths: ['req.headers.authorization', 'authorization', 'password', 'token'],
    remove: true
  }
});
