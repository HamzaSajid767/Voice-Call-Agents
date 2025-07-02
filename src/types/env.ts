import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3010),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  USE_REAL_REDIS_IN_TESTS: z.coerce.boolean().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),
  // Comma-separated list of emails allowed to act as SUPERADMIN (e.g. "a@x.com,b@y.com")
  SUPERADMIN_EMAILS: z.string().optional(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  LIVEKIT_URL: z.string().min(1).optional(),
  LIVEKIT_SIP_DOMAIN: z.string().min(1).optional(),
  OLLAMA_URL: z.string().url().optional(),
  OLLAMA_MODEL: z.string().min(1).optional(),
  OLLAMA_EMBED_MODEL: z.string().min(1).optional(),
  QDRANT_URL: z.string().url().optional(),
  QDRANT_API_KEY: z.string().min(1).optional(),
  DEEPGRAM_API_KEY: z.string().min(1).optional(),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_WEBHOOK_BASE_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().optional(),
  RUN_WORKERS: z.coerce.boolean().optional(),
  RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_TENANT_PER_MINUTE: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_APIKEY_PER_MINUTE: z.coerce.number().int().positive().optional()
});

export type Env = z.infer<typeof envSchema>;
