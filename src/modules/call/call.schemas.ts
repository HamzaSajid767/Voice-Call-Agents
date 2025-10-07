import { z } from 'zod';

export const outboundCallBodySchema = z.object({
  toNumber: z.string().min(1).max(32),
  agentId: z.string().uuid().optional()
});

export const listCallsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

export type OutboundCallBody = z.infer<typeof outboundCallBodySchema>;
export type ListCallsQuery = z.infer<typeof listCallsQuerySchema>;

