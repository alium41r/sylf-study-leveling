# Sylf AI Planner Modes — Phase 2.5 report: Planning Intelligence (Addendum A1)

Date: 25 September 2026. Scope: **Addendum Phase A1 only**, applied to the gated Exam Planner as shared Planner Modes capability.

Phase 0 architecture is unchanged. Phase 1 remains the persistence, capacity, revision, operation, quota, lineage and materialization foundation. Phase 2's Exam Planner remains the mode implementation. A1 augments it: Smart Plan Setup, hard/soft constraints, topic priority signals, Definition of Done, and a semantic plan critic with bounded targeted repair.

Nothing from A2 (spaced-retrieval scheduler, cognitive-load shaping, Core/Stretch, Coverage Map) or A3 (preference learning, friction feedback) was implemented. No Course Roadmap, no Mastery, no adaptive replanning, no autonomous schedule mutation, and no public rollout. `PLANNER_MODES_ENABLED` is still unset everywhere and Planner Modes remains disabled.

---

## 1. Current repository reconciliation

Read in full before any edit: [Sylf_AI_Planner_Modes_PRD_260924_003225.pdf](../../specifications/Sylf_AI_Planner_Modes_PRD_260924_003225.pdf) (24 pages) and [Sylf_AI_Planner_Intelligence_Addendum_v1.0.pdf](../../specifications/Sylf_AI_Planner_Intelligence_Addendum_v1.0.pdf) (13 pages), extracted to text; [AI_PLANNER_MODES_PHASE_0_ARCHITECTURE_REPORT.md](AI_PLANNER_MODES_PHASE_0_ARCHITECTURE_REPORT.md), [AI_PLANNER_MODES_PHASE_1_REPORT.md](AI_PLANNER_MODES_PHASE_1_REPORT.md), [AI_PLANNER_MODES_PHASE_2_REPORT.md](AI_PLANNER_MODES_PHASE_2_REPORT.md). The Addendum was treated as additive to the PRD.

Source hashes at reconciliation (SHA-256):

| Document | Hash |
| --- | --- |
| [Sylf_AI_Planner_Modes_PRD_260924_003225.pdf](../../specifications/Sylf_AI_Planner_Modes_PRD_260924_003225.pdf) | `8271e168…028582` |
| [Sylf_AI_Planner_Intelligence_Addendum_v1.0.pdf](../../specifications/Sylf_AI_Planner_Intelligence_Addendum_v1.0.pdf) | `a73e0dcc…c4f49f` |
| [AI_PLANNER_MODES_PHASE_0_ARCHITECTURE_REPORT.md](AI_PLANNER_MODES_PHASE_0_ARCHITECTURE_REPORT.md) | `f6e80a2a…de87eb` |
| [AI_PLANNER_MODES_PHASE_1_REPORT.md](AI_PLANNER_MODES_PHASE_1_REPORT.md) | `05bf2b2a…3d8f1` |
| [AI_PLANNER_MODES_PHASE_2_REPORT.md](AI_PLANNER_MODES_PHASE_2_REPORT.md) | `8daeac53…3fc437` |

Working tree: 127 tracked files were already modified by unrelated concurrent work (settings, Calendar, Goals, System shell, audio, mobile, motion, Focus, cosmetics) before this phase began, and `lib/planner`, `lib/ai/planner`, `app/components/planner` and `__tests__/planner` are untracked additions from Phases 1–2. **No reset, checkout, revert or stash was performed**, and no unrelated change was modified or dropped.

Legacy Planner state was verified byte-for-byte against hashes captured at the start of this session:

| File | Hash before and after | Conclusion |
| --- | --- | --- |
| `app/api/ai-planner/route.ts` | `b7f49aca…66c07f` (unchanged; mtime 7 Sep) | Classic Planner endpoint untouched |
| `lib/ai/orchestrator.ts` | `2b91d55e…2dee9` (unchanged; mtime 25 Sep 13:09, pre-session) | Concurrent model-config edit preserved, not caused by this phase |
| `lib/ai/planning-engine.ts` | `cbd73cc7…72977` (unchanged) | Untouched |

`app/system/components/PlannerTab.tsx` (mtime 25 Sep 06:29, Phase 2) was read but not modified. Phase 2's architecture matches its report; the only Phase-2-to-Phase-2.5 differences are additive extensions described in §14.

Files changed by this phase (28):

- New shared planner modules: `lib/planner/constraints.ts`, `done.ts`, `priority.ts`, `semantic.ts`, `smart-setup.ts`.
- New provider-side modules: `lib/ai/planner/critic.ts`, `lib/ai/planner/repair.ts`.
- Extended: `lib/planner/contracts.ts`, `exam-fields.ts`, `exam-policy.ts`, `exam-client.ts`, `telemetry.ts`, `lib/ai/planner/exam.ts`, `lib/planner/server/{core,generation,operations,revisions,materialize,http}.ts`, `app/components/planner/ExamPlanner.{tsx,module.css}`.
- Tests: new `__tests__/planner/{intelligence-a1,intelligence-critic,classic-coexistence}.test.ts`, `intelligence-ui.test.tsx`, `intelligence-provider-smoke.test.ts`; extended `database.test.ts` and `client-boundary.test.ts`.

