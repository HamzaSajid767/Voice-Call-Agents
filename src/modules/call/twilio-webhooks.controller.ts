import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { ValidationError } from '../../lib/errors.js';
import type { TwilioService } from '../../services/twilio.service.js';
import type { CallService } from './call.service.js';
import { CacheService } from '../../services/cache.service.js';
import { validateSipTrunkConfig } from '../../services/sip-room.service.js';

export class TwilioWebhooksController {
  public constructor(private readonly twilioService: TwilioService, private readonly callService: CallService) {}
  private readonly cache = new CacheService();

  public inbound = async (req: Request, res: Response): Promise<void> => {
    this.twilioService.validateWebhook(req);

    const fromNumber = String(req.body['From'] ?? '');
    const toNumber = String(req.body['To'] ?? '');
    const callSid = String(req.body['CallSid'] ?? '');
    if (!fromNumber || !toNumber || !callSid) {
      throw new ValidationError('Invalid Twilio inbound payload');
    }
    const idemKey = `twilio:webhook:inbound:${callSid}`;
    const first = await this.cache.setIfNotExists(idemKey, 60 * 10);
    if (!first) {
      const roomName = await this.callService.getLivekitRoomByTwilioSid(callSid);
      if (roomName) {
        res.status(200).type('text/xml').send(this.twilioService.buildInboundTwiML({ roomName }));
        return;
      }
      res.status(200).type('text/xml').send(this.twilioService.buildInboundTwiML({ roomName: 'unknown' }));
      return;
    }

    const result = await this.callService.inboundFromTwilio({ fromNumber, toNumber, twilioCallSid: callSid });
    res.status(200).type('text/xml').send(result.twiml);
  };

  public status = async (req: Request, res: Response): Promise<void> => {
    this.twilioService.validateWebhook(req);

    const callSid = String(req.body['CallSid'] ?? '');
    const callStatus = String(req.body['CallStatus'] ?? '');
    const durationValue = req.body['CallDuration'] ? Number(req.body['CallDuration']) : undefined;
    if (!callSid || !callStatus) {
      throw new ValidationError('Invalid status callback payload');
    }
    const statusKey = `twilio:webhook:status:${callSid}:${callStatus}`;
    const first = await this.cache.setIfNotExists(statusKey, 60 * 10);
    if (!first) {
      res.status(200).json({ ok: true, deduped: true });
      return;
    }

    if (Number.isFinite(durationValue)) {
      await this.callService.handleTwilioStatusCallback({
        twilioCallSid: callSid,
        twilioStatus: callStatus as never,
        durationSeconds: durationValue as number
      });
    } else {
      await this.callService.handleTwilioStatusCallback({
        twilioCallSid: callSid,
        twilioStatus: callStatus as never
      });
    }

    res.status(200).json({ ok: true });
  };

  public outboundTwiml = async (req: Request, res: Response): Promise<void> => {
    this.twilioService.validateWebhook(req);

    const callSessionId = String(req.query['callSessionId'] ?? '');
    if (!callSessionId) {
      throw new ValidationError('Missing callSessionId');
    }

    const roomName = await this.callService.getLivekitRoomByCallSessionId(callSessionId);
    if (!roomName) {
      throw new ValidationError('Call session not found');
    }
    const { sipDomain } = validateSipTrunkConfig(env.LIVEKIT_SIP_DOMAIN ? { livekitSipDomain: env.LIVEKIT_SIP_DOMAIN } : {});

    const twiml = this.twilioService.buildInboundTwiML({ roomName, livekitSipDomain: sipDomain });
    res.status(200).type('text/xml').send(twiml);
  };
}

