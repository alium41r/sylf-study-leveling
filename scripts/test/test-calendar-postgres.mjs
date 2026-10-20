/** Isolated calendar migration and persistence tests. Never reads hosted DB URLs. */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
const container = `sylf-calendar-test-${Date.now()}`;
const password = randomBytes(18).toString("hex");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0)
    throw new Error(
      `${command} failed: ${result.stderr || result.error || result.status}`
    );
  return result.stdout || "";
}
let started = false;
try {
  run("docker", [
    "run",
    "--detach",
    "--name",
    container,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    `POSTGRES_PASSWORD=${password}`,
    "postgres:17",
  ]);
  started = true;
  const port = run("docker", ["port", container, "5432/tcp"])
    .trim()
    .split(":")
    .at(-1);
  run("docker", [
    "exec",
    container,
    "sh",
    "-c",
    "for i in $(seq 1 30); do pg_isready -U postgres >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1",
  ]);
  const sql =
    'CREATE TABLE "User" (id INTEGER PRIMARY KEY, timezone TEXT NOT NULL, username TEXT UNIQUE, "notificationPreferences" JSONB); CREATE ROLE anon; CREATE ROLE authenticated;\n' +
    readFileSync(
      "prisma/migrations/20261018000000_personal_calendar/migration.sql",
      "utf8"
    ) + readFileSync("prisma/migrations/20261018010000_calendar_scheduling/migration.sql", "utf8") +
    readFileSync("prisma/migrations/20261018020000_external_calendars/migration.sql","utf8") +
    readFileSync("prisma/migrations/20261018030000_calendar_completion/migration.sql","utf8") +
    `CREATE TYPE "SystemMessageType" AS ENUM ('INFO'); CREATE TABLE "SystemMessage" ("id" SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES "User"("id"), "sessionId" INTEGER, "content" TEXT NOT NULL, "type" "SystemMessageType" NOT NULL, "read" BOOLEAN NOT NULL DEFAULT false, "attachmentUrl" TEXT, "modelUsed" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`;
  run(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql }
  );
  run(
    "node_modules/.bin/vitest",
    [
      "run",
      "__tests__/calendar/personal-postgres.test.ts",
      "__tests__/calendar/external-postgres.test.ts",
      "__tests__/calendar/completion-postgres.test.ts",
      "--environment",
      "node",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        CALENDAR_TEST_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`,
      },
    }
  );
} finally {
  if (started) run("docker", ["rm", "--force", "--volumes", container]);
}
