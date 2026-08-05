import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

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
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || "file:./dev.db",
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
