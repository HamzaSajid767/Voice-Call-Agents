import { Worker } from 'bullmq';
import { queueConnection } from '../queue.js';
import { logger } from '../../lib/logger.js';

// Placeholder worker for future call-side async tasks (e.g. LiveKit room management retries).
export const startCallWorker = () => {
  const worker = new Worker(
    'call',
    async (job) => {
      logger.info({ name: job.name }, 'call worker received job');
    },
    { ...queueConnection, concurrency: 5 }
  );

  worker.on('failed', (job, err) => logger.error({ err, jobId: job?.id, name: job?.name }, 'call worker job failed'));
  return worker;
};

