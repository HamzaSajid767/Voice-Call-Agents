import { Worker } from 'bullmq';
import { queueConnection } from '../queue.js';
import { UsageService } from '../../modules/billing/usage.service.js';
import { CostCalculatorService } from '../../modules/billing/cost-calculator.service.js';
import { BillingEventHandler } from '../../modules/billing/billing-event.handler.js';
import { logger } from '../../lib/logger.js';

const usageService = new UsageService(new CostCalculatorService());
const handler = new BillingEventHandler(usageService);

export type BillingJob =
  | { name: 'usage.metered'; data: Parameters<UsageService['recordUsage']>[0] }
  | { name: 'call.ended'; data: { tenantId: string; callSessionId: string } };

export const startBillingWorker = () => {
  const worker = new Worker(
    'billing',
    async (job) => {
      if (job.name === 'usage.metered') {
        await usageService.recordUsage(job.data as any);
        return;
      }
      if (job.name === 'call.ended') {
        // reuse handler logic by calling its private method via a small shim
        // (keeps core logic in one place).
        await (handler as any).handleCallEnded(job.data.tenantId, job.data.callSessionId);
        return;
      }
    },
    {
      ...queueConnection,
      concurrency: 10
    }
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id, name: job?.name }, 'billing worker job failed');
  });
  return worker;
};

