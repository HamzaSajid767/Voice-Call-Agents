import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { startWorkers } from './queues/workers/index.js';

let server: Server | undefined;

const startServer = async (): Promise<void> => {
  const app = createApp();
  server = createServer(app);

  await new Promise<void>((resolve) => {
    server?.listen(env.PORT, () => resolve());
  });

  logger.info({ port: env.PORT }, 'Server started');

  if (env.RUN_WORKERS) {
    startWorkers();
    logger.info('Workers started');
  }
};

const gracefulShutdown = (signal: NodeJS.Signals): void => {
  logger.warn({ signal }, 'Graceful shutdown initiated');
  server?.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

void startServer().catch((error: unknown) => {
  logger.error({ err: error }, 'Startup failed');
  process.exit(1);
});