## 2. Smart Plan Setup architecture

`lib/planner/smart-setup.ts` implements the required pipeline exactly:

```
minimum normalized input
  → deterministic uncertainty extraction (pure function of the normalized input)
  → closed question catalog + strict question schema
  → at most 3 questions (SMART_QUESTION_MAX)
  → answers merged back into the normalized planning input
```

* **Bounded.** `smartQuestions(input, limit = 3)` clamps the limit to `SMART_QUESTION_MAX = 3`, sorts candidates by a fixed product rank and truncates. It returns `[]` whenever no detector finds a material uncertainty. The UI renders the card only when the array is non-empty.
* **Deterministic-first.** Every detector is a pure function of the normalized input, so the client, the server and the tests cannot disagree about which questions are justified. Question selection therefore adds **zero** provider calls.
* **Closed catalog.** Four approved reason codes, each with a stable meaning, an affected planning dimension, a concise "Why this matters" hint and closed choices only (no free text anywhere):

| Reason code | Dimension | Fires when | Answers → material effect |
| --- | --- | --- | --- |
| `PRIORITY_UNCLEAR` | PRIORITIZATION | ≥2 topics, no priority set, a confidence tie that coverage/difficulty cannot separate, and required work above half the usable minutes | choose a topic → `priority: HIGH` (+ source), raising its work floor and practice floor and moving it earlier |
| `CONSTRAINT_STRENGTH_UNCLEAR` | SCHEDULING | `preferredMinutes` is binding (`< ceil(required/usableDates)`) and no session constraint exists | `PREFERENCE` → SOFT `SESSION_LENGTH_PREFERENCE`; `REQUIRED` → HARD `MAX_SESSION_MINUTES` (may legitimately make a plan infeasible) |
| `SCOPE_SIZE_UNCLEAR` | SCOPE | a confirmed label is too broad to size (unit/chapter/module/section keyword, ≥8 words, >80 chars, or ≥3 comma/semicolon segments) | `ONE_UNIT`/`SEVERAL_SUBTOPICS`/`FULL_SECTION` → topic `sizeSignal` (1×/1.25×/1.5× work floor) |
| `AVAILABILITY_PATTERN_UNCLEAR` | WORKLOAD | uniform non-zero daily minutes, ≥5 usable dates, and both an even spread and a consolidated pattern fit | `EVEN` → SOFT `EVEN_SPREAD_PREFERENCE`; `FEWER_LONGER` → SOFT `PREFER_FEWER_DATES` |

* **Bounded answer schema.** `SMART_ANSWER_OPTIONS` is a closed map from reason code to permitted values (`TOPICS` for the topic list, literal enums otherwise). `assertSupportedAnswers` rejects an unknown reason code (`UNSUPPORTED_SMART_QUESTION`), an unknown option (`UNSUPPORTED_SMART_ANSWER`), a duplicate reason code and more than three answers. `applySmartAnswers` is idempotent: re-applying an answer replaces the constraint it owns instead of stacking a contradiction, which is why the catalog — not live detection — is the validation authority.
* **Not an interview.** Questions are only emitted when a detector proves the answer can change sequencing, prioritisation, workload or feasibility. On the Phase 2 synthetic Exam fixture the detector set is empty: **the wizard asks nothing.** On the wizard's default synthetic input exactly one question is justified (`AVAILABILITY_PATTERN_UNCLEAR`), which is visible in the UI tests.

## 3. Hard vs soft constraint representation

`lib/planner/constraints.ts` adds the typed model from Addendum §3 plus the closed question vocabulary. Constraints live in the versioned input snapshot (`UserInputV1.constraints`, optional).

```
PlannerConstraintV1 { kind, strength: HARD|SOFT, value, preferenceWeight?, source, reasonCode? }
```

| Kind | Strength | Value | Deterministic meaning |
| --- | --- | --- | --- |
| `MAX_SESSION_MINUTES` | HARD | 15–240 | no item may exceed it |
| `UNAVAILABLE_WEEKDAY` | HARD | 0–6 | no item may be scheduled on that weekday |
| `SESSION_LENGTH_PREFERENCE` | SOFT | 15–240 | prefer items at or below it |
| `EVEN_SPREAD_PREFERENCE` | SOFT | 30–720 | prefer each date's planned total at or below it |
| `PREFER_FEWER_DATES` | SOFT | 1–90 | prefer at most that many planned dates |

Enforcement and representation rules:

