# Sylf AI Planner Modes — Phase 4 report: Chapter / Unit Mastery

Date: 26 September 2026. Scope: **Phase 4 only** — the gated Chapter / Unit Mastery mode: mode selection, guided setup, bounded scope, current-state input, Smart Setup reuse, deterministic feasibility, the Mastery generation policy, review, editing, confirmation, ordinary Quest materialization, Mastery Check representation, conservative progress presentation, accessibility and mobile, tests, provider smoke.

Phase 0 architecture is unchanged. Phase 1 remains the persistence, capacity, revision, operation, quota, lineage and materialization foundation. Phase 2's Exam Planner, Phase 2.5's planning intelligence (A1) and Phase 3's Course Roadmap plus selected-period expansion are reused, not rebuilt.

Not implemented, deliberately: Addendum A2 as a shared framework, Addendum A3, Roadmap replanning, adaptive replanning, autonomous rescheduling, automatic mastery inference, public rollout. `PLANNER_MODES_ENABLED` is still unset and Planner Modes remains disabled.

**No database migration was created or needed.** `planner_plan_bounds` already allows `mode IN ('EXAM','ROADMAP','MASTERY')` and `planner_revision_bounds` already allows `source IN ('GENERATE','EDIT','EXPAND','REBALANCE')` (`prisma/migrations/20260924010000_planner_foundation/migration.sql:143,146`). No `PlannerMastery`, `MasteryTopic`, `MasteryStage` or `MasteryCheck` table was added; Mastery lives entirely in the bounded `PlannerPlan` / `PlannerRevision` / `PlannerQuestLink` snapshots.

---

## 1. Repository reconciliation

The current repository is authoritative over these reports where they differ. Legacy Planner isolation was re-verified by hash before and after this phase:

| File | SHA-256 | Conclusion |
| --- | --- | --- |
| `app/api/ai-planner/route.ts` | `b7f49aca8c43e90bf2d8d31419080e620714e7ea85b10117bb4abb7d4d66c07f` | Byte-identical to the Phase 3 baseline |
| `lib/ai/orchestrator.ts` | `2b91d55ebcf18d458fdd4fd01d946c25a444ee16b9586f34be17ef3d6e12dee9` | Byte-identical |
| `lib/ai/planning-engine.ts` | `cbd73cc7180a1b031e08e1ee1eae29e873b010029126b7d9b69d9c674fc72977` | Byte-identical |

No Classic file imports a Planner Modes module, no Planner Modes module imports Classic, no history was migrated, no lineage was inferred from legacy AI Quests, Classic is not routed through Planner Modes and Classic quota semantics are unchanged. `classic-coexistence.test.ts` and `client-boundary.test.ts` still pass.

Phase 4 added 6 modules and 8 test files (6 suites plus fixtures and helpers), and extended 17 existing files:

| Area | New | Extended |
| --- | --- | --- |
| Shared mode contract | `lib/planner/mastery-fields.ts` (133), `lib/planner/mastery-policy.ts` (555), `lib/planner/mastery-progress.ts` (259) | `contracts.ts`, `constraints.ts`, `exam-policy.ts`, `smart-setup.ts`, `telemetry.ts` |
| Provider strategy | `lib/ai/planner/mastery.ts` (503) | `lib/ai/planner/pipeline.ts` (mastery workloads, one shared criteria resolver) |
| Server | — | `server/{core,generation,materialize,revisions}.ts` |
| Client | `lib/planner/mastery-client.ts` (53) | `app/components/planner/{PlannerWorkspace,RoadmapPlanner,PlanItemEditor}.tsx`, `ExamPlanner.module.css` |
| UI | `app/components/planner/MasteryPlanner.tsx` (1258) | — |
| Tests | `mastery.test.ts`, `mastery-setup.test.ts`, `mastery-progress.test.ts`, `mastery-ui.test.tsx`, `mastery-provider-smoke.test.ts`, `database-mastery.test.ts` (+ `mastery-fixtures.ts`, `mastery-helpers.ts`) | `planner-workspace.test.tsx`, `scripts/test-planner-postgres.mjs` |

One shared module was de-duplicated rather than copied: the unit-shaped Smart Setup detectors now have a single implementation that Roadmap and Mastery both call, and `constraintCapacityInput` moved into `constraints.ts` so Exam and Mastery share one capacity closure. Roadmap's own questions, prompts and wording are asserted unchanged by test.

## 2. Mastery product model

Mastery answers "how do I deliberately work through this bounded unit until I have learned it, recalled it, practised it, reviewed my mistakes and checked myself?" It is intentionally smaller and more execution-oriented than Roadmap: one chapter, unit, concept cluster or small topic scope, planned directly onto dated Quests.

* It is **not** a claim about academic mastery. "Mastery" names the mode and the workflow. Nothing in the mode decides, stores or displays whether a student has mastered anything.
* Unlike Roadmap, the confirmed plan contains actionable items directly. There is no strategic layer and no expansion step: one reviewed, validated progression becomes ordinary Quests.
* The mode reacts to the student's own signals only — coverage, confidence, difficulty, priority, size and depth — and never infers any of them.

## 3. Input contract and measured bounds

`MASTERY` reuses the shared `UserInputV1` discriminated union and adds one optional metadata block, exactly as Exam and Roadmap do. Its variant keeps the existing required `focus` (the unit title), so every Phase 1 payload still parses.

