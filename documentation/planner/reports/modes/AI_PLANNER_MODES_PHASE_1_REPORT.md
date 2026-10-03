# Sylf AI Planner Modes — Phase 1 implementation report

Date: 24 September 2026. Scope: shared foundation only. Source decisions: the Planner Modes PRD and [AI_PLANNER_MODES_PHASE_0_ARCHITECTURE_REPORT.md](AI_PLANNER_MODES_PHASE_0_ARCHITECTURE_REPORT.md).

**Phase 1 is implemented and remains disabled by default.** An internally supplied, deterministic, validated draft can be explicitly confirmed into ordinary Quests. Confirmation is transactional and retryable. No mode generation, wizard, expansion, rebalance, autonomous scheduling, or public rollout was added.

## 0. Working-tree reconciliation

Before editing, all 34 relevant Phase 0 reference hashes were compared with the working tree; they matched. A separate snapshot of 1,338 tracked/nonignored files was recorded for distinguishing this work from concurrent edits. The initial `tsc --noEmit` passed. Installed Next.js 16.2.9 Route Handler documentation was read before route implementation.

Other work continued during implementation, including Calendar, Goals, System, Locker, Social, motion, and button styling. Those changes were preserved. The concurrent `AiPlannerPanel` and `PlannerTab` changes inspected here were styling changes; they were not used to introduce Planner Modes. No commit, reset, checkout, or unrelated revert was performed.

The legacy API and orchestrator, and the shared Focus screen, remained byte-identical to the starting snapshot. This phase does modify narrowly scoped mutation guards in existing APIs/chat/scheduling, adds planner-sensitive cache handling, and adds a mobile server-boundary rule.

## 1. Schema and additive migration

Added exactly three models: `PlannerPlan`, `PlannerRevision`, and `PlannerQuestLink`. Existing User, Subject, Goal, and Quest models gain inverse relations only. Quest has no planner-specific scalar columns. No Topic/Milestone table, task system, timer, or reward ledger was added.

Migration: `prisma/migrations/20260924010000_planner_foundation/migration.sql`.

The table/index/FK SQL was generated using Prisma `migrate diff` against the pre-change schema. The same additive file includes reviewed membership constraints, bounds, immutable-content/receipt guards, linked-Quest/Goal mutation guards, and private-table permissions. `prisma validate` and `prisma generate` succeeded; `lib/prisma.ts` schema build version is 19.

Unique constraints cover user + shell creation key, plan + revision sequence, plan + operation key, plan + confirmation key, plan + item key, and each non-null linked Quest. Composite FKs keep active/latest/base/created/applied revision references within their plan. Indexes support owner/state listing, Goal/Subject lookups, and operation expiry.

**Migration verification limitation:** applying the entire historical migration chain to an empty disposable PostgreSQL database failed at the existing `20260821010000_add_economy_and_inventory_rpcs` migration: `ItemCategory` does not yet exist there. No old migration was modified or marked applied, and no production database was used.

The new migration was then verified repeatedly on fresh disposable PostgreSQL 17 databases built from the audited pre-planner schema through Prisma `migrate diff` and `migrate deploy`. The fixture also applies the existing canonical XP helper, S2 security/policy, and current Focus settlement migrations. All migrations in that fixture apply cleanly. This verifies this additive migration against the expected existing schema, not the completeness of the repository's historical empty-database bootstrap.

Reproduce with `node scripts/test-planner-postgres.mjs`. It creates a localhost-only, randomly named Docker container with a generated password, stages test-only Prisma migrations outside the repository, runs the tests, and removes its container, volume, and temporary configuration. It never reads a hosted database URL. Production deployment still uses the repository's real migration directory and normal `prisma migrate deploy` workflow.

## 2. Plan, revision, and link invariants

| Entity | Enforced responsibility |
| --- | --- |
| PlannerPlan | Server-issued UUID, owner, strict mode/lifecycle, optional owned Subject/Goal, revision pointers, monotonic application version, creation key/body hash, timestamps. |
| PlannerRevision | Server-issued UUID, unique increasing sequence under the plan lock, source/base lineage, schema version, input/availability/output snapshots, SHA-256 digest, operation key/body hash/state/lease, quota receipt, write-once confirmation identity/receipt. |
| PlannerQuestLink | Stable server-issued item key, one Quest identity, created/applied revision membership, original materialized baseline, LIVE/DETACHED/DELETED state, change/removal timestamps and reason. |

Sealed revision content cannot be edited in place, including through direct Prisma updates. Confirmation receipts cannot be replaced or cleared. A non-null linked Quest cannot be reassigned to another Quest. Deleted links retain their baseline and revision lineage, have a null Quest FK, and cannot be revived. JSON data has application byte limits and additional database size/type checks.

