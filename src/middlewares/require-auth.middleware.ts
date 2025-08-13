import type { RequestHandler } from 'express';
import { RequestContextStore } from '../lib/request-context.js';
import { verifyToken } from '../lib/jwt.js';
import { AuthError } from '../lib/errors.js';

const bearerPrefix = 'Bearer ';

const extractToken = (authorization: string | undefined): string | null => {
  if (!authorization) {
    return null;
  }
  if (authorization.startsWith(bearerPrefix)) {
    return authorization.substring(bearerPrefix.length).trim();
  }
  return null;
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = extractToken(req.header('authorization')) ?? null;
  if (!token) {
    throw new AuthError('Authentication required');
  }
  const payload = verifyToken(token);
  const userId = payload.userId;
  if (!userId) throw new AuthError('Invalid token');
  if (!req.context) {
    throw new AuthError('Invalid request context');
  }
  req.context.userId = userId;
  RequestContextStore.setUserId(userId);

  if (payload.type === 'CLIENT') {
    const tenantId = payload.tenantId;
    if (!tenantId) throw new AuthError('Invalid token');
    req.context.tenantId = tenantId;
    RequestContextStore.setTenantId(tenantId);
    req.auth = { type: 'jwt', userId, tenantId, userType: 'CLIENT' as const };
    next();
    return;
  }

  // SUPERADMIN is not tenant-scoped.
  req.auth = { type: 'jwt', userId, userType: 'SUPERADMIN' as const };
  next();
};
