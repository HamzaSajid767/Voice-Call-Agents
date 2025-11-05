import { prisma } from '../../lib/prisma.js';
import { events } from '../../lib/events.js';
import { BaseService } from '../../services/base.service.js';
import type { LlmService } from '../../services/llm.service.js';
import { MeteredLlmService } from '../../services/metered-llm.service.js';
import { InternalServerError, NotFoundError } from '../../lib/errors.js';
import type { VectorService } from '../../interfaces/vector-service.interface.js';
import { MeteredVectorService } from '../../services/metered-vector.service.js';
import { MemoryService } from './memory.service.js';
import { PromptBuilderService } from './prompt-builder.service.js';
import { logger } from '../../lib/logger.js';

export class AgentRuntimeService extends BaseService {
  private readonly memoryService: MemoryService;

  public constructor(
    private readonly llmService: LlmService,
    private readonly vectorService: VectorService,
    private readonly promptBuilder: PromptBuilderService
  ) {
    super();
    this.memoryService = new MemoryService(this.vectorService);
  }

  public initializeForCall = (params: { tenantId: string; callSessionId: string }): Promise<void> => {
    return this.execute('agentRuntime.init', async () => {
      // Preload call metadata and ensure agent exists if linked.
      const call = await prisma.callSession.findFirst({
        where: { id: params.callSessionId, tenantId: params.tenantId, deletedAt: null },
        select: { id: true, tenantId: true, agentId: true, livekitRoomName: true }
      });
      if (!call) {
        throw new NotFoundError('Call not found');
      }
      // No-op initialization for now (future: attach streaming pipelines).
      void call;
    });
  };

  public handleMessage = (params: {
    tenantId: string;
    callSessionId: string;
    agentId: string;
    userText: string;
  }): Promise<void> => {
    return this.execute('agentRuntime.message', async () => {
      const t0 = performance.now();

      const [agent, tenant] = await Promise.all([
        prisma.agent.findFirst({
          where: { id: params.agentId, tenantId: params.tenantId, deletedAt: null, status: 'ACTIVE' },
          select: { id: true, systemPrompt: true, temperature: true, voiceConfig: true, toolConfig: true }
        }),
        prisma.tenant.findFirst({
          where: { id: params.tenantId, deletedAt: null },
          select: { id: true, settings: true, name: true }
        })
      ]);
      if (!agent) throw new NotFoundError('Agent not found');
      if (!tenant) throw new NotFoundError('Tenant not found');

      const tenantInstructions =
        tenant.settings && typeof tenant.settings === 'object' && 'instructions' in tenant.settings
          ? String((tenant.settings as Record<string, unknown>)['instructions'] ?? '')
          : undefined;

      const safetyRules = 'Be brief.';

      // Wrap vector so user store/search get metered per call/tenant.
      const meteredVector = this.vectorService instanceof MeteredVectorService
        ? this.vectorService
        : new MeteredVectorService(this.vectorService, { tenantId: params.tenantId, callSessionId: params.callSessionId, agentId: agent.id });
      const scopedMemory = new MemoryService(meteredVector);

      // Persist user message asynchronously (avoid blocking the hot path).
      void scopedMemory.storeCallMessage({
        tenantId: params.tenantId,
        agentId: agent.id,
        callId: params.callSessionId,
        role: 'user',
        content: params.userText
      }).catch((err) => logger.warn({ err }, 'Failed to store user message'));

      const tVector0 = performance.now();
      const [memoryContext, recent] = await Promise.all([
        scopedMemory.buildContext({
          tenantId: params.tenantId,
          agentId: agent.id,
          callId: params.callSessionId,
          query: params.userText
        }),
        scopedMemory.getRecentMessages({
          tenantId: params.tenantId,
          callId: params.callSessionId,
          take: 3
        })
      ]);
      const vectorMs = performance.now() - tVector0;

      const messages = this.promptBuilder.build({
        systemPrompt: agent.systemPrompt,
        ...(tenantInstructions ? { tenantInstructions } : {}),
        safetyRules,
        memoryContext,
        recentMessages: recent,
        userInput: params.userText
      });

      const meteredLlm = this.llmService instanceof MeteredLlmService
        ? this.llmService
        : new MeteredLlmService(this.llmService, { tenantId: params.tenantId, callSessionId: params.callSessionId, agentId: agent.id });

      const tLlm0 = performance.now();
      const response = await meteredLlm.generateResponse({
        messages,
        temperature: Number(agent.temperature)
      });
      const llmMs = performance.now() - tLlm0;
      if (!response) {
        throw new InternalServerError('LLM returned empty response');
      }

      // Persist assistant message asynchronously.
      void scopedMemory.storeCallMessage({
        tenantId: params.tenantId,
        agentId: agent.id,
        callId: params.callSessionId,
        role: 'assistant',
        content: response
      }).catch((err) => logger.warn({ err }, 'Failed to store assistant message'));

      events.emit('agent.response', {
        callSessionId: params.callSessionId,
        tenantId: params.tenantId,
        agentId: agent.id,
        content: response
      });

      const totalMs = performance.now() - t0;
      logger.info(
        { tenantId: params.tenantId, callSessionId: params.callSessionId, agentId: agent.id, totalMs: Math.round(totalMs), vectorMs: Math.round(vectorMs), llmMs: Math.round(llmMs) },
        'agent response generated'
      );
    });
  };
}

