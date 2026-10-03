# Sylf AI Planner Modes — Phase 5 report: user-approved adaptive replanning & execution reconciliation

Date: 26 September 2026. Scope: **Phase 5 only** — detection and user-requested replanning for Exam Planner, the strategic Course / Syllabus Roadmap, an already-expanded Roadmap period, and Chapter / Unit Mastery; plus the narrow persistence of a user-reported Mastery Check reflection that Phase 4 deliberately deferred.

The user remains in control of every schedule mutation. Sylf may detect that a plan is stale, explain why, offer to revise it, generate a proposed revision and show exactly what would change — but nothing about a student's Quests changes without their explicit confirmation.

Not implemented: Addendum A2's shared spaced-retrieval scheduler, generalized cognitive-load shaping, Core + Stretch, Coverage Map, Addendum A3 preference learning or friction feedback, autonomous replanning, automatic schedule mutation, production or public enablement, and any broad AI architecture refactor. `PLANNER_MODES_ENABLED` remains unset in committed configuration; Phase 5 was verified with the flag enabled only inside local tests.

---

## 1. Repository reconciliation

The current repository is authoritative over the phase reports. Read before editing: the PRD and Addendum extracts, the Phase 0–4 reports, and the implementation itself — `PlannerPlan` / `PlannerRevision` / `PlannerQuestLink`, the operation and quota lifecycle, the Quest mutation guards and their database triggers, lineage and tombstone semantics, the Exam validators, the Roadmap strategic-versus-expansion split, the Mastery progression, A1, the shared pipeline, and Focus/Quest settlement.

Legacy Planner isolation was re-verified by hash before and after this phase:

| File | SHA-256 | Conclusion |
| --- | --- | --- |
| `app/api/ai-planner/route.ts` | `b7f49aca8c43e90bf2d8d31419080e620714e7ea85b10117bb4abb7d4d66c07f` | Byte-identical |
| `lib/ai/orchestrator.ts` | `2b91d55ebcf18d458fdd4fd01d946c25a444ee16b9586f34be17ef3d6e12dee9` | Byte-identical |
| `lib/ai/planning-engine.ts` | `cbd73cc7180a1b031e08e1ee1eae29e873b010029126b7d9b69d9c674fc72977` | Byte-identical |

Phase 5 added 10 modules, 4 test files and one migration, and extended 15 existing files. New: `lib/planner/rebalance-fields.ts`, `rebalance-policy.ts`, `rebalance-scope.ts`, `rebalance-mode-rules.ts`, `rebalance-client.ts`, `lib/ai/planner/rebalance.ts`, `lib/planner/server/rebalance.ts`, `rebalance-run.ts`, `lib/planner/server/check-result.ts`, `app/components/planner/RebalancePanel.tsx`, plus the two rebalance routes, the check-result route and `prisma/migrations/20260925152657_planner_check_result`. Extended: `contracts.ts`, `exam-policy.ts`, `roadmap-fields.ts`, `roadmap-policy.ts`, `mastery-policy.ts`, `expansion-policy.ts`, `telemetry.ts`, `lib/ai/config.ts`, `lib/ai/usage-limiter.ts`, `lib/ai/planner/pipeline.ts`, `server/{core,revisions}.ts`, `lib/prisma.ts`, `ExamPlanner`/`RoadmapPlanner`/`MasteryPlanner`, `scripts/test-planner-postgres.mjs`.

Everything that already existed was reused rather than re-implemented: one persistence model, one bounded pipeline and call budget, one quota mechanism, one semantic gate with its critic and targeted repair, one set of mode validators, one Definition of Done and one shared transport.

## 2. Replan product model

A replan is reconciliation, not regeneration. The lifecycle is fixed and each step is a separate, inspectable state:

`DETECT or USER REQUEST → SNAPSHOT CURRENT REALITY → GENERATE PROPOSAL → VALIDATE → SHOW DIFF → USER REVIEWS → USER CONFIRMS → ATOMIC RECONCILIATION`

