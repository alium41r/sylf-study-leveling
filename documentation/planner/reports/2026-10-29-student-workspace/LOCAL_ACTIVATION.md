# Local workspace activation — 29 October 2026

The requested local interface is enabled. Only the ignored `.env.local` values
`PLANNER_V2_DURABLE_CORE_ENABLED=true` and
`PLANNER_V2_STUDENT_WORKSPACE_ENABLED=true` were changed. The local Next server
runs on Node 24.21.0 at `http://localhost:3000/planner`.

Before database authorization, the authenticated browser rendered the goal form
rather than the unavailable screen, and both read requests returned HTTP 200.
Readiness correctly reported the missing compatible worker. The completed
activation and current healthy readiness are recorded below.

## Remaining activation boundary

The application is connected to a **remote Supabase database**, not disposable
local PostgreSQL. A read-only transaction found neither the compiler-version nor
intelligence-artifact columns on `PlannerAttempt`, and no active queued, running
or decision-waiting attempts. The existing migration helper's read-only status
check verified remote TLS and the migration ledger/checksums: exactly the eight
Planner migrations below are pending, with no unresolved failed migrations or
unrelated pending migrations. Its exit code 1 denotes pending migrations.

| Pending migration, in dependency order | SHA-256 of `migration.sql` |
| --- | --- |
| `20261025000000_planner_ai_first_foundation` | `f30ee66b1f515780cb89721f50ae4369013e21bca481d36fabffb34c4c305cb8` |
| `20261025010000_planner_compiler_version` | `5a7013faea5425657a32bdf9727fea19404147f94fb712701ade56c3916d218d` |
| `20261026000000_planner_role_resources` | `6a973b6b4f473355968e216e05a110f19f05b58aacaf2771dae6d4c331dafc3b` |
| `20261026010000_planner_understanding` | `6dc738ecfaf5cab4a1c0d0b5eb91e7eaad42da337c6e20534f98259a06b5a8e6` |
| `20261026020000_planner_calendar_capacity` | `17bc01fa9344d368293c7a410e90802a04d3245e3b851c070529c2cc06662a98` |
| `20261026030000_planner_natural_learning` | `46370dfc064d1a9d15e72a67ef8ea2fb1049221d4aedbbabc22afb68053a5784` |
| `20261027000000_planner_reviewed_learning` | `34d8de4db0308da2826173850859a0c16144cb1805e702f6b4bbaf96d5a35a5b` |
| `20261028000000_planner_reviewed_publication` | `de8ae3ba4335263d6b6c11b386492a01129f8bc4069eefbc774ac19f31fd87d6` |

These are the existing Phase A/B contracts for durable artifacts, pinned compiler
versions, aggregate role accounting, research, capacity, natural learning,
review/refinement and reviewed publication. This activation task creates no new
migration or alternative execution path.

## Approved scope, prepared before database authorization

1. Review the existing SQL and verify a private backup, following the repository's
   [migration contract](../../../../scripts/README.md#database-migrations).
2. Recheck that the pending set, checksums and unresolved status still match this
   exact list. If they differ, stop before deployment.
3. Apply this ordered set through the existing verified-TLS Prisma migration
   helper and its canonical ledger. Do not use untracked SQL, `db push`, a reset,
   or changes to existing history.
4. Verify schema/worker compatibility and active-attempt state, configure and
   start the local Node 24 worker, and check actual workspace readiness.
5. Stop before authorizing generation. Opening the interface and checking
   readiness do not authorize paid AI activity.

The earlier no-production-changes instruction initially blocked this action.
The user subsequently explicitly approved applying these eight migrations and
starting the local worker. That approval does not authorize other migrations,
provider routing changes or paid generation by the agent.

## Approved activation completed — 29 October, 07:45 UTC

- Applied exactly the eight listed migrations through the existing helper and
  official Prisma ledger, with verified remote TLS. All 78 repository migrations
  are now recorded as applied; no unresolved or pending migration remains.
- Created a fresh private custom-format public-schema/data backup in the ignored
  `backups/planner-activation-20261029/` directory (`0700`; files `0600`). The
  archive listing and a full archive-to-SQL decoding check pass. This verifies
  archive readability, not a full restoration into another database. Storage
  object bytes and managed platform schemas are outside this backup's scope.
- Compared original columns and all original rows across 73 application tables.
  **72 tables are unchanged.** All 164 User rows remain; one row's `lastSeenAt`
  changed through the app's ordinary heartbeat. No other User field changed.
  The raw fingerprint mismatch is preserved alongside the field-level audit;
  it is not misreported as a byte-identical User snapshot.
- Introspected the hosted schema into a private temporary file: 73 models, with
  the compiler version, durable intelligence archive and revision bundle fields
  present. The existing canonical/generated Prisma models already contain these
  Phase A/B fields and were not rewritten.
- The worker's existing full compatibility check passes, including versioned
  columns, enabled guards, validated constraints, indexes and Planner RLS.
  No queued, running or decision-waiting attempts existed before startup.
- Configured only the ignored local worker connection, using the existing
  session endpoint with `verify-full` and the repository's Supabase CA. The
  actual Node client socket reports encryption and certificate authorization.
- Fixed `scripts/dev/dev-planner.mjs` to load the normal development environment
  before checking the worker connection, and to run Next with the parent's Node
  executable. Node syntax validation and scoped ESLint pass. The actual shared
  launcher starts web and worker successfully on Node 24.21.0.
- Live loopback `/ready` reports `ready: true`, `compatible: true`, compiler
  versions `[1, 2]`, and no running work. An authenticated real workspace GET
  returns HTTP 200 with `enabled: true`, `ready: true` and no blocking reason.
  The browser opens `/planner` successfully. No generation/authorization button
  was clicked and no real-model result is claimed.

The local web/worker processes remain running. Refresh or **Check again** in an
already open workspace to obtain the new readiness result. Future local starts
can use `npm run planner:dev` under Node 24 with the saved local configuration.
Provider routing and production environment configuration remain unchanged.
