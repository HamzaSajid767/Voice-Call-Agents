-- CreateSchema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('google', 'facebook', 'apple');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin', 'customer');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mongo_legacy_id" VARCHAR(24),
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "provider" "AuthProvider",
    "provider_id" TEXT,
    "reset_password_token" TEXT,
    "reset_password_expires" TIMESTAMPTZ(3),
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "registration_ip" VARCHAR(255),
    "invites_disabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_mongo_legacy_id_key" ON "users"("mongo_legacy_id");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "users_updated_at_idx" ON "users"("updated_at");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_provider_provider_id_idx" ON "users"("provider", "provider_id");
