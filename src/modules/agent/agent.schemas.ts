import { z } from 'zod';

export const listAgentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

export const patchAgentBodySchema = z.object({
  systemPrompt: z.string().min(1).optional(),
  voiceConfig: z.record(z.string(), z.unknown()).optional(),
  temperature: z.number().min(0).max(2).optional()
});

export type ListAgentsQuery = z.infer<typeof listAgentsQuerySchema>;
export type PatchAgentBody = z.infer<typeof patchAgentBodySchema>;

