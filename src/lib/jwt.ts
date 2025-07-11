import jwt, { type SignOptions } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { env } from '../config/env.js';
import { AuthError } from './errors.js';

export type AuthTokenType = 'SUPERADMIN' | 'CLIENT';

export type JwtPayload =
  | {
      sub: string;
      userId: string;
      type: 'SUPERADMIN';
    }
  | {
      sub: string;
      userId: string;
      tenantId: string;
      type: 'CLIENT';
    };

export const signToken = (payload: JwtPayload, options?: SignOptions): string => {
  const expiresIn = env.JWT_EXPIRES_IN as StringValue;
  const signOptions: SignOptions = options ? { ...options } : {};
  if (!signOptions.expiresIn) {
    signOptions.expiresIn = expiresIn;
  }

  return jwt.sign(payload, env.JWT_SECRET, signOptions);
};

const isPayload = (value: unknown): value is JwtPayload => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record['sub'] !== 'string') return false;
  if (typeof record['userId'] !== 'string') return false;
  if (record['type'] === 'SUPERADMIN') {
    return true;
  }
  if (record['type'] === 'CLIENT') {
    return typeof record['tenantId'] === 'string';
  }
  return false;
};

export const verifyToken = (token: string): JwtPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (!isPayload(decoded)) {
      throw new AuthError('Invalid or expired token');
    }
    return decoded;
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError('Invalid or expired token');
  }
};
