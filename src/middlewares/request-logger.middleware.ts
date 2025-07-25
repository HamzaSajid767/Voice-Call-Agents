import type { RequestHandler } from 'express';
import { logger } from '../lib/logger.js';
import { metrics } from '../lib/metrics.js';

export const requestLoggerMiddleware: RequestHandler = (req, res, next) => {
  const startTime = process.hrtime.bigint();
  metrics.incRequest();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    metrics.observeResponse(durationMs);
    logger.info(
      {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2))
      },
      'HTTP request completed'
    );
  });

  next();
};
