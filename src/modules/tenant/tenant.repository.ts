import type { Prisma, Tenant, TenantStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export interface CreateTenantInput {
  slug: string;
  name: string;
  timezone?: string;
  status?: TenantStatus;
}

/**
 * Root aggregate: `Tenant` has no `tenantId` — this repository is not `BaseRepository`-based.
 */
export class TenantRepository {
  public findById(id: string): Promise<Tenant | null> {
    return prisma.tenant.findFirst({
      where: { id, deletedAt: null }
    });
  }

  public findBySlug(slug: string): Promise<Tenant | null> {
    return prisma.tenant.findFirst({
      where: { slug, deletedAt: null }
    });
  }

  public create(data: CreateTenantInput): Promise<Tenant> {
    return prisma.tenant.create({ data });
  }

  public updateSettings(
    id: string,
    data: Prisma.TenantUpdateInput
  ): Promise<Tenant> {
    return prisma.tenant.update({ where: { id }, data });
  }
}
