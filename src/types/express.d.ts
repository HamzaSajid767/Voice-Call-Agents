import type { RequestContext } from './request-context.js';

export interface RequestAuth {
  type: 'jwt' | 'apikey';
  userId?: string;
  tenantId?: string;
  userType?: 'SUPERADMIN' | 'CLIENT';
  apiKeyId?: string;
}

declare global {
  namespace Express {
    interface Request {
      context: RequestContext;
      auth?: RequestAuth;
      rawBody?: string;
    }
  }
}

export {};
