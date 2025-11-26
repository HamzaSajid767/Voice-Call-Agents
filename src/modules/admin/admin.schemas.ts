import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50)
});

export const listTenantsQuerySchema = paginationQuerySchema;

export const createTenantBodySchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().email().max(255),
  plan: z.string().min(1).max(80),
  region: z.string().min(1).max(40)
});

export const purchasePhoneNumberBodySchema = z.object({
  // If provided, we just register it (useful for SIP/manual inventory). Otherwise we ask Twilio to buy one.
  e164: z.string().min(1).max(32).optional(),
  country: z.string().min(2).max(2).optional(),
  areaCode: z.number().int().min(1).max(999).optional(),
  provider: z.enum(['TWILIO', 'SIP']).default('TWILIO')
});

export const assignPhoneNumberBodySchema = z.object({
  phoneNumberId: z.string().uuid(),
  tenantId: z.string().uuid()
});

export const patchTenantBodySchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'CANCELLED']).optional(),
  plan: z.string().min(1).max(80).optional(),
  pricing: z
    .object({
      CALL_MINUTE_RATE: z.number().nonnegative().optional(),
      LLM_INPUT_TOKEN_RATE: z.number().nonnegative().optional(),
      LLM_OUTPUT_TOKEN_RATE: z.number().nonnegative().optional(),
      VECTOR_SEARCH_RATE: z.number().nonnegative().optional(),
      VECTOR_UPSERT_RATE: z.number().nonnegative().optional()
    })
    .optional(),
  limits: z
    .object({
      MAX_CALL_MINUTES_PER_MONTH: z.number().int().nonnegative().optional(),
      MAX_LLM_TOKENS_PER_MONTH: z.number().int().nonnegative().optional()
    })
    .optional()
});

export const listUsersQuerySchema = paginationQuerySchema.extend({
  tenantId: z.string().uuid().optional()
});

export const patchUserBodySchema = z.object({
  status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED']).optional()
});

export const listCallsQuerySchema = paginationQuerySchema.extend({
  tenantId: z.string().uuid().optional(),
  status: z
    .enum(['INITIATED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'NO_ANSWER', 'CANCELED'])
    .optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});

export const listAgentsQuerySchema = paginationQuerySchema.extend({
  tenantId: z.string().uuid().optional()
});

export const patchAgentBodySchema = z.object({
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  systemPrompt: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional()
});

export const analyticsTrendsQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  interval: z.enum(['day', 'hour'])
});

export const billingBreakdownQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});

