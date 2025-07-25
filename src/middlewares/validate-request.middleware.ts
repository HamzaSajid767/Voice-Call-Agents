import type { RequestHandler } from 'express';
import { z, flattenError, type ZodType } from 'zod';
import { ValidationError } from '../lib/errors.js';

type ValidationTarget = 'body' | 'query' | 'params';

export const validateRequest = <TSchema extends ZodType>(
  schema: TSchema,
  target: ValidationTarget = 'body'
): RequestHandler => {
  return (req, _res, next) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      throw new ValidationError('Invalid request payload', flattenError(result.error));
    }

    (req as any).validated = (req as any).validated ?? {};
    (req as any).validated[target] = result.data;

    if (target === 'body') {
      req.body = result.data;
    } else {
      // Express 5 defines req.query/req.params with accessors; reassigning can throw.
      // Mutate the existing object instead.
      Object.assign(req[target] as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>);
    }
    next();
  };
};
