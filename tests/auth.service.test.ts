import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { UserRepository } from '../src/modules/user/user.repository.js';
import { TenantRepository } from '../src/modules/tenant/tenant.repository.js';
import { ConflictError } from '../src/lib/errors.js';

describe('AuthService', () => {
  const userRepository = new UserRepository();
  const tenantRepository = new TenantRepository();
  const authService = new AuthService(userRepository, tenantRepository);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('register: maps Prisma P2002 to ConflictError', async () => {
    jest.spyOn(TenantRepository.prototype, 'findBySlug').mockResolvedValue(null);
    const err = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: '0'
    });
    jest.spyOn(prisma, '$transaction').mockRejectedValue(err);

    await expect(
      authService.register({
        email: 'a@b.c',
        password: 'longpassword1',
        fullName: 'Test',
        tenantName: 'Acme',
        tenantSlug: 'acme'
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
