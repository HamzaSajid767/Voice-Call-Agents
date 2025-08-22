import type { Prisma, User, UserStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BaseRepository } from '../../lib/base.repository.js';

export interface UserListRow {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  isOwner: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export type UserForLogin = User & { passwordHash: string | null };

export class UserRepository extends BaseRepository<
  User,
  Prisma.UserUncheckedCreateInput,
  Prisma.UserUpdateInput,
  { id: string; tenantId: string },
  Prisma.UserWhereInput,
  Prisma.UserOrderByWithRelationInput
> {
  public constructor() {
    super(prisma.user);
  }

  public findByEmailInTenant(
    tenantId: string,
    email: string
  ): Promise<UserForLogin | null> {
    return prisma.user.findFirst({
      where: { tenantId, email, deletedAt: null }
    });
  }

  public findByIdInTenant(tenantId: string, id: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null }
    });
  }

  public listForTenant(
    tenantId: string,
    params: { status?: UserStatus; take: number; skip: number }
  ): Promise<UserListRow[]> {
    return prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(params.status ? { status: params.status } : {})
      },
      orderBy: { createdAt: 'asc' },
      take: params.take,
      skip: params.skip,
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        isOwner: true,
        lastLoginAt: true,
        createdAt: true
      }
    });
  }

  public countForTenant(
    tenantId: string,
    status?: UserStatus
  ): Promise<number> {
    return prisma.user.count({
      where: { tenantId, deletedAt: null, ...(status ? { status } : {}) }
    });
  }

  public async setLastLoginAt(tenantId: string, id: string): Promise<void> {
    await prisma.user.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { lastLoginAt: new Date() }
    });
  }

  public async setPasswordHash(tenantId: string, id: string, passwordHash: string): Promise<void> {
    await prisma.user.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { passwordHash }
    });
  }
}