* **Strength is bound to kind by schema.** A SOFT `MAX_SESSION_MINUTES` or a HARD `SESSION_LENGTH_PREFERENCE` is a validation error, so a preference can never be silently promoted to a limit and a limit can never be softened.
* **Hard constraints are validated deterministically** by `validateHardConstraints`, which runs inside `validateDraft` — therefore before a draft can be displayed, again after a semantic repair, and again at confirmation and materialization. Codes: `HARD_SESSION_LIMIT_EXCEEDED`, `HARD_UNAVAILABLE_DAY_USED`.
* **The confirmed availability grid is itself a hard constraint.** `unavailableWeekdays` derives it from zero-minute weekdays plus explicit `UNAVAILABLE_WEEKDAY` entries, and `constraintCapacityInput` (used by feasibility, proposal validation, sealing, editing, confirmation and the review UI) zeroes those days so "I cannot study on Friday" is enforced by the same capacity maths that already existed.
* **Soft constraints never touch capacity.** `constraintCapacityInput` derives only from `examAvailabilityInput` plus hard weekday exclusions; soft kinds are absent from every feasibility path. A test asserts that adding all three soft kinds leaves `examFeasibility.status`, `availableMinutes` and `validateCapacity(...).feasible` identical.
* **Violations are explained, in one sentence.** `tradeoffExplanations` returns at most three concise sentences (`MAX_TRADEOFFS`), e.g. *"2 sessions are longer than your preferred 15 minutes because the confirmed dates and capacity could not fit the work otherwise."* `softConstraintStatus` returns `{total, satisfied, violated}` for the `soft_constraint_satisfied_rate` metric.
* **Localized violations also change placement.** A violated `SESSION_LENGTH_PREFERENCE` or `EVEN_SPREAD_PREFERENCE` becomes a bounded, item-scoped `PRIORITY_MISS` finding fed to the targeted repair, so a preference influences the schedule rather than only being reported. A violated `PREFER_FEWER_DATES` is a global property and stays an explanation only — it never triggers a whole-plan rewrite.
* **Sources.** `USER_EXPLICIT` and `DRAFT_EDIT` are accepted; `LEARNED_PREFERENCE` is present in the schema so A3 can extend it but is **rejected** today, because preference learning is not implemented and must not be implied.

## 4. Priority model

Priority and confidence are separate fields with separate effects.

* `ExamTopic` gains optional `priority` (`NEUTRAL`/`LOW`/`HIGH`), `prioritySource` (four user-only sources: `USER_EXPLICIT`, `USER_ASSESSMENT_WEIGHTING`, `USER_TEACHER_EMPHASIS`, `USER_MUST_COVER`) and `sizeSignal`. The schema **requires a source for any non-neutral level**, so an inferred or "official" weighting cannot enter a plan unnoticed, and an absent level is `NEUTRAL`.
* Coarse planning multipliers: `HIGH 1.25`, `NEUTRAL 1`, `LOW 0.75`, applied to the boundable work floor and to a separate practice floor. `NEUTRAL` is exactly `1`, so an untouched plan is byte-for-byte unchanged (the Phase 2 fixtures keep their exact floors).
* Behaviour distinctions, all deterministic:
  * **HIGH + LOW confidence** → deeper treatment (×1.25 floors, larger `topicPracticeFloor`) and earlier treatment: on a STANDARD plan with ≥6 dates, the topic's first item must fall inside the first third of the horizon, or `PRIORITY_ORDER` fails.
  * **HIGH + HIGH confidence** → reinforcement, never relearning. Priority cannot create a coverage requirement: the covered-topic rule (`UNJUSTIFIED_RELEARNING`) is unchanged and priority never adds a LEARN item. A test asserts a HIGH-priority covered+confident topic validates with no LEARN item and fails only if a LEARN item is added.
  * **LOW + LOW confidence under a tight deadline** → bounded coverage: the ×0.75 factor lowers the floor and `priorityTradeoffNotes` states *"…is lower priority, so it receives bounded coverage rather than the deepest treatment."*
  * **Practice, not only learning.** `topicPracticeFloor` is enforced by `INSUFFICIENT_PRACTICE_ALLOCATION` for every topic, so priority changes practice allocation independently of initial learning.
* Sylf never derives a level: `priorityLevel` defaults to `NEUTRAL`, no code path infers priority from confidence, difficulty or coverage, and no assessment weighting is invented.

## 5. Definition of Done implementation

`lib/planner/done.ts` implements Addendum §9 as a shared planner contract plus a bounded validator, with **no Quest schema change**.

