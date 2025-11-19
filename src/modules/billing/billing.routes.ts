import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { requireAuth } from '../../middlewares/require-auth.middleware.js';
import { requireClient } from '../../middlewares/require-client.middleware.js';
import { BillingService } from './billing.service.js';
import { BillingController } from './billing.controller.js';

const billingController = new BillingController(new BillingService());

export const billingRouter = Router();

billingRouter.use(requireAuth);
billingRouter.use(requireClient);

billingRouter.get('/', asyncHandler(billingController.getSummary));

