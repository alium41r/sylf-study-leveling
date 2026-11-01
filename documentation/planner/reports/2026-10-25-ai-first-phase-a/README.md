# Phase A — AI-first architecture foundation

25 October 2026, Asia/Karachi. **Foundation implemented; new workflow remains inactive.** New contract/unit and foundation PostgreSQL checks pass. The complete retained V2 aggregate remains failed on pre-existing fixtures; it is not relabelled green. No paid provider call, hosted migration, production flag/routing change, deployment, Phase B pipeline or Phase 3 UI was performed.

Authority: [approved handoff](../../AI_FIRST_PLANNER_HANDOFF.md), [design rationale](../2026-10-25-ai-first-architecture-proposal/README.md), retained original execution architecture and actual source/tests. The current [foundation contract](../../AI_FIRST_FOUNDATION.md) records exact decisions and limits. The [Phase B plan](PHASE_B_PLAN.md) orders the first complete headless journey.

## Delivered foundation

| Requirement | Implemented result |
| --- | --- |
| Durable complete strategy | Exact natural text, immutable local versions/parents, server paragraph spans, producer/input/model metadata and bounded explicit overflow. No blueprint prose cap or template imposed on the strategist. |
| Dossier/capacity retention | Owned requested/resolved intent and exact accepted-instruction bindings, raw/adopted evidence/source/applicability pins, consequential gaps, plus retained typed SchedulingEnvelope and calendar projection. |
| Faithful translation | Exact strategy refs, consequential element inventory, owned canonical targets, retained guidance/gaps, bounded mechanical derivations and committed-work basis checks. Semantic completeness still requires independent review. |
| Exact approval | Domain-separated strategy/dossier/translation/canonical graph/execution/allocation/constraints/calendar/issue-head bindings; fresh reviewer call; complete-result inspection; literal grounds; gaps/blockers/stale verification cannot seal. |
| Recoverable refinement | Compiler-v2 stages, allowed role returns, invalidation, pending-dispatch/saved-response semantics, stable issue history and explicit correction/withdrawal, repeated-candidate detection. No small repair-count cap. |
| Resource admission | Explicit role output/effort/caps and aggregate finite policy, sufficient downstream translation/review holdbacks, same-root accounting projections, immutable continuation counters/deadline and unknown-spend protection. No new ledger, production default or spending authority. |
| Research/clarification | Explicit verified-research versus consequential student-decision boundary, immutable intent ancestry/CAS and linked continuation contract. Actual new continuation admission remains Phase B; legacy retries retain their old meaning. |
| Calendar | Accepted windows, explicit busy/transparent/tentative/all-day/freshness policy, interval projection and joint witness validation. Existing services/allocator remain owners; exact clock bookings and full wiring are not added. |
| Compatibility | Original twelve execution contracts untouched; nullable additive storage; old compiler/checkpoints remain pinned; new archives/unknown versions fail closed through legacy compilation/publication/execution reads; worker checks storage guards. |
| Runtime | Worker/build now require Node 24, matching package metadata and exact `.node-version` 24.21.0. Temporary official binary checksum verified. Shared telemetry has one Node-compatible state owner and its existing Next-only wrapper. |

Persistence uses only two additive columns on existing Attempt/Revision records. Archive CAS/replay, ownership and currentness use the existing user-first serializable coordinator and lease/fence. SQL prevents retained-entry rewrites, unfenced/terminal append and revision-metadata mutation. Existing protected execution, time/reward ledgers, cancellation, recovery and atomic ApplyService remain their original owners. The migration has **not** been deployed.

## Source and tests

| Area | Files |
| --- | --- |
| Intelligence contracts/validation | `lib/planner/v2/intelligence/foundation/{contracts,validation,workflow,resources,calendar}.ts` |
| Durable retention and compatibility | `lib/planner/v2/server/foundation.ts`; small barriers/readiness changes in existing `compiler.ts`, `revisions.ts`, `worker.ts` |
| SQL/Prisma | `prisma/migrations/20261025000000_planner_ai_first_foundation/migration.sql`, two Prisma fields, schema cache version 39 |
| Runtime | `lib/planner/v2/main.ts`, `scripts/build/build-planner-worker.mjs`, `lib/ai/telemetry-runtime.ts`, existing telemetry wrapper and provider/logger imports |
| New checks | `__tests__/planner-v2/intelligence/ai-first-foundation.test.ts`, `foundation-fixtures.ts`, `__tests__/planner-v2/postgres/ai-first-foundation.postgres.ts` |
| Reproduction | `scripts/test/test-planner-ai-first-foundation.mjs`; current architecture contract, report and Phase B plan |

