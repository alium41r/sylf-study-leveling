# Planner V2 Phase 0: duration, lineage and migration map

This is a migration contract and dependency map, not an applied migration. Source: [approved target](../../PLANNER_TARGET_ARCHITECTURE.md), [audit](../2026-10-02-end-to-end-audit/AUDIT.md), [execution writers](EXECUTION_WRITERS.md), and [V2 contracts](CONTRACTS.md). No hosted data was changed or backfilled in Phase 0.

## Current authorities and required changes

| Current field/artifact | Existing meaning/consumer | V2 mapping and preservation |
| --- | --- | --- |
| Quest `requiredMinutes` | Focus countdown consumes this field; timer/reward RPCs also use it. | Use it as the legacy execution timebox baseline when valid. Map to `plannedMinutes`; do not select `max(target, required)` or average aliases. Preserve both original values in the imported baseline/migration evidence. |
| Quest `targetMinutes` | Calendar/Planner capacity consumers and some creation paths use it; default 45 can contradict execution. | Remove as an authority. During transport transition both aliases reflect the one approved timebox. Drop only after all writers/readers and supported clients move. |
| Quest `elapsedSeconds` | Cumulative accepted execution; some direct lifecycle paths can change it without matching session evidence. | Preserve; reconcile against accepted sessions and flag unexplained mismatches. It is actual history, not a future reservation or readiness score. |
| StudySession `durationSeconds`, `durationMinutes`, `breakSeconds` | Exact focus seconds, derived minutes and separate break accounting. | Seconds are primary. Never add minutes and seconds, or subtract breaks from seconds again. Preserve historical ledger/rewards; normalize only with documented evidence when old seconds are unavailable. |
| Session `endedAt` / client pause snapshots | Ended time exists; pause/running authority is currently client-local. | Add server execution state/version in Phase 1. A null `endedAt` does not prove RUNNING or PAUSED. Drain/acknowledge open sessions before linked-work cutover rather than guess. |
| Quest `status`, `completedAt` | RPCs can complete at elapsed timebox even without explicit completion. | New linked V2 work distinguishes ending time, work completion and readiness. Existing completed history remains completed; no retroactive rewards/mastery rewrite. Withdrawn remaining work cannot also claim original completion. |
| Quest `scheduledFor` | User-local civil-date string, including possible empty/invalid legacy values. | Preserve valid civil dates/timezone context. Flag missing/invalid dates for reviewed scheduling. Session dates never move with the Quest. |
| PlannerRevision snapshots/receipt | Input/output/availability plus operation/lease/quota fields; sealed SQL guard. | Keep immutable historical records. New operation state moves to Attempt. New baseline reflects actual Quests, not divergent saved instructions. Never falsify a passed V2 quality report for legacy work. |
| QuestLink activity key/baseline/disposition | Unique Quest and Plan/item identity; release/deletion tombstones. | Preserve identities and tombstones. Add explicit continuation lineage/remaining disposition; do not resurrect removed work or overwrite old baseline history. |
| Plan active/latest draft pointers | Active strategy can differ from separately confirmed Roadmap expansions. | Build one imported active baseline containing actual committed work plus strategic state. Preserve old revisions/expansions as history and pin their provenance; do not lose expansion Quests. |
| Goal/Subject ownership | Goal is optional in current materialization; some tasks render Unknown Goal. | Reuse owned references; create a truthful Goal in the baseline/adoption transaction when missing. No guessed subject/foreign reassignment. |
| Intake sessions, operation keys | Separate brief and revision operation identities. | Import accepted input as intent ancestry, retire intake persistence after cutover. Old candidate output requires V2 regeneration/review. In-flight old operations are quiesced/settled, never converted to running V2 jobs. |
| Quota/AI telemetry | Revision-held quota receipts, success logs and unknown prices represented as zero. | Retain accounting history; extend existing records/Attempt for root reservations, unknown spend/pricing and idempotent settlement. Do not infer historical financial cost from zero. |

Focus evidence: `app/focus/components/FocusScreen.tsx:612`. Current capacity mismatch: `lib/planner/server/core.ts:87`. Effective RPC definitions and every caller are indexed in the execution inventory; source hashes pin the observed working tree.

## Remaining-work contract

For new unstarted work, `remainingMinutesEstimate = plannedMinutes`. For started incomplete work, store an explicit remaining estimate with the elapsed-seconds baseline used for that estimate; subsequent accepted progress can reduce its forecast, but cannot prove completion. An overrun remains positive or requests a decision. Completed/withdrawn work reserves zero future time. A running session blocks structural changes; acknowledged server pause permits only reviewed remaining placement/estimate changes.

Capacity for a date counts accepted actual seconds on that session date and eligible remaining commitments assigned to that date. It never counts the full timebox again after subtracting actual work. Kept work counts once; replaced selected work is removed before proposals are added. A moved Quest does not move actual effort. Incomplete work in the past is an overdue commitment requiring explicit reassignment/triage, not silently erased or charged to every future day.

The two duration fields must remain conceptually different: `plannedMinutes` is the approved total timebox; remaining estimate is a forecast about unfinished work. Neither is a mastery threshold. A future actual-time refresh updates the live execution overlay, not a sealed revision.

## Classification before adoption

