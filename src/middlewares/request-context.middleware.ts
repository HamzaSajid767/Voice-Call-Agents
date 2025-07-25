import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { RequestContextStore } from '../lib/request-context.js';

export const requestContextMiddleware: RequestHandler = (req, res, next) => {
  const requestId = req.header('x-request-id') ?? randomUUID();

  req.context = { requestId };
  res.setHeader('x-request-id', requestId);

  RequestContextStore.run({ requestId }, () => next());
};