* The snapshot is server-owned: link disposition, Quest status, dates, minutes, elapsed time, session existence and open sessions.
* The proposal is sealed as a `REBALANCE` revision containing the diff the user reviews, so review and confirmation read one immutable object.
* Confirmation is one SERIALIZABLE transaction that re-reads reality first; if anything moved, it returns a conflict and applies nothing.
* Four entry points exist, one per confirmed-plan shape: **Review plan** (Exam), **Rebalance roadmap** (strategic Roadmap), **Revise this period** (an already-expanded Roadmap period) and **Review remaining plan** (Mastery, including after a `NEEDS_MORE_WORK` self-report).

## 3. Reason codes

One closed vocabulary, stored as operation metadata in the sealed revision:

| Code | Meaning |
| --- | --- |
| `USER_REQUESTED` | The student asked to review the plan |
| `AVAILABILITY_CHANGED` | The student stated a new weekly grid for this replan |
| `DEADLINE_CHANGED` | The target date was explicitly changed |
| `MISSED_WORK` | Planned work was missed |
| `OVERDUE_WORK` | Planned work is past its date and unstarted |
| `EXECUTION_CHANGED` | Quests were edited or deleted since the plan was confirmed |
| `PRIORITY_CHANGED` | Priorities changed |
| `SCOPE_CHANGED` | The confirmed scope changed |
| `MASTERY_CHECK_NEEDS_WORK` | The student reported that the check needs more work |

Detection may only surface an affordance: `detectRebalanceReasons()` is a pure function over the execution snapshot, and nothing in it calls a provider, spends quota or touches a Quest. These codes are operation metadata — they are **not** A3 friction feedback and are never used to learn preferences.

## 4. Execution snapshot and classification

`readExecution()` builds the snapshot in **two bounded queries** (never one per Quest): the link projection carries the Quest fields, and one grouped session read answers "has this Quest any recorded time, or an open session?". Classes, in the precedence the module documents:

`DELETED` → `DETACHED` → `CONFLICTED` → `COMPLETED` → `FAILED` → `IN_PROGRESS` → `STARTED` → `PENDING_OVERDUE` → `PENDING_FUTURE`.

A deterministic fingerprint over immutable facts (item key, quest id, disposition, status, date, minutes, elapsed seconds, completion, session count, open-session flag) is stored with the operation, so staleness is a digest comparison rather than a judgement.

## 5. Replannable eligibility rules

One function decides what may change, and it is used by detection, generation, review and confirmation:

`isPlannerQuestReplannable(row, className)` is true only for a **LIVE link whose Quest is `PENDING`/`PENDING_OVERDUE`, not completed, with zero elapsed seconds, no recorded session and no open session**. A second rule composes with it: an item the student **locked** is never offered as replannable (`rebalanceEligible`), and the plan detail reports how many items are held back so the review can say why and offer the obvious remedy — unlock it. Locks are an explicit instruction, so a replan never overrides one, and overdue state is not treated as permission to rewrite them.

`CONFLICTED` — a link with no Quest, an unexpected disposition, or an unknown status — is never eligible and blocks a replan (`REPLAN_CONFLICTED_EXECUTION`) rather than being guessed at.

For a strategic Roadmap, which creates no Quests, eligibility is milestone-based instead: every milestone that has not been expanded may change, and the partition is derived from confirmed `EXPAND` lineage, never from the model.

## 6. Protected execution

Never silently rewritten, and structurally unreachable for a replan:

* completed Quests, and Quests with a completed study session;
* in-progress Quests and Quests with an open session;
* Quests with recorded time (started but not finished);
* historical failed work, deleted lineage tombstones and detached lineage;
* already-confirmed Roadmap expansion history.

Two independent layers enforce this: the server's frozen/eligible partition and the existing database guards (`planner_quest_guard`, `planner_link_ownership`). The reconciliation additionally re-checks every supersede target **inside** the confirmation transaction, so a Quest that started between proposal and confirmation is refused (`REPLAN_EXECUTION_CHANGED`) and a protected Quest is refused (`PLANNER_EXECUTION_PROTECTED`).

## 7. Replacement lineage