* Every item in `ModelProposalV1`/`ValidatedDraftV1` gains an optional `completionCriteria`. `normalizeProposal` resolves it for **every** item before validation, so a criterion always exists on a sealed draft, on an edited draft and on a materialized Quest.
* Validation rules (codes in `completionCriteriaIssue`): 12–240 characters; ≤40 words; a fixed list of observable action verbs; rejection of mastery language (`fully understand`, `master…`, `be confident`, `know everything`, `guarantee`); rejection of invented official requirements and counts (`marks`, `mark scheme`, `grade A–E`, `official`, `exam board`, `past paper`, `12 questions`); and any stated duration must fit the item's own planned minutes.
* **Model text is never trusted.** `resolveCompletionCriteria` keeps a criterion only when it passes every rule and otherwise substitutes the per-intent default, so a mastery claim or an invented question count can never reach a user, a Quest or a plan. The defaults mirror the Addendum examples ("Recall the core points from memory, then check and correct the gaps.") and are unit-tested to pass their own validator.
* `validateDraft` re-checks any stored criterion, so a later writer (including a user edit) cannot introduce one that breaks the rules.
* `EditSchema` accepts `completionCriteria`, so the criterion is user-editable with a 12–240 bound.
* **Materialization path:** `mapQuest` appends `Done when: <criterion>` to the Quest description — the safest existing user-facing field. No Quest column, no new table, no legacy-Quest change: a manually created Quest still has a null description, and the criterion is never written into planner-unrelated Quests.
* **UI:** the criterion is secondary text under the item title (`Done when: …`) and an editable field inside the collapsed item details, with the note "Claiming mastery is not a completion condition."

## 6. Semantic critic

Two layers share one closed issue vocabulary (`lib/planner/semantic.ts`): `SEQ_WEAK`, `TASK_VAGUE`, `DENSITY_SPIKE`, `REDUNDANT_TOUCH`, `PRIORITY_MISS`, `ROBOTIC_PATTERN`.

1. **A deterministic semantic gate that always runs** — `deterministicSemanticIssues` is invoked inside `validateDraft`, so it runs on generation, on every edit and at confirmation/materialization: blank item description → HIGH `TASK_VAGUE` (fails closed), thin description, duplicate purpose (same topic + intent + date), planned-minute load spike above 2× the median and 100 minutes, clustered retrieval (all recall after the last practice for a topic with ≥3 items), repeated title stems, and localized soft-preference misses.
2. **A bounded AI critic** — `lib/ai/planner/critic.ts` with its **own system prompt and its own strict schema** (`CriticReportV1Schema`: ≤12 issues, ≤20 item refs per issue, severity enum, patch instruction 10–300 characters). It receives the normalized input, the validated plan in proposal-local `iN` tokens, the typed constraints and the per-topic priority/confidence/practice context. It never receives durable identifiers, and cannot change hard constraints, the exam date, the confirmed scope or the horizon; the prompt forbids inventing items, dates, counts and identifiers. Any transport error, abort, empty/oversized body, non-JSON, schema violation or reference to an item the plan does not contain is reported as `UNAVAILABLE` — never partially trusted and never fatal to the operation.

Even for the same provider and model the generator, critic and repair use **three separate prompts and three separate schemas**. Critic findings are never shown to the user; only the improved draft, plus a deterministic tradeoff sentence when a supplied preference could not be honored.

## 7. Targeted repair policy

`lib/ai/planner/repair.ts`:

1. `repairTargets` collects the deduplicated item references from the merged findings, capped at 20 items.
2. The repair request contains the flagged items plus the rest of the plan only as context; the response schema (`RepairPatchV1Schema`) requires **exactly one entry per requested ref**, with the same `ref` and the same `topicRef`.
3. `mergeRepair` rejects a patch that misses a ref, adds a ref, duplicates a ref, names an unknown ref or rebinds a topic (`REPAIR_SET_MISMATCH`, `REPAIR_OUT_OF_SCOPE`, `REPAIR_UNKNOWN_REF`, `REPAIR_TOPIC_CHANGED`). Unaffected items are copied by identity, so a repair can never rewrite the rest of the plan.
4. The merged proposal is re-run through `validateExamProposal` (structural rules + HARD constraints + capacity) and the deterministic semantic gate. **If anything fails, the whole patch is discarded** and the previously validated plan is kept.
5. There is exactly one critic call and at most one repair call: no `critic → repair → critic → repair` nesting, and no SDK retries inside the stage.
6. The sealed revision records a content-free `semanticReview`: `{schemaVersion, critic, issues, repaired, deterministicIssues, softViolations}` with `critic ∈ {PASSED, ISSUES_REPAIRED, UNREPAIRED, UNAVAILABLE, DISABLED, NOT_RERUN}`. A user edit re-runs the deterministic gate and records `NOT_RERUN` rather than implying the edited content was critically reviewed (edit saves are quota-free and must not spend provider calls).

## 8. Provider-call and quota budget

| Bound | Value |
| --- | --- |
| `EXAM_GENERATION_CALL_BUDGET` | 3 (initial, at most one validation repair, at most one provider fallback — unchanged from Phase 2) |
| `EXAM_SEMANTIC_CALL_BUDGET` | 2 (one critic, one targeted repair) |
| `EXAM_PROVIDER_CALL_BUDGET` | **5 total per generation operation** |
| `EXAM_SEMANTIC_BUDGET_MS` | 30 s slice of the operation deadline |
| Operation deadline (`EXAM_TIMEOUT_MS`) | 90 s, unchanged, under the 120 s route window |
| Route window | `maxDuration = 120`, unchanged |

