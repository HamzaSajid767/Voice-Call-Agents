import type { LlmMessage } from '../../services/llm.service.js';

export class PromptBuilderService {
  public build(params: {
    systemPrompt: string;
    tenantInstructions?: string;
    safetyRules: string;
    memoryContext: string;
    recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
    userInput: string;
  }): LlmMessage[] {
    const systemParts: string[] = [];
    if (params.systemPrompt?.trim()) systemParts.push(params.systemPrompt.trim());
    if (params.memoryContext?.trim()) systemParts.push(params.memoryContext.trim());
    // Keep a single short rule line (avoid verbose policy blocks).
    if (params.safetyRules?.trim()) systemParts.push(params.safetyRules.trim());
    const system = systemParts.join('\n');

    const messages: LlmMessage[] = [{ role: 'system', content: system }];

    for (const m of params.recentMessages) {
      messages.push({ role: m.role, content: m.content });
    }

    messages.push({ role: 'user', content: params.userInput });
    return messages;
  }
}