Existing semantics were sufficient, so no schema change was made for lineage. A superseded item is tombstoned through the link model's own lifecycle — `disposition = DELETED`, `questId = NULL`, `removedAt`, and a `removalReason` of `REBALANCE_SUPERSEDED` or `REBALANCE_REMOVED` — and its Quest is deleted **after** the tombstone, which is why the Quest guard sees an unlinked Quest and never needs a capability bypass.

Traceability is recorded on the replacement's immutable link baseline: `baseline.replaces = { itemKey, reason }` plus the replan's reason code. Chain: previous planner item → tombstoned link → replacement link naming what it replaced.

Retention is the counterpart: a retained item keeps its durable item key, so it keeps its Quest and nothing about it is written except the link's `appliedRevisionId`.

## 8. Stale proposal detection

A sealed replan is confirmable only while the reality it was built from still holds. Confirmation re-reads, in one transaction: the plan version, the revision digest, the base revision pointer, live availability, live execution, and the links. Any drift fails closed with a specific code, and **nothing is rebased automatically**:

`REPLAN_STALE_BASE` · `REPLAN_STALE_EXECUTION` · `REPLAN_STALE_AVAILABILITY` · `REPLAN_CONFLICTED_EXECUTION` · `REPLAN_EXECUTION_CHANGED` · `SCHEDULE_CHANGED` · `STALE_REVISION` · `CONTENT_CHANGED`.

Each has translation copy in the review UI, so the student is told what changed rather than shown a validation code.

## 9. Atomic confirmation

`confirmRebalance()` performs, in one SERIALIZABLE transaction with the existing per-user advisory lock: replay/idempotency check → ownership and source check → version, digest, pointer and base checks → draft re-validation (with frozen history) → fresh availability → digest comparison → live execution read → fingerprint comparison → protected-execution verification for every supersede and retention → capacity re-validation of the work actually being written → tombstone superseded work → delete the now-unlinked Quests → create replacements and additions once each → record lineage → update retained links → write the receipt → advance the plan pointer and version.

Failure anywhere rolls the whole thing back. Asserted against real PostgreSQL: a proposal that would move work the student has since started fails with zero partial mutations — no deletion, no move, no creation, no receipt.

## 10. Exam replanning

Exam rebalances the **remaining** work. The execution-aware view merges frozen executed items into the educational gate, so completed learning satisfies coverage, recall and practice prerequisites and is never demanded twice — while capacity is charged only for the items the replan will write (an untouched item already exists as a Quest and is already counted as existing work).

Two defects were found and fixed by doing this properly: retained items were initially charged again against capacity (double counting, `INFEASIBLE_CAPACITY`), and frozen items reached the gate without the `stage` and `rationale` it requires (`INVALID_EXAM_INTENT_STAGE`). Both were fixed in the execution-aware view, never by relaxing the rule.

The confirmed scope, exam date, reserve, coverage, recall, practice, mistake review, mocks and final readiness all remain enforced, and a proposal that repeats already-completed work is refused outright (`REBALANCE_DUPLICATES_HISTORY`).

## 11. Strategic Roadmap replanning

A strategic replan may modify **only unexpanded future milestones**. Expanded periods are anchors derived from confirmed `EXPAND` lineage: they are carried into the revised strategic draft verbatim with their keys — which is what keeps expansion lineage intact — and they contribute coverage but **zero** effort against remaining capacity.

The revised plan is validated by the Roadmap validator with the frozen milestones supplied as context, so every period is still planned, every unit is still covered and the priority window still holds. A strategic revision creates no Quests; confirming it becomes the active strategic revision.

## 12. Expanded-period replanning

The permanent Phase 3 invariant is preserved: **a confirmed period can never be expanded again** (`MILESTONE_ALREADY_EXPANDED` remains), and the original `EXPAND` revision stays on record forever.

Phase 5 adds a different, explicit action: **Revise this period**. It is a `REBALANCE` operation (never a second expansion), it pins the period's own window and capacity, it copies the strategic structure verbatim so no neighbouring period or topic placement can drift, it freezes completed or started work inside the period, and it proposes replacements only for what is left. It spends `plannerRebalance`, not `plannerExpansion`.

