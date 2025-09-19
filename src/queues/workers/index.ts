import { startBillingWorker } from './billing.worker.js';
import { startAgentWorker } from './agent.worker.js';
import { startCallWorker } from './call.worker.js';

export const startWorkers = () => {
  startBillingWorker();
  startAgentWorker();
  startCallWorker();
};

