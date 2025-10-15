import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { TwilioService } from '../../services/twilio.service.js';
import { LiveKitService } from '../../services/livekit.service.js';
import { CallRepository } from './call.repository.js';
import { CallEventService } from './call-event.service.js';
import { CallService } from './call.service.js';
import { TwilioWebhooksController } from './twilio-webhooks.controller.js';
import { LiveKitWebhooksController } from './livekit-webhooks.controller.js';

const callRepository = new CallRepository();
const callEventService = new CallEventService();
const twilioService = new TwilioService();
const livekitService = new LiveKitService();
const callService = new CallService(callRepository, callEventService, twilioService, livekitService);
const webhooksController = new TwilioWebhooksController(twilioService, callService);
const livekitWebhooksController = new LiveKitWebhooksController();

export const twilioWebhooksRouter = Router();

twilioWebhooksRouter.post('/twilio/inbound', asyncHandler(webhooksController.inbound));
twilioWebhooksRouter.post('/twilio/status', asyncHandler(webhooksController.status));
twilioWebhooksRouter.post('/twilio/outbound-twiml', asyncHandler(webhooksController.outboundTwiml));
twilioWebhooksRouter.post('/livekit/events', asyncHandler(livekitWebhooksController.handle));

