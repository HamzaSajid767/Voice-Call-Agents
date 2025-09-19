import { Queue, type JobsOptions } from 'bullmq';
import { env } from '../config/env.js';

export type JobQueue = {
  add: (name: string, data: unknown, opts?: JobsOptions) => Promise<unknown>;
};

export const queueConnection = {
  connection: {
    url: env.REDIS_URL
  }
};

const stubQueue: JobQueue = {
  add: async () => undefined
};

const makeQueue = (name: string): JobQueue => {
  if (env.NODE_ENV === 'test' && !env.USE_REAL_REDIS_IN_TESTS) {
    return stubQueue;
  }
  return new Queue(name, queueConnection);
};

export const billingQueue = makeQueue('billing');
export const agentQueue = makeQueue('agent');
export const callQueue = makeQueue('call');