## 13. Mastery replanning

Mastery rebalances the remaining progression. Completed stages are frozen history that **satisfies the progression**: a plan whose `UNDERSTAND` and `LEARN` are done may be rebalanced over `ACTIVE_RECALL`, `PRACTICE`, `REVIEW_MISTAKES` and the check, and the structure validator evaluates the merged view (frozen stages + proposed remaining stages) so it still requires every unit to reach practice and still requires exactly one terminal `MASTERY_CHECK`.

Because practice is completion-only, the revised plan must still end with its check and cannot regenerate a completed one; and a re-proposal of completed work is refused by the same duplication guard as Exam.

## 14. Mastery Check result persistence decision

Phase 4 deferred this signal because no path was safe. Phase 5 resolves it with the narrowest additive mechanism that fits the existing architecture: a dedicated planner-owned table.

`PlannerCheckResult`: `id`, `planId`, `userId`, `revisionId`, `itemKey`, `result`, `createdAt`, `updatedAt`; `@@unique([planId, itemKey])` (one *current* value per check, deliberately editable rather than append-only); `@@index([userId, planId])`; cascading FKs to the plan and the user; a database CHECK constraint limiting `result` to the three values; `ENABLE ROW LEVEL SECURITY` and `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role` — the same private planner posture as the existing planner tables, with no client policy and no Realtime publication.

It is explicitly **not** stored in a Quest, a Quest description, a sealed `PlannerRevision` snapshot, a `PlannerQuestLink` baseline, a `SubjectNode`, a Focus session or telemetry. The service verifies ownership, that the revision is sealed and confirmed, and that the referenced item really is that plan's `MASTERY_CHECK` item; it writes nothing else and spends no quota. The value is user-reported, optional, changeable and resettable, and it is never an objective score.

## 15. Diff and review UX

Review is **diff first**, in the student's words:

```
UNCHANGED ▸ n items      RESCHEDULED ▸ n items     REPLACED ▸ n items
REMOVED   ▸ n items      NEW         ▸ n items
```

Each entry shows only what matters: title, unit, old → new date, old → new minutes where they differ, stage, and a one-line reason ("Moves from 2030-01-11 to 2030-01-18."). Never shown: critic internals, prompts, model reasoning, or raw validation codes — conflicts are translated into sentences like "One of the Quests this proposal would replace has since been started or changed, so nothing was applied."

The confirmation summary is a single line (`1 unchanged · 1 rescheduled · 1 replaced · 1 new · 1 removed`) followed by the guarantee the product makes: **Completed or active history affected: 0**. A non-zero count disables confirmation, and the server refuses it even if a client asks.

Discarding is inert: it releases the sealed proposal through the owned operation endpoint and changes nothing about live execution, the plan pointer or the Quests — asserted in the UI tests and in the database tests.

## 16. Quota and provider budget

* A new configuration-driven bucket, `plannerRebalance` (3 per local week), uses the existing `UserQuota`, reservation receipt, settlement and release-on-failure machinery. Replanning never consumes the single weekly `planner` bucket or the `plannerExpansion` bucket — asserted against real PostgreSQL, including that the plan bucket's used count does not move during a replan.
* The shared pipeline is reused unchanged: at most one initial generation, one validation repair on the same provider, one fallback, one critic and one targeted repair — `generation ≤ 3`, `semantic ≤ 2`, `total ≤ 5`, with no nested retries and the same 90-second operation deadline philosophy. Workloads `rebalance`, `rebalance_critic` and `rebalance_repair` keep provider spend attributable.

## 17. Progress after a replan

Progress spans revisions safely. `getPlanDetail` now exposes bounded `historyItems` — the still-live items of previous confirmed revisions, excluding anything whose link is tombstoned — so completed work remains completed history, superseded pending work stops counting as outstanding, replacement work becomes current, and nothing is counted twice. The Mastery and per-mode projections keep refusing to infer mastery, and the roadmap's milestone states continue to come from confirmed expansion lineage.

## 18. Security, privacy and telemetry