The semantic stage runs on its own child abort signal bounded by `min(now + 30 s, deadlineAt − 5 s)`. If the slice is exhausted or already past, the stage is skipped and recorded as `DISABLED`; an expired semantic budget **never** turns an already-valid plan into a failed operation, and the parent operation deadline still governs delivery. `generation.ts` caches one adapter instance per provider/model for the operation, so the critic and repair reuse the generator's adapter instead of constructing new SDK clients (and the Phase 2 single-`getAdapter` expectation still holds).

**Quota policy (explicit):** one user-visible generation operation owns the whole pipeline. A single Phase 1 revision-operation quota reservation is taken *before* any provider call and settled once, only when a validated draft is sealed; setup questions, the critic and the repair never charge separately, and failure/cancellation releases the original reservation once. Provider spend is tracked separately and unchanged in the existing `AiUsageLog` through the existing usage logger, now labelled `workload: "exam" | "exam_critic" | "exam_repair"`.

## 9. Exam Planner integration

A1 augments the Phase 2 Exam Planner; it does not rewrite it. All Phase 2 validators are intact and unchanged in behaviour: confirmed scope mismatch, coverage for unseen topics, justified relearning only for covered topics, per-topic recall/review and practice, mistake review for low-confidence topics, later-date spaced recall, dependency order and same-day ordering, exam-day policy, mixed practice, required mock, final review near the exam, overlapping stages, capacity and reserve, triage behaviour, item bounds and exclusion semantics.

A1 additions on top:

* generation payload now carries per-topic `minimumMinutes`, `minimumPracticeMinutes` and `priorityWindowEnd`, and the system prompt states the priority, constraint-strength and completion-condition rules;
* feasibility and capacity now include HARD weekday exclusions;
* the review shows the tradeoff explanations, the honored-preference count and the priority notes;
* the wizard asks 0–3 closed smart questions when justified, adds one lightweight priority select per topic, and shows the session-length strength (`Required / cannot break` vs `Preference / try to honor`) only when that question is justified.

## 10. Classic Planner coexistence verification

* `app/api/ai-planner/route.ts` is byte-identical to the session start hash and contains no `lib/planner` import, no `PlannerPlan`/`PlannerRevision`/`PlannerQuestLink` reference and no `PLANNER_MODES_ENABLED` check. It keeps its own `AiStudyOrchestrator` and `reserveQuota(userId, "planner")` path.
* `lib/ai/orchestrator.ts` and `lib/ai/planning-engine.ts` contain no Planner Modes import — and no Planner Modes module imports them either (asserted in both directions by `classic-coexistence.test.ts`).
* `PlannerTab` still renders `AiPlannerPanel` (legacy endpoint + completion callback) when the server capability reports the gate off; `ExamPlanner` is selected only when `capabilities.enabled` is true. `exam-entry.test.tsx` re-verifies both branches, including the quick-modal legacy path.
* Planner Modes still cannot be reached with the flag off: `requireEnabled()` returns 404 from every planner route, and the capability route reports `enabled: false`.
* No Classic Planner history was migrated, no PlannerPlan lineage was inferred from legacy AI quests, and the legacy planner was not re-plumbed to use Planner Modes internally.

## 11. Privacy and telemetry

* New content-free events: `smart_question_asked` / `smart_question_skipped` (bounded question count), `smart_setup_applied` / `smart_setup_skipped` (priority/size/constraint counts), `soft_constraint_evaluated` (satisfied/violated counts) and `semantic_review_completed` (critic state, reported-issue, repaired and soft-violation counts, provider-call count). `proposal_edited` now additionally carries `itemsEdited` and `criteriaEdited`.
* The telemetry boundary is whitelist-based: two UUIDs, fifteen non-negative bounded counters, one fixed critic-state enum and the closed reason-code enum. There is no free-text field, so syllabus content, smart-question answers, completion criteria, prompts, critic payloads and provider output cannot be logged even by accident.
* No secret, provider payload, raw error object or academic content is logged. No client Prisma, service-role exposure, mobile Bearer auth, Realtime publication of private planner payloads, or chain-of-thought storage/display was introduced. The extended `client-boundary` test now also proves that `constraints`, `done`, `priority`, `semantic`, `smart-setup`, `exam-fields`, `exam-policy`, `exam-client`, `telemetry` and the three new provider modules keep the correct `server-only` boundary.
* `npm run audit:secrets` passed, and the same credential-pattern scan over the 33 planner source/test files (including untracked files) found no matches; the only hit was the pre-existing `service_role` assertion string in the Phase 1 database test.

