import { z } from 'zod';

export const registerBodySchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128)
});

export const loginBodySchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128)
});

export const forgotPasswordBodySchema = z.object({
  tenantSlug: z
    .string()
    .min(2)
    .max(80)
    .transform((s) => s.toLowerCase().trim()),
  email: z.string().email().max(255).transform((s) => s.toLowerCase().trim())
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(16).max(512),
  password: z.string().min(8).max(128)
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
