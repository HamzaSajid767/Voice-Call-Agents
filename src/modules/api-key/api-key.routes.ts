import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { requireAuth } from '../../middlewares/require-auth.middleware.js';
import { requireClient } from '../../middlewares/require-client.middleware.js';
import { validateRequest } from '../../middlewares/validate-request.middleware.js';
import { createApiKeyBodySchema } from './api-key.schemas.js';
import { ApiKeyService } from './api-key.service.js';
import { ApiKeyRepository } from './api-key.repository.js';
import { ApiKeyController } from './api-key.controller.js';

const apiKeyService = new ApiKeyService(new ApiKeyRepository());
const apiKeyController = new ApiKeyController(apiKeyService);

export const apiKeyRouter = Router();

apiKeyRouter.get(
  '/',
  requireAuth,
  requireClient,
  asyncHandler(apiKeyController.list)
);

apiKeyRouter.post(
  '/',
  requireAuth,
  requireClient,
  validateRequest(createApiKeyBodySchema, 'body'),
  asyncHandler(apiKeyController.create)
);