* Unchanged and re-verified: cookie `getSession` with `tokenVersion` validation, owner-scoped reads and writes, no client Prisma, no service-role exposure, no mobile Bearer planner auth, no Realtime publication of planner payloads and no chain-of-thought storage or display.
* New telemetry is content-free and bounded: `replan_review_offered`, `replan_generation_started|completed|failed`, `replan_discarded`, `replan_confirmed`, `replan_conflict`, `mastery_check_result_set`, `mastery_check_result_reset`. Metadata is limited to the mode, the closed reason code, retained/moved/replaced/removed/added/frozen counts, provider calls, latency, critic state and a whitelisted conflict code.
* Never logged: plan titles, Quest titles, unit or topic names, generated items, criteria, reflection content beyond the fixed enum, prompts, critic or repair payloads, or raw provider output.

## 19. Migration

One narrow additive migration: `prisma/migrations/20260925152657_planner_check_result/migration.sql`. It creates the table, its foreign keys, unique index and CHECK constraint, then applies the private planner RLS/REVOKE posture. No historical migration was edited, no unrelated bootstrap repair was attempted, and no replacement-lineage schema change was needed because the existing link lifecycle and immutable baseline express it.

Target-ledger requirement: this migration must be applied through the normal reviewed Prisma workflow in the target environment (together with the Phase 1 planner foundation migration), and `scripts/test-planner-postgres.mjs` now stages it so the disposable-database run proves it applies cleanly on a fresh database.

## 20. Tests

| Gate | Result |
| --- | --- |
| `npx vitest run` (whole repository) | **1,540 passed, 82 skipped** (154 files) — Phase 4 baseline 1,477, so +63 tests and no regression |
| `npx vitest run __tests__/planner` (no database) | **278 passed, 82 skipped** (32 files) |
| `node scripts/test-planner-postgres.mjs` (disposable PostgreSQL 17) | **353 passed, 7 skipped** (32 files) |
| `npm run build`, `npx prisma validate` | pass |
| `npm run audit:secrets`, `npm run mobile:build`, `npm run mobile:verify` | pass |
| `npx tsc --noEmit -p scratch/tsconfig.verify.json` | clean (`scratch/` helper; plain `tsc` still shows the 89 pre-existing `.next` artifact errors) |
| `npx eslint` on the planner surface (library, routes, components, tests) | zero errors in every Phase 5 file; one pre-existing error remains in `ExamPlanner`'s `sessionStorage` restore effect, which belongs to the earlier Exam Planner flow and is not touched here |

The real-database suites are the ones that changed this round's outcome. Three new reconciliation tests run a **complete replan per mode against PostgreSQL** — strategic Roadmap (an expanded period frozen as an anchor, the rest restated), expanded-period revision (neighbours byte-identical, plan pointer untouched), and Mastery (completed stages satisfied, progression still terminal):

| Defect the tests found | Where it was | Fix |
| --- | --- | --- |
| A retained item was charged against the period's capacity **twice** | the period branch of `validateRebalanceProposal` never passed the retained refs to `periodRebalanceValidation`, so `validateExpansionItems` charged work that already exists as a Quest, and an honest "keep everything where it is" revision failed as `INSUFFICIENT_PERIOD_CAPACITY` | the branch now passes the retained refs (and the item titles, so the duplicate-history check actually runs on this path) |
| An anchor carried from the base revision failed as `UNKNOWN_PERIOD`, `UNKNOWN_ROADMAP_TOPIC`, then `DUPLICATE_KEY` | a stored draft names units and periods with keys minted for **its own** revision, so anchors, and the milestones a strategic replan carries over verbatim, referenced keys the new revision does not have | anchors and carried milestones now travel by **position** (`tN`/`pN`, the currency of the confirmed scope and the deterministic period grid) with the durable milestone key kept; an anchor the draft already carries is recognised as that milestone rather than counted twice; and a carried milestone's own effort counts towards its unit's floor while still never being re-charged against a period |
| `INSUFFICIENT_PRIORITY_ALLOCATION` on a perfectly allocated strategic replan | anchors were being mapped with zero effort, so the unit-floor check saw history as unallocated | anchors contribute the effort they actually carried; capacity stays charged only on what the replan writes |
| `REPLAN_EXECUTION_CHANGED` on a strategic replan's own retained milestones, and a receipt reporting five items with `questId: 0` | the item-level protection check and the receipt builder were applied to **milestone** diff entries, which have no Quest | milestone entries are skipped by the item-level protection check (the work beneath them is protected by the frozen anchor) and are never reported as receipt items; a retained item whose link is gone now fails closed instead of reporting a fabricated Quest |