```
{ schemaVersion:1, mode:"MASTERY", title, focus:"<unit title>", scope:"<labels, newline separated>",
  startDate, endDate, availability, constraints?,
  mastery?: { subjectName, subjectId, unitTitle, topics[1..12], desiredDepth, priorExposure,
              checkPreference, targetDate|null, acceptReducedReserve } }
```

`masteryInput()` asserts `focus === mastery.unitTitle`, that `scope` mirrors the confirmed labels exactly, that labels are unique, that a below-reserve plan carries explicit acceptance, that the unit count and horizon are inside the mode's bounds, that the horizon equals the target date or the derived one, and that every supplied constraint is one the mode can evaluate. Per-unit state reuses the shared `ScopeTopicSchema` fields (`label`, `covered`, `confidence`, `difficult`, `priority`, `prioritySource`, `sizeSignal`) — no parallel topic type was created.

Measured bounds (measured, not guessed):

| Quantity | Value |
| --- | --- |
| `MASTERY_LIMITS` | 12 units, 60 items, 84 days (1–12 weeks), 240 minutes per check |
| Maximum schema-valid input | **12,142 bytes** (12 units at 198 multi-byte characters, depth DEEP, full priority/size signals) |
| Mode input envelope | 16,384 bytes — above the schema maximum, so the unit cap binds first and the byte measure is a wire-format guard |
| Provider payload | **2,849 bytes** for a 3-unit chapter, **10,105 bytes** at the 12-unit maximum |
| Stored draft snapshot (fixture, 16 items) | **9,743 bytes** |
| Worst-case 60-item snapshot (every text field at its bound) | **371,256 bytes**, inside the Phase 1 512 KiB snapshot limit |

Mastery deliberately does **not** reuse Roadmap's 60-unit ceiling: a chapter needing more than a dozen schedulable units is a course-level problem, and the mode says so instead of producing a thin plan. An oversized scope returns `SEGMENT_REQUIRED` with explicit choices (including "Use Course / Syllabus Roadmap for a whole course or qualification") and never truncates topics.

## 4. Horizon strategy

* Explicit target date, or **no target date at all** — in which case the horizon is derived deterministically from the depth-scaled scope estimate and the confirmed availability, bounded to 1–12 weeks and clamped to the mode's 84-day maximum.
* `deriveMasteryHorizon()` is a pure function of scope, depth and availability, so the wizard can show the derived end date before generation and the server re-derives the same value; `input.endDate` must equal the target date or exactly the derived date (`MASTERY_HORIZON_MISMATCH`). There is no open-ended generation.
* `masteryFeasibility()` reports the horizon as `derived` or explicit, the scope minutes, the available minutes and the named shortfall reasons; an impossible deadline returns `INFEASIBLE` with choices rather than a plan that silently overruns.

## 5. Mastery stage model

Six planning stages, in a fixed order: `UNDERSTAND → LEARN → ACTIVE_RECALL → PRACTICE → REVIEW_MISTAKES → MASTERY_CHECK`. They are planning metadata, not Quest types and not database rows.

The policy is adaptive rather than uniform:

| Stage | Rule |
| --- | --- |
| `UNDERSTAND` | Required unless the unit is already covered **with confidence ≥ 4**; brief by construction (a single bounded item) |
| `LEARN` | Required when the unit is not covered; forbidden when it is covered with confidence ≥ 4 (`UNNECESSARY_RELEARNING`) |
| `ACTIVE_RECALL` | At least one per unit, always after that unit's learning; on a horizon ≥ 14 days a second retrieval lands ≥ 3 days after that unit's last learning item |
| `PRACTICE` | At least one practice-family item per unit, after the unit's learning |
| `REVIEW_MISTAKES` | Required whenever any unit is not already secure, and never before the practice it inspects |
| `MASTERY_CHECK` | Exactly the final item, `ASSESS`, ≤ 240 minutes, covering every HIGH-priority unit and ≥ 2 units in a multi-unit chapter |

So not every unit receives the same quantity of every stage — a secure unit gets retrieval, practice and its share of the check, while an uncovered unit additionally gets orientation and teaching — but the plan as a whole always contains meaningful retrieval, practice and one final bounded check, which is what §10 requires.

## 6. Intent/stage representation

Each stage maps to **existing** educational intents (`MASTERY_STAGE_INTENTS`): `UNDERSTAND → LEARN|REVIEW`, `LEARN → LEARN`, `ACTIVE_RECALL → RECALL|REVIEW`, `PRACTICE → PRACTICE|TIMED_PRACTICE`, `REVIEW_MISTAKES → MISTAKE_REVIEW`, `MASTERY_CHECK → ASSESS`. Exam's readiness intents (`MOCK_EXAM`, `FINAL_REVIEW`) are deliberately unavailable to the mode.

**No new intent was needed.** The check reuses the existing generic `ASSESS` intent and the meaning is carried by the stage, exactly as the goal's §9 permits. The stage travels in planner metadata (`masteryStage`) inside the sealed revision snapshot; it is never written to the Quest row, never a Quest database type, and never a trigger for anything automatic.

## 7. Mastery-specific deterministic validators

`validateMasteryStructure()` runs on a small structural view, so one implementation serves a fresh proposal, a stored draft and an edited draft. Codes and rules:

