import { describe, expect, it, jest } from '@jest/globals';
import { events } from '../src/lib/events.js';
import { AgentEventHandler } from '../src/modules/agent-runtime/agent-event.handler.js';
import { AgentRuntimeService } from '../src/modules/agent-runtime/agent-runtime.service.js';
import { PromptBuilderService } from '../src/modules/agent-runtime/prompt-builder.service.js';
import type { LlmService } from '../src/services/llm.service.js';
import { InMemoryVectorService } from '../src/services/vector/in-memory-vector.service.js';
import { prisma } from '../src/lib/prisma.js';

describe('agent runtime flow (simulated)', () => {
  it('call.message → agent.response', async () => {
    const llm: LlmService = {
      generateResponse: async () => 'Hello from agent',
      async *streamResponse() {
        yield 'Hello from agent';
      }
    };

    // Minimal prisma spies for runtime.
    jest.spyOn(prisma.callSession, 'findFirst').mockResolvedValue({
      id: 'call1',
      tenantId: 't1',
      agentId: 'a1',
      livekitRoomName: 'call_call1'
    } as any);
    jest.spyOn(prisma.agent, 'findFirst').mockResolvedValue({
      id: 'a1',
      systemPrompt: 'You are helpful',
      temperature: 0.2,
      voiceConfig: {},
      toolConfig: null
    } as any);
    jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue({
      id: 't1',
      name: 'Tenant',
      settings: { instructions: 'Be concise' }
    } as any);
    jest.spyOn(prisma.callEvent, 'create').mockResolvedValue({} as any);
    jest.spyOn(prisma.callEvent, 'findMany').mockResolvedValue([] as any);

    const runtime = new AgentRuntimeService(llm, new InMemoryVectorService(), new PromptBuilderService());
    new AgentEventHandler(runtime).register();

    const responses: string[] = [];
    events.on('agent.response', (e) => responses.push(e.content));

    events.emit('call.started', { tenantId: 't1', callSessionId: 'call1' });
    events.emit('call.message', {
      tenantId: 't1',
      callSessionId: 'call1',
      agentId: 'a1',
      role: 'user',
      content: 'Hi'
    });

    // Allow async handlers to run.
    await new Promise((r) => setTimeout(r, 10));

    expect(responses[0]).toBe('Hello from agent');
  });
});

