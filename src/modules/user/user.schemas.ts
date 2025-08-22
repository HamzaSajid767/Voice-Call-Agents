import { z } from 'zod';

export const createUserBodySchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1).max(160)
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED']).optional()
});

export type CreateUserBody = z.infer<typeof createUserBodySchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
