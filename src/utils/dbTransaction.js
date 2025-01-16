import { prisma } from '../lib/prisma.js';

/**
 * Runs `fn(tx)` inside an interactive Prisma transaction.
 *
 * @template T
 * @param {(tx: import('@prisma/client').Prisma.TransactionClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withDbTransaction(fn) {
  return prisma.$transaction(async (tx) => fn(tx));
}
