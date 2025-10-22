import type { Request, Response } from 'express';
import { WebhookReceiver, type WebhookEventNames } from 'livekit-server-sdk';
import { env } from '../../config/env.js';
import { CacheService } from '../../services/cache.service.js';
import { prisma } from '../../lib/prisma.js';
import { events } from '../../lib/events.js';
import { logger } from '../../lib/logger.js';

const handledEvents: ReadonlySet<WebhookEventNames> = new Set(['participant_joined', 'participant_left', 'track_published']);

const buildIdempotencyKey = (e: { event?: string; id?: string; room?: { name?: string }; participant?: { identity?: string }; track?: { sid?: string } }) => {
  const parts = [
    e.id ? `id=${e.id}` : null,
    e.event ? `ev=${e.event}` : null,
    e.room?.name ? `room=${e.room.name}` : null,
    e.participant?.identity ? `p=${e.participant.identity}` : null,
    e.track?.sid ? `t=${e.track.sid}` : null
  ].filter(Boolean);
  return `livekit:webhook:${parts.join(':')}`;
};

export class LiveKitWebhooksController {
  private readonly receiver = new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  private readonly cache = new CacheService();

  public handle = async (req: Request, res: Response): Promise<void> => {
    const auth = req.header('authorization') ?? undefined;
    const body = req.rawBody ?? '';
    if (!body) {
      // No raw body => cannot validate signature; still return 200 to avoid webhook retries storm.
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    let event: Awaited<ReturnType<WebhookReceiver['receive']>>;
    try {
      event = await this.receiver.receive(body, auth);
    } catch (err) {
      logger.warn({ err }, 'LiveKit webhook signature validation failed');
      res.status(401).json({ ok: false });
      return;
    }

    if (!handledEvents.has(event.event)) {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    const idemKey = buildIdempotencyKey(event as unknown as { event?: string; id?: string; room?: { name?: string }; participant?: { identity?: string }; track?: { sid?: string } });
    const first = await this.cache.setIfNotExists(idemKey, 60 * 10);
    if (!first) {
      res.status(200).json({ ok: true, deduped: true });
      return;
    }

    const roomName = event.room?.name ?? '';
    if (!roomName) {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    const call = await prisma.callSession.findFirst({
      where: { livekitRoomName: roomName, deletedAt: null },
      select: { id: true, tenantId: true, startedAt: true, endedAt: true, status: true }
    });
    if (!call) {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    if (event.event === 'participant_joined') {
      if (!call.startedAt) {
        await prisma.callSession.update({ where: { id: call.id }, data: { startedAt: new Date(), status: 'IN_PROGRESS' } });
        events.emit('call.started', { callSessionId: call.id, tenantId: call.tenantId });
      }

      const kind = String((event.participant as unknown as { kind?: string } | undefined)?.kind ?? '');
      if (kind !== 'SIP') {
        events.emit('agent.joined', { callSessionId: call.id, tenantId: call.tenantId });
      }
    }

    if (event.event === 'participant_left') {
      const kind = String((event.participant as unknown as { kind?: string } | undefined)?.kind ?? '');
      // End call when SIP leg leaves; Twilio status callback can also end the call (idempotent via endedAt).
      if (kind === 'SIP' && !call.endedAt) {
        await prisma.callSession.update({ where: { id: call.id }, data: { endedAt: new Date(), status: 'COMPLETED' } });
        events.emit('call.ended', { callSessionId: call.id, tenantId: call.tenantId, status: 'COMPLETED' });
      }
    }

    if (event.event === 'track_published') {
      // When media arrives, ensure runtime init is triggered quickly (if not already).
      if (!call.startedAt) {
        await prisma.callSession.update({ where: { id: call.id }, data: { startedAt: new Date(), status: 'IN_PROGRESS' } });
        events.emit('call.started', { callSessionId: call.id, tenantId: call.tenantId });
      }
    }

    res.status(200).json({ ok: true });
  };
}

