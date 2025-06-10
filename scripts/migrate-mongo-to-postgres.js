/**
 * One-off migration: MongoDB `users` collection (Mongoose model User) → PostgreSQL via Prisma.
 *
 * Prerequisites:
 *   - MONGODB_URI (and optional MONGODB_DB_NAME) still set for the source
 *   - DATABASE_URL points at the target PostgreSQL database with schema already applied (`npx prisma migrate deploy`)
 *   - Dependencies: `mongodb` (dev) and `@prisma/client` / Prisma schema in sync
 *
 * Usage:
 *   node scripts/migrate-mongo-to-postgres.js
 *
 * Idempotent per document: upserts on `mongo_legacy_id` (original ObjectId hex).
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function mapProvider(v) {
  if (v == null || v === '') return null;
  const s = String(v).toLowerCase();
  if (s === 'google' || s === 'facebook' || s === 'apple') return s;
  console.warn(`Unknown provider "${v}" — storing as null`);
  return null;
}

function mapRole(v) {
  const s = String(v || 'user').toLowerCase();
  if (s === 'user' || s === 'admin' || s === 'customer') return s;
  return 'user';
}

function toDate(v) {
  if (!v) return undefined;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || undefined;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required for source reads');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for PostgreSQL writes');
  }

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = dbName ? client.db(dbName) : client.db();
  const col = db.collection('users');

  const cursor = col.find({});
  let n = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    const mongoLegacyId = doc._id?.toString?.();
    if (!mongoLegacyId || mongoLegacyId.length !== 24) {
      skipped += 1;
      continue;
    }

    const email = String(doc.email || '')
      .toLowerCase()
      .trim();
    const username = String(doc.username || '').trim();
    if (!email || !username) {
      console.warn(`Skip ${mongoLegacyId}: missing email or username`);
      skipped += 1;
      continue;
    }

    const data = {
      mongoLegacyId,
      username,
      email,
      passwordHash: doc.password || null,
      provider: mapProvider(doc.provider),
      providerId: doc.providerId ?? null,
      resetPasswordToken: doc.resetPasswordToken ?? null,
      resetPasswordExpires: toDate(doc.resetPasswordExpires) ?? null,
      role: mapRole(doc.role),
      registrationIp: doc.registrationIp ? String(doc.registrationIp).slice(0, 255) : null,
      invitesDisabled: Boolean(doc.invitesDisabled),
      createdAt: toDate(doc.createdAt) ?? new Date(),
      updatedAt: toDate(doc.updatedAt) ?? new Date(),
    };

    try {
      await prisma.user.upsert({
        where: { mongoLegacyId },
        create: data,
        update: {
          username: data.username,
          email: data.email,
          passwordHash: data.passwordHash,
          provider: data.provider,
          providerId: data.providerId,
          resetPasswordToken: data.resetPasswordToken,
          resetPasswordExpires: data.resetPasswordExpires,
          role: data.role,
          registrationIp: data.registrationIp,
          invitesDisabled: data.invitesDisabled,
          updatedAt: data.updatedAt,
        },
      });
      n += 1;
      if (n % 500 === 0) {
        // eslint-disable-next-line no-console
        console.log(`Migrated ${n} users…`);
      }
    } catch (err) {
      console.error(`Failed mongo id ${mongoLegacyId}:`, err.message);
      skipped += 1;
    }
  }

  await client.close();
  await prisma.$disconnect();

  // eslint-disable-next-line no-console
  console.log(`Done. Upserted ${n} users, skipped/failed ${skipped}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
