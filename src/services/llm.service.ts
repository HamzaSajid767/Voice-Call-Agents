export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateResponseInput {
  messages: LlmMessage[];
  temperature: number;
}

export interface LlmService {
  generateResponse(input: GenerateResponseInput): Promise<string>;
  streamResponse(input: GenerateResponseInput): AsyncIterable<string>;
}

/**
 * Default LLM implementation for dev/tests.
 * Real provider adapters (OpenAI, etc.) will implement `LlmService`.
 */
export class MockLlmService implements LlmService {
  public async generateResponse(input: GenerateResponseInput): Promise<string> {
    const lastUser = [...input.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    return `I heard: ${lastUser}`.trim();
  }

  public async *streamResponse(input: GenerateResponseInput): AsyncIterable<string> {
    const full = await this.generateResponse(input);
    yield full;
  }
}