Sequence allocation and optimistic version checks are serialized by the server. These are not inferred from titles, dates, `createdByAi`, chat messages, or Goal names.

## 3. Shared contracts

`lib/planner/contracts.ts` defines strict Zod discriminated unions for `UserInputV1`, `ModelProposalV1`, and `ValidatedDraftV1`, each covering EXAM, ROADMAP, and MASTERY. Mode details are intentionally small foundation contracts: exam date, roadmap outcome, or mastery focus. Educational generation policies remain future work.

Unknown fields are rejected, including model-supplied database identities, rewards, and unknown item types. Model references are temporary local symbols. `normalizeProposal` replaces every topic/milestone/item reference with application-issued UUIDs and checks all relationships. EDIT revisions preserve those UUIDs.

Bounds include a 32 KiB input envelope, 20,000 scope characters, 256 KiB proposal/draft/request envelope, 50 topics, depth 4, 52 milestones, 60 actionable items, 15–240 minutes per item, bounded notes and descriptions, and a horizon spanning at most 365 calendar-day increments. There is no automatic external syllabus research.

Pure contracts, date arithmetic, capacity policy, and client modules have no Prisma, Next server, provider, or Node crypto imports. Persistence modules reside under `lib/planner/server/` and import `server-only`.

## 4. Date and capacity validation

`dates.ts` validates genuine `YYYY-MM-DD` keys, including leap years and impossible dates. Calendar arithmetic uses UTC noon solely to count calendar days; it never localizes a planner date-only value. User-local today uses the existing timezone service after explicitly validating the timezone.

Reference validation rejects duplicates, unknown topics/milestones/dependencies, cycles, excess nesting, dependency dates later than dependent items, mismatched modes/details, and dates outside the approved horizon.

`capacity.ts` computes each date's budget, visible recovery reserve, existing scheduled workload, proposed workload, and remaining minutes. It respects fixed rests, floating rests, and explicit blocked dates. Existing ACTIVE/PENDING/IN_PROGRESS and completed daily work consume capacity; FAILED work does not. Invalid or unavailable required data fails closed. Infeasibility is explicit; nothing is rolled forward or placed on an overloaded day.

Availability snapshots record the user timezone/rest settings, floating dates, scheduled Quest workload/fingerprints, and a fingerprint of plan lineage, execution/session state, Subject/Goal references, and the daily target setting. The explicit input availability defines capacity; the existing daily target is not silently treated as available time.

Optional Goal deadlines use the existing representational UTC storage convention. When the feature is enabled, Calendar identifies planner-associated Goals and displays the original date key rather than localizing that representational midnight. Existing non-planner calendar behavior remains unchanged.

## 5. Revision lifecycle

Server services support idempotent shell creation, internal deterministic draft validation/sealing, owned reads, bounded summary/history lists, explicit batched EDIT saves, and archive.

Saving a draft appends a new revision and increments the plan version. An EDIT must name the current latest draft or active revision and the expected plan version. Its content is revalidated, and its parent and stable item keys are preserved. No save-per-keystroke behavior was introduced.

Archive changes lifecycle/version and preserves Goals, Quests, links, and revision history. A successful confirmation remains recoverable after archive.

## 6. Transactional materialization

`server/materialize.ts` performs no provider calls, HTTP calls, chat tools, or reward awards.

1. Validate the bounded confirmation body and derive its canonical body hash.
2. Begin a short serializable Prisma transaction; acquire a per-user planner advisory lock, then the owned plan row lock. A common user lock serializes competing plans without introducing User-before-Quest row locking that would invert Focus settlement order.
3. Return a matching durable receipt before evaluating stale-version checks. Otherwise verify owned revision, exact digest, latest draft pointer, expected version, and sealed content digest.
4. Resolve the exact selected item keys and required dependencies. Re-read current schedule, links, tombstones, Quest fields, sessions, and owned references. A changed snapshot returns 409.
5. Validate selected new workload against current capacity. Check dates again against current user-local today.
6. Create a Goal only when explicitly requested. Create ordinary Quests and their lineage links using returned IDs.
7. Write the active revision/version/lifecycle and immutable confirmation receipt in the same transaction.
8. Return success only after commit. PostgreSQL serialization/deadlock failures receive at most two retries; persistent contention becomes a bounded 409.

Every new Quest has `status = PENDING`, `requiredMinutes === targetMinutes`, an owned optional Subject, no SubjectNode, and difficulty/XP/Sylph fields from the existing canonical functions. No progress, currency, XP ledger, streak, or session is awarded/created by confirmation.