| Legacy record | Required treatment |
| --- | --- |
| Valid, matching timeboxes; unstarted | Import exact Quest specification, stable identity and approved timebox; no schedule regeneration. |
| Valid but conflicting aliases | Preserve `requiredMinutes` execution baseline and both originals; record a duration conflict. New capacity uses the baseline consistently. Never silently inflate to the larger alias. |
| Started/completed work | Preserve content, accepted time, IDs, session dates and earned rewards. Started remaining work cannot be reassigned until server state is acknowledged. |
| Missing/invalid timebox/date or timebox outside V2 bounds | Record a migration exception. Keep as protected external legacy commitment until a reviewed adoption resolves future work. Do not clip, split or invent a duration; no caller-controlled legacy bypass of V2 validation. |
| Revision and live Quest differ | Import live execution as baseline; retain the old revision and a correspondence discrepancy. Do not overwrite useful live instructions with the old saved snapshot. |
| Released/deleted/detached work | Preserve terminal decisions and ownership. Do not issue new IDs merely to make removed work look new. Re-adoption is explicit and reviewed. |
| Classic work without modern lineage | Preserve ordinary Quest/Goal IDs. Issue activity/link identity once, in an idempotent baseline transaction, when adopting valid work. No Classic generation remains available after cutover. |
| Completed Quest with no StudySession | Preserve work completion; do not fabricate actual study time or mastery evidence. |
| Null-ended session at cutover | Reconcile through explicit stop/final settlement/client acknowledgment. Pause cannot be inferred from browser storage or `endedAt`. |

Historical records that cannot satisfy new execution bounds remain inspectable and count as real commitments; they are not relabeled as valid V2 proposals. Migration exceptions block adoption of affected future work, not preservation of actual history.

## SQL/RPC dependencies

The ordered migration files define the effective runtime, not just Prisma. The Phase 0 PostgreSQL harness installs the audited schema plus actual dependency SQL; its manifest is test bootstrap evidence, not a replacement production migration history.

1. Existing progression helpers, reward ledgers and ownership infrastructure remain dependencies of session/Quest settlement.
2. `20260827000000_s2_security_hardening` supplies effective `start_study_session`, the still-defined legacy `complete_study_session`, function grants and drops obsolete `claim_session_reward_atomic`.
3. `20260827050000_sp_stipend_level_rank_ups` supplies final `settle_study_session_atomic` and `claim_quest_reward`. These currently lock Session/Quest/User-related rows without the Planner user-lock namespace; lock ordering must be migrated coherently.
4. `20260924010000_planner_foundation` supplies revision/Quest/Goal/ownership guards and deferred membership constraints. Its Quest guard protects structural mutations, not every status/reward/session mutation.
5. Check, preference/friction, intake, archived Subject, user release and reoffer migrations extend that foundation. Latest ownership guard is the reoffer definition; preserve release immutability.
6. RLS/revoked grants and account-deletion cascades remain enforceable. Subject/Goal deletion and reset paths must be included; account erasure is the explicit exception to history preservation.

The baseline migration chain has an existing bootstrap gap documented by the old PostgreSQL harness. Do not claim a Prisma schema diff plus staged security SQL proves that a fresh production `migrate deploy` chain is clean. Before Phase 1 production migration, rehearse against a disposable copy with the actual migration ledger and schema; reconcile known drift explicitly, without editing historical migrations or touching hosted data during Phase 0.

## Safe sequence and verification

The inspected source build metadata is `package.json` version 0.1.0 and Android `android/app/build.gradle` versionName 1.0/versionCode 1. The Vite mobile client imports shared web execution screens; there is no separate mobile package/version authority. These values identify the current checkout, not installed student releases. Before aliases/endpoints are retired, the release owner must enumerate distributed builds, their API/protocol support, upgrade admission and retirement dates. Legacy linked writes must fail explicitly when they cannot supply the new execution/version contract.

**Expand:** add Intent/Attempt and execution-state/remaining fields without dropping aliases. Add owned membership, immutable/write-once and fencing constraints. Add new protocol version guards. Regenerate Prisma and increment schema build version when Phase 1 actually changes fields.

**Backfill/reconcile:** hash and count affected records; classify conflicts; create owned baselines from live execution; preserve source snapshots and ledger totals. Quiesce old Planner jobs and settle receipts. Drain linked open timer sessions before applying authoritative state. Generate a migration exception report rather than “fixing” ambiguous data.

**Cut over:** one generation/apply path; shared user-lock order for Planner, generic Quest/calendar/Goal writers and effective SQL RPCs. New web/mobile clients consume the same canonical projection. Legacy linked mutation requests without execution/version correspondence receive an explicit upgrade/conflict response, not a bypass. Aliases are read-only transport projections during the bounded transition.

**Contract:** retire Classic generation, old intake/Designer/Copilot/replan/promotion endpoints and aliases only after supported client rollout. Preserve historical reads and standalone Quest execution. Rollback disables new planning writes while retaining owned reads, timers and recovery; it does not restart an unsafe old planning engine.

Verification checks: identity/count correspondence, no new Quest/reward/session duplication, equal session/ledger totals, owned Goal coverage, actual-date preservation, semantic equality for every kept/live activity, tombstone integrity, null-ended-session reconciliation, no unresolved exception silently adopted, and all-or-nothing baseline/apply rollback. These are Phase 1/5 migration gates; Phase 0 freezes their mapping and provides the real-database harness, without pretending the migrations have run.
