import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { requireAuth } from '../../middlewares/require-auth.middleware.js';
import { requireSuperAdmin } from '../../middlewares/require-superadmin.middleware.js';
import { validateRequest } from '../../middlewares/validate-request.middleware.js';
import { BillingService } from '../billing/billing.service.js';
import { UsageAggregatorJob } from '../billing/usage-aggregator.job.js';
import { AdminService } from './admin.service.js';
import { AnalyticsService } from './analytics.service.js';
import { MonitoringService } from './monitoring.service.js';
import { AdminController } from './admin.controller.js';
import { BillingAnalyticsService } from './billing-analytics.service.js';
import { z } from 'zod';
import { AgentRuntimeService } from '../agent-runtime/agent-runtime.service.js';
import { OllamaLlmService } from '../../services/ollama-llm.service.js';
import { QdrantVectorService } from '../../services/vector/qdrant-vector.service.js';
import { PromptBuilderService } from '../agent-runtime/prompt-builder.service.js';
import { TwilioService } from '../../services/twilio.service.js';
import {
  listTenantsQuerySchema,
  createTenantBodySchema,
  patchTenantBodySchema,
  listUsersQuerySchema,
  patchUserBodySchema,
  listCallsQuerySchema,
  listAgentsQuerySchema,
  patchAgentBodySchema,
  analyticsTrendsQuerySchema,
  billingBreakdownQuerySchema,
  purchasePhoneNumberBodySchema,
  assignPhoneNumberBodySchema
} from './admin.schemas.js';

const monitoringService = new MonitoringService();
monitoringService.register();

const adminService = new AdminService(new BillingService(), new UsageAggregatorJob(), new TwilioService());
const analyticsService = new AnalyticsService();
const billingAnalyticsService = new BillingAnalyticsService();
const adminController = new AdminController(adminService, analyticsService, monitoringService, billingAnalyticsService);

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(requireSuperAdmin);

adminRouter.get(
  '/tenants',
  validateRequest(listTenantsQuerySchema, 'query'),
  asyncHandler(adminController.listTenants)
);
adminRouter.post(
  '/tenants',
  validateRequest(createTenantBodySchema, 'body'),
  asyncHandler(adminController.createTenant)
);
adminRouter.get('/tenants/:id', asyncHandler(adminController.getTenant));
adminRouter.patch(
  '/tenants/:id',
  validateRequest(patchTenantBodySchema, 'body'),
  asyncHandler(adminController.patchTenant)
);

adminRouter.get(
  '/users',
  validateRequest(listUsersQuerySchema, 'query'),
  asyncHandler(adminController.listUsers)
);
adminRouter.patch(
  '/users/:id',
  validateRequest(patchUserBodySchema, 'body'),
  asyncHandler(adminController.patchUser)
);

adminRouter.get(
  '/calls',
  validateRequest(listCallsQuerySchema, 'query'),
  asyncHandler(adminController.listCalls)
);
adminRouter.get('/calls/:id', asyncHandler(adminController.getCall));

adminRouter.get(
  '/agents',
  validateRequest(listAgentsQuerySchema, 'query'),
  asyncHandler(adminController.listAgents)
);
adminRouter.get('/agents/:id', asyncHandler(adminController.getAgent));
adminRouter.patch(
  '/agents/:id',
  validateRequest(patchAgentBodySchema, 'body'),
  asyncHandler(adminController.patchAgent)
);

adminRouter.get(
  '/analytics/overview',
  asyncHandler(adminController.analyticsOverview)
);
adminRouter.get(
  '/analytics/tenant/:tenantId',
  asyncHandler(adminController.analyticsTenant)
);
adminRouter.get(
  '/analytics/trends',
  validateRequest(analyticsTrendsQuerySchema, 'query'),
  asyncHandler(adminController.analyticsTrends)
);

adminRouter.get(
  '/billing/breakdown',
  validateRequest(billingBreakdownQuerySchema, 'query'),
  asyncHandler(adminController.billingBreakdown)
);

adminRouter.get(
  '/monitoring/live',
  asyncHandler(adminController.monitoringLive)
);

adminRouter.get('/phone-numbers', asyncHandler(adminController.listPhoneNumbers));
adminRouter.post(
  '/phone-numbers/purchase',
  validateRequest(purchasePhoneNumberBodySchema, 'body'),
  asyncHandler(adminController.purchasePhoneNumber)
);
adminRouter.post(
  '/phone-numbers/assign',
  validateRequest(assignPhoneNumberBodySchema, 'body'),
  asyncHandler(adminController.assignPhoneNumber)
);

// Test-only debug helpers (kept behind super-admin + non-production guard)
if (process.env.NODE_ENV !== 'production') {
  const debugAgentMessageSchema = z.object({
    tenantId: z.string().uuid(),
    callSessionId: z.string().uuid(),
    agentId: z.string().uuid(),
    userText: z.string().min(1).max(2000)
  });

  const runtime = new AgentRuntimeService(new OllamaLlmService(), new QdrantVectorService(), new PromptBuilderService());

  adminRouter.post(
    '/debug/agent-message',
    validateRequest(debugAgentMessageSchema, 'body'),
    asyncHandler(async (req, res) => {
      const body = (req as any).validated?.body ?? req.body;
      await runtime.handleMessage({
        tenantId: body.tenantId,
        callSessionId: body.callSessionId,
        agentId: body.agentId,
        userText: body.userText
      });
      res.status(200).json({ data: { ok: true } });
    })
  );
}

