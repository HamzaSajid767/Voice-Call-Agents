import { Prisma } from '@prisma/client';
import crypto from 'node:crypto';
import { ConflictError, NotFoundError, AuthError } from '../../lib/errors.js';
import { signToken } from '../../lib/jwt.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { toPublicUser, type PublicUser } from '../../mappers/user.mapper.js';
import { hashPassword, comparePassword } from '../../utils/password.js';
import {
  isValidTenantSlug,
  slugify,
  uniqueSlugAttempt
} from '../../utils/slugify.js';
import { UserRepository } from '../user/user.repository.js';
import { TenantRepository } from '../tenant/tenant.repository.js';
import { BaseService } from '../../services/base.service.js';
import { env } from '../../config/env.js';

export interface RegisterInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ForgotPasswordInput {
  tenantSlug: string;
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

export class AuthService extends BaseService {
  public constructor(
    private readonly userRepository: UserRepository,
    private readonly tenantRepository: TenantRepository
  ) {
    super();
  }

  private resetKeyForHash(hash: string) {
    return `auth:password_reset:${hash}`;
  }

  private hashResetToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private deriveTenantAndUserMeta(email: string): { tenantName: string; tenantSlugBase: string; fullName: string } {
    const addr = email.trim().toLowerCase();
    const local = addr.split('@')[0] ?? 'workspace';
    const domain = addr.split('@')[1] ?? '';
    const domainBase = domain.split('.')[0] ?? '';
    const base = slugify(domainBase || local || 'workspace');
    const fullName = local
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      .slice(0, 3)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
    const tenantName = (domainBase || local || 'Workspace')
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      .slice(0, 3)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
    return { tenantName: tenantName || 'Workspace', tenantSlugBase: base || 'workspace', fullName: fullName || 'Owner' };
  }

  private isSuperAdminEmail(email: string): boolean {
    const listRaw = env.SUPERADMIN_EMAILS ?? '';
    if (!listRaw.trim()) return false;
    const set = new Set(
      listRaw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );
    return set.has(email.trim().toLowerCase());
  }