None of these was fixed by relaxing a rule. Each was a real defect on a real path, and the tests that exposed them stayed as they were written.

Coverage of the goal's §51–§57 lists: 3 lock tests (a locked item excluded while its Quest is otherwise startable, offered again once unlocked, and held back even when overdue), 45 policy tests (classification precedence, eligibility, snapshot partition and fingerprint stability, detection and de-duplication, all five diff classifications, milestone diff, staleness codes, progress reconciliation, envelope bound); 14 UI tests (affordance without a provider call, explicit availability change, diff rendering, counts and the history guarantee, confirmation, refusal when history is touched, stale/protected conflicts, discard inertness, the check self-report set/change/reset, needs-more-work as an offer only, axe with a full diff, and a per-mode affordance test for Exam, Roadmap strategic + period, and Mastery); 6 real-database reconciliation tests plus the 3 new per-mode ones described above, and 8 real-database check-result tests.

## 21. Live provider smoke

`__tests__/planner/rebalance-provider-smoke.test.ts`, opt-in, synthetic only, no database: three scenarios through the real provider path with the real critic and repair. The evidence file records, for a rejected scenario, the **shape the provider actually returned** — a bare code says a rule failed, the returned shape says why.

| Scenario | Run A | Run B | Calls | Notes |
| --- | --- | --- | --- | --- |
| Roadmap period revision | **Accepted** | **Accepted** | 2 | Low churn (1 of 2 eligible retained), critic `PASSED` (run A) / no issues (run B), 4–5 s |
| Exam remaining-work replan | **Accepted** | **Rejected** | 3 | Run A: 15 items, 15 retained, 2 frozen kept, critic `ISSUES_REPAIRED` with 10 items repaired, 30 s. Run B: `UNJUSTIFIED_RELEARNING`, then the validation repair returned `SCHEMA_INVALID` |
| Mastery remaining-stage replan | **Rejected** | **Rejected** | 2 | Run A: `MISSING_MASTERY_STAGE` ×2. Run B: `SCHEMA_INVALID`, then `MISSING_MASTERY_STAGE`; the fallback provider answered `429` |

Recorded codes across both runs: `UNJUSTIFIED_RELEARNING`, `SCHEMA_INVALID`, `MISSING_MASTERY_STAGE`, `MISSING_COVERAGE` (earlier run), and `REBALANCE_GENERATION_FAILED` as the terminal code. Run B's returned shapes are worth recording: both whole-plan responses came back with the right **mode**, the full item key set (including `masteryStage` for Mastery), and the right stage/intent pairs — the failures are specific rule violations inside an otherwise correct shape, not a model that misunderstood the contract.

Honest reading: the replanning *path* is proven live. The period revision converges on every run with minimal churn and no fabricated work. The Exam path now converges on at least one run end to end — including a critic repair pass over 10 items — which it did not before this round's fixes. Whole-plan convergence is nevertheless **stochastic**: the same prompts produced an accepted Exam revision in one run and a rule violation in the next, and the validation-repair retry can itself return a schema-invalid shape. Mastery did not converge in either run.

**No rule was weakened to manufacture success.** Every prompt-contract defect the smoke revealed was fixed properly: JSON mode requires the word "JSON" in the prompt (otherwise HTTP 400), the payload must supply the confirmed unit list for the model to mirror, the item shape must state that `ref` and `retainRef` are different fields and that a Mastery item carries `masteryStage` and no `stage` key, and generation-time validation must be given the frozen history and the per-unit floors it is judged against.

## 22. Performance

