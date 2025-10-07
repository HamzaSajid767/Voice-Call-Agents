import type { CallDirection, CallSession, CallSessionStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BaseRepository } from '../../lib/base.repository.js';

export class CallRepository extends BaseRepository<
  CallSession,
  Prisma.CallSessionUncheckedCreateInput,
  Prisma.CallSessionUpdateInput,
  { id: string; tenantId: string },
  Prisma.CallSessionWhereInput,
  Prisma.CallSessionOrderByWithRelationInput
> {
  public constructor() {
    super(prisma.callSession);
  }

  public createCallSession(params: {
    tenantId: string;
    direction: CallDirection;
    status: CallSessionStatus;
    fromNumber?: string;
    toNumber?: string;
    phoneNumberId?: string;
    agentId?: string;
    livekitRoomName: string;
    twilioCallSid?: string;
  }): Promise<CallSession> {
    const data: Prisma.CallSessionUncheckedCreateInput = {
      tenantId: params.tenantId,
      direction: params.direction,
      status: params.status,
      livekitRoomName: params.livekitRoomName,
      fromNumber: params.fromNumber ?? null,
      toNumber: params.toNumber ?? null,
      phoneNumberId: params.phoneNumberId ?? null,
      agentId: params.agentId ?? null,
      twilioCallSid: params.twilioCallSid ?? null
    };

    return prisma.callSession.create({ data });
  }

  public attachTwilioSid(tenantId: string, callSessionId: string, twilioCallSid: string): Promise<CallSession> {
    return prisma.callSession
      .updateMany({
        where: { id: callSessionId, tenantId, deletedAt: null },
        data: { twilioCallSid }
      })
      .then(() => prisma.callSession.findUnique({ where: { id: callSessionId } }))
      .then((row) => row as CallSession);
  }

  public updateCallStatus(params: {
    tenantId: string;
    callSessionId: string;
    status: CallSessionStatus;
    startedAt?: Date;
    endedAt?: Date;
    durationSeconds?: number;
  }): Promise<void> {
    return prisma.callSession
      .updateMany({
        where: { id: params.callSessionId, tenantId: params.tenantId, deletedAt: null },
        data: {
          status: params.status,
          ...(params.startedAt ? { startedAt: params.startedAt } : {}),
          ...(params.endedAt ? { endedAt: params.endedAt } : {}),
          ...(params.durationSeconds !== undefined ? { durationSeconds: params.durationSeconds } : {})
        }
      })
      .then(() => undefined);
  }

  public findByTwilioSid(twilioCallSid: string): Promise<CallSession | null> {
    return prisma.callSession.findFirst({
      where: { twilioCallSid, deletedAt: null }
    });
  }

  public fetchCallById(tenantId: string, callSessionId: string): Promise<CallSession | null> {
    return prisma.callSession.findFirst({
      where: { id: callSessionId, tenantId, deletedAt: null }
    });
  }

  public listTenantCalls(tenantId: string, params: { take: number; skip: number }): Promise<CallSession[]> {
    return prisma.callSession.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: params.take,
      skip: params.skip
    });
  }

  public countTenantCalls(tenantId: string): Promise<number> {
    return prisma.callSession.count({ where: { tenantId, deletedAt: null } });
  }
}

