import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { requireAuth } from '../../middlewares/require-auth.middleware.js';
import { requireClient } from '../../middlewares/require-client.middleware.js';
import { validateRequest } from '../../middlewares/validate-request.middleware.js';
import { AgentService } from './agent.service.js';
import { AgentController } from './agent.controller.js';
import { listAgentsQuerySchema, patchAgentBodySchema } from './agent.schemas.js';

const agentService = new AgentService();
const agentController = new AgentController(agentService);

export const agentRouter = Router();

agentRouter.use(requireAuth);
agentRouter.use(requireClient);

agentRouter.get('/', validateRequest(listAgentsQuerySchema, 'query'), asyncHandler(agentController.list));
agentRouter.patch('/:id', validateRequest(patchAgentBodySchema, 'body'), asyncHandler(agentController.patch));

