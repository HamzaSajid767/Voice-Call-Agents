export interface TtsService {
  synthesize(params: { text: string; sampleRate: number }): Promise<Int16Array>;

  stream?(params: { text: string; sampleRate: number; onPcm: (chunk: Int16Array) => void | Promise<void> }): Promise<void>;
}

