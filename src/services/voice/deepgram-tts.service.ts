import { env } from '../../config/env.js';
import type { TtsService } from './tts.service.js';

export class DeepgramTtsService implements TtsService {
  public async synthesize(params: { text: string; sampleRate: number }): Promise<Int16Array> {
    if (!env.DEEPGRAM_API_KEY) {
      throw new Error('DEEPGRAM_API_KEY not configured');
    }
    const model = 'aura-asteria-en';
    const url = `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=linear16&sample_rate=${encodeURIComponent(
      String(params.sampleRate)
    )}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ text: params.text })
    });
    if (!resp.ok) {
      throw new Error(`Deepgram TTS http ${resp.status}`);
    }
    const ab = await resp.arrayBuffer();
    // Deepgram returns raw linear16 PCM bytes; interpret as Int16LE.
    return new Int16Array(ab);
  }

  public async stream(params: { text: string; sampleRate: number; onPcm: (chunk: Int16Array) => void | Promise<void> }): Promise<void> {
    if (!env.DEEPGRAM_API_KEY) {
      throw new Error('DEEPGRAM_API_KEY not configured');
    }
    const model = 'aura-asteria-en';
    const url = `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=linear16&sample_rate=${encodeURIComponent(
      String(params.sampleRate)
    )}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ text: params.text })
    });
    if (!resp.ok || !resp.body) {
      throw new Error(`Deepgram TTS http ${resp.status}`);
    }

    const reader = resp.body.getReader();
    let carry = new Uint8Array(0);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;
      // concat carry + value
      const merged = new Uint8Array(carry.length + value.length);
      merged.set(carry, 0);
      merged.set(value, carry.length);

      // ensure even byte length for int16
      const even = merged.length - (merged.length % 2);
      if (even > 0) {
        const chunkBytes = merged.subarray(0, even);
        carry = merged.subarray(even);
        const i16 = new Int16Array(chunkBytes.buffer, chunkBytes.byteOffset, chunkBytes.byteLength / 2);
        await params.onPcm(i16);
      } else {
        carry = merged;
      }
    }
    if (carry.length >= 2) {
      const even = carry.length - (carry.length % 2);
      if (even > 0) {
        const chunkBytes = carry.subarray(0, even);
        const i16 = new Int16Array(chunkBytes.buffer, chunkBytes.byteOffset, chunkBytes.byteLength / 2);
        await params.onPcm(i16);
      }
    }
  }
}

