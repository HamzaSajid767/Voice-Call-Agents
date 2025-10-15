import twilio, { type Twilio } from 'twilio';
import type { Request } from 'express';
import { env } from '../config/env.js';
import { AuthError, InternalServerError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export type TwilioCallStatus =
  | 'queued'
  | 'initiated'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'busy'
  | 'failed'
  | 'no-answer'
  | 'canceled';

export class TwilioService {
  private readonly client: Twilio;

  public constructor() {
    this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  public validateWebhook(req: Request): void {
    const signature = req.header('x-twilio-signature');
    if (!signature) {
      throw new AuthError('Missing Twilio signature');
    }

    const url = env.TWILIO_WEBHOOK_BASE_URL
      ? `${env.TWILIO_WEBHOOK_BASE_URL}${req.originalUrl}`
      : `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const params = (req.body ?? {}) as Record<string, string>;
    const ok = twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params);
    if (!ok) {
      throw new AuthError('Invalid Twilio signature');
    }
  }

  public buildInboundTwiML(params: { roomName: string; livekitSipDomain?: string }): string {
    const sipDomain = params.livekitSipDomain ?? env.LIVEKIT_SIP_DOMAIN;
    if (!sipDomain) {
      // Safe fallback: do not expose internal URLs; keep the webhook flow working.
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Call service is not configured.</Say>
  <Hangup/>
</Response>`;
    }

    const sipUri = `sip:${params.roomName}@${sipDomain}`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Sip>${sipUri}</Sip>
  </Connect>
</Response>`;
  }

  public async initiateCall(params: {
    to: string;
    from: string;
    twimlUrl: string;
    statusCallbackUrl: string;
    metadata?: Record<string, string>;
  }): Promise<{ callSid: string }> {
    try {
      const call = await this.client.calls.create({
        to: params.to,
        from: params.from,
        url: params.twimlUrl,
        statusCallback: params.statusCallbackUrl,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST'
      });
      return { callSid: call.sid };
    } catch (e) {
      logger.error({ err: e }, 'Twilio call initiation failed');
      throw new InternalServerError('Failed to initiate call', e);
    }
  }

  public async purchaseIncomingNumber(params: { country?: string; areaCode?: number }): Promise<{ e164: string; sid: string }> {
    // Best-effort helper for superadmin provisioning; in dev/test we allow a mocked purchase.
    const country = (params.country ?? 'US').toUpperCase();
    try {
      const search = await this.client.availablePhoneNumbers(country).local.list({
        ...(params.areaCode ? { areaCode: params.areaCode } : {}),
        limit: 1
      });
      const candidate = search[0];
      if (!candidate?.phoneNumber) {
        throw new Error('No available numbers found');
      }
      const purchased = await this.client.incomingPhoneNumbers.create({ phoneNumber: candidate.phoneNumber });
      return { e164: purchased.phoneNumber, sid: purchased.sid };
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') {
        const mock = `+1555${Math.floor(Math.random() * 9000000 + 1000000)}`;
        logger.warn({ err: e }, 'Twilio purchase failed; returning mock number (non-production)');
        return { e164: mock, sid: `PN_MOCK_${Date.now()}` };
      }
      logger.error({ err: e }, 'Twilio number purchase failed');
      throw new InternalServerError('Failed to purchase phone number', e);
    }
  }

  public parseStatusCallback(body: Record<string, unknown>): { callSid: string; status: TwilioCallStatus } {
    const callSid = String(body['CallSid'] ?? '');
    if (!callSid) {
      throw new AuthError('Missing CallSid');
    }

    const s = String(body['CallStatus'] ?? '');
    const allowed: TwilioCallStatus[] = [
      'queued',
      'initiated',
      'ringing',
      'in-progress',
      'completed',
      'busy',
      'failed',
      'no-answer',
      'canceled'
    ];
    if (!allowed.includes(s as TwilioCallStatus)) {
      throw new AuthError('Invalid call status');
    }

    return { callSid, status: s as TwilioCallStatus };
  }
}

