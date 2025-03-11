import { prisma } from '../lib/prisma.js';
import { findUserByPublicId } from '../utils/resolveUserId.js';

function parseDayStart(isoOrDate) {
  if (!isoOrDate) return undefined;
  const s = String(isoOrDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00.000Z`);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseDayEnd(isoOrDate) {
  if (!isoOrDate) return undefined;
  const s = String(isoOrDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T23:59:59.999Z`);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function mapUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    provider: row.provider ?? null,
    providerId: row.providerId ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
  };
}

const listUsersForAdmin = async (rawQuery) => {
  const {
    page = 1,
    limit = 10,
    search,
    role,
    provider,
    createdFrom,
    createdTo,
    updatedFrom,
    updatedTo,
    sort = 'createdAt',
    order = 'desc',
  } = rawQuery;

  const andParts = [];

  if (role && role !== 'all') {
    andParts.push({ role });
  }

  if (provider === 'local') {
    andParts.push({ provider: null });
  } else if (provider && provider !== 'all') {
    andParts.push({ provider });
  }

  const q = search && String(search).trim();
  if (q) {
    andParts.push({
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ],
    });
  }

  const cFrom = parseDayStart(createdFrom);
  const cTo = parseDayEnd(createdTo);
  if (cFrom || cTo) {
    const range = {};
    if (cFrom) range.gte = cFrom;
    if (cTo) range.lte = cTo;
    andParts.push({ createdAt: range });
  }

  const uFrom = parseDayStart(updatedFrom);
  const uTo = parseDayEnd(updatedTo);
  if (uFrom || uTo) {
    const range = {};
    if (uFrom) range.gte = uFrom;
    if (uTo) range.lte = uTo;
    andParts.push({ updatedAt: range });
  }

  const where = andParts.length === 0 ? {} : { AND: andParts };

  const sortField = ['createdAt', 'updatedAt', 'username', 'email', 'role'].includes(sort)
    ? sort
    : 'createdAt';
  const sortDir = order === 'asc' ? 'asc' : 'desc';

  const skip = (Number(page) - 1) * Number(limit);
  const lim = Number(limit);

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { [sortField]: sortDir },
      skip,
      take: lim,
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / lim));

  return {
    data: rows.map(mapUserRow),
    pagination: {
      page: Number(page),
      limit: lim,
      total,
      totalPages,
    },
  };
};

const updateUserByAdmin = async (userId, { username, email, role }) => {
  const user = await findUserByPublicId(userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  if (username != null && username !== user.username) {
    const taken = await prisma.user.findFirst({
      where: { username, NOT: { id: user.id } },
    });
    if (taken) {
      const err = new Error('Username already in use');
      err.statusCode = 400;
      throw err;
    }
  }

  if (email != null) {
    const nextEmail = String(email).toLowerCase().trim();
    if (nextEmail !== user.email) {
      const taken = await prisma.user.findFirst({
        where: { email: nextEmail, NOT: { id: user.id } },
      });
      if (taken) {
        const err = new Error('Email already in use');
        err.statusCode = 400;
        throw err;
      }
    }
  }

  const fresh = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(username != null ? { username } : {}),
      ...(email != null ? { email: String(email).toLowerCase().trim() } : {}),
      ...(role != null ? { role } : {}),
    },
  });

  return mapUserRow(fresh);
};

const deleteUserByAdmin = async (userId, requestingAdminId) => {
  if (String(userId) === String(requestingAdminId)) {
    const err = new Error('You cannot delete your own account');
    err.statusCode = 400;
    throw err;
  }

  const user = await findUserByPublicId(userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  await prisma.user.delete({ where: { id: user.id } });
};

export { listUsersForAdmin, updateUserByAdmin, deleteUserByAdmin };