## 12. Tests and build

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Source is clean; the command also reports 89 pre-existing errors inside the stale dev-server artifact `.next/dev/types/validator.ts`. Excluding that generated directory (`npx tsc --noEmit -p scratch/tsconfig.verify.json`, a copy of the root config whose only change is `exclude: [".next"]`) exits 0. The authoritative `npm run build` TypeScript step also passed. |
| `npx prisma validate` | Passed (no schema change; `SCHEMA_BUILD_VERSION` unchanged at 19) |
| Planner suite (no DB) | 10 files / **113 tests passed**, 45 skipped (3 opt-in files) |
| New A1 tests | `intelligence-a1` 26, `intelligence-critic` 15, `intelligence-ui` 5, `classic-coexistence` 4 → **50 new tests** |
| Disposable PostgreSQL harness (`node scripts/test-planner-postgres.mjs`) | 11 files / **154 tests passed**; includes 3 new real-database A1 tests and all Phase 1/2 DB tests |
| Full repository suite | **131 files / 1374 tests passed, 0 failed**, 45 skipped |
| `npm run audit:secrets` | Passed |
| `npm run mobile:build` + `npm run mobile:verify` | Passed; mocks disabled, no server-only symbols or secrets |
| `npm run build` | Passed: compiled, TypeScript finished, 88 static pages, exit 0 |
| ESLint on every new/changed A1 file | No errors or warnings. Repository-wide `eslint .` reports 1,510 pre-existing errors and 9,912 warnings (including one long-standing `react-hooks/set-state-in-effect` in the Phase 2 `ExamPlanner` sessionStorage restore), so lint is not a gate here; this phase adds none. |

Required A1 coverage, all present and passing:

* **Smart Setup** — zero questions when unnecessary; exactly one when justified; never more than three (and `limit` is clamped); unknown reason code / unknown option / duplicate / four-answer payloads rejected; answers materially change the affected normalized dimension (priority, constraint strength, scope size); every question carries a reason code from the closed catalog.
* **Hard/soft** — hard constraint never violated (schema, validator and capacity paths); a critic repair that would exceed a HARD session limit is rejected; a soft preference influences placement through a bounded segment repair without regenerating the plan; adding every soft kind leaves feasibility and capacity identical; a violated preference yields exactly one concise sentence; strength cannot be swapped for kind.
* **Priority** — independent from confidence; high-priority weak topics get a larger floor and an early start (the window rule bites when violated); high-priority strong topics are not forced to relearn; a non-neutral level without a user source is rejected; Sylf never assigns a level.
* **Definition of Done** — every actionable item has one after generation; every default passes its own validator; length, observability, mastery language, invented official requirements, invented counts and duration inconsistency are each rejected by code; model mastery text is replaced by the bounded default.
* **Critic** — no issues → the original validated plan; `SEQ_WEAK`, `TASK_VAGUE` and `PRIORITY_MISS` each produce a targeted repair; malformed/untrustworthy/unavailable output fails safely five different ways; a structurally invalid repaired segment is rejected; out-of-scope and topic-rebinding patches are rejected; a repair cannot override a hard constraint; no whole-plan regeneration (unaffected items are compared for identity); the provider call count is bounded by `EXAM_PROVIDER_CALL_BUDGET`; an exhausted semantic budget degrades to `DISABLED`; a cancellation during the semantic stage leaves the plan intact.
* **Exam regression** — all Phase 2 fixtures and validators still pass; generation still creates zero Goals and zero Quests before confirmation; confirmation still uses the Phase 1 transaction (including `start_study_session`/`settle_study_session_atomic` replay); recovery remains idempotent; the A1 review and completion criteria are stored in the sealed snapshot and appear on materialized Quests while a manually created Quest keeps a null description.
* **Classic Planner** — see §10.

## 13. Provider smoke result

Bounded live smoke tests used the synthetic scope fixture and existing development credentials, printing and recording no credentials and no model content (`/tmp/sylf-planner-phase2_5/`).

**Provider availability changed since Phase 2 and is now the better news.** Phase 2's primary HTTP 402 and fallback HTTP 503 did **not** reproduce:

| Run | DeepSeek `deepseek-v4-pro` | Gemini `gemini-2.5-flash` | Outcome |
| --- | --- | --- | --- |
| Full pipeline, run 1 | responded, ~5.5k tokens | not reached | rejected (`INFEASIBLE_CAPACITY`, `MISSING_SPACED_RECALL`, `INVALID_EXAM_INTENT_STAGE`) |
| Full pipeline, run 2 | responded ×2, ~4k tokens each | responded ×3 (fallback generation 7.1k, critic 3.7k, repair 5.6k tokens, all STOP) | **validated**: 25 items, exactly 5 provider calls, 84 s; critic reported 5 issues; the repair was merged and then **rejected** by the deterministic gates → `UNREPAIRED`; every item carried a bounded completion condition |
| Full pipeline, run 3 | responded ×2, ~4k tokens each | responded, STOP, ~7.9k tokens | rejected (`MISSING_SPACED_RECALL` ×2, `INVALID_EXAM_INTENT_STAGE`) |
| Critic/repair only, on a validated fixture plan | — | responded ×1 | critic returned 3–4 live issues (`SEQ_WEAK`, `TASK_VAGUE`, `REDUNDANT_TOUCH`, `ROBOTIC_PATTERN`); the repair payload was rejected (`REPAIR_UNAVAILABLE` once, `REPAIR_SCHEMA` once) and the validated plan was kept |

