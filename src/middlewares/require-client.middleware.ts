import type { RequestHandler } from 'express';
import { ForbiddenError } from '../lib/errors.js';

export const requireClient: RequestHandler = (req, _res, next) => {
  if (req.auth?.type !== 'jwt' || req.auth.userType !== 'CLIENT') {
    throw new ForbiddenError('Client access required');
  }
  if (!req.auth.tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }
  next();
};

