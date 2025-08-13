import type { RequestHandler } from 'express';
import { ForbiddenError } from '../lib/errors.js';

export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (req.auth?.type !== 'jwt' || req.auth.userType !== 'SUPERADMIN') {
    throw new ForbiddenError('Superadmin access required');
  }
  next();
};