Interpretation, stated plainly: **live end-to-end success is not reliable in this environment** (1 of 3 bounded full-pipeline runs produced a validated draft), and no successful live-provider → sealed database draft → confirmed Quest chain was demonstrated in this phase either. The three rejection codes are all **pre-existing Phase 2 Exam rules**, not new A1 rules, and provider reachability is now established for both configured providers, unlike Phase 2. The semantic stage itself is verified live: the critic ran three times and returned bounded, schema-valid findings every time, and the repair was never trusted when its payload was malformed or its result failed validation — it failed safe and the validated plan was kept. Validation and failure handling were not weakened to make these runs pass. Deterministic provider fixtures (not live calls) verify the full chain through the disposable-PostgreSQL harness, and timeout/abort/repair behaviour remains covered by deterministic adapter tests rather than claimed as live timing guarantees.

## 14. Deviations from the PRD/Addendum, and why

1. **No AI step in question selection.** The Addendum allows "bounded AI question-selection if useful". Deterministic extraction over a four-code closed catalog already produces at most three candidates, so wiring an extra provider call would add latency, cost and failure surface to the *setup* step for no additional information. The closed catalog plus closed option validation is what actually prevents arbitrary data collection, and it is enforced regardless of who selects the question. Recorded as a deliberate deviation, not an omission.
2. **Question detection is input-only.** `smartQuestions` deliberately uses coarse, normalized-input signals rather than the authoritative availability snapshot, so the client, the server and the tests cannot disagree about which question is justified. It only decides whether to *ask*; the real capacity check remains `validateCapacity` on the server.
3. **The semantic gate is deterministic-mandatory and AI-attempted.** This is the precise mechanism behind the "structural + semantic" acceptance criterion: the deterministic semantic gate runs on every generated, edited and confirmed draft and fails closed on a HIGH finding, while the bounded AI critic is attempted once per generation and its outcome is recorded (`PASSED` / `ISSUES_REPAIRED` / `UNREPAIRED` / `UNAVAILABLE` / `DISABLED`). Failing an otherwise-valid generation because a *quality-improvement* call could not run would be a product regression on a provider boundary this environment has already shown to be unreliable, so the draft is delivered with the critic outcome recorded rather than hidden. An unavailable or malformed critic is never treated as a pass.
4. **Soft-preference findings reuse the `PRIORITY_MISS` code.** The Addendum's vocabulary has no dedicated soft-preference code, and its critic responsibilities explicitly include "check whether the plan meaningfully uses the user's stated priorities and soft preferences". Localized preference misses are therefore reported as `PRIORITY_MISS` with an instruction that names the preference; the vocabulary stays closed at six codes.
5. **`PREFER_FEWER_DATES` never drives a repair.** It is a property of the whole plan; honoring it would require a global rewrite, which the Addendum forbids by default. It is explained to the user instead.
6. **Invalid Definition-of-Done text is replaced, not fatal.** Resolving to the bounded per-intent default guarantees "every actionable item has a completion condition" without spending the bounded repair budget on cosmetic prose, and the rejected text is discarded rather than surfaced. Stored criteria are still validated strictly, so a later writer cannot introduce one.
7. **`LEARNED_PREFERENCE` is rejected; `DRAFT_EDIT` is accepted but not yet produced.** The schema anticipates A3 without implementing learning, and it does not claim that edits are already being inferred into preferences.
8. **New optional snapshot fields, no migration.** `UserInputV1.constraints`, `ExamTopic.priority/prioritySource/sizeSignal` and item `completionCriteria` are optional, and `ValidatedDraftV1.semanticReview` is optional, so every sealed Phase 1/2 snapshot keeps its original digest and stays readable and confirmable. Nothing is injected into a historical snapshot: `validateDraft` validates but never mutates, and completion criteria for older drafts are resolved at read/materialization time.
9. **One adapter instance per provider/model per operation.** The critic and repair take an explicit adapter hook so that (a) unit tests never touch the network and (b) the operation reuses one client per target. `generation.ts` always supplies it in production.
10. **One additional route-visible error code.** `plannerRoute` now passes three user-facing limit codes (`INVALID_COMPLETION_CRITERIA`, `HARD_SESSION_LIMIT_EXCEEDED`, `HARD_UNAVAILABLE_DAY_USED`) through instead of collapsing everything to `INVALID_DRAFT`, so the UI can explain a limit the user themselves set. Critic and validator internals still collapse to `INVALID_DRAFT`/`PLANNER_UNAVAILABLE`.

## 15. Remaining blockers before Course Roadmap

