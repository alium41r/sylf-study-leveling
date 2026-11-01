# Phase B Step 1 — baseline, admission and compatibility

25 October 2026. Implements Step 1 of the [Phase B plan](../2026-10-25-ai-first-phase-a/PHASE_B_PLAN.md) under the [approved handoff](../../AI_FIRST_PLANNER_HANDOFF.md). The [current foundation contract](../../AI_FIRST_FOUNDATION.md) records the resulting guarantees. This is headless compatibility work; the four-role AI workflow remains unimplemented.

## Result

The retained V2 PostgreSQL baseline is stabilized without relaxing execution checks. New planning Attempts can explicitly pin compiler v2 through trusted service composition. Existing callers and in-flight Attempts retain compiler v1. The existing worker/compiler dispatches by that immutable pin. Owned readers retain exact strategy, translation and review correspondence across historical revisions and newer drafts.

Production admission/provider routing is unchanged. Compiler v2 role execution, actual role resource admission, linked continuation, publication and apply remain closed. Its dispatch branch validates recovery artifacts and reports `QUALITY_INCOMPLETE` before calls or publication; the existing worker persists that finite failure. No paid calls, hosted migrations, UI or parallel engine were introduced.

## The 32 retained failures

These names were recorded in the Phase A run and its matching control. They are all present and passing in the final run; [the resolution manifest](evidence/regression-resolution.json) maps each name to its disposition. Frozen historical reports, pure contract fixtures and deadline assertions were preserved.

| Count | Cause | Correction |
| --- | --- | --- |
| 28 | Lifecycle/publication fixtures scheduled today after a fixed 23 October exam | PostgreSQL lifecycle fixtures now explicitly accept an exam 90 days ahead. Pure dated contract fixtures remain unchanged. A new negative test intentionally exceeds the exam cutoff and requires rejection with no revision written. |
| 1 | Capacity fixture assumed a usable day while inheriting both an expired exam and Sunday's default rest day | Explicit future exam and no rest days for this capacity scenario; exact 20 committed / 18 recovery / 82 available assertions retained. |
| 1 | Cost summary expected a known subtotal in a field that now correctly represents an incomplete total as null | Assert `costUsd:null`, `knownCostUsd:0.25`, two unknown requests, incomplete status, and unchanged ledger rows. |
| 1 | Concurrency fixture expected five blocking advisory-lock waiters, although coordination intentionally retries nonblocking transaction locks with fresh snapshots | Observe genuine retry connections, assert no reservation enters while the owner is held, then require exactly four accepted reservations and one budget rejection. |
| 1 | Foreground replay supplied null cost after the dispatcher had already settled a known price | Replay the exact persisted cost; additionally require changed actual usage to fail idempotency validation. |

**Production regressions among those 32: none found.** The deadline, rest-day, accounting/idempotency and coordination owners behaved as intended. Fixture corrections are separate from the new production versioning/reader implementation. One intermediate versioned run also correctly rejected a Phase A fixture trying to reserve a v2 call through the legacy meter; synthetic historical receipt setup now qualifies retention without reopening runtime admission.

## Implemented boundaries

- **Admission and replay:** nullable-free `PlannerAttempt.compilerVersion`, supported values 1/2, default 1 for old/in-flight rows, SQL immutability. Trusted `GenerationService(db,{compilerVersion:2})` opts in; client bodies cannot. V2 hashes include its pin; historical v1 hashes retain their interpretation. Reusing a key or retrying a parent under another compiler fails. V2 child continuation remains blocked until aggregate accounting exists.
- **One lifecycle:** the existing worker, lease/fence/deadline, Attempt state, cancellation, sweep, financial receipts and compiler remain the owners. SQL rejects an older worker's v2 claim without the new transaction-local compiler capability; v1 work can drain during mixed deployment. V2 cannot fall through into v1 repair/provider/publication. Legacy checkpoint writers and call admission reject v2; archive writers reject v1. Worker readiness requires the new column, constraint and both version guards.
- **Historical inspection:** `PlannerFoundationService.inspect` distinguishes old core, old compiler and AI-first data; verifies owned intent/target/request bindings, archive/checkpoint integrity and receipt correspondence; recognizes saved response versus uncertain dispatch. `RevisionService.read` and `WorkspaceService.readIntelligence` return exact sealed strategy/translation/review references and verify canonical correspondence across selected revisions. Later drafts never replace sealed text. Pre-V2 snapshots are explicitly legacy, with no invented blueprint or approval.
- **Execution remains protected:** `readCompilerCheckpoint` still requires fresh execution bindings. Historical inspection is a separate read operation. `loadRevision`, publication and ApplyService remain closed to v2 until full live validation is installed. SQL prevents a canonical v2 revision from masquerading as legacy by omitting its bundle, or a v1 revision from acquiring a v2 bundle. No active plan is regenerated.

The v2 budget currently retained in the Attempt is unspent lifecycle scaffolding. It is not a role policy, expanded financial entitlement or implemented aggregate continuation allowance. No checkpoint is converted, no budget is reset and no unknown dispatch is silently retried.

## Affected owners

