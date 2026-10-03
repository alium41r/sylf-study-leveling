# Planner V2 Phase 0: worker deployment and recovery contract

This freezes runtime requirements from [the approved architecture](../../PLANNER_TARGET_ARCHITECTURE.md). It does not implement or deploy a worker. Executable request/state/budget shapes are in [contracts](CONTRACTS.md); [PostgreSQL harness](POSTGRES_HARNESS.md) establishes the real integration-test prerequisite.

## Process and deployment boundary

Use the existing hosted Next web application plus one supervised Node worker process/container against the same PostgreSQL database. Attempt is the queue; no second broker or coordinator. Web authenticates, validates/saves, reserves/transfers accounting and enqueues. It returns durable attempt identity quickly. SSE is optional persisted-stage delivery with polling fallback; client disconnect does not own/cancel work.

The Phase 1 package must provide a compiled `dist/planner-worker/main.js` entrypoint and a documented local command that starts both web and worker. The supervised command is `node dist/planner-worker/main.js`; this path is a packaging requirement, not a runnable Phase 0 file. Use the same pinned Node major/toolchain as qualified web/CI builds. The current package does not declare an engines range; Phase 1 packaging must freeze it rather than assume whatever Node is installed locally. No host/vendor migration is required for the web app.

Initial worker resources: one CPU, 512 MiB memory, two concurrent jobs total. One planning job plus one read-only research job per user; fair claiming prevents starvation. Use a worker-specific database connection configuration and a pool maximum of four, separate from the web singleton's production maximum of twenty. All provider calls happen outside transactions. Transaction-scoped advisory locks work within a transaction; do not require session locks or LISTEN for claiming through a pooler. Migrations use a direct administrative connection; runtime credentials have only necessary privileges.

Worker secrets contain only required database/provider/search credentials. No client/mobile bundle imports worker/server dependencies. Private research and student artifacts are owned; public fetched content caching remains separated. Logging contains IDs/digests/stage/cost, not credentials/full student content. Health endpoints/metrics are operational, not a student-facing settings panel.

## Frozen operational values

| Setting | Initial contract |
| --- | --- |
| Lease duration / renewal | 45 seconds / every ten seconds, database clock. |
| Claim | Short transaction, `FOR UPDATE SKIP LOCKED`; per-user admission/fairness checked with database coordination. |
| Fence | Monotonically increases on every acquisition/takeover. |
| Reaper | Independent sweep every ten seconds for expired RUNNING jobs; no browser request required. |
| Ordinary advice | Foreground, 30 seconds, two calls maximum; never waits for a planning slot. |
| Read-only research | Same queue, `RESEARCH_ADVICE`, zero mutation targets, separately admitted per user. |
| Queue warning / expiry | Warn after sixty seconds; expire unclaimed work after ten minutes. |
| Shutdown | Stop claiming immediately; abort/checkpoint in-flight work within a thirty-second grace. Fenced recovery remains available after hard termination. |
| Database operations | Short transactions; bounded serialization retry, at most three attempts with jitter. No external calls under locks. |
| Provider transport retry | At most one retry for a retryable transport failure, counting against the same call/token/deadline cap. No automatic fresh budget. |
| Poll fallback | Active work every two seconds, idle/backoff five to thirty seconds; visibility/network aware. |

Values are versioned runtime policy defaults. Changing them later requires corresponding tests/measurement, not a new architecture. Effective provider timeout is the smaller of its stage allowance and the remaining root deadline; extraction/OCR may not reset the root budget.

## Claim, publication and crash rules

An Attempt records request key/hash, kind, targets/requested intents, base versions, deadline/remaining budget, checkpoints, call reservations and lease/fence. Research adoption binds resolved intent once using fenced compare-and-swap; only then can blueprint generation start. Concurrent accepted input supersedes publication rather than retargeting the job.

A claim transaction sets current owner, fence and expiry. Every renewal, checkpoint, call reservation and publication checks owner/fence and an unexpired database lease. An expired owner cannot renew itself. Candidate publication additionally checks pinned base/intent correspondence. Completion writes result/revision map and publishes pointers atomically; zero-target research publication only stores evidence/answer and cannot invoke apply.