Phase 1 does not replace or delete existing execution. A later EDIT can retain a still-matching live item identity. Changing a materialized item, selecting a detached/deleted item, or using stale execution data returns a reconciliation conflict. New generation on an already active plan is blocked until reviewed replanning exists. This deliberately leaves execution replacement to its later phase.

## 7. Idempotency and recovery

The confirmation key is unique within a plan. The hash binds the exact validated body, including revision, digest, selection order, expected version, and Goal choice.

Same key/body returns the original committed receipt and Quest IDs, including concurrent double-clicks and retry after archive. Same key/different body returns 409. A committed revision cannot be confirmed under another key. A later selection requires a new revision. Unique lineage prevents duplicate execution identity.

The receipt, pointer, Goal, Quests, and links either commit together or all roll back. A lost response is recovered through the owned operation lookup with `kind=confirmation`; the client does not need to insert again or infer IDs from titles/dates.

## 8. Quota and operation foundation

The existing `UserQuota` counter engine is extended, not replaced. Its legacy exports retain their previous behavior.

New `reserveRevisionQuota` and `settleRevisionQuota` APIs lock and re-read the owned revision receipt, then atomically update the existing counter and durable receipt in the caller's transaction. A receipt records its original user/feature/bucket/reset/reservation identity and RESERVED/SETTLED/RELEASED state. Counter-only primitives are private; callers cannot refund twice by passing an old in-memory receipt.

The final allowed unit produces a valid reservation. Release always uses the recorded original bucket, including after a timezone/day/week boundary. Repeated same settlement/release is idempotent; opposing terminal transitions fail. Provider expenditure remains separate in the existing `AiUsageLog` system.

Internal operation services support PREPARING envelopes with a 120-second lease, sealed delivery with quota settlement in the same transaction, and owned recovery that fails expired preparation and releases its original reservation once. There is no provider integration, worker, queue, or autonomous expiry job. Phase 2 must call recovery after interrupted delivery and handle expired operation state.

Deterministic shell/draft/EDIT/confirmation/archive operations consume no AI quota. Internal `beginOperation` is the explicit future generation-charging entry point; it has no public generation route.

## 9. Linked-Quest mutation guards

| Writer | Behavior for linked work |
| --- | --- |
| Direct Quest PATCH | Safe explicit structural edits run in a locked transaction, keep minute/reward fields coherent, retain the original baseline, and mark the link DETACHED. Mixed execution + structural changes are rejected before any reward call. Status/timer completion remains in the canonical execution path. |
| Direct Quest DELETE | An unstarted, nonterminal item may be intentionally deleted. The database trigger atomically retains a DELETED tombstone. Started/session-associated/completed/failed work is protected. |
| Chat update/move/swap/clear/delete | Preflights return planner attention for affected linked work; SQL guards prevent races or bypasses. Unrelated non-planner items remain usable. |
| Goal adjust/automatic Goal edits | Guard before mutation. The database rejects automatic updates to planner-associated Goals. |
| Intentional Goal metadata PATCH | Allowed through a narrow transaction-local capability; subsequent confirmation observes the changed Goal fingerprint. |
| Goal delete/bulk delete/chat wipe | Linked plans/Quests return 409/attention. Enabled bulk Goal+Quest deletion is atomic and shares the planner lock, preventing partial deletion around a planner conflict. |
| Floating rest-day cascade | Linked candidates cause attention and rollback of the floating-rest creation/cascade transaction. No silent movement. |
| Progress reset | Linked execution returns attention before reset/OTP consumption. No silent lineage destruction. |
| Explicit whole-account deletion | Existing full-erasure behavior is preserved. Once the parent User is deleted, FK cascades may remove execution and all planner history; this is distinct from archive or individual task deletion and is tested with completed linked work. |
| Focus/reward/deadline execution | Existing status, elapsed-time, and reward behavior remains authoritative; planner confirmation never rewrites it. |

Database Quest guards cover all structural update/delete writers regardless of the feature flag. They inspect only Quests with sidecar links. Preflights are feature-gated for compatibility before the migration is deployed. No legacy Quest is adopted or inferred to belong to a plan.

## 10. Authenticated API surface

All routes use the existing real `getSession`, derive the user from its cookie session, preserve tokenVersion revocation, and return private/no-store responses. `PLANNER_MODES_ENABLED` must equal the exact server-side string `true`; otherwise authenticated access returns 404. No flag was enabled in environment files.

