import type { Request, Response } from 'express';
import type { CallService } from './call.service.js';
import { QuotaService } from '../billing/quota.service.js';

export class CallController {
  public constructor(private readonly callService: CallService) {}
  private readonly quota = new QuotaService();

  public list = async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: { code: 'AUTH_ERROR', message: 'Unauthorized' } });
      return;
    }
    const q = (((req as any).validated?.query ?? req.query) as unknown) as { page: number; pageSize: number };
    const out = await this.callService.listCalls(tenantId, { page: q.page, pageSize: q.pageSize });
    res.status(200).json({ data: out });
  };

  public getById = async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: { code: 'AUTH_ERROR', message: 'Unauthorized' } });
      return;
    }
    const call = await this.callService.getCall(tenantId, String(req.params['id']));
    res.status(200).json({ data: { call } });
  };

  public createOutbound = async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth?.tenantId;
    if (!tenantId || req.auth?.type !== 'jwt') {
      res.status(401).json({ error: { code: 'AUTH_ERROR', message: 'Unauthorized' } });
      return;
    }
    await this.quota.enforceOutboundCallAllowed(tenantId);
    const created = await this.callService.createOutbound({
      tenantId,
      toNumber: req.body.toNumber,
      agentId: req.body.agentId
    });
    const twilio = await this.callService.startOutboundViaTwilio({ tenantId, callSessionId: created.callSession.id });
    res.status(201).json({
      data: {
        callSessionId: created.callSession.id,
        livekitRoomName: created.callSession.livekitRoomName,
        twilioCallSid: twilio.twilioCallSid
      }
    });
  };
}