Only thirteen pre-existing files changed from the task-start snapshot. Unrelated Notes/Calendar/Prisma/package changes were preserved. Provider/logger changes are import-only against verified baseline hashes; the telemetry implementation moved unchanged to one shared runtime module. The shared Prisma schema retains all pre-existing edits. [Preservation evidence](evidence/preservation.json) records this separately from historical Git diff totals.

## Verification and exact limitations

- **382 unit/contract tests in 32 files pass**, no failures/skips, including the existing 500 independent allocator-oracle fixtures inside their property test. The new foundation file contributes 16 tests. Scripted replies establish mechanics, not educational model quality.
- **Nine new genuine PostgreSQL foundation tests pass**: exact strategy/version/capacity retention, replay/CAS, foreign-owner and intent-forgery rejection, SQL immutability/fencing, cancelled/stale writers, real lease takeover without accounting reset, unknown-version rejection, durable pending-call/saved-response recovery, legacy-path exclusion, read-only research, readiness and account erasure.
- The final complete Phase A run records **186/218 V2 PostgreSQL passes and 32 failures**, plus **225/225 legacy Planner PostgreSQL passes**: **411 passes, 32 failures, zero required skips**. The same 32 V2 failure names occur in the baseline control without Phase A guards/integration. They include expired 23 October fixture deadlines, consequent fixture admission failures, and existing telemetry/context/deadline expectations. No assertion, production date rule or frozen fixture was weakened to hide them.
- The focused current-SQL run records **38/39 passes**, including all nine new cases, the actual HTTP generation → sealed candidate → canonical apply/replay path, and Focus Party concurrency. Its one failure is the existing offline V2 timer fixture's expired deadline. The earlier two unmatched failures do not reproduce under isolated current-SQL qualification. This is separate from a full green retained V2 gate.
- Full TypeScript and new/integration-source ESLint pass. Four existing provider/logger files still report **17 pre-existing lint errors and two warnings**; verified changes there only redirect imports. Those diagnostics are retained, not suppressed.
- Prisma generation, Node 24 ordinary worker compilation and eleven credential-free compiled imports pass. Node 26 is correctly refused by the supported-runtime guard.
- The **web production build passes** with a temporary 6 GiB heap (`next build --webpack`), and mobile production build plus bundle audit pass. The first web attempt compiled but its TypeScript worker exhausted the default heap. No build/type suppression or persistent heap/config change was added.

Machine results, logs, source pins and the control are indexed in [verification.json](evidence/verification.json). Historical totals in earlier reports are not reused as current acceptance. Full retained qualification remains open until the existing V2 fixture/test issues are repaired in a separately scoped change; this report does not certify release readiness or live educational quality.

The disposable runner copies relevant source, strips hosted/provider credentials, uses real loopback PostgreSQL and actual SQL, and preserves historical evidence writers inside the copy. Its adapter to the old harness restores SQL-owned generated Calendar definitions and applies the later actual timer/telemetry migrations that the old harness omitted. The control supplies only nullable client-mapping columns, restores the three clean pre-Phase-A integration owners, and retains common runtime fixes so the old code can execute. It does not claim a pristine full historical migration replay. Earlier bootstrap/runtime/control-mapping failures remain beside the final results.

## Reproduce

Use Node 24.x (24.21.0 pinned), installed lockfile dependencies and generated Prisma client:

```sh
npx prisma generate
npx tsc --noEmit
npm run planner:worker:build
npm run test -- --run __tests__/planner-v2/contracts __tests__/planner-v2/intelligence __tests__/planner-v2/durable-digests.test.ts
node scripts/test/test-planner-ai-first-foundation.mjs --native-bin /absolute/postgresql/bin
node scripts/test/test-planner-ai-first-foundation.mjs --baseline-control --native-bin /absolute/postgresql/bin
node scripts/test/test-planner-ai-first-foundation.mjs --focused --native-bin /absolute/postgresql/bin
NODE_OPTIONS=--max-old-space-size=6144 npx next build --webpack
npm run mobile:build
npm run mobile:verify
```

Docker is also supported when available. Local listener permission is required; the first automatic review timed out, the allowed retry succeeded. No action remains blocked by that review. The native PostgreSQL and Node packages were downloaded into temporary storage, with no machine-wide installation or application dependency/lockfile changes.

## Phase B boundary

The foundations are reviewable and retained, but **cannot execute the new four-role workflow**. Phase B must connect versioned resource accounting/role transport, linked admission and research, canonical calendar readers/allocator witnesses, natural strategy/translation, complete independent review/refinement, and exact bundle publication/read/apply validation in dependency order. Existing activation barriers must be replaced only as those guarantees become executable and tested. See the [implementation plan](PHASE_B_PLAN.md).

Phase C still needs a fresh independently assessed quality protocol and spending authorization. The numerical exceptional-quality threshold, paid budget and production provider configuration are not silently finalized here.
