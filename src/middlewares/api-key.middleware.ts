import type { RequestHandler } from 'express';
import { RequestContextStore } from '../lib/request-context.js';
import { AuthError } from '../lib/errors.js';
import { ApiKeyService } from '../modules/api-key/api-key.service.js';
import { ApiKeyRepository } from '../modules/api-key/api-key.repository.js';

const apiKeyService = new ApiKeyService(new ApiKeyRepository());

const extractApiKey = (req: { header: (name: string) => string | undefined }): string | null => {
  const fromHeader = req.header('x-api-key');
  if (fromHeader) {
    return fromHeader.trim();
  }
  return null;
};

/**
 * Resolves the tenant (and key id) from `X-API-Key` without a JWT. Does not set `userId` / role.
 * Use for service-to-service routes, or stack with `requireAuth` for dual-mode endpoints later.
 */
export const authenticateApiKey: RequestHandler = async (req, _res, next) => {
  const raw = extractApiKey(req);
  if (!raw) {
    throw new AuthError('API key required');
  }
  const { tenantId, keyId } = await apiKeyService.verify(raw);
  if (req.context) {
    req.context.tenantId = tenantId;
  }
  RequestContextStore.setTenantId(tenantId);
  req.auth = { type: 'apikey', tenantId, apiKeyId: keyId };
  next();
};