| Route | Operation |
| --- | --- |
| `GET /api/planner` | Up to 30 owned summaries, optional `before` cursor. |
| `GET /api/planner/[id]` | Owned plan, latest draft, bounded link detail. |
| `GET /api/planner/[id]/revisions` | Up to 30 history summaries; `revisionId` selects one owned snapshot. |
| `POST /api/planner/[id]/revisions` | Strict bounded edits to an existing owned revision. |
| `POST /api/planner/[id]/commit` | Exact explicit confirmation. |
| `POST /api/planner/[id]/archive` | Version-checked archive. |
| `GET /api/planner/[id]/operations/[key]` | Owned operation state or committed confirmation recovery. |
| `POST /api/planner/[id]/operations/[key]` | Explicit `RECOVER_EXPIRED` action only. |

There is no public shell/proposal/generation ingestion endpoint. Raw fake proposals submitted to the edit route are rejected. JSON reads enforce byte limits while streaming, including requests without Content-Length. Errors use safe 400/401/404/409/422 semantics, with 429 for future generation reservation exhaustion and 503 for unavailable dependencies. Provider/database internals are not returned.

## 11. Client and cache foundation

`lib/planner/client.ts` adds only shared review-state types and commit/recovery helpers. There is no rendered Planner Modes UI, wizard, route entry, localStorage syllabus storage, polling loop, or mobile auth change.

Successful commit/recovery invalidates quests, goals, calendar, dashboard, schedule, planner, and user-stats cache fragments in one pass. No fetch is triggered by invalidation. Unaffected AI quota caches remain valid. Failed commits do not report success or invalidate as though materialization occurred.

The shared cache now suppresses stale responses that were already in flight at invalidation, uses the same key for single-flight insertion/removal, and blocks planner content from storage reads/writes. This avoids an old request repopulating a freshly invalidated cache. Relevant API data surfaces are dynamic; confirmation does not change server-cached rank/profile reward data.

## 12. Security and privacy verification

- All three new tables have RLS enabled and no client policies. PUBLIC, anon, authenticated, and service_role receive no direct table privileges. Access is through the existing authenticated app-server connection and owner-scoped services.
- New trigger functions use a fixed public search path, are not SECURITY DEFINER RPCs, and have execution revoked from those external roles.
- New tables are not added to Realtime publications.
- Tests verify real JWT cookie authentication, current database tokenVersion revocation, Bearer-only rejection, foreign plan/revision/commit denial, Subject ownership, DB link ownership, revision membership, grants, RLS flags, and function permissions.
- Pure client dependency traversal and an actual mobile build/bundle audit verify no Prisma/provider/server-only or secret references reach client bundles.
- New planner server code does not log academic text, titles, descriptions, request payloads, tokens, or raw provider/database errors. Existing unrelated telemetry was not rewritten.
- `npm run audit:secrets` passed. Because that scanner covers tracked files only, the same credential-pattern checks were also applied to the 24 new Phase 1 source/test/migration files; they passed.

## 13. Verification results

| Verification | Result |
| --- | --- |
| Initial and final `npx tsc --noEmit` | Passed. |
| `npx prisma validate` / `npx prisma generate` | Passed; client matches the new schema. |
| Fresh disposable PostgreSQL migration + planner harness | 3 files, **59 tests passed**, including 33 real-database tests. |
| Rollback failure injection | All seven write positions passed: optional Goal, each Quest/link pair, active pointer, receipt. No partial rows or pointer/receipt survived. |
| Concurrency/idempotency | Concurrent same-body replay, different-body rejection, lost-response recovery, and competing two-plan capacity tests passed. |
| Execution and lineage | Manual edits/deletion, active sessions, real Focus start/settlement RPC completion, rest/floating/timezone changes, immutable content/receipts, stable keys, tombstones, and explicit whole-account erasure passed. |
| Quota | Last unit, crash expiry/recovery, original week/day bucket, concurrent duplicate release, repeated settlement, and refusal to refund delivered output passed. |
| Final focused regression run | **25 files / 222 tests passed**, covering existing planner/chat, Goals, calendar/rest days, Quest completion, timer/session math, Subject progress reconciliation, mobile, and danger-zone behavior. |
| Security/auth/mobile run | Earlier targeted run: 21 files / 219 tests passed, including actual auth-engine and security tests. |
| Broader Focus/AI regression run | 56 files / 741 tests passed; the same 4 hosted-DB tests below failed on unavailable DNS. |
| Full repository suite | 117 files / **1,230 tests passed**; 1 optional planner DB file / 28 tests skipped in that run, then tested separately and expanded above. 1 unrelated live-DB file / **4 tests failed**. |
| `npm run audit:secrets` + new-file scan | Passed. |
| `npm run build` | Passed with Next.js 16.2.9; final source compiled, TypeScript passed, and 87 static pages generated. |
| Mobile Vite production build + `scripts/verify-mobile-bundle.mjs` | Passed; mocks disabled and no forbidden server/secret symbols. |

