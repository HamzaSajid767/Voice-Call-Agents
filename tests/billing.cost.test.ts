import { describe, expect, it, jest } from '@jest/globals';
import { CostCalculatorService } from '../src/modules/billing/cost-calculator.service.js';
import { UsageAggregatorJob } from '../src/modules/billing/usage-aggregator.job.js';
import { BillingEventHandler } from '../src/modules/billing/billing-event.handler.js';
import { UsageService } from '../src/modules/billing/usage.service.js';
import { events } from '../src/lib/events.js';
import { prisma } from '../src/lib/prisma.js';

describe('billing cost engine', () => {
  it('calculates cost = quantity × rate', () => {
    const svc = new CostCalculatorService();
    const pricing = {
      CALL_MINUTE_RATE: 0.1,
      LLM_INPUT_TOKEN_RATE: 0.01,
      LLM_OUTPUT_TOKEN_RATE: 0.02,
      VECTOR_SEARCH_RATE: 0.5,
      VECTOR_UPSERT_RATE: 0.25
    };
    const out = svc.calculateCost({ pricing, type: 'CALL_MINUTES', quantity: 3 });
    expect(out.totalCost).toBeCloseTo(0.3);
  });

  it('call.ended produces CALL_MINUTES usage record', async () => {
    const tenantSpy = jest.spyOn(prisma.tenant, 'findFirst').mockResolvedValue({ settings: { pricing: { CALL_MINUTE_RATE: 0.1 } } } as any);
    const callSpy = jest
      .spyOn(prisma.callSession, 'findFirst')
      .mockResolvedValue({ durationSeconds: 61, startedAt: null, endedAt: null, agentId: null } as any);
    const createSpy = jest.spyOn(prisma.usageRecord, 'create').mockResolvedValue({} as any);

    const handler = new BillingEventHandler(new UsageService(new CostCalculatorService()));
    handler.register();

    events.emit('call.ended', { tenantId: 't1', callSessionId: 'c1', status: 'COMPLETED' });
    await new Promise((r) => setTimeout(r, 10));

    expect(createSpy.mock.calls.length).toBeGreaterThan(0);
    tenantSpy.mockRestore();
    callSpy.mockRestore();
    createSpy.mockRestore();
  });

  it('aggregator sums by metadata.type', async () => {
    const findSpy = jest.spyOn(prisma.usageRecord, 'findMany').mockResolvedValue([
      { quantity: 2, totalCost: 1, metadata: { type: 'CALL_MINUTES' } },
      { quantity: 5, totalCost: 2, metadata: { type: 'LLM_TOKENS_INPUT' } }
    ] as any);
    const job = new UsageAggregatorJob();
    const out = await job.runForTenant({ tenantId: 't1', from: new Date(0), to: new Date() });
    expect(out.byType['CALL_MINUTES']).toBe(2);
    expect(out.totalCost).toBe(3);
    findSpy.mockRestore();
  });
});