Freeze coordination order around the existing user advisory namespace 73641: user coordination first, owned Plan/Attempt/revision rows in stable identity order, affected existing StudySession rows by ID, affected Quest rows by ID, then User/Stats/Node economic rows. New-session insertion follows that user's coordinated start; progress using a narrower protocol may not reverse Session→Quest order or mutate structural state. Queue selection may read candidate IDs without locks, then acquire user admission before locking/claiming the Attempt; do not wait on a user lock while holding a queue row in the opposite order. Account erasure/reset must quiesce/cancel attempts and use the same coordination. SQL RPCs and generic writers participate, not only Planner service code.

At first worker claim, subtract already-consumed foreground interpretation from the profile budget and persist the absolute deadline. Initial queue wait is excluded from processing allowance but included in user-visible latency. Provider waits, persistence, crash/takeover downtime after first claim consume the deadline. A lease takeover never resets it.

Before provider dispatch, persist a uniquely identified call reservation with estimated token allowance. After completion, record actual usage/unknown spend before advancing a validated checkpoint. Crash after dispatch may repeat a call; exactly-once external execution is not promised. Late responses from an obsolete fence cannot advance data. Reservations settle once, unknown pricing/spend remains explicit, and retries do not become free or invisible.

Cancellation is durable and checked before dispatch, after response and before publication. SDK/fetch receives abort/deadline signals; an SDK that ignores abort still cannot publish. A browser refresh/disconnect leaves work running. Retry of a terminal attempt is explicit, linked and newly budgeted; checkpoint reuse requires compatible schema/digests/context, not just a previous success.

Quality review failure retains the useful checkpoint unconfirmably. Repair cannot consume the slots reserved for verification and then silently pass. Strong severe findings remain blockers; reasonable uncertainty/advisory findings remain visible without increasing work automatically.

## Request-class budgets

| Profile | Total model calls | Processing allowance | Total input/output token ceilings |
| --- | --- | --- | --- |
| Advice | 2 | 30 seconds | 16k / 4k |
| Calendar-only | 2, normally zero/one | 30 seconds | 16k / 4k |
| Known scope / educational update | 6 | 180 seconds | 80k / 24k |
| Research/import, including research advice | 8 | 300 seconds; research at most 120 | 160k / 32k |

Planning after interpretation has at most five calls, including adaptation, initial review, repair/verification and fallback. Research has at most two synthesis calls, one focused follow-up, eight total queries, sixteen fetch attempts, nine retained sources and seventy-two thousand selected source characters. OCR has at most six necessary pages in batches of three and consumes root-call slots. A profile escalation in the same request retains consumed counters and is explicit; separate interview turns remain measured at journey level.

## Deployment acceptance and recovery drills

Before V2 production writes, staging must demonstrate all of the following against real PostgreSQL and a controllable provider stub, then a bounded live-provider smoke test:

1. Start web without worker: enqueue stays durable, health detects unavailable worker, user can cancel; no request-owned hidden generation.
2. Kill worker before dispatch, after dispatch, after checkpoint and before publication: reclaim once, preserve accounting, reject obsolete results and publish one candidate.
3. Run two workers: no double claim and no simultaneous planning jobs for one user; research advice retains its separate admission and has no mutation targets.
4. Expire a lease while the old process is alive: renewal/publication fail; newer owner can progress. Database clock, not host clock, decides ownership.
5. Cancel during a slow provider: abort and retain truthful terminal/recovery state; late response cannot publish.
6. Exhaust call/token/time budget during research/repair: preserve checkpoint, never skip mandatory review or silently open a new budget.
7. Refresh/close SSE, reopen from mobile/polling: restore exact durable stage and result under the same intent.
8. Deploy incompatible schema/worker: readiness fails; do not claim until contract/migration version matches. Rolling compatible deployment and graceful shutdown permit takeover.
9. Fail apply after each write boundary: no partial Quest/Goal/link/pointer/receipt writes; duplicate confirmation returns the same receipt.
10. Start/resume a Quest from another client during review: exact protected-execution conflict; no stale paused-client bypass.

Monitor oldest queue age, failed renewal/fence rejection, recovery count, stage latency, budget consumption, review recovery and transaction retry. Readiness requires database reachability, compatible schema and recent successful claim/sweep heartbeat. Liveness only establishes a functioning process; a stalled queue is not healthy merely because HTTP responds.

Phase 0 supplies definitions and test infrastructure. These worker/apply drills are Phase 1 behavior gates; they must not be reported as already passing merely because the queue primitives can be exercised in a contract test.