| Files | Responsibility |
| --- | --- |
| [compiler-version](../../../../lib/planner/v2/server/compiler-version.ts), [attempts](../../../../lib/planner/v2/server/attempts.ts), [generation](../../../../lib/planner/v2/server/generation.ts), [compiler](../../../../lib/planner/v2/server/compiler.ts), [worker](../../../../lib/planner/v2/server/worker.ts) | Immutable admission, replay, dispatch and activation guards |
| [versioned readers](../../../../lib/planner/v2/intelligence/foundation/readers.ts), [checkpoints](../../../../lib/planner/v2/intelligence/checkpoints.ts), [foundation](../../../../lib/planner/v2/server/foundation.ts), [revisions](../../../../lib/planner/v2/server/revisions.ts), [workspace](../../../../lib/planner/v2/server/workspace.ts) | Owned draft/history readers and exact correspondence |
| [migration](../../../../prisma/migrations/20261025010000_planner_compiler_version/migration.sql), [schema](../../../../prisma/schema.prisma), [Prisma owner](../../../../lib/prisma.ts) | Additive pin/SQL guards, generated client, cache marker 40 |
| [reader tests](../../../../__tests__/planner-v2/intelligence/versioned-readers.test.ts), [PostgreSQL compatibility tests](../../../../__tests__/planner-v2/postgres/compiler-versions.postgres.ts), existing foundation PostgreSQL tests | Version compatibility, ownership, history, recovery, dispatch, publication barriers and legacy apply |
| PostgreSQL fixture owners: `intent-fixture`, `coordinated-routes`, `durable-core`, `intelligence-boundary`, `lifecycle-projection`, `maximum-envelope`, `timer-lifecycle` | The retained failure corrections above |
| [isolated runner](../../../../scripts/test/test-planner-ai-first-foundation.mjs) | New migration/required suite and explicit report destination; historical evidence writers stay inside a disposable source copy |

ApplyService, session/reward/Quest authorities, the allocator, provider configuration, package pins and frozen execution contracts retain their source. [Preservation evidence](evidence/preservation.json) compares the entire task-start working tree and separately pins these owners. Unrelated Notes/Calendar/package/schema edits were preserved.

## Verification and rollout

See [verification.json](evidence/verification.json) and the [evidence index](evidence/README.md) for commands, exact outcomes and source pins. Tests use Node 24.21.0 and real disposable PostgreSQL 18.4, with no hosted/provider credentials. The native runner applies the actual foundation/version/timer/telemetry SQL through the established isolated harness; it does not claim a pristine replay of every historical migration.

- **382 unit tests in 30 files pass**, including six new reader tests and retained allocation oracle coverage.
- **228 V2 + 225 legacy PostgreSQL checks pass (453 total)**, including ten new compatibility tests and nine adapted foundation tests. All 32 retained failure names pass. Zero required skips; the existing optional paid experiment remains excluded.
- Prisma generation/validation, full TypeScript check and scoped ESLint pass with no lint errors or warnings. Worker build, seven credential-free ordinary Node imports and production web build pass. The web build uses the same explicit 6 GiB process allowance as Phase A, without changing project configuration.
- Final PostgreSQL source pins report no drift. All 5,137 unrelated/pre-existing unchanged files and 20 intended edited files are accounted for. No remaining Step 1 blocker; existing nonblocking Vite/pg diagnostics are recorded in verification metadata. Mobile checks are unnecessary for these backend-only changes.

The new migration is prepared and tested locally, **not deployed**. Deploy the Phase A migration and this migration before matching web/worker code. Old Attempts default to v1; do not backfill compiler v2 from checkpoint shape. A pre-pin Phase A archive on a legacy Attempt remains retained and quarantined from compilation rather than silently converting it. Rollback retains storage/readers and v1 execution; it does not delete history.

No Step 1 implementation blocker remains. This technical verification does not establish model educational excellence or authorize paid qualification.

## Next: Phase B Step 2 — role resource admission and accounting

1. Define a trusted finite offline role profile with meaningful reasoning/final capacity and explicit downstream translation/review reserves. Preserve v1 resource semantics. Natural strategy uses TEXT; translation and review use JSON. Capacity follows educational needs rather than an efficiency target.
2. Extend the existing meter, durable call metadata and versioned SQL/budget interpretation: explicit effort/format/caps; effective model/fingerprint and input/prompt bindings; complete STOP responses; reasoning-inclusive settlement; accurate known/unknown cost. Keep production provider routing unchanged.
3. Implement atomic linked-attempt aggregate admission through the existing financial receipts: one lineage and resource identity, original absolute deadline, no reset of consumed/reserved capacity, preserved unknown spend and explicit uncertain-dispatch reconciliation. Only then enable v2 continuation and role reservation.
4. Qualify reservation/settlement/holdbacks, saved-response recovery, cancellation, deadline/fence loss and concurrent admission with scripted adapters plus disposable PostgreSQL. Leave publication/apply closed. Proceed next to Step 3's accepted research/context dossier.

The remaining dependency order stays: research/clarification → calendar capacity → strategy/translation → independent review/refinement → sealed publication/confirmation → complete offline journey qualification. No Phase 3 UI or paid run is implicit.
