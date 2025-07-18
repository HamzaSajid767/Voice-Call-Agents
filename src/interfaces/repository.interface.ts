export interface RepositoryListParams<TWhere, TOrderBy> {
  where?: TWhere;
  orderBy?: TOrderBy;
  take?: number;
  skip?: number;
}

export interface IRepository<TEntity, TCreateInput, TUpdateInput, TWhereUnique, TWhere, TOrderBy> {
  findById(id: string, tenantId: string): Promise<TEntity | null>;
  findMany(
    params: RepositoryListParams<TWhere, TOrderBy>,
    tenantId: string
  ): Promise<TEntity[]>;
  create(data: TCreateInput, tenantId: string): Promise<TEntity>;
  update(where: TWhereUnique, data: TUpdateInput, tenantId: string): Promise<TEntity>;
  softDelete(id: string, tenantId: string): Promise<TEntity>;
}
