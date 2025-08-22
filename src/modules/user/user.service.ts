import type { UserStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { BaseService } from '../../services/base.service.js';
import { toPublicUser, type PublicUser } from '../../mappers/user.mapper.js';
import { UserRepository } from './user.repository.js';
import { hashPassword } from '../../utils/password.js';

export class UserService extends BaseService {
  public constructor(
    private readonly userRepository: UserRepository
  ) {
    super();
  }

  public getMe = (tenantId: string, userId: string): Promise<PublicUser> => {
    return this.execute('user.getMe', async () => {
      const user = await this.userRepository.findByIdInTenant(tenantId, userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }
      return toPublicUser(user as any);
    });
  };

  public listUsers = (params: {
    tenantId: string;
    page: number;
    pageSize: number;
    status?: UserStatus;
  }): Promise<{ data: PublicUser[]; total: number; page: number; pageSize: number }> => {
    return this.execute('user.list', async () => {
      const { tenantId, page, pageSize, status } = params;
      const skip = (page - 1) * pageSize;
      const listParams =
        status === undefined
          ? { take: pageSize, skip }
          : { take: pageSize, skip, status };
      const [rows, total] = await Promise.all([
        this.userRepository.listForTenant(tenantId, listParams),
        this.userRepository.countForTenant(tenantId, status)
      ]);
      return {
        data: rows.map((u) => toPublicUser(u)),
        total,
        page,
        pageSize
      };
    });
  };

  public createUser = (params: {
    tenantId: string;
    email: string;
    fullName: string;
    password: string;
  }): Promise<PublicUser> => {
    return this.execute('user.create', async () => {
      const passwordHash = await hashPassword(params.password);

      try {
        const created = await this.userRepository.create(
          {
            tenantId: params.tenantId,
            email: params.email,
            fullName: params.fullName,
            passwordHash,
            status: 'ACTIVE',
            isOwner: false
          },
          params.tenantId
        );

        const full = await this.userRepository.findByIdInTenant(params.tenantId, created.id);
        if (!full) {
          throw new NotFoundError('User not found after create');
        }
        return toPublicUser(full as any);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictError('A user with this email already exists in the tenant');
        }
        throw error;
      }
    });
  };
}
