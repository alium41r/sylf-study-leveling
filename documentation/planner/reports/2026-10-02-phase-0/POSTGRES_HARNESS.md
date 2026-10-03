# Phase 0: genuine PostgreSQL harness

This harness establishes a disposable database and executable current integrity/concurrency baseline. It does **not** implement or verify the future V2 worker, intent/attempt schema, joint apply service, or V2 migrations.

## Commands and safety

```sh
node scripts/test-planner-v2-phase0-postgres.mjs
node scripts/test-planner-v2-phase0-postgres.mjs --native-bin /absolute/path/to/postgres/bin
```

The runner first checks a working Docker daemon and starts an owned `postgres:17` container bound to a generated loopback port. Without Docker it uses an explicitly supplied native binary directory, or an installed Homebrew/Postgres.app server. Native mode initializes a new cluster below the OS temporary directory, runs it only on `127.0.0.1`, creates a unique database, and destroys the cluster after tests. It never starts an installed database service.

The runner accepts **no database URL**. It does not load `.env` or inherit PostgreSQL settings/provider credentials. Child processes receive only a small OS environment allowlist, generated disposable connection settings and synthetic test secrets. New required suites additionally demand a harness-issued marker from the generated database. URLs, passwords and identity tokens are removed from saved summaries.

Unavailable runtime, bootstrap failure, missing required suite, zero executed assertions, failed tests or a skipped required assertion all produce a nonzero exit. Running the new suites directly without the harness fails rather than skipping. PGlite is deliberately excluded: it cannot establish the required separate-server-connection races. The sole permitted exclusion is the existing named provider experiment in `database.test.ts`; it is not an integrity gate and the child environment contains no provider keys.

The required SQL/connection suites use the explicit `.postgres.ts` suffix and are discovered only by `vitest.planner-v2-postgres.config.ts`. Ordinary unit runs therefore do not discover them without a disposable database. Invoking the dedicated configuration without the harness still fails closed. The default Vitest configuration is unchanged.

## Bootstrap fidelity

The historical migration chain has the pre-existing missing-enum bootstrap gap documented by the legacy database runner. Phase 0 uses an audited current Prisma schema diff from empty, omitting Planner models/relations, then applies actual migration SQL unchanged. It does not claim a successful clean replay of every historical production migration.

The staged chain includes:

- Canonical progression/Quest reward helpers.
- Pre-S2 session/achievement and T3 start/settle RPC definitions.
- S2 security revocation, JWT policy semantics and recursion fixes.
- Subsequent cognitive effects/APEX/SP replacements, including final settlement and reward RPC bodies.
- Planner foundation, checks, preferences/friction, intake, subject archive, permanent release and reoffer SQL.

Pre-S2 RPC definitions are important for ACL fidelity: S2 revokes existing function privileges before replacing those functions. Creating those signatures only after the blanket revocation changes their privilege history. The final effective `start_study_session` comes from S2; final settlement/Quest reward come from SP stipend SQL. Their installed bodies and browser-role denial are asserted.

The runner records the current schema SHA-256 and each applied source migration SHA-256. Supabase role names, `auth.jwt`, `auth.uid` and the publication are disposable local platform stubs; this is not a hosted Supabase/PostgREST/Realtime verification.

## Required verification

The new suites use `pg` clients and actual installed triggers/RPCs:

| Coverage | Proof |
| --- | --- |
| Runtime | Genuine server version and three distinct PostgreSQL backend PIDs |
| Security | Planner RLS enabled; browser roles lack Planner access and start RPC execution |
| Ownership | Foreign Subject/Goal and execution references rejected |
| Membership | Cross-Plan active pointer rejected by the actual deferred FK at commit |
| Immutability | Sealed snapshots/operation identity and confirmation receipt cannot be rewritten |
| Generic writers | Linked Quest structural changes without review capability rejected |
| Execution | Actual zero-second Focus start protects scheduling mutation |
| Race | Another backend visibly waits on the Quest row, then its reschedule is rejected after start commits |
| Release | `USER_RELEASED` lineage cannot be silently resurrected |
| Atomicity prerequisite | Injected SQL failure rolls back Goal/Quest/pointer writes |
| Lock prerequisite | Separate backends observe transaction-scoped advisory lock exclusion and release |

The runner then executes all seventeen current `database*.test.ts` Planner suites serially on the same disposable cluster. New suite names explicitly say “current SQL” or “PostgreSQL connections.” Their raw SQL rollback/lock tests are prerequisites, not proof that the future application-level V2 apply/lease/fence implementation is correct.

Future Phase 1 acceptance must run through the actual new worker/apply services, including stale fences, intent resolution races, joint all-or-nothing application, crash recovery and complete write-boundary rollback. Those guarantees are not counted as passing Phase 0 tests or replaced by a toy queue model.

## Runtime provenance and evidence

Docker Desktop was found incomplete (`kLSNoExecutableErr`); no local native server was installed. A temporary runtime was obtained by the root agent from pinned `@embedded-postgres/darwin-arm64@18.4.0-beta.17`, outside repository dependencies, and its binary reports PostgreSQL 18.4. The isolated binary directory is `/private/tmp/sylf-planner-phase0-runtime/package/native/bin`; it is a rerun convenience, not a portable project dependency.

Registry tarball SHA-512: `Kg1ZMNFzkVIJs3g4V2UYEc5X005km9rGinxFBH8R1sOU2Rblvz4pt2Uf93Pu8Rk273Ue9HIdrbMPpgUqwjUi0Q==`.

Local package symlinks were hydrated by the root agent with path confinement. No `package.json`, lockfile, global installation, production schema, services or hosted database changed. Loopback binding required sandbox escalation; the approved run remained disposable and localhost-only. The supported container path targets PostgreSQL 17; the measured local result is PostgreSQL 18.4, not a claim of a PostgreSQL 17 run.

Machine-readable evidence lives beside this document:

- `evidence/postgres-harness-run.json`: runtime, schema/migration fingerprints, gate result and cleanup outcome.
- `evidence/postgres-phase0-results.json`: required new SQL/connection suite results.
- `evidence/postgres-current-results.json`: required existing service/route suite results when reached.

Read the current result files for measured pass/failure totals. The harness overwrites these summaries on rerun and never turns a failure or skipped integrity suite into success.

The verified run passed **14 new SQL/connection assertions and 225 existing assertions in 17 suites**, with zero required skips or failures. One explicitly optional live-provider experiment was excluded. Targeted ESLint also passed. PostgreSQL shut down successfully and the temporary cluster was removed. This establishes the Phase 0 current-database gate, not future V2 service correctness.

Whole-repository typecheck reports two generated Next route-export errors for `CURATED_SOUNDSCAPES` in Acoustics and `calculateScopeWeight` in Quests. No Phase 0 file has a type diagnostic. Those unrelated routes were not edited; exact check status is recorded in `evidence/postgres-harness-checks.json`.