| Code | Rule |
| --- | --- |
| `MISSING_UNDERSTAND` | A unit that is not already secure needs orientation |
| `MISSING_LEARN` / `UNNECESSARY_RELEARNING` | Real gaps are taught; covered, confident material is not re-taught |
| `MISSING_ACTIVE_RECALL`, `MISSING_PRACTICE` | Every unit needs recall and practice |
| `RECALL_BEFORE_LEARNING`, `PRACTICE_BEFORE_LEARNING` | Retrieval and practice follow the unit's own learning |
| `MISTAKE_REVIEW_BEFORE_PRACTICE`, `MISSING_MISTAKE_REVIEW` | Error review follows the practice it inspects, and exists whenever any unit is not secure |
| `INSUFFICIENT_TOPIC_WORK`, `INSUFFICIENT_PRIORITY_ALLOCATION` | Each unit reaches its depth-scaled floor; a HIGH-priority unit reaches its practice floor |
| `PRIORITY_ORDER` | A HIGH-priority unit's first item lands inside the first half of the horizon |
| `MISSING_LATER_RETRIEVAL` | On a horizon ≥ 14 days, retrieval lands ≥ 3 days after the unit's last learning item |
| `MISSING_MASTERY_CHECK`, `INVALID_MASTERY_INTENT_STAGE`, `MASTERY_CHECK_NOT_TERMINAL`, `MASTERY_CHECK_TOO_LONG`, `CHECK_SCOPE_TOO_NARROW`, `PRIORITY_MISSED_IN_CHECK` | The plan ends with one bounded, legal, last check that covers the chapter |
| `MISSING_SCOPE_TOPIC`, `OUTSIDE_HORIZON`, `MASTERY_MILESTONES_NOT_ALLOWED`, `EMPTY_MASTERY_PLAN`, `MASTERY_ITEM_LIMIT` | Every confirmed unit is planned, inside the horizon, with no milestones |

The model may propose sequencing; the server decides whether the result is a mastery plan at all. `validateMasteryProposal()` additionally enforces the confirmed unit list (`CONFIRMED_SCOPE_MISMATCH`), capacity against the shared closure (`INFEASIBLE_CAPACITY`) and the HARD limits (`HARD_SESSION_LIMIT_EXCEEDED`, `HARD_UNAVAILABLE_DAY_USED`). `validateMasteryDraft()` re-runs the same structure rules on a stored or edited draft and returns early unless the input carries mastery details, so every sealed Phase 1–3 payload keeps its digest and stays readable.

## 8. Feasibility

`masteryFeasibility()` is deterministic, uses the shared capacity system with the HARD-weekday closure, and returns `POTENTIAL_FIT | INFEASIBLE | SEGMENT_REQUIRED` with named reasons (`NO_STUDY_DATES`, `INSUFFICIENT_CAPACITY`, `SCOPE_TOO_LARGE`, `HORIZON_TOO_LONG`, `SCOPE_BYTES_TOO_LARGE`, `ITEM_LIMIT_REQUIRES_SEGMENTS`), explicit choices, the scope and available minutes, the derived/explicit horizon and a bounded minimum-item estimate.

It runs as the generation route's **preflight**: a non-`POTENTIAL_FIT` status returns 422 with that payload before any provider call or quota reservation. It never drops a unit, never removes the check, never schedules outside the horizon and never violates rest or blocked days; "potential fit" is not a promise, and final generation still has to pass exact validation.

## 9. Smart Setup reuse/adaptation

One shared catalog, one ranking, one question schema, one answer-merge entry point, one bounded limit of 0–3 closed-choice questions. Mastery adds only detectors and wording, and Roadmap's own question output is pinned by a regression test.

* `masterySetupSignals()` derives the coarse requirement from the depth-scaled scope over the derived horizon, using the same availability model Roadmap uses.
* Detectors cover the genuine uncertainties: priority separation, constraint strength, scope size (a label too broad to size) and availability pattern. Nothing is asked merely because it might be interesting; a decided chapter asks nothing at all.
* `applySmartAnswers(MASTERY, …)` merges into mastery vocabulary the mode can evaluate: a priority answer marks one unit HIGH with `USER_EXPLICIT` source, a scope-size answer sets `sizeSignal` on broad labels, the constraint-strength answer becomes **`MAX_SESSION_MINUTES` (HARD) or `SESSION_LENGTH_PREFERENCE` (SOFT)** — never Roadmap's weekly limit — and the availability answer becomes `EVEN_SPREAD_PREFERENCE` or `PREFER_FEWER_DATES`. Answers are idempotent: re-answering replaces the constraint it owns instead of stacking a contradictory one.
* **No new reason code was added.** The four existing closed codes represent every Mastery uncertainty the tests exercise.

## 10. Constraints/priority reuse

* `CONSTRAINT_MODES` now includes MASTERY for the item-level kinds (`MAX_SESSION_MINUTES`, `UNAVAILABLE_WEEKDAY`, `SESSION_LENGTH_PREFERENCE`, `EVEN_SPREAD_PREFERENCE`, `PREFER_FEWER_DATES`); the Roadmap-only kinds stay Roadmap-only, and `assertConstraintsApplicable("MASTERY", …)` rejects anything else with `CONSTRAINT_NOT_APPLICABLE` rather than ignoring it.
* HARD constraints are deterministic authority: they are enforced on the proposal, on every repair (through the accept path) and again at confirmation. SOFT preferences never create infeasibility — a plan with every session above the student's stated preference still validates as `POTENTIAL_FIT` and reports the violation as an explanation in one sentence.
* Priority is the shared model, independent of confidence: HIGH brings earlier attention (`PRIORITY_ORDER`), more practice (`INSUFFICIENT_PRIORITY_ALLOCATION`) and inclusion in the check (`PRIORITY_MISSED_IN_CHECK`). It never creates a fake official weighting, never implies low confidence, never implies mastery and never forces relearning of already-secure material.
* Depth (`ORIENTATION | SOLID | DEEP`) scales only the coarse effort estimate (×0.8/1/×1.25); it never changes the confirmed scope and never bypasses a floor.

