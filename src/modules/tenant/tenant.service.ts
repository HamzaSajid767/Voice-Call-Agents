import type { Tenant } from '@prisma/client';
import { NotFoundError } from '../../lib/errors.js';
import { BaseService } from '../../services/base.service.js';
import { TenantRepository } from './tenant.repository.js';

export class TenantService extends BaseService {
  public constructor(private readonly tenantRepository: TenantRepository) {
    super();
  }

  public getById = (id: string): Promise<Tenant> => {
    return this.execute('tenant.getById', async () => {
      const tenant = await this.tenantRepository.findById(id);
      if (!tenant) {
        throw new NotFoundError('Tenant not found');
      }
      return tenant;
    });
  };

  public getBySlug = (slug: string): Promise<Tenant> => {
    return this.execute('tenant.getBySlug', async () => {
      const tenant = await this.tenantRepository.findBySlug(slug);
      if (!tenant) {
        throw new NotFoundError('Tenant not found');
      }
      return tenant;
    });
  };
}
