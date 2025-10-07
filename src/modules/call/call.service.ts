import type { CallSession, CallSessionStatus } from '@prisma/client';
import { env } from '../../config/env.js';
import { events } from '../../lib/events.js';
import { ConflictError, InternalServerError, NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { BaseService } from '../../services/base.service.js';
import { LiveKitService } from '../../services/livekit.service.js';
import { TwilioService, type TwilioCallStatus } from '../../services/twilio.service.js';
import { CallEventService } from './call-event.service.js';
import { CallRepository } from './call.repository.js';
import { buildSipRoomName } from '../../services/sip-room.service.js';

const roomNameForCall = (params: { tenantId: string; callSessionId: string }) =>
  buildSipRoomName({ tenantId: params.tenantId, callId: params.callSessionId });

const mapTwilioStatus = (status: TwilioCallStatus): CallSessionStatus => {
  switch (status) {
    case 'queued':
    case 'initiated':
      return 'INITIATED';
    case 'ringing':
      return 'RINGING';
    case 'in-progress':
      return 'IN_PROGRESS';
    case 'completed':
      return 'COMPLETED';
    case 'no-answer':
      return 'NO_ANSWER';
    case 'canceled':
      return 'CANCELED';
    case 'busy':
    case 'failed':
      return 'FAILED';
    default:
      return 'FAILED';
  }
};

export class CallService extends BaseService {
  public constructor(
    private readonly callRepository: CallRepository,
    private readonly callEventService: CallEventService,
    private readonly twilioService: TwilioService,
    private readonly livekitService: LiveKitService
  ) {
    super();
  }

  public inboundFromTwilio = (params: {
    fromNumber: string;
    toNumber: string;
    twilioCallSid: string;
  }): Promise<{ callSession: CallSession; twiml: string }> => {
    return this.execute('call.inbound', async () => {
      const phoneNumber = await prisma.phoneNumber.findFirst({
        where: { e164: params.toNumber, isActive: true, deletedAt: null }
      });
      if (!phoneNumber) {
        throw new NotFoundError('Phone number not found');
      }

      const tenantId = phoneNumber.tenantId;
      if (!tenantId) {
        throw new NotFoundError('Phone number is not assigned to a tenant');
      }
      const tenant = await prisma.tenant.findFirst({
        where: { id: tenantId, deletedAt: null },
        select: { defaultAgentId: true }
      });
      const agentId = phoneNumber.agentId ?? tenant?.defaultAgentId ?? null;

      const callSession = await this.callRepository.createCallSession({
        tenantId,
        direction: 'INBOUND',
        status: 'INITIATED',
        fromNumber: params.fromNumber,
        toNumber: params.toNumber,
        phoneNumberId: phoneNumber.id,
        ...(agentId ? { agentId } : {}),
        livekitRoomName: 'pending',
        twilioCallSid: params.twilioCallSid
      });

      const roomName = roomNameForCall({ tenantId, callSessionId: callSession.id });
      await prisma.callSession.update({
        where: { id: callSession.id },
        data: { livekitRoomName: roomName }
      });

      void this.livekitService.createRoom(roomName);

      await this.callEventService.logEvent({
        tenantId,
        callSessionId: callSession.id,
        eventType: 'TWILIO_WEBHOOK_RECEIVED',
        payload: { from: params.fromNumber, to: params.toNumber, callSid: params.twilioCallSid }
      });

      events.emit('call.created', { callSessionId: callSession.id, tenantId, direction: 'INBOUND' });

      const twiml = this.twilioService.buildInboundTwiML({ roomName });
      return { callSession, twiml };
    });
  };

  public createOutbound = (params: { tenantId: string; toNumber: string; agentId?: string }): Promise<{ callSession: CallSession }> => {
    return this.execute('call.outbound.create', async () => {
      const effectiveAgentId =
        params.agentId ??
        (await prisma.tenant.findFirst({ where: { id: params.tenantId, deletedAt: null }, select: { defaultAgentId: true } }))?.defaultAgentId ??
        null;
      if (!effectiveAgentId) {
        throw new NotFoundError('No default agent configured for tenant');
      }

      const agent = await prisma.agent.findFirst({
        where: { id: effectiveAgentId, tenantId: params.tenantId, deletedAt: null, status: 'ACTIVE' }
      });
      if (!agent) throw new NotFoundError('Agent not found');

      const fromNumber = await prisma.phoneNumber.findFirst({
        where: {
          tenantId: params.tenantId,
          deletedAt: null,
          isActive: true,
          ...(agent.id ? { agentId: agent.id } : {})
        }
      });
      const fallbackFrom =
        fromNumber ??
        (await prisma.phoneNumber.findFirst({
          where: { tenantId: params.tenantId, isActive: true, deletedAt: null }
        }));
      if (!fallbackFrom) {
        throw new ConflictError('No active phone number available for tenant');
      }

      const callSession = await this.callRepository.createCallSession({
        tenantId: params.tenantId,
        direction: 'OUTBOUND',
        status: 'INITIATED',
        fromNumber: fallbackFrom.e164,
        toNumber: params.toNumber,
        phoneNumberId: fallbackFrom.id,
        agentId: agent.id,
        livekitRoomName: 'pending'
      });

      const roomName = roomNameForCall({ tenantId: params.tenantId, callSessionId: callSession.id });
      await prisma.callSession.update({
        where: { id: callSession.id },
        data: { livekitRoomName: roomName }
      });
      void this.livekitService.createRoom(roomName);

      events.emit('call.created', { callSessionId: callSession.id, tenantId: params.tenantId, direction: 'OUTBOUND' });
      await this.callEventService.logEvent({
        tenantId: params.tenantId,
        callSessionId: callSession.id,
        eventType: 'SESSION_CREATED',
        payload: { direction: 'OUTBOUND', to: params.toNumber, agentId: agent.id }
      });

      return { callSession };
    });
  };

  public startOutboundViaTwilio = async (params: { tenantId: string; callSessionId: string }): Promise<{ twilioCallSid: string }> => {
    return this.execute('call.outbound.twilio', async () => {
      const call = await this.callRepository.fetchCallById(params.tenantId, params.callSessionId);
      if (!call) {
        throw new NotFoundError('Call not found');
      }
      if (!call.fromNumber || !call.toNumber) {
        throw new InternalServerError('Call is missing from/to number');
      }

      if (!env.TWILIO_WEBHOOK_BASE_URL) {
        throw new ConflictError('TWILIO_WEBHOOK_BASE_URL is required to initiate outbound calls');
      }
      const root = env.TWILIO_WEBHOOK_BASE_URL;
      const connectUrl = `${root}/webhooks/twilio/outbound-twiml?callSessionId=${call.id}`;
      const statusUrl = `${root}/webhooks/twilio/status`;

      const result = await this.twilioService.initiateCall({
        to: call.toNumber,
        from: call.fromNumber,
        twimlUrl: connectUrl,
        statusCallbackUrl: statusUrl
      });

      await prisma.callSession.update({
        where: { id: call.id },
        data: { twilioCallSid: result.callSid }
      });

      await this.callEventService.logEvent({
        tenantId: params.tenantId,
        callSessionId: call.id,
        eventType: 'CALL_STATUS_UPDATED',
        payload: { twilioCallSid: result.callSid, status: 'INITIATED' }
      });

      return { twilioCallSid: result.callSid };
    });
  };

  public handleTwilioStatusCallback = (params: { twilioCallSid: string; twilioStatus: TwilioCallStatus; durationSeconds?: number }): Promise<void> => {
    return this.execute('call.twilio.status', async () => {
      const call = await this.callRepository.findByTwilioSid(params.twilioCallSid);
      if (!call) {
        // Callback can race DB creation; do not fail Twilio.
        logger.warn({ twilioCallSid: params.twilioCallSid }, 'Call session not found for status callback');
        return;
      }

      const nextStatus = mapTwilioStatus(params.twilioStatus);

      const startedAt = nextStatus === 'IN_PROGRESS' && !call.startedAt ? new Date() : undefined;
      const endedAt =
        ['COMPLETED', 'FAILED', 'NO_ANSWER', 'CANCELED'].includes(nextStatus) && !call.endedAt
          ? new Date()
          : undefined;

      const update =
        startedAt || endedAt || params.durationSeconds !== undefined
          ? {
              tenantId: call.tenantId,
              callSessionId: call.id,
              status: nextStatus,
              ...(startedAt ? { startedAt } : {}),
              ...(endedAt ? { endedAt } : {}),
              ...(params.durationSeconds !== undefined ? { durationSeconds: params.durationSeconds } : {})
            }
          : { tenantId: call.tenantId, callSessionId: call.id, status: nextStatus };

      await this.callRepository.updateCallStatus(update);

      await this.callEventService.logEvent({
        tenantId: call.tenantId,
        callSessionId: call.id,
        eventType: 'CALL_STATUS_UPDATED',
        payload: { status: nextStatus, twilioStatus: params.twilioStatus }
      });

      if (nextStatus === 'IN_PROGRESS') {
        events.emit('call.started', { callSessionId: call.id, tenantId: call.tenantId });
      }
      if (['COMPLETED', 'FAILED', 'NO_ANSWER', 'CANCELED'].includes(nextStatus)) {
        events.emit('call.ended', { callSessionId: call.id, tenantId: call.tenantId, status: nextStatus });
        void this.livekitService.deleteRoom(
          call.livekitRoomName ?? roomNameForCall({ tenantId: call.tenantId, callSessionId: call.id })
        );
      }
    });
  };

  public getLivekitRoomByTwilioSid = (twilioCallSid: string): Promise<string | null> => {
    return this.execute('call.roomBySid', async () => {
      const call = await this.callRepository.findByTwilioSid(twilioCallSid);
      return call?.livekitRoomName ?? null;
    });
  };

  public getLivekitRoomByCallSessionId = (callSessionId: string): Promise<string | null> => {
    return this.execute('call.roomById', async () => {
      const row = await prisma.callSession.findFirst({
        where: { id: callSessionId, deletedAt: null },
        select: { livekitRoomName: true }
      });
      return row?.livekitRoomName ?? null;
    });
  };

  public getCall = (tenantId: string, callSessionId: string): Promise<CallSession> => {
    return this.execute('call.get', async () => {
      const call = await this.callRepository.fetchCallById(tenantId, callSessionId);
      if (!call) {
        throw new NotFoundError('Call not found');
      }
      return call;
    });
  };

  public listCalls = (tenantId: string, params: { page: number; pageSize: number }): Promise<{ data: CallSession[]; total: number; page: number; pageSize: number }> => {
    return this.execute('call.list', async () => {
      const skip = (params.page - 1) * params.pageSize;
      const [rows, total] = await Promise.all([
        this.callRepository.listTenantCalls(tenantId, { take: params.pageSize, skip }),
        this.callRepository.countTenantCalls(tenantId)
      ]);
      return { data: rows, total, page: params.page, pageSize: params.pageSize };
    });
  };
}

