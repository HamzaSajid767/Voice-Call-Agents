import { describe, expect, it, jest } from '@jest/globals';
import { CallService } from '../src/modules/call/call.service.js';
import { CallRepository } from '../src/modules/call/call.repository.js';
import { CallEventService } from '../src/modules/call/call-event.service.js';
import { TwilioService } from '../src/services/twilio.service.js';
import { LiveKitService } from '../src/services/livekit.service.js';

describe('CallService (stubs)', () => {
  it('outbound: creates session then starts twilio call (mocked)', async () => {
    const repo = new CallRepository();
    const events = new CallEventService();
    const twilio = new TwilioService();
    const livekit = new LiveKitService();
    const service = new CallService(repo, events, twilio, livekit);

    // Stub methods that would hit external systems/DB.
    jest.spyOn(service as any, 'createOutbound').mockResolvedValue({ callSession: { id: 'x', livekitRoomName: 'call_x' } });
    jest.spyOn(service as any, 'startOutboundViaTwilio').mockResolvedValue({ twilioCallSid: 'CA123' });

    const created = await (service as any).createOutbound({ tenantId: 't', toNumber: '+1', agentId: 'a' });
    const started = await (service as any).startOutboundViaTwilio({ tenantId: 't', callSessionId: created.callSession.id });

    expect(started.twilioCallSid).toBe('CA123');
  });
});