Measured rather than assumed. `__tests__/planner/database-rebalance-bounds.test.ts` runs the real path against PostgreSQL and pins each artefact to its envelope, printing every number on each run so the figures below can be reproduced by running the harness:

| Artefact (this build) | Measured | Envelope |
| --- | --- | --- |
| Execution view, at `REBALANCE_LIMITS.executionRows` | 200 rows, 37 frozen / 151 eligible | 200 rows |
| Execution fingerprint | 20,491 bytes; its **digest is 64 characters** and that is what a plan stores | transient comparison artefact, not a persisted one |
| Diff, at `REBALANCE_LIMITS.items` (every item moved) | 60 entries, 18,472 bytes rendered | 60 entries |
| Availability snapshot | 1,881 bytes | inside the operation's availability column |
| Provider payload (Exam, 3 units, 12 eligible items) | **3,171 bytes** | `LIMITS.payloadBytes` 262,144 |
| Sealed revision input, including the replan metadata | 1,863 bytes total, of which the rebalance block is **1,166 bytes** | `LIMITS.inputBytes` 32,768; metadata 16,384 (7% used) |
| Sealed replan draft | 9,532 bytes, against a 6,147-byte base draft | `LIMITS.payloadBytes` |
| Confirmation | **49 ms wall, 35 queries, 14 write statements**, receipt of 12 retained items | one transaction; asserted ≤ 60 queries and < 10 s |

Two facts the numbers make concrete: the metadata that describes a whole replan costs about 7% of its declared bound even before the 60-item maximum, and a confirmation is a **fixed, small** amount of database work — 35 statements for 12 items, not 35 per item. The execution view is two bounded queries and never an N+1 walk; the provider payload carries only the affected scope (confirmed units with their floors, frozen history, eligible items, period or roadmap context) and never a whole historical plan; and the diff is bounded at 60 entries. Section 21's smoke records 2–3 provider calls and 4–53 seconds per scenario.

## 23. Classic, Exam, Roadmap and Mastery regression

* Classic Planner: hash-identical files, no cross-imports, no history migration, no quota change, unchanged flag-off behaviour.
* Exam: Phase 2/2.5 suites green; no Exam validator or prompt was weakened. The shared edits are additive: an optional `executed` view, an optional `capacityItems` view, and frozen items now reach the gate with the `stage` and `rationale` it already required.
* Roadmap: strategic confirmation still creates zero Quests, selected-period expansion still works under its own bucket, `MILESTONE_ALREADY_EXPANDED` still holds permanently, and the strategic structure fingerprint still rejects drift.
* Mastery: Phase 4 suites green, the progression and check rules are unchanged, and the new check-result table is additive and invisible to plan semantics.

## 24. Blockers before Phase 6

* **Whole-plan replan reliability.** The period revision converges live on every run; the Exam path now converges on some runs and the Mastery path did not converge in the last two. The *mechanism* for all four replan kinds is verified end to end against real PostgreSQL, so what remains is model-output convergence and the validation-repair retry (`UNJUSTIFIED_RELEARNING`, `SCHEMA_INVALID`, `MISSING_MASTERY_STAGE`), not plan semantics. This is prompt and contract work, with the recorded codes and returned shapes as the starting evidence.
* **Migration application.** `20260925152657_planner_check_result` (and the Phase 1 planner foundation) must be applied through the reviewed Prisma workflow in the target environment before any enablement.
* **Roadmap period revision without an expansion.** A strategic milestone that was never expanded is rebalanced through the strategic path; the period-revision action is deliberately offered only where a confirmed expansion exists, because that is the only case where "revise this period" has a defined historical meaning.
* **Enablement.** `PLANNER_MODES_ENABLED` remains unset, no public rollout happened, and no Phase 6 work (A2, A3, autonomous behaviour) was started.

## Explicit answers