## 11. Definition of Done

A1 is reused exactly, with no second DoD system. `withItemCriteria()` resolves the shared `resolveCompletionCriteria()` for every actionable item before validation, so a bounded, observable criterion always exists; a valid model criterion is kept, anything else (including a mastery claim or an invented official requirement) is replaced by the bounded default for the intent. The stored snapshot therefore always carries "Done when: …" text, and `validateDraft` re-checks it (`INVALID_COMPLETION_CRITERIA`).

The defaults already read as the goal's examples: `UNDERSTAND` → "Explain the main idea in your own words, then note what is still unclear."; `RECALL` → "Recall the core points from memory, then check and correct the gaps."; `PRACTICE` → "Complete one bounded practice set, then review every incorrect step."; `MISTAKE_REVIEW` → "Re-attempt your recorded errors and confirm each corrected step."; `ASSESS` → "Complete the check and record what was correct and what was not."

## 12. Semantic critic/repair

* The deterministic half of the A1 gate runs on the shared item view, so mastery items are held to the same vagueness, density, redundancy and retrieval-clustering standard as any Quest — including `SEQ_WEAK` when all of a unit's retrieval is clustered after its last practice item.
* The AI critic reuses the closed six-code vocabulary (`criticReportSchema(/^i[1-9][0-9]*$/)`) and the shared `runCriticCall`, with mastery-specific meanings documented in the prompt: weak progression, unnecessary relearning, misplaced retrieval, thin practice, mistake review before practice, vague tasks (including a final check whose purpose or scope is unclear), robotic repetition, priority misses, unrealistic daily density and a weak final check.
* At most one targeted repair is allowed, through `MasteryRepairPatchSchema` and the shared `mergeItemPatch`, which refuses a moved topic binding and copies unaffected items by identity. A repair is accepted only after re-passing structure, capacity, HARD limits and the deterministic semantic gate; otherwise the validated plan is kept unchanged.
* Fail-safe behaviour is tested: a malformed critic report is discarded (never retried into a rewrite), an issue referencing a non-existent item never triggers a provider call, a repair that moves an item to another unit is rejected whole, and a repair that would exceed a HARD session limit is rejected.
* **No new issue code was added.**

## 13. Mastery Check representation

Every normal plan ends with its check, and the check is represented as one bounded item:

* Type `ASSESS`, stage `MASTERY_CHECK`, ≤ 240 minutes, never longer than the confirmed availability, dated after every other item and last in the plan's own order.
* Scope: it covers ≥ 2 units in a multi-unit chapter and every HIGH-priority unit, recorded as its own unit plus `relatedTopicRefs`.
* Purpose and criterion: the criterion describes completing the check and recording what was correct, never passing, scoring or mastering. A fabricated threshold the student never supplied ("score 8/10 to pass") is replaced by the bounded default, which is asserted by test — so no invented pass mark or exam-board requirement can reach a Quest.
* Presentation: its own review panel with state (`Scheduled` / `Scheduled for today or earlier` / `Completed`), date, minutes and the number of units it covers, plus one sentence stating that completing the check records what was correct and what was not, and that only the student decides whether the unit is mastered.

## 14. Mastery Check result/reflection decision

**The result is not persisted, and no reflection is captured.** This is a deliberate, documented refusal to force the feature, because every available path would corrupt existing semantics:

| Candidate path | Why it is unsafe |
| --- | --- |
| Write the result into the sealed revision snapshot | `planner_revision_guard()` raises `PLANNER_IMMUTABLE` (SQLSTATE 23514) once `operationState <> 'PREPARING'` and any of `inputSnapshot, availabilitySnapshot, outputSnapshot, digest, sealedAt, operationState` differs (`prisma/migrations/20260924010000_planner_foundation/migration.sql:169-173`). Asserted against a real database: adding a `checkResult` key to a sealed snapshot is rejected |
| Write it into the planner link baseline | The lineage trigger rejects a baseline change (`PLANNER_LINEAGE_IMMUTABLE`) — also asserted against a real database |
| Attach it to the completed Quest | `mapQuest()` is the only planner→Quest writer and a Quest is ordinary execution shared by Focus, the calendar and the dashboard; encoding a planning verdict there would make an academic claim in a row every other feature reads |
| Append a new revision to carry it | The revision model records plan versions, not reflections. `source` is bound to `GENERATE|EDIT|EXPAND|REBALANCE` by a database check constraint, and an extra revision would flip the confirmed plan back into "draft awaiting review", corrupting exactly the semantics §13 says must not be broken |
| Add a table or column | §13 and §42 forbid a migration for this signal |

So the mode stores nothing about the check's outcome. What the user gets instead is conservative workflow state: the check's own completion is visible because it is an ordinary Quest, the plan reports `Check pending` / `Check completed` / `Plan completed`, and no verdict is displayed or recorded anywhere. The preferred conceptual states (`NOT_TAKEN`, `COMPLETED_UNRATED`, `NEEDS_MORE_WORK`, `FELT_OK`, `READY_TO_MOVE_ON`) are **not** implemented, because implementing them requires a persistence decision this phase must not make: who may write it, whether it is editable, and how it survives revision sealing. That is a reviewed later-phase decision with its own migration, not something to smuggle in under a disabled flag. Consequently `mastery_check_reflection_recorded` is not a telemetry event either: an event for something not implemented would be a false claim.