The four full-suite failures are in `__tests__/focus-backgrounds-cascade-triggers.test.ts`. They fail while opening their existing hosted Supabase connection (`ENOTFOUND`), before their test SQL runs. They are environment-dependent and were not changed to make the report green. New planner database tests use only disposable localhost PostgreSQL.

The first sandboxed Turbopack build stalled at compilation. The identified idle process was stopped; the approved build outside the sandbox completed, and a later final build also passed. No build configuration workaround was committed.

## 14. Narrow adaptations from Phase 0

1. Private planner tables use deny-by-default RLS with no client grants/policies. The app-server cookie/owner boundary is the sole access path; no Realtime distribution is needed.
2. Serializable transactions plus a dedicated per-user advisory lock coordinate competing planner capacity. Existing execution is read and preserved, so confirmation introduces no Quest-to-User lock inversion or execution replacement path.
3. Database triggers supplement writer preflights. This closes bypass/race windows while intentional manual edits use narrow transaction-local capabilities.
4. Reconciliation/replacement of materialized execution is explicitly deferred. EDIT history works now; an unsafe materialized-item change produces 409. This follows the stop gate on rebalance/autonomous rescheduling.
5. The existing migration-history bootstrap gap required a representative disposable-schema fixture. The production migration architecture and old migration files remain unchanged.
6. A narrowly gated Calendar mapping fixes date-only interpretation for newly linked planner Goals. The old non-planner mapping is preserved.
7. Generic cache invalidation needed in-flight suppression to prevent a pre-commit fetch from restoring stale results; this is covered by client tests.

## 15. Remaining work and blockers before Exam Planner

- Review this Phase 1 change and stop-gate evidence before authorizing Phase 2.
- Before any deployment/enablement, verify the target environment's actual migration ledger/schema and apply the additive migration through normal Prisma deployment. The pre-existing empty-database history gap needs a separately reviewed resolution if a new environment must be bootstrapped from the entire historical chain.
- Phase 2 must integrate bounded Exam generation, its own input/review UI, canonical operation/quota lifecycle, provider timeout/cancellation recovery, and educational/feasibility acceptance tests. No generation strategy exists in this phase.
- Preserve stable identities and surface DETACHED/DELETED/conflict states in that review UI. Do not add a shortcut that regenerates or replaces existing linked execution; reconciliation remains a later reviewed phase.
- Manual non-planner writers may intentionally overbook after confirmation. The guarantee is authoritative validation at planner commit and serialization of competing planner allocations, not a new global scheduler imposed on all legacy actions.
- Hosted Focus-background trigger tests still require their approved reachable test environment. Local planner security/Focus integration tests do not claim to validate every hosted Supabase configuration.

## Explicit stop-gate answers

| Question | Answer |
| --- | --- |
| Can a deterministic validated draft now be confirmed into ordinary Quests? | **Yes.** Proven against real PostgreSQL, including canonical mapping and optional Goal creation. |
| Can confirmation ever partially create a plan? | **No partial materialization.** A shell/draft already exists; all confirmation-created Goal/Quest/link/pointer/receipt writes are one transaction. All seven injected failure positions rolled back. |
| Can retry/double-click duplicate Quests? | **No for the same confirmation.** Durable exact-body receipts, revision uniqueness, link uniqueness, and concurrent tests cover retries/double-clicks. |
| Can a stale preview overwrite completed/edited work? | **No.** Snapshot changes cause conflict, and Phase 1 never replaces existing execution. Real Focus completion was exercised. |
| Are deleted planner-linked Quests preserved as tombstones? | **Yes.** Safe intentional deletion leaves a DELETED link with its original baseline and revision lineage; it cannot be recreated by confirmation. |
| Are existing non-planner Quests unaffected? | **Yes.** They are not adopted or guarded as planner work. Enabled bulk Goal operations become atomic, while their successful non-planner behavior remains the same. Regression tests pass. |
| Is the legacy public planner still unchanged? | **Yes in this implementation.** Its API and orchestrator are byte-identical to the starting tree. Concurrent cosmetic UI edits were preserved. |
| Is Planner Modes still safely feature-gated? | **Yes.** The server flag is unset by this work, routes default to 404, and no incomplete Planner Modes UI is exposed. |
| Is Phase 2 safe to begin? | **Yes for gated development after review.** Production enablement remains conditional on migration readiness and Phase 2's own acceptance review. |

**Stopped after Phase 1. No Phase 2 implementation or public rollout has begun.**
