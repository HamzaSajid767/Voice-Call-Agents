import type { ErrorRequestHandler } from 'express';
import { AppError, InternalServerError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { metrics } from '../lib/metrics.js';

export const errorHandlerMiddleware: ErrorRequestHandler = (error, req, res, _next) => {
  const normalized = error instanceof AppError ? error : new InternalServerError();
  metrics.incError();

  logger.error(
    {
      err: error,
      requestId: req.context?.requestId,
      tenantId: req.context?.tenantId
    },
    'Request failed'
  );

  res.status(normalized.statusCode).json({
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details !== undefined ? { details: normalized.details } : {})
    },
    requestId: req.context?.requestId
  });
};
