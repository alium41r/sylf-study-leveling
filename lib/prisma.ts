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
const SCHEMA_BUILD_VERSION = 31;
let applicationPool: Pool | undefined;

/** Raw durable-core transactions reuse the web pool already owned by Prisma. */
export function getApplicationPool(): Pool {
  getPrismaClient();
  const pool = applicationPool ?? globalForPrisma.pool;
  if (!pool) throw new Error("Application database pool is unavailable");
  return pool;
}

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

  // In development, purge require.cache so regenerated Prisma Client DMMF schema
  // is loaded fresh from disk without requiring a full server process restart.
  let PrismaConstructor = PrismaClient;
  if (process.env.NODE_ENV !== "production") {
    try {
      if (typeof require !== "undefined" && require.cache) {
        Object.keys(require.cache).forEach((key) => {
          if (key.includes(".prisma") || key.includes("@prisma")) {
            delete require.cache[key];
          }
        });
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const freshModule = require("@prisma/client");
        if (freshModule?.PrismaClient) {
          PrismaConstructor = freshModule.PrismaClient;
        }
      }
    } catch (e) {
      console.warn("[prisma] require cache bust failed, falling back to static import:", e);
    }
  }

  const connectionString = process.env.DATABASE_POOL_URL || process.env.DATABASE_URL;
  const pool = globalForPrisma.pool ?? new Pool({
    connectionString,
    max: process.env.NODE_ENV === "production" ? 20 : 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    // Fail slow queries fast instead of hanging serverless invocations on
    // the pooler (Supabase transaction pooler / pgbouncer connection
    // bottleneck from the 25k scaling video).
    options: "-c statement_timeout=30000",
  });

  // An unhandled 'error' event on an idle pooled client would otherwise
  // crash the Node process (classic pg + serverless issue). Log instead.
  pool.on("error", (err) => {
    console.error("[pg pool] idle client error:", err.message);
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pool = pool;
  }

  const adapter = new PrismaPg(pool);
  applicationPool = pool;
  const client = new PrismaConstructor({ adapter });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaVersion = SCHEMA_BUILD_VERSION;
  }

  return client;
}

export const prisma = getPrismaClient();
