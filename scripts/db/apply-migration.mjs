/** Apply reviewed SQL through the existing Prisma ledger, never as untracked SQL. */
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import nextEnv from "@next/env";
import {
  checkMigrationHistory,
  readMigrationHistory,
  runVerifiedPrisma,
} from "./verified-prisma.mjs";
nextEnv.loadEnvConfig(process.cwd());
const input = process.argv[2];
if (!input || process.argv.length !== 3) {
  console.error(
    "Usage: node scripts/db/apply-migration.mjs --status | --all | prisma/migrations/<name>/migration.sql"
  );
  process.exitCode = 2;
} else
  try {
    const directory = resolve("prisma/migrations"),
      files = readdirSync(directory, { withFileTypes: true })
        .filter((f) => f.isDirectory())
        .map((f) => ({
          name: f.name,
          path: realpathSync(resolve(directory, f.name, "migration.sql")),
        }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        .map((f) => ({
          ...f,
          checksum: createHash("sha256")
            .update(readFileSync(f.path))
            .digest("hex"),
        }));
    const selected = input.startsWith("--")
      ? undefined
      : files.find((f) => f.path === realpathSync(input));
    if (!["--status", "--all"].includes(input) && !selected)
      throw Error("Only canonical migration files are accepted.");
    const connection = process.env.DIRECT_URL,
      history = checkMigrationHistory(
        files,
        await readMigrationHistory(connection)
      );
    console.log(
      JSON.stringify(
        {
          pending: history.pending.map((f) => f.name),
          unresolved: history.failed,
        },
        null,
        2
      )
    );
    if (input !== "--status") {
      if (history.failed.length)
        throw Error(
          "A failed migration needs verified schema reconciliation. Nothing was applied."
        );
      if (
        selected &&
        (history.pending.length !== 1 ||
          history.pending[0].name !== selected.name)
      )
        throw Error(
          "Single-file deployment requires exactly that one pending migration. Review the ordered list and use --all explicitly."
        );
    }
    const result = await runVerifiedPrisma(
      ["migrate", input === "--status" ? "status" : "deploy"],
      connection
    );
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    console.log(
      `Verified remote TLS connections: ${result.verifiedConnections}`
    );
    process.exitCode = result.code ?? 1;
  } catch (error) {
    console.error(
      error instanceof Error && !error.code
        ? error.message
        : "Migration connection failed; no credentials were logged."
    );
    process.exitCode = 1;
  }
