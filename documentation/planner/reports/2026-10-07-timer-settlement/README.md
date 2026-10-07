# Timer settlement compatibility — 7 October 2026

Status: **FIX IMPLEMENTED AND VERIFIED; DEPLOYMENT PENDING**.

The user reported that End repeatedly failed on the deployed site. This is an additional authorized fix alongside the ongoing Phase 2 work, not intended Planner behavior or Phase 3 work.

## Diagnosis

The configured database has the existing timer RPCs and user timezone fields, but no `StudySession.executionContext`/`executionState` or `Quest.plannedMinutes`/`plannerSpec` columns. Read-only metadata inspection and query planning reproduced SQLSTATE `42703` for the previous weekly-settlement query and Quest marker lookup. Neither query was executed; no study records were read and no hosted data was changed. See [diagnosis evidence](evidence/diagnosis.json).

Every legacy progress/final request uses `SessionService.settleLegacy`. The session RPC and weekly mission run in one transaction, so the missing-column error in weekly aggregation rolls back the session finish and its rewards. The UI correctly retains local progress and reports failure. Quest-linked starts also attempted to select the missing marker directly.

## Changes

- The existing weekly settlement owner reads the optional execution context through the PostgreSQL row representation. On the older schema it uses the existing `startedAt` rule. When V2 context exists, its accepted civil date remains authoritative.
- The existing session API reads an owned Quest's optional V2 marker through the same technique. Marked V2 work still requires protocol 2; disabled admission does not bypass that protection.
- The existing atomic RPC, coordination, exact-delta accounting, one-time reward authority, flood guard and timer transport remain in place. No new settlement path, schema migration, UI change or deployment flag is introduced.

## Validation

- [Timer/transport tests](evidence/timer-tests.json): **62 passed**, including owned legacy start, V2 protocol protection and canonical final settlement.
- [Disposable PostgreSQL results](evidence/postgres-harness-run.json): **407 passed, zero required skips** (182 durable service cases and 225 existing regression cases). The added database test exercises a real transaction-local legacy history table without V2 columns, a V2 history row whose accepted civil date differs from its old timestamp, and one-time weekly award replay.
- Both compatible queries plan successfully on the configured older database. The previous statements fail with `42703`.
- Scoped ESLint and worker TypeScript checks pass. Full repository typecheck still reports the previously documented generated Next.js route/page errors; none names the changed timer files. No unrelated owners were edited.
- An isolated production compilation is being refreshed as part of Step 6; its final result will be recorded here.

## Deployment and remaining verification

This repository change has not been deployed. The deployed site's End button must be checked after deployment; a local/unit success is not a claim that the live page has changed. No user session was ended or replayed during investigation. The fix does not require applying V2 migrations to the deployed database.

The timer defect and its evidence are separate from the still-incomplete Phase 2 live educational acceptance gate. [Phase 2 continuation](../2026-10-03-phase-2/STEP_6_CONTINUATION.md) records that work.
