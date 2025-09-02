import { z } from 'zod';

export const createApiKeyBodySchema = z.object({
  name: z.string().min(1).max(120)
});

export type CreateApiKeyBody = z.infer<typeof createApiKeyBodySchema>;
