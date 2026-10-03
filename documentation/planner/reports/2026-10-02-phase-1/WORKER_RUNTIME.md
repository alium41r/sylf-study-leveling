# Phase 1 worker packaging, deployment and recovery

This implements the [frozen runtime contract](../2026-10-02-phase-0/WORKER_RUNTIME.md). It is a local qualification/runbook, not evidence of a hosted deployment. No intelligence handler, provider prompt or LearningBlueprint compiler is shipped in this phase.

## Package and commands

Node **26.x** is pinned in `package.json` and `.node-version`. Install the existing lockfile with `npm ci`, regenerate Prisma with `npx prisma generate`, then run `npm run planner:worker:build`. The package entrypoint is `dist/planner-worker/main.js`; ship the compiled tree, matching runtime dependencies, generated Prisma client and lockfile together. Start with `npm run planner:worker`. Local `npm run planner:dev` builds and supervises web plus worker; it requires a local `DATABASE_WORKER_URL`. Web uses its existing Prisma-owned pool; the worker has a separate pool with maximum four connections.

Use the existing hosted Next service and one supervised Node process/container with the same migration level. Initial allocation is one CPU / 512 MiB, two jobs concurrently. Do not run a provider request as background work owned by a Next request or client connection. Attempt is the PostgreSQL queue; no extra broker is required. Database calls use short serializable transactions, user-first advisory coordination, UTC, ten-second statement timeout and bounded three-attempt serialization/deadlock retries with jitter. Provider work runs outside transactions.

Environment: `DATABASE_WORKER_URL` is required; `PLANNER_WORKER_HEALTH_PORT` defaults to 8081. Web V2 planning-write admission uses `PLANNER_V2_DURABLE_CORE_ENABLED=true`. This flag does not disable owned recovery reads, cancellation, versioned Focus execution or SQL protections. Phase 2 will register only approved handlers and necessary provider/search credentials; Phase 1 requires no provider secrets. Never supply web/mobile client code with worker credentials.

## Health and supervision

Health listens on **127.0.0.1**. Use an in-container/host loopback probe; do not expose student operations publicly through this port.

- `/live`: HTTP 200 while the process is alive. Restart a failed process under the supervisor.
- `/ready`: HTTP 200 only with compatible execution schema/backstops, registered handlers, fresh sweep/claim progress and queue age below ten minutes. Includes `compatible`, `claiming`, `running`, timestamps and oldest queue age.
- In this Phase 1 package, `/live` is 200 and `/ready` is deliberately **503**, with `compatible:true` and `claiming:false`: no educational handlers exist. Do not route generation traffic or restart-loop the process merely because Phase 2 is absent.
- Startup fails if required columns, enabled triggers, validated membership/duration constraints or Planner RLS are missing. The catalog check is a compatibility backstop, not proof that hosted SQL matches source; compare deployed definitions/grants during release rehearsal.

Supervisor grace must be at least 30 seconds. SIGTERM stops admission, aborts in-flight handlers, releases/checkpoints under the owned fence and exits. SIGKILL leaves a recoverable durable lease. Health failure disables new admission; it never reactivates Classic for adopted work. Recommended operational alerts: worker startup/schema mismatch, no sweep for 30 seconds, queue age over 60 seconds, repeated lease loss, unknown-spend growth and repeated provider errors. Current logs contain operational IDs/fences/error codes, not full student content or credentials; adding an external monitoring vendor is outside Phase 1.

## Recovery rules

A lease lasts 45 seconds and renews every ten seconds using database time. Acquisition/takeover increments the fence. Renewal, checkpoints, call reservations, publication and terminal writes verify owner/fence/unexpired lease and root currentness. An expired worker cannot renew itself. An independent sweep runs every ten seconds even when no request/browser is present. One planning job plus one read-only research job per user is admitted; claims are fair and use PostgreSQL locking. Queued work expires after ten minutes; initial queue wait is distinct from root processing time.

Recovery preserves the original processing start/deadline, transferred foreground time, consumed call/token/cost budget, call reservations and useful checkpoint. It does not grant a new budget. Unknown external spend remains uncertain and consumes its reservation conservatively. Exactly-once provider dispatch is not promised. Durable call identity prevents duplicate application/quota settlement; late financial reconciliation may record actual usage without changing a cancelled/superseded result or refunding dispatched work. Cancel aborts cooperatively; stale SDK results cannot pass repository fencing even if the SDK ignores AbortSignal.

Profile escalation requires an explicit same-root decision and preserves counters/start. All retries, fallback and repairs count. Foreground interpretation transfers owned durable receipts into one Attempt, rather than inventing counters or charging twice. Calendar-only work dispatching no model call does not consume AI quota.

## Credential and deployment boundary

Migrations require a direct administrative connection and must precede application/worker activation. Runtime must use trusted **server-only** database credentials with explicit table/sequence/function access and the appropriate RLS authority for Planner tables; browser `anon`, `authenticated` and public `service_role` access remains revoked for the new artifacts/private guard functions. Custom transaction settings are internal capabilities, not a security boundary against an administrator holding arbitrary SQL credentials. Never grant such credentials to clients. Verify the chosen restricted runtime roles against all required service/RPC operations before hosted activation; local qualification uses the disposable PostgreSQL administrator and does not attest a production grant plan.

No hosted migration, credentials rotation, production grant or deployment was performed. Before activation: rehearse the actual migration ledger/schema on a disposable copy, review catalog/function/grant drift, verify both runtime roles, deploy matching web/mobile transports, drain old jobs/timers for adoption, then enable V2 write admission for staged targets. Rollback switches off new planning admission while retaining recovery and execution; leave adopted data and SQL protections intact. Do not drop new tables, reverse lineage, or relaunch the legacy engine for adopted Goals.

## Reproducible evidence

The required PostgreSQL harness builds the worker and executes its compiled process. It kills a worker with SIGKILL, waits the real 45-second lease, verifies fenced takeover without budget/checkpoint reset, tests an abort-ignoring handler at the absolute deadline, and tests SIGTERM with unknown spend. It also starts the packaged main entrypoint and checks `/live` versus `/ready`, then removes/restores an execution trigger to verify compatibility refusal. See `evidence/postgres-phase1-results.json` and `evidence/postgres-harness-run.json`. These are genuine database/process tests, not mocked queue tests or hosted recovery drills.
