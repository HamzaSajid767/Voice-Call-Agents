import type { RequestHandler } from 'express';

// Tenant is never taken from untrusted client headers. Use `authenticateJwt` or `apiKeyAuth`.
export const tenantContextMiddleware: RequestHandler = (_req, _res, next) => {
  next();
};
