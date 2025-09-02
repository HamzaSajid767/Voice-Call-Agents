import type { APIKey, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BaseRepository } from '../../lib/base.repository.js';

const apiKeyListSelect = {
  id: true,
  name: true,
  keyPrefix: true,
  status: true,
  lastUsedAt: true,
  expiresAt: true,
  createdAt: true,
  revokedAt: true
} as const;

export type ApiKeyListRow = {
  id: string;
  name: string;
  keyPrefix: string;
  status: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
};

export class ApiKeyRepository extends BaseRepository<
  APIKey,
  Prisma.APIKeyUncheckedCreateInput,
  Prisma.APIKeyUpdateInput,
  { id: string; tenantId: string },
  Prisma.APIKeyWhereInput,
  Prisma.APIKeyOrderByWithRelationInput
> {
  public constructor() {
    super(prisma.aPIKey);
  }

  public findByKeyPrefix(
    keyPrefix: string
  ): Promise<Pick<APIKey, 'id' | 'tenantId' | 'keyHash' | 'status' | 'expiresAt' | 'revokedAt' | 'deletedAt'> | null> {
    return prisma.aPIKey.findFirst({
      where: { keyPrefix, deletedAt: null, status: 'ACTIVE' },
      select: {
        id: true,
        tenantId: true,
        keyHash: true,
        status: true,
        expiresAt: true,
        revokedAt: true,
        deletedAt: true
      }
    });
  }

  public listByTenant(
    tenantId: string
  ): Promise<ApiKeyListRow[]> {
    return prisma.aPIKey.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: apiKeyListSelect
    });
  }
}