Because no result exists, "what happens after NEEDS_MORE_WORK" (goal §15) is vacuous by construction: there is no result to react to, and no document anywhere — no automatic Quest creation, no rescheduling, no regeneration, no mutation of completed work — was added.

## 15. Review/edit UX

`MasteryPlanner.tsx` is a seven-step wizard with progressive disclosure: **saved plans → what you are mastering → what is included → how deep and by when → when can you study → how far along are you → review**. Deterministic feasibility is a `role="status"` panel that appears wherever it is relevant, with the reasons and the choices spelled out.

Review is **stage-oriented**, which is what makes it visibly different from Exam's chronological readiness plan and Roadmap's strategic periods:

```
Mastery check      ▸ 1 item
Review mistakes    ▸ n items
Practice           ▸ n items
Active recall      ▸ n items
Learn              ▸ n items
Understand         ▸ n items
```

Each stage group is a native `<details>` in the progression's order with a count, containing the shared `PlanItemEditor` (title, completion condition, date, minutes, lock, remove, reorder). A maximum-scope draft — the full 60-item ceiling with every text field at its bound — renders with every stage group present and every item reachable; that is asserted, and axe reports zero violations on it.

Editing uses the existing immutable EDIT path. An edit that breaks the required progression is refused by the same deterministic rules (removing a unit's only recall or its check is rejected, and the UI explains which guarantee was broken); a legal edit appends a new sealed revision and re-runs structure, Mastery policy, HARD constraints, capacity and the deterministic semantic gate before confirmation is allowed.

## 16. Confirmation/materialization

* Confirmation is Exam-like: the **complete remaining validated item set** (`MASTERY_SELECTION_REQUIRES_EDIT` for any subset), because a subset would drop the recall, practice, mistake review or check the plan was validated to contain. Leaving out a whole unit is possible only as an explicit exclusion, acknowledged before confirmation (`EXCLUSIONS_REQUIRE_ACCEPTANCE`), and the UI names how many units are being left out.
* Materialization is the unchanged Phase 1 transaction: ordinary `PENDING` Quests with `targetMinutes == requiredMinutes`, canonical difficulty and rewards, an optional owned Subject, no SubjectNode mutation, the A1 "Done when" text in the description, and normal `PlannerQuestLink` lineage. No rewards are minted at confirmation; Focus settlement remains authoritative.
* Verified against a real disposable PostgreSQL: zero Quests before confirmation, ordinary PENDING Quests after, a real Focus session started through `start_study_session` and settled through `settle_study_session_atomic`, a replayed settlement that changes nothing (rewards, Sylph, seconds and ledger all identical), and a completed Quest with `requiredMinutes == targetMinutes`, `subjectNodeId: null` and `elapsedSeconds` set by the session.
* Idempotency and recovery are the shared ones: the same creation key with the same body returns the same plan, a different body under the same key conflicts (`IDEMPOTENCY_MISMATCH`), a duplicate worker for one operation key is refused, a sealed operation recovers as `SEALED` with its digest intact, and a terminal transition cannot refund or rewrite an already sealed operation.

## 17. Workflow progress semantics

`lib/planner/mastery-progress.ts` is a pure projection over the confirmed revision plus linked-Quest status. It reports `NOT_CONFIRMED | PLANNED | IN_PROGRESS | CHECK_PENDING | CHECK_COMPLETED | PLAN_COMPLETED`, per-unit `NOT_STARTED | IN_PROGRESS | PLANNED_WORK_DONE`, per-stage planned/completed counts and minutes, and the check's own workflow state.

It has no representation for mastery, and the wording is deliberately about work rather than ability: "Planned work done — check outstanding", "Check completed", "All planned work done". A missing or failed Quest counts as outstanding, never done; a completed check does not complete the plan; every sentence in the rendered UI that contains the word "mastered" is a negation ("Sylf does not decide whether the unit is mastered"), which the test suite asserts sentence by sentence.

## 18. Provider/quota/recovery

* The shared Phase 3 pipeline is reused verbatim: initial generation → at most one validation repair on the same provider → at most one fallback candidate → one semantic critic → at most one targeted repair. `GENERATION_CALL_BUDGET = 3`, `SEMANTIC_CALL_BUDGET = 2`, `PROVIDER_CALL_BUDGET = 5`, the 90-second operation deadline and the 30-second semantic slice with a 5-second reserve are unchanged. There are no nested retries.
* Quota is the existing weekly `planner` bucket — no new bucket. Asserted against a real database: after generation the user's only quota row is `feature = 'planner'`.
* Workloads `mastery`, `mastery_critic` and `mastery_repair` were added to the existing union, so provider spend is attributable with content-free labels.
* Operation lifecycle, request keys, durable recovery, cancellation, lease expiry, quota release, SSE streaming and lost-response recovery are the shared implementations; the mastery DB tests assert same-key recovery, duplicate-worker refusal and sealed-operation terminality.

## 19. Privacy/telemetry/security

* Events: `mastery_generation_started|completed|failed`, `mastery_confirmed`, `mastery_check_completed`, plus the existing `planner_mode_selected`, `proposal_edited`, `semantic_review_completed`, `soft_constraint_evaluated`, `feasibility_warning` and quota events.
* `PlannerMode` now includes `MASTERY` (a mastery event can no longer be silently recorded as `EXAM`), and metadata is limited to closed codes and bounded counts: `masteryDepth`, `checkPreference`, `excludedUnits`, item/topic/period/horizon/provider-call/latency/critic fields.
* `mastery_check_completed` is emitted when a student views a confirmed plan whose check Quest is complete, once per plan revision per page session. It reports workflow state the student can already see; it carries no result, no rating and no reflection.
* Content-free by construction and asserted by test: no unit labels, titles, descriptions, criteria, check contents, reflection text, prompts, critic or repair payloads, or raw provider output. `mastery_generation_completed` and `mastery_check_completed` emit exactly their fixed key sets and no academic text.
* No client Prisma, no service-role exposure, no Realtime private planner payloads, no mobile Bearer auth and no chain-of-thought storage or display. `client-boundary.test.ts` passes with the mastery client and progress modules in the client graph, and `npm run audit:secrets` finds no credential patterns in tracked files.

## 20. Classic/Exam/Roadmap coexistence

| Surface | Evidence |
| --- | --- |
| Classic Planner | The three protected files are hash-identical to the Phase 3 baseline (§1), nothing imports across the boundary, and the flag-off experience is unchanged (`exam-entry.test.tsx` still asserts it) |
| Exam Planner | Phase 2 and 2.5 suites green; no Exam validator, prompt, budget or contract was weakened. The only shared-code changes are de-duplications: `activeExamItems` now delegates to a shared active-item projection, `constraintCapacityInput` delegates to the shared constraints module, and `softPreferenceIssues` widened its input type |
| Course Roadmap | Strategic confirmation still creates zero Quests, selected-period expansion still works with its own independent quota bucket and permanent already-expanded lineage, and Roadmap's Smart Setup questions are asserted byte-identical after the shared detector extraction |
| Mode isolation | The three input variants are mutually exclusive by strict schema: a mastery input cannot carry `exam` or `roadmap` metadata and an exam input cannot carry `mastery`, asserted by test |
| No leakage | No Mastery rule, table, column, intent or telemetry event is reachable from Exam or Roadmap; Roadmap proposals remain item-free, and `MASTERY_MILESTONES_NOT_ALLOWED` keeps milestones out of Mastery |

## 21. Tests/build

| Gate | Result |
| --- | --- |
| `npx vitest run` (whole repository) | **1,477 passed, 63 skipped** (139 files) — Phase 3 baseline 1,415, so +62 tests and no regression |
| `npx vitest run __tests__/planner` | **216 passed, 63 skipped** (18 files) |
| `node scripts/test-planner-postgres.mjs` (disposable PostgreSQL 17) | **273 passed, 6 skipped** (24 files, including 11 mastery database tests) |
| `npm run build` | exit 0 |
| `npx prisma validate` | schema valid; no migration added |
| `npm run audit:secrets` | no credential patterns in tracked files |
| `npm run mobile:build` + `npm run mobile:verify` | pass; zero server-only symbols or secrets in the mobile bundle |
| `npx tsc --noEmit -p scratch/tsconfig.verify.json` | clean (plain `npx tsc --noEmit` still reports the 89 pre-existing `.next/dev/types` errors — repository hygiene, unchanged) |
| `npx eslint` on every Phase 4 file | zero problems |

The mastery suites are `mastery.test.ts` (35 tests: contracts, every progression rule, generation, A1 reuse, fail-safe repair, measurements), `mastery-setup.test.ts` (7), `mastery-progress.test.ts` (10), `mastery-ui.test.tsx` (10), `database-mastery.test.ts` (11) and `mastery-provider-smoke.test.ts` (1, opt-in).

Coverage added for the goal's §35–§38 lists: small chapter, multi-subtopic unit, already-covered/high-confidence scope, low-confidence scope, mixed confidence, mixed priority, short horizon, flexible horizon, impossible deadline, oversized scope, blocked dates and rest days, HARD session/weekday constraints, soft preferences that cannot create infeasibility, every progression rule asserted by its own code, mode isolation, malformed critic fails safe, out-of-scope and binding-changing repairs rejected, a HARD limit surviving generation plus repair, a fabricated pass mark replaced by the bounded default, zero/justified/max-3 Smart Setup questions, the conservative progress projection, the maximum-scope render, appearance-token and 44px-target guards, and the real-database materialization, Focus settlement, settlement replay, check completion, recovery and immutability paths.

One harness change: `scripts/test-planner-postgres.mjs` now runs the disposable-database suite with `--no-file-parallelism`. Planner operations run at SERIALIZABLE with per-user advisory locks, so two writing suites at once produced retryable `40001` conflicts (`CONCURRENT_CHANGE`) that said nothing about the code under test — including in the pre-existing Exam suite once a second writing file existed. The retry policy, isolation level and product code are untouched.

## 22. Live provider smoke

`__tests__/planner/mastery-provider-smoke.test.ts`, opt-in (`PLANNER_PROVIDER_SMOKE=true`), three synthetic chapters through the real provider path with the real critic and repair. Latest run:

| Scenario | Items | Provider calls | Critic | Stages legal | Ends with check | Criteria valid | Milestones | Re-teaches a secure unit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| new chapter (unit not covered) | 15–17 | 2–3 | UNAVAILABLE or ISSUES_REPAIRED | yes | yes | yes | 0 | no |
| mostly covered (all units secure) | 8–13 | 3 | ISSUES_REPAIRED | yes | yes | yes | 0 | no |
| mixed confidence (DEEP) | 16–17 | 3 | ISSUES_REPAIRED | yes | yes | yes | 0 | no |

Twelve of twelve scenarios passed across four consecutive runs after the prompt and payload fixes below (the latest run: 3/3, zero validation failures, every plan accepted with `ISSUES_REPAIRED` and a legal terminal check, ~95 s for all three chapters). Every run stayed inside the 5-call budget — mostly 3 calls per chapter.

Rules were never weakened to obtain this. The four fixes were all prompt or payload defects, each found by reading the validator's own code back:

1. **`SCHEMA_INVALID` on every attempt (6/6 responses).** The item shape omitted `milestoneRef`, which the strict proposal schema requires as a nullable key. The shape now lists every required key, forbids a `stage` key and states the text bounds.
2. **`INFEASIBLE_CAPACITY` on every run.** The payload advertised `maxSessionMinutes: 240` while the tightest day's real allowance was 51 minutes, so the model planned a 60-minute session into a 51-minute day. `maxSessionMinutes` is now the tighter of the student's limit and that remainder.
3. **The same rejection after the first clarification.** The payload now carries `perDateCeilingMinutes` and a one-line `scheduleGuidance` ("one item per date" when the tightest day allows under 60 minutes), and the prompt tells the model to follow it exactly.
4. **Retrieval clustered at the end.** The prompt now asks for two recalls per unit — one on the next usable date after that unit's learning, one ≥ 3 days after its last learning item — and forbids a recall sharing a date with that unit's own learning item, which also removed the deterministic `SEQ_WEAK` advisories.

Reported honestly: Gemini returned HTTP 429 in the early runs, so most successes came from DeepSeek with the bounded repair, and some runs accepted a plan whose critic call was unavailable because the deterministic gate had passed — the designed behaviour for advisory-only issues. Three synthetic chapters on one provider is evidence, not a guarantee.

## 23. Deviations and why

| Deviation | Why |
| --- | --- |
| The Mastery Check result/reflection (§13–§15) is not implemented | Every persistence path is blocked (§14): the sealed snapshot and the link baseline are immutable by database trigger, the Quest row must not carry a verdict, appending a revision would corrupt plan-version semantics, and a migration for this signal is forbidden. Persisting it needs a reviewed later-phase decision |
| `mastery_check_reflection_recorded` does not exist as an event | An event for an unimplemented feature would be a false claim. `mastery_check_completed` exists and is documented as view-observed workflow state |
| `mastery_check_completed` is emitted from the UI, not from a server hook | The server has no mastery-specific Quest-completion moment, and adding one would mean touching the shared Quest/Focus completion path that Classic and every other feature depend on. The event is therefore observed when the student views the plan, once per plan revision per page session, and the report says so rather than implying a completion hook |
| No new Mastery intent; the check reuses `ASSESS` | The existing vocabulary already expresses "bounded check", and inventing `MASTERY_CHECK` as an intent would have implied a Quest-level meaning the mode deliberately does not have |
| No new semantic issue code | The closed six-code set, with mastery-specific wording in the critic prompt, covers every defect the mode can produce; a new code would be vocabulary growth without a new decision |
| The mastery input envelope is above the schema maximum | Measured: the worst schema-valid input is 12,142 bytes against a 16,384-byte envelope, so the 12-unit cap binds first. The envelope is documented as a wire-format guard rather than claimed as the binding limit |
| One shared stylesheet line changed | The planner module's only literal colour (`.error`'s `#dc8c50`) became `var(--accent-red)`, so the whole planner surface is appearance-token driven in dark, light and custom themes. It applies identically to all three modes; no class, structure or behaviour changed |
| The disposable-database harness is no longer file-parallel | Real PostgreSQL plus SERIALIZABLE operations plus parallel writers produced retryable `40001` conflicts, including in the pre-existing Exam suite. Test infrastructure only |
| `lib/planner/exam-policy.ts`, `constraints.ts` and `smart-setup.ts` were edited | De-duplication required by "reuse, do not rebuild": one capacity closure, one active-item projection and one unit-detector implementation now serve all modes. Exam and Roadmap behaviour is asserted unchanged by their own suites and by a pinned Roadmap question set |
| The report's structure follows this phase's required outline rather than Phase 3's | Phase 3's 20-section shape did not match the questions this phase must answer; the substance is the same or greater |

