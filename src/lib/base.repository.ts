import { NotFoundError } from './errors.js';
import type { IRepository, RepositoryListParams } from '../interfaces/repository.interface.js';

interface RepositoryDelegate<TEntity, TCreateInput, TUpdateInput, TWhereUnique, TWhere, TOrderBy> {
  findFirst(args: { where: TWhere }): Promise<TEntity | null>;
  findMany(args: { where?: TWhere; orderBy?: TOrderBy; take?: number; skip?: number }): Promise<TEntity[]>;
  create(args: { data: TCreateInput }): Promise<TEntity>;
  update(args: { where: TWhereUnique; data: TUpdateInput }): Promise<TEntity>;
}

export abstract class BaseRepository<
    TEntity extends { id: string; tenantId: string },
    TCreateInput extends object,
    TUpdateInput extends object,
    TWhereUnique extends { id: string; tenantId: string },
    TWhere,
    TOrderBy
  >
  implements IRepository<TEntity, TCreateInput, TUpdateInput, TWhereUnique, TWhere, TOrderBy>
{
  protected constructor(private readonly delegate: RepositoryDelegate<TEntity, TCreateInput, TUpdateInput, TWhereUnique, TWhere, TOrderBy>) {}

  public findById(id: string, tenantId: string): Promise<TEntity | null> {
    return this.delegate.findFirst({
      where: { id, tenantId, deletedAt: null } as TWhere
    });
  }

  public findMany(params: RepositoryListParams<TWhere, TOrderBy>, tenantId: string): Promise<TEntity[]> {
    const args: { where: TWhere; orderBy?: TOrderBy; skip?: number; take?: number } = {
      where: { ...params.where, tenantId, deletedAt: null } as TWhere
    };

    if (params.orderBy) {
      args.orderBy = params.orderBy;
    }
    if (typeof params.skip === 'number') {
      args.skip = params.skip;
    }
    if (typeof params.take === 'number') {
      args.take = params.take;
    }

    return this.delegate.findMany(args);
  }

  public create(data: TCreateInput, tenantId: string): Promise<TEntity> {
    return this.delegate.create({
      data: { ...data, tenantId }
    });
  }

  public async update(where: TWhereUnique, data: TUpdateInput, tenantId: string): Promise<TEntity> {
    const existing = await this.findById(where.id, tenantId);
    if (!existing) {
      throw new NotFoundError('Entity not found');
    }
    // Primary key is globally unique; tenant is enforced via the pre-check above.
    return this.delegate.update({ where: { id: where.id } as TWhereUnique, data });
  }

  public async softDelete(id: string, tenantId: string): Promise<TEntity> {
    const entity = await this.findById(id, tenantId);
    if (!entity) {
      throw new NotFoundError('Entity not found');
    }

    return this.delegate.update({
      where: { id } as TWhereUnique,
      data: { deletedAt: new Date() } as TUpdateInput & { deletedAt: Date }
    });
  }
}
