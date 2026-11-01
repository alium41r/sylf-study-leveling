# Scripts

Repository utilities grouped by purpose. Run them from the repository root; most
scripts resolve the repository root from their own location, and asset/QA writers
expect `process.cwd()` to be the root.

| Directory | Purpose | Representative commands |
| --- | --- | --- |
| `build/` | Reproducible builds invoked by npm lifecycle scripts. | `npm run planner:worker:build`, `npm run calendar:recognition:build` |
| `assets/` | Source-art pipelines and read-only image diagnostics. | `npm run sylv:vectorize`, `npm run sylv:optimize`, `node scripts/assets/prepare-pixel-companion-eyes.mjs` |
| `db/` | Migration application, disposable-data maintenance and local sync helpers. | `node scripts/db/apply-migration.mjs`, `node scripts/db/run-calendar-sync.mjs` |
| `dev/` | Local development orchestration. | `npm run planner:dev` |
| `qa/` | Browser/editor qualification harnesses and their fixtures. | `node scripts/qa/qa-planner-session.mjs` |
| `security/` | Repository audits exposed through npm scripts. | `npm run audit:secrets`, `npm run audit:models` |
| `test/` | Opt-in disposable-PostgreSQL integrations (Docker required). | `node scripts/test/test-backend-postgres.mjs`, `node scripts/test/test-rls-audit-postgres.mjs`, `node scripts/test/test-planner-postgres.mjs`, `node scripts/test/test-timer-postgres.mjs` |
| `verify/` | Focused static, bundle and browser verification. | `npm run mobile:verify`, `node scripts/verify/verify-planner-browser.mjs` |

## Notes

- Notes interface checks: [unified-page/browser harness](qa/notes-redesign/README.md), [creative-tools Phase 2](qa/notes-creative/README.md).

- Database harnesses create disposable loopback databases and never read a hosted
  database URL. They are intentionally outside the default `npm test` run.
- `test/lib/disposable-backend.mjs` builds the schema from all of `prisma/migrations/`,
  bridging what only `db push` ever created, and blanks every variable the source names.
  `test-backend-postgres.mjs`, `test-rls-audit-postgres.mjs` and `run-backend-local.mjs`
  use it. The last starts the real server on a disposable database: see the
  [Phase 11 handoff](../documentation/native/handoffs/phase-11.md#6-harness). The older
  `test-timer`, `test-pixel` and `test-planner-postgres.mjs` cannot bootstrap the current
  working-tree schema, so `test-backend-postgres.mjs --suite timer`, `planner`, `pixel` and
  `planner-v2` run those suites on the migrated schema. `run-backend-local.mjs --native-checks`
  runs Sylf Native's client against the real server, `--journey` runs the whole student
  journey in real Electron as two processes on one profile, and
  `test-native-migrations-postgres.mjs` applies Phase 12's migrations to an older database.
- `verify/` writers such as `verify-app-sanity.mjs` and `verify-planner-browser.mjs`
  refresh `.browser-qa/`; refreshable output is not an immutable historical record.
- Planner V2 phase scripts are retained qualification harnesses. They use the
  alternate TypeScript/Vitest configuration in [`config/`](../config/README.md).
  `test/test-planner-ai-first-foundation.mjs --focused --focused-suite understanding`
  selects one existing V2 PostgreSQL suite, retaining every assertion in that
  suite and all required legacy checks. Omit `--focused-suite` for the complete
  focused bank; omit `--focused` for the full bank. This is unpaid disposable
  database testing; it cannot activate provider calls.
- Dated reports may cite pre-reorganization paths. This file and `package.json`
  describe the current locations; historical commands remain task-era records.


## Database migrations

Ordered SQL in `prisma/migrations/` is authoritative. This Supabase-hosted project
uses Prisma's existing `_prisma_migrations` ledger; do not introduce a second
Supabase CLI ledger, rename applied migrations, or derive production DDL from the
Prisma model. Full migration names matter: two historical timestamp prefixes are
shared by different migrations.

```sh
node scripts/db/apply-migration.mjs --status
node scripts/db/apply-migration.mjs --all
# Only accepted when this is the sole pending migration:
node scripts/db/apply-migration.mjs prisma/migrations/<name>/migration.sql
```

Inspect SQL, dependencies, actual schema/history and a private backup before
`--all`. The helper loads the same environment precedence as Next.js, checks all
recorded checksums, refuses unresolved failures, and delegates to official Prisma
`migrate status`/`deploy`. It never executes an arbitrary SQL file or automatically
resolves history. Use a direct or **session** connection in `DIRECT_URL`, not a
transaction pooler. Remote transport always verifies the certificate and hostname;
see the [public CA/transport contract](../config/database/README.md).

A failed migration requires an explicit audit: compare **all** of its schema,
security and data postconditions before using official `migrate resolve` for work
already fully present. A partially applied migration needs a reviewed transactional
repair first. Do not blanket-mark files, reset the database, use `db push`, or add
`IF NOT EXISTS` to conceal conflicting definitions.

After successful deployment, introspect to a **temporary schema**, compare with
SQL, preserve client-facing names and `@updatedAt`, then update the canonical
Prisma schema and run `npx prisma generate`. Bump `SCHEMA_BUILD_VERSION` when its
client model changes. SQL-only constraints, triggers, policies, generated-column
semantics, expression/partial indexes and extra composite Planner ownership FKs
must remain intact. Installed Prisma introspection emits invalid one-to-one
relations for some of those extra composite FKs; do not invent new unique indexes
to satisfy that output. Never execute a Prisma semantic diff against production.

Current hosted migration status, preservation checks, and the historical fresh
bootstrap limitation are documented in the
[22 October audit](../documentation/infrastructure/reports/2026-10-22-database-migrations/report.md).

### Legacy Focus Party QA safety

`db/confirm-invites-and-rejoin.mjs` and `verify/verify-focus-party.mjs` require an
explicit `FOCUS_PARTY_TEST_DATABASE_URL` for a loopback database named
`sylf_focus_party_test` (or that name plus an alphanumeric suffix). They never
inherit hosted application credentials. Provision the real SQL schema in a
**disposable** database first; both scripts create and remove synthetic users.
Cleanup uses normal FK cascades. Never disable triggers or replication checks to
remove fixtures. A cleanup failure makes the command fail.
