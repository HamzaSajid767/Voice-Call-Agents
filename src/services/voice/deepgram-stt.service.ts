import WebSocket from 'ws';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import type { SttService } from './stt.service.js';

type DeepgramMessage = {
  channel?: { alternatives?: Array<{ transcript?: string }> };
  is_final?: boolean;
  speech_final?: boolean;
  type?: string;
};

export class DeepgramSttService implements SttService {
  private ws: WebSocket | null = null;
  private onFinal: ((text: string) => void | Promise<void>) | null = null;
  private onPartial: ((text: string) => void | Promise<void>) | null = null;
  private speechStartAt: number | null = null;

  public async start(params: {
    sampleRate: number;
    onFinalTranscript: (text: string) => void | Promise<void>;
    onPartialTranscript?: (text: string) => void | Promise<void>;
  }): Promise<void> {
    if (!env.DEEPGRAM_API_KEY) {
      throw new Error('DEEPGRAM_API_KEY not configured');
    }
    this.onFinal = params.onFinalTranscript;
    this.onPartial = params.onPartialTranscript ?? null;

    const url =
      `wss://api.deepgram.com/v1/listen?` +
      new URLSearchParams({
        encoding: 'linear16',
        channels: '1',
        sample_rate: String(params.sampleRate),
        model: 'nova-2',
        interim_results: 'true',
        punctuate: 'true'
      }).toString();

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url, {
        headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}` }
      });
      this.ws = ws;

      ws.on('open', () => resolve());
      ws.on('error', (err) => reject(err));

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString('utf8')) as DeepgramMessage;
          const t = msg.channel?.alternatives?.[0]?.transcript ?? '';
          if (!t) return;

          if (msg.is_final || msg.speech_final) {
            const durMs = this.speechStartAt ? Math.max(0, performance.now() - this.speechStartAt) : undefined;
            this.speechStartAt = null;
            if (durMs !== undefined) {
              logger.info({ sttMs: Math.round(durMs) }, 'STT final transcript');
            }
            void this.onFinal?.(t);
          } else {
            if (this.speechStartAt === null) {
              this.speechStartAt = performance.now();
            }
            void this.onPartial?.(t);
          }
        } catch (err) {
          logger.warn({ err }, 'Deepgram STT message parse failed');
        }
      });

      ws.on('close', () => {
        this.ws = null;
      });
    });
  }

  public pushAudio(pcm: Int16Array): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // Send as little-endian 16-bit PCM
    const buf = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    ws.send(buf);
  }

  public async stop(): Promise<void> {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    try {
      ws.close();
    } catch {
      // ignore
    }
  }
}