* Keep Planner Modes gated and review this phase before starting Roadmap.
* **Live provider end-to-end reliability is still not established**: 1 of 3 bounded full-pipeline runs validated, and no live sealed-draft → confirmed-Quest chain was demonstrated. This is an environment/provider-quality matter; the fix is not to weaken the Exam validators. The pre-existing failure codes (`MISSING_SPACED_RECALL`, `INVALID_EXAM_INTENT_STAGE`, `INFEASIBLE_CAPACITY`, `MISSING_MISTAKE_REVIEW`) are worth their own investigation before any enablement decision, because they are what actually stands between this pipeline and a reliable live success.
* The live targeted repair has never produced an accepted patch (one transport failure, one schema violation, one structural rejection). Repair fails safe in every case, but its live acceptance rate is unproven; the deterministic fixtures prove the mechanism, not the live hit rate.
* The target environment's migration ledger/schema must still be verified and the existing additive planner migration applied through the normal reviewed Prisma workflow before enablement. The historical empty-database bootstrap gap (`ItemCategory`) remains untouched.
* `npx tsc --noEmit` reports 89 pre-existing errors from the stale `.next/dev/types/validator.ts` dev artifact. Running `next build` (or a dev server) regenerates it; the source tree and the build's own TypeScript step are clean. Worth resolving as repository hygiene, not a planner issue.
* Roadmap-specific questions A1 deliberately does not answer: whether a long-horizon mode reuses these same detectors (its availability model is weekly totals, so `AVAILABILITY_PATTERN_UNCLEAR` becomes genuinely unclear there), how milestone-level Definition of Done interacts with item-level criteria, and how the semantic stage should be budgeted for a mode whose operation may expand a milestone rather than generate a whole plan.

## Explicit stop-gate answers

| Question | Answer |
| --- | --- |
| **Can Smart Setup ask zero questions?** | **Yes.** The Phase 2 Exam fixture produces `[]` — detectors fire only when a specific answer would change sequencing, prioritisation, workload or feasibility, and the UI renders nothing when the list is empty — asserted at unit level and in the wizard, where a non-uniform availability grid removes the last justified question and the generation request carries no constraint at all. |
| **Is it bounded to at most 1–3 by default?** | **Yes.** `SMART_QUESTION_MAX = 3`, and `limit` is clamped to it, so no caller can widen the flow; answers are bounded to three distinct reason codes. |
| **Can a hard constraint ever be overridden by AI or critic?** | **No.** Hard constraints are validated deterministically inside `validateDraft` before display, again after any repair, and again at confirmation; a repair that violates one is discarded wholesale, and a generated plan that violates one never reaches the critic at all (proven by test, including an exhausted-generation case). |
| **Can a soft preference falsely make a plan impossible?** | **No.** Soft constraints are absent from every capacity and feasibility path; a test adds all three soft kinds and asserts identical feasibility and capacity. Only HARD constraints can change what fits, and only when the user marks them as required. |
| **Are topic priority and confidence independent?** | **Yes.** Separate fields, separate multipliers, no derivation in either direction; a non-neutral priority requires an explicit user source and Sylf never invents an official weighting. |
| **Does every actionable item have a bounded Definition of Done?** | **Yes.** `normalizeProposal` resolves one for every item, the rules are enforced (12–240 characters, ≤40 words, observable, no mastery claim, no invented official requirement) and the live validated run produced a compliant criterion on all 25 items. |
| **Has every displayed Planner Modes draft passed structural + semantic gates?** | **Yes, with the mechanism stated precisely.** Every displayed draft passes the structural gate and the always-on deterministic semantic gate (both enforced inside `validateDraft`, so generation, edit and confirmation all run them, and a HIGH finding fails closed). The bounded AI critic is additionally attempted once per generation and its outcome is recorded on the revision (`PASSED`/`ISSUES_REPAIRED`/`UNREPAIRED`/`UNAVAILABLE`/`DISABLED`); an unavailable or malformed critic is never recorded as a pass, and no critic finding is ever shown to the user. |
| **Does repair patch only affected segments by default?** | **Yes.** The patch must return exactly the requested item references, with unchanged topic bindings; unaffected items are copied by identity and asserted equal in tests. There is one critic call and at most one repair call — never a whole-plan regeneration and never a nested loop. |
| **Is Classic Planner still independently usable?** | **Yes.** Its endpoint, orchestrator and panel are unchanged (endpoint hash identical), it has no Planner Modes dependency in either direction, and it remains the selected experience whenever the gate is off. |
| **Can Planner Modes still be disabled without affecting Classic Planner?** | **Yes.** `PLANNER_MODES_ENABLED` is unset in every environment file and is only ever read; with it off every planner route returns 404, the capability route reports `enabled: false`, and the System planner renders the legacy panel with its own quota and completion behaviour. |
| **Is the system safe to begin Course Roadmap?** | **The shared foundation is ready; enablement is not.** A1's capabilities are shared, pure where they must be, versioned inside existing snapshots, and gated — so Roadmap can reuse the constraint model, priority signals, Definition of Done, question catalog and semantic stage without new persistence. What is *not* ready is live reliability: successful live generation remains intermittent and the live repair acceptance rate is unproven, so public enablement should not proceed on the strength of this phase. Await review and an explicit next-phase request. |

Phase 2.5 stops here. No A2, A3, Roadmap, Mastery, adaptive replanning or public rollout is included.
