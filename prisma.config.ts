// SQL files and their deployed ledger are authoritative; Prisma is derived.
// Match the application's environment precedence, including .env.local.
import nextEnv from "@next/env";
import { defineConfig } from "prisma/config";

nextEnv.loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use a direct/session URL for CLI operations; never transaction pooling.
    // The app runtime uses DATABASE_URL (pooled) via the pg adapter in lib/prisma.ts.
    url: process.env["DIRECT_URL"],
  },
});