| Question | Answer |
| --- | --- |
| **Can Sylf ever modify a confirmed plan automatically?** | **No.** Every mutation is behind an explicit user action and an explicit confirmation of a reviewed diff. Detection only surfaces an affordance, and no detection code path calls a provider, spends quota or writes a Quest. An item the student has **locked** is never offered as replannable in the first place, so a replan cannot silently override the lock — it never sees it as eligible. |
| **Can generation change live Quests before confirmation?** | **No.** Generation seals a proposal; the database tests assert that Quest rows, dates, statuses and links are byte-identical between sealing and confirmation. |
| **Can completed work ever be rewritten?** | **No.** Completed and failed Quests are frozen by classification, and the reconciliation refuses any proposal touching them (`REBALANCE_TOUCHES_HISTORY`), verified inside the transaction as well as at seal. |
| **Can an active Quest/session be moved?** | **No.** In-progress Quests, Quests with recorded time and Quests with an open session are frozen; if one changes between proposal and confirmation the confirmation fails with `REPLAN_STALE_EXECUTION`/`SCHEDULE_CHANGED` and applies nothing. |
| **Can deleted/detached work be resurrected?** | **No.** Removed links are tombstoned, detached links are history, neither is ever eligible again, and a proposal that tries to retain one fails closed (`UNKNOWN_RETAIN_REF` on a non-eligible token). New work for the same unit is a genuinely new item with a new identity and a baseline that names what it replaced. |
| **Is replannability determined by server state rather than AI?** | **Yes.** `isPlannerQuestReplannable` and the frozen/eligible partition are pure functions of link disposition, Quest status, elapsed time, sessions and dates. The model never sees a database identifier and is never asked what is protected. |
| **Can a stale replan partially apply?** | **No.** All reconciliation happens in one SERIALIZABLE transaction that re-reads reality first; the database test starts a session after sealing and asserts a conflict with zero deletions, moves, creations or receipts. |
| **Can repeated confirmation duplicate Quests?** | **No.** Confirmation is idempotent by key and hash: two concurrent confirmations return the same receipt, a replay changes nothing, and the Quest count is asserted exactly. |
| **Can an already-expanded Roadmap period now be explicitly revised without violating original EXPAND lineage?** | **Yes.** "Revise this period" is a `REBALANCE` operation; the permanent `MILESTONE_ALREADY_EXPANDED` guard is untouched, the original `EXPAND` revision stays on record, and it spends `plannerRebalance` rather than `plannerExpansion`. |
| **Can completed Mastery stages satisfy prerequisites in a revised plan?** | **Yes.** Frozen stages are merged into the progression view, so a replan over recall/practice/check does not regenerate orientation or learning, and the plan must still reach practice for every unit and still end with one terminal check. |
| **Is the Mastery Check result now safely persisted, or deliberately still deferred?** | **Safely persisted** — in a dedicated, additive, owner-scoped `PlannerCheckResult` table with a closed enum, no client access, and nothing written to Quests, revisions, link baselines, SubjectNodes or telemetry. Phase 4's open item is resolved on the narrowest terms that fit the existing architecture. |
| **If NEEDS_MORE_WORK exists, can it trigger work automatically?** | **No.** Recording it writes one enum value, spends no quota and calls no provider. The UI says plainly that Sylf will not create, move or delete anything until the student starts a review, and the only affordance is the ordinary review button. |
| **Is replanning a separate quota from initial generation/expansion?** | **Yes.** `plannerRebalance` (3 per week) is independent of `planner` and `plannerExpansion`, verified against real PostgreSQL: a replan leaves both other buckets untouched. |
| **Is Classic Planner still independently usable?** | **Yes.** Hash-identical, no cross-imports, no history migration, no quota change, and the flag-off experience is unchanged. |
| **Are all three Planner Modes still gated?** | **Yes.** `PLANNER_MODES_ENABLED` is unset in committed configuration and no environment file enables it; Phase 5's flag-on verification happened only inside local tests. |
| **Is Phase 6 safe to begin?** | **Not yet — await review.** The phase delivers the full user-approved lifecycle with atomic reconciliation, a resolution to the Mastery Check result question and no migration beyond the one narrow table. What is not established is whole-plan replan reliability (Exam and Mastery were rejected by their own validators in the live smoke), the reviewed application of the new migration, and any enablement decision. Phase 5 stops here. |
