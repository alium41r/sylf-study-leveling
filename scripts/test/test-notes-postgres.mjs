/** Actual Notes migration against disposable PostgreSQL. Never reads a hosted URL or pulls an image. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
const name = "sylf-notes-test-" + randomBytes(6).toString("hex"),
  password = randomBytes(18).toString("hex");
const run = (args) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: "pipe" });
let started = false,
  db;
try {
  run(["image", "inspect", "postgres:17"]);
  run([
    "run",
    "--pull=never",
    "--detach",
    "--name",
    name,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    `POSTGRES_PASSWORD=${password}`,
    "postgres:17",
  ]);
  started = true;
  run([
    "exec",
    name,
    "sh",
    "-c",
    "for i in $(seq 1 30); do pg_isready -U postgres >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1",
  ]);
  const port = Number(run(["port", name, "5432/tcp"]).trim().split(":").at(-1));
  db = new pg.Client({
    host: "127.0.0.1",
    port,
    user: "postgres",
    password,
    database: "postgres",
  });
  await db.connect();
  await db.query(
    'CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE "User" ("id" INTEGER PRIMARY KEY); INSERT INTO "User" VALUES (1),(2)'
  );
  await db.query(
    readFileSync(
      new URL(
        "../../prisma/migrations/20261020000000_notes_connections/migration.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
  const insert =
    'INSERT INTO "NotesConnection" (id,"userId","libraryId","accountId",label,credentials,"vaultKey") VALUES ($1,$2,$3,\'account\',\'label\',\'wrapped\',\'wrapped\')';
  await db.query(insert, ["one", 1, "lib-one"]);
  await assert.rejects(
    db.query(insert, ["two", 1, "lib-two"]),
    (e) => e.code === "23505"
  );
  await assert.rejects(
    db.query(insert, ["two", 2, "lib-one"]),
    (e) => e.code === "23505"
  );
  await assert.rejects(
    db.query(insert, ["two", 3, "lib-two"]),
    (e) => e.code === "23503"
  );
  for (const role of ["anon", "authenticated"]) {
    await db.query(`SET ROLE ${role}`);
    await assert.rejects(
      db.query('SELECT * FROM "NotesConnection"'),
      (e) => e.code === "42501"
    );
    await assert.rejects(
      db.query('SELECT * FROM "NotesOAuthState"'),
      (e) => e.code === "42501"
    );
    await db.query("RESET ROLE");
  }
  const rls = await db.query(
    "SELECT relrowsecurity FROM pg_class WHERE relname IN ('NotesConnection','NotesOAuthState')"
  );
  assert(rls.rows.every((r) => r.relrowsecurity));
  const claims = await Promise.all(
    [1, 2].map(() =>
      db.query(
        'UPDATE "NotesConnection" SET "refreshLeaseUntil"=NOW()+INTERVAL \'60 seconds\' WHERE id=\'one\' AND ("refreshLeaseUntil" IS NULL OR "refreshLeaseUntil"<NOW())'
      )
    )
  );
  assert.equal(
    claims.reduce((n, r) => n + r.rowCount, 0),
    1
  );
  await db.query(
    "INSERT INTO \"NotesOAuthState\" VALUES ('state',1,'hash','wrapped',NOW())"
  );
  await db.query('DELETE FROM "User" WHERE id=1');
  assert.equal((await db.query('SELECT * FROM "NotesConnection"')).rowCount, 0);
  assert.equal((await db.query('SELECT * FROM "NotesOAuthState"')).rowCount, 0);
  console.log(
    "PASS: actual additive migration, foreign keys, user/library uniqueness, RLS and denied anonymous/authenticated access, single refresh lease, ownership cascade. Disposable baseline only; no hosted migration."
  );
} finally {
  await db?.end();
  if (started) run(["rm", "--force", "--volumes", name]);
}
