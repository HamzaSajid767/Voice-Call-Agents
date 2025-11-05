import { events } from '../lib/events.js';
import type { GenerateResponseInput, LlmService } from './llm.service.js';

const estimateTokens = (text: string): number => {
  // Heuristic: ~4 chars per token average.
  return Math.max(1, Math.ceil(text.length / 4));
};

export class MeteredLlmService implements LlmService {
  public constructor(
    private readonly inner: LlmService,
    private readonly context: { tenantId: string; callSessionId?: string; agentId?: string }
  ) {}

  public async generateResponse(input: GenerateResponseInput): Promise<string> {
    const promptText = input.messages.map((m) => `${m.role}: ${m.content}`).join('\n');
    const inputTokens = estimateTokens(promptText);

    const out = await this.inner.generateResponse(input);
    const outputTokens = estimateTokens(out);

    events.emit('usage.metered', {
      tenantId: this.context.tenantId,
      ...(this.context.callSessionId ? { callSessionId: this.context.callSessionId } : {}),
      ...(this.context.agentId ? { agentId: this.context.agentId } : {}),
      type: 'LLM_TOKENS_INPUT',
      quantity: inputTokens,
      metadata: { model: 'ollama', temperature: input.temperature }
    });
    events.emit('usage.metered', {
      tenantId: this.context.tenantId,
      ...(this.context.callSessionId ? { callSessionId: this.context.callSessionId } : {}),
      ...(this.context.agentId ? { agentId: this.context.agentId } : {}),
      type: 'LLM_TOKENS_OUTPUT',
      quantity: outputTokens,
      metadata: { model: 'ollama' }
    });

    return out;
  }

  public async *streamResponse(input: GenerateResponseInput): AsyncIterable<string> {
    // For now, meter once by materializing the full result.
    yield await this.generateResponse(input);
  }
}

