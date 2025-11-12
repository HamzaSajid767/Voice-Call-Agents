export interface SttService {
  start(params: {
    sampleRate: number;
    onFinalTranscript: (text: string) => void | Promise<void>;
    onPartialTranscript?: (text: string) => void | Promise<void>;
  }): Promise<void>;

  pushAudio(pcm: Int16Array): void;

  stop(): Promise<void>;
}

