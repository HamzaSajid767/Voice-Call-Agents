import type { CallEventType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BaseService } from '../../services/base.service.js';

export class CallEventService extends BaseService {
  public logEvent = (params: {
    tenantId: string;
    callSessionId: string;
    eventType: CallEventType;
    payload?: unknown;
  }): Promise<void> => {
    return this.execute('callEvent.log', async () => {
      await prisma.callEvent.create({
        data: {
          tenantId: params.tenantId,
          callSessionId: params.callSessionId,
          eventType: params.eventType,
          payload: params.payload ?? Prisma.JsonNull
        }
      });
    });
  };
}

