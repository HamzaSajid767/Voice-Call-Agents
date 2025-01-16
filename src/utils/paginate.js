/**
 * Offset pagination for Prisma. Prefer `skip` / `take` at call sites for simple cases.
 *
 * @template T
 * @param {{
 *   count: () => Promise<number>;
 *   findMany: (args: { skip: number; take: number; orderBy?: object }) => Promise<T[]>;
 *   page?: number;
 *   limit?: number;
 * }} args
 */
const paginateOffset = async ({ count, findMany, page = 1, limit = 10 }) => {
  const numericLimit = Math.max(1, Number(limit) || 10);
  const numericPage = Math.max(1, Number(page) || 1);
  const skip = (numericPage - 1) * numericLimit;

  const [data, total] = await Promise.all([
    findMany({ skip, take: numericLimit }),
    count(),
  ]);

  return {
    data,
    pagination: {
      mode: 'page',
      total,
      page: numericPage,
      limit: numericLimit,
      pages: Math.max(1, Math.ceil(total / numericLimit)),
    },
  };
};

export default paginateOffset;
