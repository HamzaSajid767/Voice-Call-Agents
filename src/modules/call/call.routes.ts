import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { requireAuth } from '../../middlewares/require-auth.middleware.js';
import { requireClient } from '../../middlewares/require-client.middleware.js';
import { validateRequest } from '../../middlewares/validate-request.middleware.js';
import { CallRepository } from './call.repository.js';
import { CallEventService } from './call-event.service.js';
import { CallService } from './call.service.js';
import { CallController } from './call.controller.js';
import { outboundCallBodySchema, listCallsQuerySchema } from './call.schemas.js';
import { TwilioService } from '../../services/twilio.service.js';
import { LiveKitService } from '../../services/livekit.service.js';

const callRepository = new CallRepository();
const callEventService = new CallEventService();
const twilioService = new TwilioService();
const livekitService = new LiveKitService();
const callService = new CallService(callRepository, callEventService, twilioService, livekitService);
const callController = new CallController(callService);

export const callRouter = Router();

callRouter.get(
  '/',
  requireAuth,
  requireClient,
  validateRequest(listCallsQuerySchema, 'query'),
  asyncHandler(callController.list)
);
callRouter.get('/:id', requireAuth, requireClient, asyncHandler(callController.getById));
callRouter.post(
  '/outbound',
  requireAuth,
  requireClient,
  validateRequest(outboundCallBodySchema, 'body'),
  asyncHandler(callController.createOutbound)
);

