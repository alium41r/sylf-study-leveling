import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// ---------------------------------------------------------------------------
// Shared Prisma Client Singleton
// ---------------------------------------------------------------------------
// Previously, every API route created its own PrismaClient instance which can
// exhaust connections. This module exports a single global instance that is
// reused across all server-side code (API routes, lib modules, etc.).
//
// In development, Next.js hot-reloads modules which would create new clients
// on every reload. We store the client on `globalThis` to prevent that.
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
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
  }

  return client;
}

export const prisma = getPrismaClient();