  public register = (
    input: RegisterInput
  ): Promise<{
    accessToken: string;
    tokenType: 'Bearer';
    tenant: { id: string; name: string; slug: string; timezone: string };
    user: PublicUser;
  }> => {
    return this.execute('auth.register', async () => {
      const email = input.email.trim().toLowerCase();
      const existing = await prisma.user.findFirst({ where: { email, deletedAt: null }, select: { id: true } });
      if (existing) {
        throw new ConflictError('Email is already in use');
      }

      const derived = this.deriveTenantAndUserMeta(email);
      const baseSlug = derived.tenantSlugBase;
      if (!isValidTenantSlug(baseSlug)) {
        throw new ConflictError('Invalid tenant slug');
      }

      let attempt = 0;
      let slug = uniqueSlugAttempt(baseSlug, 0);
      for (;;) {
        const taken = await this.tenantRepository.findBySlug(slug);
        if (!taken) {
          break;
        }
        attempt += 1;
        if (attempt > 8) {
          throw new ConflictError('Could not allocate a unique tenant slug');
        }
        slug = uniqueSlugAttempt(baseSlug, attempt);
      }

      const passwordHash = await hashPassword(input.password);

      try {
        const { tenant, user } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const createdTenant = await tx.tenant.create({
            data: {
              name: derived.tenantName,
              slug,
              status: 'ACTIVE',
              timezone: 'UTC'
            }
          });

          const createdUser = await tx.user.create({
            data: {
              tenantId: createdTenant.id,
              email,
              fullName: derived.fullName,
              passwordHash,
              status: 'ACTIVE',
              isOwner: true
            }
          });

          return { tenant: createdTenant, user: createdUser };
        });

        const publicUser = await this.userRepository.findByIdInTenant(tenant.id, user.id);
        if (!publicUser) {
          throw new NotFoundError('User not found after registration');
        }

        const accessToken = signToken({ sub: user.id, userId: user.id, tenantId: tenant.id, type: 'CLIENT' });

        return {
          accessToken,
          tokenType: 'Bearer' as const,
          tenant: {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            timezone: tenant.timezone
          },
          user: toPublicUser(publicUser as any)
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictError('Email or tenant slug is already in use');
        }
        throw error;
      }
    });
  };

  public login = (
    input: LoginInput
  ): Promise<{
    accessToken: string;
    tokenType: 'Bearer';
    user: PublicUser;
  }> => {
    return this.execute('auth.login', async () => {
      const email = input.email.trim().toLowerCase();
      const matches = await prisma.user.findMany({
        where: { email, deletedAt: null },
        include: { tenant: true }
      });

      if (matches.length === 0) {
        throw new AuthError('Invalid email or password');
      }
      if (matches.length > 1) {
        throw new AuthError('Multiple accounts found for this email. Contact support.');
      }

      const found = matches[0]!;
      if (found.status !== 'ACTIVE') {
        throw new AuthError('User is not active');
      }
      if (!found.passwordHash) {
        throw new AuthError('Invalid email or password');
      }

      const match = await comparePassword(input.password, found.passwordHash);
      if (!match) {
        throw new AuthError('Invalid email or password');
      }

      await this.userRepository.setLastLoginAt(found.tenantId, found.id);

      const isSuperAdmin = this.isSuperAdminEmail(email) || (found as any).isSuperAdmin === true;
      const accessToken = isSuperAdmin
        ? signToken({ sub: found.id, userId: found.id, type: 'SUPERADMIN' })
        : signToken({ sub: found.id, userId: found.id, tenantId: found.tenantId, type: 'CLIENT' });

      const { passwordHash: _passwordHash, ...userWithoutSecret } = found;
      const publicUser = toPublicUser(userWithoutSecret as any);
      return { accessToken, tokenType: 'Bearer' as const, user: publicUser };
    });
  };

  public forgotPassword = (
    input: ForgotPasswordInput
  ): Promise<{
    ok: true;
    message: string;
    resetToken?: string;
  }> => {
    return this.execute('auth.forgotPassword', async () => {
      const tenant = await this.tenantRepository.findBySlug(input.tenantSlug);
      // Never leak tenant/user existence.
      if (!tenant) {
        return { ok: true, message: 'If an account exists, a reset link will be sent.' };
      }

      const found = await this.userRepository.findByEmailInTenant(tenant.id, input.email);
      if (!found || found.status !== 'ACTIVE') {
        return { ok: true, message: 'If an account exists, a reset link will be sent.' };
      }

      const rawToken = crypto.randomBytes(32).toString('base64url');
      const hash = this.hashResetToken(rawToken);
      const key = this.resetKeyForHash(hash);
      const ttlSeconds = 60 * 15; // 15 minutes
      await redis.setEx(key, JSON.stringify({ tenantId: tenant.id, userId: found.id }), ttlSeconds);

      // Production: caller should deliver token via email. In non-production we return it for end-to-end testing.
      if (process.env.NODE_ENV !== 'production') {
        return { ok: true, message: 'Reset token issued.', resetToken: rawToken };
      }
      return { ok: true, message: 'If an account exists, a reset link will be sent.' };
    });
  };

  public resetPassword = (
    input: ResetPasswordInput
  ): Promise<{
    ok: true;
    message: string;
  }> => {
    return this.execute('auth.resetPassword', async () => {
      const hash = this.hashResetToken(input.token);
      const key = this.resetKeyForHash(hash);
      const raw = await redis.get(key);
      if (!raw || raw === 'USED') {
        throw new AuthError('Invalid or expired reset token');
      }

      let payload: { tenantId: string; userId: string } | null = null;
      try {
        payload = JSON.parse(raw) as { tenantId: string; userId: string };
      } catch {
        payload = null;
      }
      if (!payload?.tenantId || !payload?.userId) {
        throw new AuthError('Invalid or expired reset token');
      }

      const passwordHash = await hashPassword(input.password);
      await this.userRepository.setPasswordHash(payload.tenantId, payload.userId, passwordHash);

      // Invalidate token (best-effort; adapter doesn't expose DEL).
      await redis.setEx(key, 'USED', 60 * 60 * 24);

      return { ok: true, message: 'Password updated successfully' };
    });
  };

  public me = (
    params: { userId: string; tenantId?: string; userType: 'SUPERADMIN' | 'CLIENT' }
  ): Promise<{
    user: PublicUser;
    userType: 'SUPERADMIN' | 'CLIENT';
    tenant?: { id: string; name: string; slug: string; timezone: string };
  }> => {
    return this.execute('auth.me', async () => {
      if (params.userType === 'SUPERADMIN') {
        const user = await prisma.user.findFirst({ where: { id: params.userId, deletedAt: null } });
        if (!user) throw new NotFoundError('User not found');
        return { user: toPublicUser(user as any), userType: 'SUPERADMIN' };
      }

      const tenantId = params.tenantId;
      if (!tenantId) throw new AuthError('Tenant scope required');
      const [tenant, user] = await Promise.all([
        this.tenantRepository.findById(tenantId),
        this.userRepository.findByIdInTenant(tenantId, params.userId)
      ]);
      if (!tenant) throw new NotFoundError('Tenant not found');
      if (!user) throw new NotFoundError('User not found');
      return {
        user: toPublicUser(user as any),
        userType: 'CLIENT',
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, timezone: tenant.timezone }
      };
    });
  };
}
