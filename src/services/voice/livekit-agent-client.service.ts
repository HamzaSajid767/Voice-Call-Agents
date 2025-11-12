import { AudioFrame, AudioSource, AudioStream, LocalAudioTrack, Room, RoomEvent, TrackKind, TrackPublishOptions, TrackSource } from '@livekit/rtc-node';
import { createHash } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { LiveKitService } from '../livekit.service.js';
import { logger } from '../../lib/logger.js';
import type { SttService } from './stt.service.js';
import type { TtsService } from './tts.service.js';
import { events } from '../../lib/events.js';
import { env } from '../../config/env.js';

type ActiveCall = {
  tenantId: string;
  callSessionId: string;
  roomName: string;
  agentId: string | null;
  room: Room;
  audioSource: AudioSource;
  audioTrack: ReturnType<typeof LocalAudioTrack.createAudioTrack>;
  stt: SttService;
  tts: TtsService;
  closed: boolean;
  speakChain: Promise<void>;
  processing: boolean;
  pendingUtterance: string | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  lastPartial: string;
  lastTriggeredKey: string | null;
  ttsCancelSeq: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class LiveKitAgentClient {
  private readonly livekit = new LiveKitService();
  private readonly active = new Map<string, ActiveCall>(); // key = callSessionId

  public constructor(private readonly sttFactory: () => SttService, private readonly ttsFactory: () => TtsService) {}

  public async joinCall(params: { tenantId: string; callSessionId: string }): Promise<void> {
    if (this.active.has(params.callSessionId)) return;

    const call = await prisma.callSession.findFirst({
      where: { id: params.callSessionId, tenantId: params.tenantId, deletedAt: null },
      select: { id: true, tenantId: true, agentId: true, livekitRoomName: true }
    });
    if (!call?.livekitRoomName) {
      return;
    }

    const identity = `ai-agent-${call.id}`;
    const token = this.livekit.generateToken({
      identity,
      roomName: call.livekitRoomName,
      participantName: 'ai-agent',
      metadata: { kind: 'AI' }
    });

    const room = new Room();
    const sampleRate = 48000;
    const audioSource = new AudioSource(sampleRate, 1);
    const audioTrack = LocalAudioTrack.createAudioTrack('ai-audio', audioSource);
    const opts = new TrackPublishOptions();
    opts.source = TrackSource.SOURCE_MICROPHONE;

    const stt = this.sttFactory();
    const tts = this.ttsFactory();

    const active: ActiveCall = {
      tenantId: call.tenantId,
      callSessionId: call.id,
      roomName: call.livekitRoomName,
      agentId: call.agentId,
      room,
      audioSource,
      audioTrack,
      stt,
      tts,
      closed: false,
      speakChain: Promise.resolve(),
      processing: false,
      pendingUtterance: null,
      debounceTimer: null,
      lastPartial: '',
      lastTriggeredKey: null,
      ttsCancelSeq: 0
    };
    this.active.set(call.id, active);

    room.on(RoomEvent.Disconnected, () => {
      active.closed = true;
      this.active.delete(call.id);
    });

    room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      if (track.kind !== TrackKind.KIND_AUDIO) return;
      if (participant.identity === identity) return;

      const stream = new AudioStream(track);
      void (async () => {
        try {
          for await (const frame of stream) {
            if (active.closed) break;
            // frame.data is Int16Array in rtc-node
            const pcm = frame.data as unknown as Int16Array;
            active.stt.pushAudio(pcm);
          }
        } catch (err) {
          logger.warn({ err }, 'AudioStream failed');
        }
      })();
    });

    const triggerUtterance = async (text: string): Promise<void> => {
      const t = String(text ?? '').trim();
      if (!t) return;
      if (!active.agentId) return;
      if (active.closed) return;

      const key = createHash('sha1').update(`${active.callSessionId}|${t}`).digest('hex');
      if (active.lastTriggeredKey === key) return;
      active.lastTriggeredKey = key;

      if (active.processing) {
        // queue latest only
        active.pendingUtterance = t;
        return;
      }
      active.processing = true;
      events.emit('call.message', {
        tenantId: active.tenantId,
        callSessionId: active.callSessionId,
        agentId: active.agentId,
        role: 'user',
        content: t
      });
    };

    const onSilence = async () => {
      active.debounceTimer = null;
      if (!active.lastPartial) return;
      await triggerUtterance(active.lastPartial);
      active.lastPartial = '';
    };

    const startStt = async () =>
      active.stt.start({
        sampleRate,
        onPartialTranscript: async (text) => {
          const t = String(text ?? '').trim();
          if (!t) return;
          active.lastPartial = t;
          if (active.debounceTimer) clearTimeout(active.debounceTimer);
          active.debounceTimer = setTimeout(() => void onSilence().catch(() => undefined), 700);
        },
        onFinalTranscript: async (text) => {
          const t = String(text ?? '').trim();
          if (!t) return;
          if (active.debounceTimer) {
            clearTimeout(active.debounceTimer);
            active.debounceTimer = null;
          }
          active.lastPartial = '';
          await triggerUtterance(t);
        }
      });
    try {
      await startStt();
    } catch (err) {
      // Retry once then give up (no STT).
      logger.warn({ err, callSessionId: call.id }, 'STT start failed, retrying once');
      await sleep(150);
      await startStt();
    }

    await room.connect(String(env.LIVEKIT_URL ?? ''), token);
    if (room.localParticipant) {
      await room.localParticipant.publishTrack(audioTrack, opts);
    }
    logger.info({ tenantId: call.tenantId, callSessionId: call.id, roomName: call.livekitRoomName }, 'AI agent joined LiveKit room');
  }

  public async leaveCall(params: { callSessionId: string }): Promise<void> {
    const active = this.active.get(params.callSessionId);
    if (!active) return;
    active.closed = true;
    if (active.debounceTimer) {
      clearTimeout(active.debounceTimer);
      active.debounceTimer = null;
    }
    this.active.delete(params.callSessionId);
    await active.stt.stop().catch(() => undefined);
    try {
      active.room.disconnect();
    } catch {
      // ignore
    }
    logger.info({ tenantId: active.tenantId, callSessionId: active.callSessionId, roomName: active.roomName }, 'AI agent left LiveKit room');
  }

  public async speak(params: { callSessionId: string; text: string }): Promise<void> {
    const active = this.active.get(params.callSessionId);
    if (!active) return;
    if (active.closed) return;
    const text = String(params.text ?? '').trim();
    if (!text) return;

    // Cancel any current/future playback loops from older responses.
    active.ttsCancelSeq += 1;
    const cancelSeq = active.ttsCancelSeq;

    // Serialize speech per call to avoid overlapping streams.
    active.speakChain = active.speakChain.then(async () => {
      if (active.closed) return;
      const t0 = performance.now();
      const sampleRate = 48000;
      const frameSamples = 960; // 20ms @ 48kHz mono

      const push = async (pcm: Int16Array) => {
        for (let i = 0; i < pcm.length; i += frameSamples) {
          if (active.closed) return;
          if (cancelSeq !== active.ttsCancelSeq) return;
          const slice = pcm.subarray(i, Math.min(pcm.length, i + frameSamples));
          const frame = new AudioFrame(slice, sampleRate, 1, slice.length);
          await active.audioSource.captureFrame(frame);
          await sleep(20);
        }
      };

      try {
        if (typeof active.tts.stream === 'function') {
          await active.tts.stream({ text, sampleRate, onPcm: push });
        } else {
          const pcm = await active.tts.synthesize({ text, sampleRate });
          await push(pcm);
        }
      } catch (err) {
        // Retry once then skip.
        logger.warn({ err, callSessionId: active.callSessionId }, 'TTS failed, retrying once');
        try {
          if (typeof active.tts.stream === 'function') {
            await active.tts.stream({ text, sampleRate, onPcm: push });
          } else {
            const pcm = await active.tts.synthesize({ text, sampleRate });
            await push(pcm);
          }
        } catch (err2) {
          logger.error({ err: err2, callSessionId: active.callSessionId }, 'TTS retry failed, skipping audio');
        }
      } finally {
        const ms = performance.now() - t0;
        logger.info({ callSessionId: active.callSessionId, ttsMs: Math.round(ms) }, 'TTS completed');
      }
    });
    await active.speakChain;

    // Release the per-call pipeline lock after playback completes.
    if (!active.closed) {
      active.processing = false;
      if (active.pendingUtterance) {
        const next = active.pendingUtterance;
        active.pendingUtterance = null;
        // Trigger next queued utterance immediately.
        const key = createHash('sha1').update(`${active.callSessionId}|${next}`).digest('hex');
        if (active.lastTriggeredKey !== key) {
          active.lastTriggeredKey = key;
          active.processing = true;
          if (active.agentId) {
            events.emit('call.message', {
              tenantId: active.tenantId,
              callSessionId: active.callSessionId,
              agentId: active.agentId,
              role: 'user',
              content: next
            });
          }
        }
      }
    }
  }
}