## 24. Blockers before Phase 5

* **Mastery Check result persistence** needs a reviewed decision plus one additive migration (who may write a self-reported planning signal, whether it is editable, how it coexists with sealed revisions). Until then the mode claims nothing about the check's outcome.
* **Live reliability breadth.** Nine of nine synthetic scenarios pass, but that is three chapters on one provider with a rate-limited fallback. A wider smoke (more chapters, both providers configured and healthy, longer horizons) is needed before any enablement.
* **Migration ledger.** The reviewed additive planner migration still has to be applied through the normal Prisma workflow in the target environment, and the historical empty-database bootstrap gap (`ItemCategory`) remains untouched. Phase 4 adds nothing new here.
* **Enablement.** `PLANNER_MODES_ENABLED` remains unset; no public rollout, no flag change. Any enablement decision belongs to the human reviewer.
* **Phase 5 scope** (adaptive replanning, reconciliation of "needs more work", re-planning an expanded Roadmap period) is untouched, and none of it was started here.

## Explicit answers

| Question | Answer |
| --- | --- |
| **Does Mastery produce a deliberate progression rather than a generic task list?** | **Yes.** Every item carries one of six stages, the stage order is enforced (`RECALL_BEFORE_LEARNING`, `PRACTICE_BEFORE_LEARNING`, `MISTAKE_REVIEW_BEFORE_PRACTICE`, `MASTERY_CHECK_NOT_TERMINAL`), retrieval is deliberately spaced (`MISSING_LATER_RETRIEVAL`), and the review UI presents the progression as stage groups rather than a flat task list. Live smoke: 8–17 staged items per chapter, legal stages and stage-legal intents every time. |
| **Can covered/high-confidence material avoid unnecessary relearning?** | **Yes.** A unit covered with confidence ≥ 4 receives no learning item and no separate orientation item (`UNNECESSARY_RELEARNING` and `MISSING_UNDERSTAND` are both conditional on the student's own signals), while a not-covered unit must be taught (`MISSING_LEARN`). The "mostly covered" live scenario produced no re-teaching. |
| **Is meaningful recall present?** | **Yes.** At least one `ACTIVE_RECALL` per unit, always after that unit's learning; on horizons ≥ 14 days a second retrieval lands ≥ 3 days after the unit's last learning item, and the prompt asks for retrieval on both sides of practice so it is not clustered at the end. |
| **Is meaningful practice present?** | **Yes.** Every unit needs a practice-family item (`MISSING_PRACTICE`), it must follow the unit's learning, and each unit must reach its depth-scaled effort floor while a HIGH-priority unit must reach its practice floor (`INSUFFICIENT_TOPIC_WORK`, `INSUFFICIENT_PRIORITY_ALLOCATION`). |
| **Can mistake review occur before practice?** | **No.** `MISTAKE_REVIEW_BEFORE_PRACTICE` rejects it, asserted directly and through a dated variant of the fixture. |
| **Does every normal plan end with a Mastery Check?** | **Yes.** One `ASSESS` check, ≤ 240 minutes, covering every HIGH-priority unit and ≥ 2 units in a multi-unit chapter, is required and must be the plan's last item (`MISSING_MASTERY_CHECK`, `MASTERY_CHECK_NOT_TERMINAL`, `CHECK_SCOPE_TOO_NARROW`, `PRIORITY_MISSED_IN_CHECK`). The single-unit short-horizon fixture is the only case where chapter-level coverage is trivially satisfied, and it still ends with its check. |
| **Does completing the Mastery Check automatically mark anything mastered?** | **No.** Completing it is an ordinary Quest status change. Asserted against a real database: no SubjectNode is created or updated, no plan or revision is written, no Quest is created or rescheduled, the plan's state, active revision and version are unchanged, and the projection still reports workflow state only. |
| **Does Quest completion imply mastery?** | **No.** Quest completion is execution state. Nothing in the planner, Focus settlement, or the mastery projection derives coverage, confidence or mastery from it; the progress module's own tests assert that a failed or missing Quest counts as outstanding and that no label claims ability. |
| **Is any check result explicitly user-reported rather than inferred?** | **There is no result at all** — see §14. The mode shows only the check's workflow state, which is ordinary Quest execution. A user-reported result was deliberately not built, because no safe persistence exists in this phase; nothing is inferred in its place. |
| **Can NEEDS_MORE_WORK create or reschedule work automatically?** | **No**, and it cannot arise: no result state exists to trigger it. No automatic Quest creation, rescheduling, regeneration or mutation of completed work was added anywhere in the mode. |
| **Does confirmation still create ordinary Quests only?** | **Yes.** A real-database test confirms ordinary `PENDING` Quests with `targetMinutes == requiredMinutes`, canonical rewards, `subjectNodeId: null`, no XP/ledger/quota writes at confirmation, no SubjectNode progress, A1 "Done when" text, and normal link lineage — and a real Focus session on one of those Quests settles and replays exactly as any other Quest does. |
| **Are A1 and the shared Phase 3 pipeline reused?** | **Yes.** One Smart Setup catalog and entry point (with shared unit detectors), one constraint model with an explicit applicability map, one priority model, one Definition of Done, one deterministic semantic gate, one critic/repair mechanism, one bounded pipeline with the same 3+2 call budget and the same operation deadline. New code was added only where the mode genuinely differs: the progression policy, its prompt/payload, its feasibility, and its presentation. |
| **Is Classic Planner still independently usable?** | **Yes.** Hash-identical files, no cross-imports, no history migration, no lineage inference, no quota change, and the flag-off experience is asserted unchanged. |
| **Are Exam and Roadmap unchanged?** | **Yes.** Both suites pass unchanged, no validator or prompt was weakened, Roadmap still confirms strategic plans with zero Quests and still expands a selected period under its own quota, and the only shared-code edits are de-duplications with behaviour pinned by tests. |
| **Is Phase 5 safe to begin?** | **Not yet — await review.** Mastery completes the three-mode surface with no migration and a conservative data model, and live generation is reliable in the synthetic smoke. What is not established is breadth (three chapters, one provider, a rate-limited fallback), the deliberately undecided check-result persistence path, an unapplied reviewed migration ledger, and any enablement decision. Phase 4 stops here; nothing in A2, A3, replanning, rescheduling or rollout was started. |
