import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// ---------------------------------------------------------------------------
// Shared Prisma Client Singleton with Hot-Reload & Schema Invalidation
// ---------------------------------------------------------------------------
// In development, Next.js dev server caches globalThis.prisma across reloads.
// When Prisma schema fields change and prisma generate runs, we invalidate
// stale instances using SCHEMA_BUILD_VERSION so new DMMF fields are immediately
// recognized without requiring manual server restart.
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
  prismaVersion?: number;
};

// Increment this version whenever schema fields are modified
const SCHEMA_BUILD_VERSION = 10;

export function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma && globalForPrisma.prismaVersion === SCHEMA_BUILD_VERSION) {
    return globalForPrisma.prisma;
  }

  // Disconnect and clear outdated dev client if schema version bumped
  if (globalForPrisma.prisma) {
    try {
      globalForPrisma.prisma.$disconnect();
    } catch {}
    globalForPrisma.prisma = undefined;
  }

  const connectionString = process.env.DATABASE_POOL_URL || process.env.DATABASE_URL;
  const pool = globalForPrisma.pool ?? new Pool({
    connectionString,
    max: process.env.NODE_ENV === "production" ? 20 : 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pool = pool;
  }

  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaVersion = SCHEMA_BUILD_VERSION;
  }

  return client;
}

export const prisma = getPrismaClient();

