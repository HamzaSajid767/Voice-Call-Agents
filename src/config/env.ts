import dotenv from 'dotenv';
import { envSchema, type Env } from '../types/env.js';

dotenv.config();

// Compatibility aliases for e2e runners / envs
if (process.env.RATE_LIMIT_MAX && !process.env.RATE_LIMIT_GLOBAL_PER_MINUTE) {
  process.env.RATE_LIMIT_GLOBAL_PER_MINUTE = process.env.RATE_LIMIT_MAX;
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env: Env = parsed.data;
