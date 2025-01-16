import { prisma } from '../lib/prisma.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONGO_OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

/**
 * Load a user by canonical UUID primary key or legacy MongoDB ObjectId string (post-migration).
 */
export async function findUserByPublicId(publicId) {
  const s = String(publicId ?? '').trim();
  if (!s) return null;
  if (UUID_RE.test(s)) {
    return prisma.user.findUnique({ where: { id: s } });
  }
  if (MONGO_OBJECT_ID_RE.test(s)) {
    return prisma.user.findUnique({ where: { mongoLegacyId: s } });
  }
  return null;
}
