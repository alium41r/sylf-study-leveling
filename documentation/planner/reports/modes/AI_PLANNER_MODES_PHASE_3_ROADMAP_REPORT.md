# Sylf AI Planner Modes — Phase 3 report: Course / Syllabus Roadmap + selected-period expansion

Date: 25 September 2026. Scope: **Phase 3 only** — Course / Syllabus Roadmap generation, roadmap review/edit/confirmation, and explicit selected-period ("Plan this month") expansion into ordinary Quests.

Phase 0 architecture is unchanged. Phase 1 remains the persistence, capacity, revision, operation, quota, lineage and materialization foundation. Phase 2's Exam Planner and Phase 2.5's planning intelligence (A1) are reused, not rebuilt: Smart Plan Setup, HARD/SOFT constraints, topic priority, Definition of Done and the semantic critic + targeted repair are shared by both modes.

No Mastery, no A2 (spaced retrieval, cognitive-load shaping, Core/Stretch, Coverage Map), no A3 (preference learning, friction feedback), no adaptive replanning, no autonomous rescheduling and no public rollout. `PLANNER_MODES_ENABLED` is still unset and Planner Modes remains disabled.

**No database migration was created or needed.** `planner_plan_bounds` already allows `mode IN ('EXAM','ROADMAP','MASTERY')` and `planner_revision_bounds` already allows `source IN ('GENERATE','EDIT','EXPAND','REBALANCE')` (`prisma/migrations/20260924010000_planner_foundation/migration.sql:143,146`). Roadmap structure lives in the existing bounded `PlannerRevision` snapshots.

---

## 1. Repository reconciliation

Read in full before editing: the Phase 0 architecture report, Phase 1 report, Phase 2 report, Phase 2.5 A1 report, the PRD and the Intelligence Addendum (both extracted from PDF). Source hashes at reconciliation:

| Document | SHA-256 |
| --- | --- |
| [AI_PLANNER_MODES_PHASE_0_ARCHITECTURE_REPORT.md](AI_PLANNER_MODES_PHASE_0_ARCHITECTURE_REPORT.md) | `f6e80a2a…de87eb` |
| [AI_PLANNER_MODES_PHASE_1_REPORT.md](AI_PLANNER_MODES_PHASE_1_REPORT.md) | `05bf2b2a…3d8f1` |
| [AI_PLANNER_MODES_PHASE_2_REPORT.md](AI_PLANNER_MODES_PHASE_2_REPORT.md) | `8daeac53…3fc437` |
| [AI_PLANNER_MODES_PHASE_2_5_INTELLIGENCE_A1_REPORT.md](AI_PLANNER_MODES_PHASE_2_5_INTELLIGENCE_A1_REPORT.md) | created in 2.5 |
| [Sylf_AI_Planner_Modes_PRD_260924_003225.pdf](../../specifications/Sylf_AI_Planner_Modes_PRD_260924_003225.pdf) | `8271e168…028582` |
| [Sylf_AI_Planner_Intelligence_Addendum_v1.0.pdf](../../specifications/Sylf_AI_Planner_Intelligence_Addendum_v1.0.pdf) | `a73e0dcc…c4f49f` |

The working tree still carries the pre-existing unrelated modifications (settings, Calendar, Goals, System shell, audio, mobile, motion, Focus, cosmetics) and the Phases 1–2.5 untracked additions. **No reset, checkout, revert or stash was performed.**

Legacy Planner isolation was re-verified by hash before and after this phase:

| File | Hash (unchanged) | Conclusion |
| --- | --- | --- |
| `app/api/ai-planner/route.ts` | `b7f49aca…66c07f` | Classic endpoint untouched |
| `lib/ai/orchestrator.ts` | `2b91d55e…2dee9` | Untouched (still carries the pre-existing concurrent model-config edit) |
| `lib/ai/planning-engine.ts` | `cbd73cc7…72977` | Untouched |

Phase 3 changed 33 files: 8 new shared planner modules, 5 new provider modules, 2 new server services, 1 new route, 3 new UI components, plus extensions to `contracts.ts`, `constraints.ts`, `done.ts`, `semantic.ts`, `smart-setup.ts`, `telemetry.ts`, `server/{core,generation,operations,revisions,materialize}.ts`, `lib/ai/config.ts` (quota bucket) and `app/system/components/PlannerTab.tsx` (one import + one line). `exam-policy.ts` lost its duplicated effort floors: `topicMinutes`/`topicPracticeFloor` now delegate to the shared `scope-topic.ts`, so Exam and Roadmap compute the same floors from one implementation.

## 2. Roadmap input model

`ROADMAP` reuses the shared `UserInputV1` union and adds one optional metadata block, exactly as Exam does. The variant keeps its existing required `outcome` (the roadmap objective), so every Phase 1/2 payload still parses.

`lib/planner/roadmap-fields.ts`:

```
RoadmapDetailsSchema {
  subjectName (1–200), subjectId (owned|null), qualification (1–200|null),
  topics: RoadmapTopic[] (1–60),
  granularity: "MONTH" | "WEEK",
  acceptReducedReserve: boolean
}
```

* **Reused, not duplicated.** `RoadmapTopic` and `ExamTopic` are both built from the single shared `scopeTopicFields` (`label, covered, confidence, difficult, priority?, prioritySource?, sizeSignal?`) extracted into `lib/planner/scope-topic.ts`. A roadmap unit therefore carries exactly the A1 signals — including the rule that a non-neutral priority must name an explicit user source.
* **Availability.** A roadmap confirms the *same* weekly grid as Exam (`dailyMinutes[7]`, `recoveryPercent`, `blockedDates`). The wizard offers a weekly-total shortcut and distributes it across the user's available weekdays, so there is one capacity model and no parallel scheduler. Term/holiday unavailability uses the existing `blockedDates` field rather than a new constraint kind.
* **Scope is authoritative.** `roadmapInput()` enforces `scope === topics.map(label).join("\n")`, unique labels, the reserve-acceptance rule, constraint applicability and the horizon/period bounds. Sylf never researches or replaces a syllabus.
* **Bounds (mode-specific, Exam unchanged):** `ROADMAP_LIMITS = { inputBytes: 49152, topics: 60, milestones: 60, periods: { MONTH: 13, WEEK: 53 } }`.

### Why 60 units and a 49,152-byte envelope

A confirmed label is stored **twice** — in `roadmap.topics[].label` and in the `scope` string — so payload size depends on label length and JSON escaping, not on the unit count. Worst case measured from the code: 60 units with 200-character ASCII labels, plus title/outcome/subject/qualification, 366 blocked dates and 12 constraints, is ≈ 40.4 KiB: inside the 49,152-byte roadmap envelope with ≈ 8.8 KiB of headroom and inside the database's 64 KiB `inputSnapshot` bound with ≈ 23 KiB. An earlier draft of this phase used 150 units; the arithmetic above showed 150 units with long labels can exceed 32 KiB, so the bound was lowered and the **measured byte check made authoritative** (`assertRoadmapEnvelope`, `ROADMAP_SCOPE_TOO_LARGE` with segment choices). The schema's own unit cap and the byte check agree; a schema-valid roadmap with multi-byte labels can exceed the Exam envelope and is still accepted here — which is exactly why the limit is mode-specific. Tests assert both directions.

## 3. Granularity strategy

Granularity is deterministic, user-visible and recorded in the input, so a saved plan always replays the same periods:

* `defaultRoadmapGranularity(start, end)` → `WEEK` when the horizon is ≤ 84 days, otherwise `MONTH`.
* The wizard prefills that default and lets the user override it; the chosen value is part of the sealed input snapshot.
* Period boundaries are computed by the server, never by the model: `roadmapPeriodSpecs()` tiles the horizon exactly — `MONTH` uses calendar months clipped to the horizon, `WEEK` uses consecutive seven-day blocks with the last clipped. Periods have no gaps and no overlaps (asserted), a stable order, a deterministic title (`January 2030`, `Week 3`) and application-issued UUID keys at normalization.
* The model only ever references the supplied `pN` tokens; a milestone whose `date` is not exactly its period's end date is rejected (`MILESTONE_PERIOD_MISMATCH`), and the target date is never exceeded.

## 4. Planning algorithm / AI strategy

`lib/ai/planner/roadmap.ts` (new, server-only):

* Separate system prompt and the shared strict `ModelProposalV1` ROADMAP contract, with the model required to emit **`items: []`** and one or more milestones per period carrying `periodRef, outcome, topicRefs, effortMinutes, checkpoint?, dependsOn?`.
* Payload: the confirmed units with progress/confidence/priority/minimum minutes, the locked period list with each period's `capacityMinutes`, the priority window (`first ⌈periods/2⌉ periods`), the total scope estimate, the applicable constraints and the Smart Setup answers. No external research, no search tools.
* Sequencing guidance is explicit: prerequisites and conceptual order rather than an even split of the unit list; effort proportional to each unit's confirmed size; every period planned; repeated units allowed for reinforcement when a period has no new unit left.
* **Deterministic authority** (`lib/planner/roadmap-policy.ts`): confirmed-scope mirror, exact period boundaries, one milestone per planned period, `date === period.endDate`, dependency order (a milestone may only depend on one in an earlier or same-period-earlier position), every unit covered or explicitly excluded, every unit's effort at least its coarse floor, HIGH-priority units inside the priority window, each period's planned effort within `min(period capacity, weekly limit converted to that period)`, and no effort beyond the target date.
* **Bounded pipeline:** one shared implementation in `lib/ai/planner/pipeline.ts` — initial attempt, at most one validation repair, at most one provider fallback (≤3 calls), then one critic and at most one targeted repair (≤2 calls). Exam, Roadmap and expansion all run through it; there are no nested retries.

## 5. A1 Smart Setup adaptation

`smart-setup.ts` was **generalized, not duplicated**: one catalog, one ranking, one set of closed options, one answer-application path, with mode-specific detectors behind a single entry point.

* `smartQuestions<T>(input, limit?)` and `applySmartAnswers<T extends UserInputV1>(input, answers): T` now dispatch on `input.mode`; the Exam detectors are unchanged, so all 50 A1 tests pass verbatim.
* **No new reason code was needed.** The four approved codes cover the Roadmap uncertainties the brief lists:
  * `PRIORITY_UNCLEAR` — the unit that matters most (roadmap detector over units).
  * `SCOPE_SIZE_UNCLEAR` — "how large is this broad syllabus unit?" (shared broad-label detector).
  * `AVAILABILITY_PATTERN_UNCLEAR` — genuinely meaningful for a roadmap, because its availability model is a weekly total: spread across study days vs longer sessions on fewer days.
  * `CONSTRAINT_STRENGTH_UNCLEAR` — is the weekly capacity a limit or a preference? (`REQUIRED` → HARD `MAX_WEEKLY_MINUTES`, `PREFERENCE` → SOFT `WEEKLY_WORKLOAD_PREFERENCE`).
* Same guarantees: 0–3 questions, closed choices only, stable reason codes, "Why this matters", bounded answer schema, idempotent answers, and **zero questions** when the roadmap is already determined (asserted, including in the wizard).

## 6. Constraint and priority behaviour

The A1 typed model is extended, never replaced (`lib/planner/constraints.ts`): strength stays bound to kind by schema, and a new `CONSTRAINT_MODES` map rejects a kind the mode cannot evaluate rather than ignoring it.

| Kind | Strength | Effect |
| --- | --- | --- |
| `MAX_SESSION_MINUTES`, `UNAVAILABLE_WEEKDAY` | HARD (reused) | expansion session ceiling; no work on an excluded weekday |
| `MAX_WEEKLY_MINUTES` | HARD (new) | **strategic:** each period's planned effort ≤ `min(period capacity, floor(limit × periodDays / 7))`; **expansion:** a true rolling seven-day window over the items |
| `SESSION_LENGTH_PREFERENCE`, `EVEN_SPREAD_PREFERENCE`, `PREFER_FEWER_DATES` | SOFT (reused) | apply to expansion items |
| `WEEKLY_WORKLOAD_PREFERENCE` | SOFT (new) | prefer each period at or below its converted weekly ceiling |
| `PREFER_EARLIER_WORKLOAD`, `PREFER_BALANCED_PERIODS`, `PREFER_UNIT_ORDER`, `PREFER_FEWER_SWITCHES` | SOFT (new) | measured per roadmap and explained in one sentence when unhonored |

**Revised from the original plan:** a month-level roadmap does not know which days its work happens on, so a rolling seven-day window would be a claim the plan cannot honour. `MAX_WEEKLY_MINUTES` therefore becomes a per-period ceiling on a strategic roadmap, and exact rolling-week enforcement lives only in expansion, which does know its dates. Localized roadmap preferences (unit order, balanced periods) are turned into bounded, milestone-scoped `PRIORITY_MISS` repair findings, so a preference influences the schedule instead of only being reported — global ones (`PREFER_FEWER_DATES`) stay explanation-only. Soft kinds remain absent from every feasibility path (asserted by test).

**Priority stays independent of confidence** and affects allocation:
* every unit is held to its own coarse floor (`INSUFFICIENT_UNIT_ALLOCATION`), so a roadmap cannot shrink units to fill periods evenly;
* a HIGH-priority unit's milestones must lie inside the first half of the periods (`PRIORITY_ORDER`) and its total effort must meet the larger floor (`INSUFFICIENT_PRIORITY_ALLOCATION`);
* no rule can force relearning, and Sylf never invents a level — a non-neutral priority requires an explicit user source;
* LOW-priority weak units receive bounded coverage with a visible tradeoff sentence.

## 7. Roadmap output contract

The ROADMAP variants of `ModelProposalV1` and `ValidatedDraftV1` extend the shared union additively:

* proposal/draft: `outcome` (objective), `topics` (mirrored confirmed scope; `scopeRef` recorded for the draft), `periods` (draft only, application keys), roadmap milestone metadata (`periodRef`/`periodKey`, `outcome`, `topicRefs`/`topicKeys`, `effortMinutes`, `checkpoint`, `dependsOn`, `locked`, `removed`), and `expansion?: { milestoneKey }` for EXPAND revisions.
* `items` is `max(60)` with **min 0** for ROADMAP only; Exam keeps `min(1)`.
* Strategic revisions must contain **zero** items (`ROADMAP_ITEMS_NOT_ALLOWED`); only EXPAND revisions carry actionable items, each bound to the selected milestone and to that milestone's confirmed units (`EXPANSION_SCOPE_VIOLATION` otherwise).
* Milestone `effortMinutes` is a bounded planning estimate (0–20,000), not a Quest duration; a milestone outcome is 12–240 characters and is *planning metadata*, not a Quest Definition of Done. Milestone outcomes reuse A1's quality vocabulary (bounded, observable, no mastery claim, no invented official requirement) via `milestoneOutcomeIssue`, and an invalid outcome is replaced by a bounded default so bad text never surfaces — exactly the DoD pattern.
* The application assigns every durable identity during normalization (`normalizeRoadmapProposal`); the model supplies only temporary tokens. No persisted ID, reward or execution identity can come from the model.

## 8. Semantic critic behaviour

The A1 critic is **reused with a separate Roadmap contract**, not forked:

* `runCriticCall` is now shared and parameterized by payload, system prompt, allowed references and report schema; the Exam critic is a thin wrapper, so the A1 tests are unchanged.
* Roadmap critiques speak in `mN` milestone tokens with their own schema (`RoadmapCriticReportSchema`) and their own prompt; the closed six-code vocabulary is unchanged — `SEQ_WEAK`, `TASK_VAGUE`, `DENSITY_SPIKE`, `REDUNDANT_TOUCH`, `PRIORITY_MISS`, `ROBOTIC_PATTERN` all map onto roadmap defects, so **no new issue code was added**.
* The deterministic half runs through the same `deterministicSemanticIssues` by projecting milestones onto the shared item view (`roadmapSemanticDraft`): a milestone outcome takes the description role, effort takes the minutes role, so DENSITY_SPIKE means "one period carries far more work than the rest of the roadmap" and TASK_VAGUE means "this milestone does not say what being finished looks like". A blank outcome fails closed.
* Malformed, truncated, unavailable or out-of-scope critic output is `UNAVAILABLE`/rejected and never partially trusted; the recorded `semanticReview` on the revision is content-free.

## 9. Roadmap review/edit UX

`app/components/planner/PlannerWorkspace.tsx` (new) owns the single outcome-based mode choice (Exam / Course Roadmap, Mastery marked as later) and hands off to the mode's wizard; `PlannerTab` renders it when the gate is on and still renders the untouched legacy panel when the gate is off.

`app/components/planner/RoadmapPlanner.tsx` (new) implements a six-step progressive wizard (course → syllabus → target date + granularity → weekly availability + reserve → progress/confidence/priority → review + Smart Setup questions) and a period-oriented review that deliberately does **not** look like the Exam timeline:

* course title, qualification, target date, granularity, period count, milestone count and total estimated hours;
* one compact collapsible row per period: title, milestone title(s), date range, planned minutes, expansion state;
* per-milestone editing of title, outcome, planned minutes, lock, removal, and earlier/later ordering, with unit coverage shown as text;
* a "Plan <period>" action per milestone whose label reflects state (already expanded / review pending period plan / review existing Quests);
* tradeoffs and priority notes only — **no critic internals** (asserted in the DOM test).

Editing appends an immutable EDIT revision (`appendEdit` extended with `milestoneEdits`/`milestoneOrder`), revalidates structure, coverage, capacity and priority, protects locked milestones (`MILESTONE_LOCKED`), refuses reordering across a fixed period boundary, and requires explicit acknowledgment before a unit can disappear (`exclusionsAccepted`, unit names listed). Date/minutes/DoD editing inside an expanded period reuses the extracted `PlanItemEditor`, which is shared with the Exam review so the two cannot drift.

## 10. Confirmation behaviour

* A strategic roadmap confirms with **`selectedItemKeys: []`** and creates **zero Quests** (`CommitSchema` relaxed to `max(60)`; Exam still requires full selection, and a non-empty selection on a strategic roadmap is `UNKNOWN_ITEM`).
* Confirmation runs the existing Phase 1 transaction: lock, version check, advisory lock, capacity revalidation, receipt, pointer update. The optional Goal is still only created when explicitly requested (`createGoal`, default false).
* An expansion confirms its whole segment (`EXPANSION_SELECTION_REQUIRES_EDIT` for a partial selection) and materializes ordinary PENDING Quests through the unchanged `mapQuest` path, with `Done when: …` appended to the Quest description.
* **Deviation, documented:** confirming an EXPAND revision does **not** take over `plan.activeRevisionId`. The roadmap stays the active strategic layer while the segment becomes executable, which is what makes partially expanded roadmaps representable. A roadmap GENERATE/EDIT confirmation keeps today's pointer behaviour. `plan.version` still advances for both.

## 11. Selected-period expansion

`POST /api/planner/[id]/milestones/[itemKey]/expand` (new, Phase 0's documented surface) → `lib/planner/server/expansion.ts` → `lib/ai/planner/expansion.ts`.

* **Only the confirmed, active roadmap revision can be expanded.** The base is `plan.activeRevisionId`, which must be sealed, carry a confirmation receipt and contain the milestone. A raw request cannot name a draft revision.
* **An unconfirmed roadmap edit blocks expansion** with `CONFIRM_ROADMAP_EDIT_FIRST`; another milestone's unconfirmed expansion blocks it with `PENDING_EXPANSION_DRAFT`. The UI disables the action with the same explanation.
* **The authoritative already-expanded guard is confirmed expansion lineage, not link disposition.** `expansionLineage()` projects `source = 'EXPAND'` revisions to `{id, confirmed, milestoneKey, state}` with a single JSON path (≤24 rows, owner already proven by `ownedPlan` in the same transaction) and treats **any confirmed EXPAND revision for that milestone** as expanded — forever. Deleting every Quest, or editing one until it is DETACHED, changes nothing: the write-once confirmation receipt is permanent, so a period whose work the user removed can never be silently regenerated. A sealed-but-unconfirmed draft for the same milestone is **reopened** (no provider call, no charge) instead of regenerated.
* **Scope:** only that milestone's units and only its period's dates, validated by `validateExpansionItems` (unit membership, period bounds, session limit, unavailable weekdays, per-day capacity, rolling weekly limit, every unit touched).
* **Neighbours cannot change:** `normalizeExpansion` copies the parent's topics, milestones and periods verbatim with their keys, and `finishExpansion` compares a canonical structure fingerprint against the parent, rejecting any drift with `ROADMAP_STRUCTURE_CHANGED`.
* **Budgets:** generation ≤3 calls, semantic ≤2, one 30 s semantic slice inside the 90 s operation deadline; provider spend logged as `expansion` / `expansion_critic` / `expansion_repair`.
* The expansion's availability snapshot is scoped to its own period, so one period cannot consume another's capacity and the payload stays small.

## 12. Quest materialization path

Unchanged Phase 1 semantics: `confirmDraft` creates ordinary `PENDING` Quests with canonical difficulty/rewards, `requiredMinutes === targetMinutes`, an owned optional Subject and no SubjectNode, then writes the links, pointer and receipt in one transaction. Expansion items carry the A1 `completionCriteria`, exposed through the existing Quest description (`Done when: …`); legacy and manual Quests are untouched. The DB harness confirms a roadmap creates zero Quests and that an expanded period's Quests can be started and settled through the real `start_study_session` / `settle_study_session_atomic` RPCs with replay idempotence.

## 13. Idempotency and recovery

* Roadmap generation uses the existing request-key path: same key + same body recovers the same operation; same key + different body is `IDEMPOTENCY_MISMATCH`; a lost response is recovered from durable state by `GET /api/planner/recover/[key]`.
* Expansion is its own operation with its own request key, recoverable through the owned `GET /api/planner/[id]/operations/[key]` (which already existed) and cancellable through the same endpoint (`action: "CANCEL"` added, reusing `stopOperation` and the shared in-process registry in `server/running.ts`).
* Retrying an expansion of the same milestone reopens the durable draft; a confirmed expansion is refused for good; confirmation receipts and link uniqueness prevent duplicate Quests on any retry.
* Quota is reserved once per operation and released once on failure, cancellation or lease expiry, against the recorded original bucket.

## 14. Progress semantics

`lib/planner/roadmap-progress.ts` derives per-milestone state conservatively from confirmed expansion revisions and link dispositions: `NOT_EXPANDED`, `EXPANSION_DRAFT`, `EXPANDED`, `EXECUTION_CHANGED`, `PARTIALLY_REMOVED`, `REMOVED`, `CONFLICTED`. Every milestone's state is returned by the detail route together with bounded expansion summaries, so the UI can show mixed roadmaps (September expanded, October and November roadmap-only).

There is **no mastery claim anywhere**: a milestone existing, a Quest existing, a Quest being completed or Focus time being recorded never marks a unit "mastered", and no topic coverage map is implemented (that is A2 and is deliberately absent).

## 15. Provider and quota budget

| Operation | Generation | Semantic | Total | Deadline |
| --- | --- | --- | --- | --- |
| Exam (unchanged) | ≤3 | ≤2 | ≤5 | 90 s |
| Roadmap | ≤3 | ≤2 | ≤5 | 90 s |
| Expansion | ≤3 | ≤2 | ≤5 | 90 s |

One adapter instance per provider/model per operation; one advisor-free shared semantic slice; no nested retry. Soft-kinded limits never consume capacity.

**Quota (user decision):** expansion reserves its own bucket, `AI_QUOTAS.plannerExpansion = { limit: 3, window: "week" }`, through the unchanged engine and receipt lifecycle, so planning a period no longer competes with the single weekly `planner` allowance. The DB harness asserts a roadmap charges `planner` once and creates no `plannerExpansion` usage, and that both buckets coexist.

## 16. Classic Planner coexistence

* `app/api/ai-planner/route.ts`, `lib/ai/orchestrator.ts` and `lib/ai/planning-engine.ts` are byte-identical to the session start (hashes above).
* No Planner Modes module — now including every Phase 3 file — imports the legacy orchestrator or planning engine, and no legacy file imports Planner Modes (`classic-coexistence.test.ts`, extended with a 13-file list).
* `PlannerTab` still renders the legacy `AiPlannerPanel` with the flag off; with the flag on it renders the mode workspace, and `exam-entry.test.tsx` keeps the flag-off assertion exactly as before. The quick modal's legacy path is unchanged.
* No Classic Planner history was migrated, no PlannerPlan lineage was inferred from legacy AI Quests, and Classic Planner was not rewritten.

## 17. Security, privacy and telemetry

New content-free events: `roadmap_generation_started|completed|failed`, `roadmap_confirmed`, `roadmap_edit_saved`, `roadmap_milestone_expansion_started|completed|failed`. Metadata is limited to a fixed mode enum, a fixed granularity enum, opaque UUIDs, the critic-state enum and bounded counters (`periods`, `milestones`, `horizonDays`, `scopeBytes`, `providerCalls`, `latencyMs`, …). No field can carry syllabus text, milestone titles, outcomes, prompts, critic payloads or provider output.

Preserved invariants: cookie-`getSession` on every route, ownership checks, private/no-store responses, RLS/grants untouched, no client Prisma, no service-role exposure, no private-draft publication, no mobile Bearer auth, no chain-of-thought storage or display. `npm run audit:secrets` passed, and the same credential-pattern scan over the 69 planner source/test files (including untracked ones) found only the pre-existing `service_role` assertion string in the Phase 1 database test. The extended `client-boundary` test walks all twenty client-safe modules and asserts `server-only` in all ten server modules; `npm run mobile:build` + `mobile:verify` passed with mocks disabled.

## 18. Tests and build

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Source clean (the `-p scratch/tsconfig.verify.json` variant excludes the stale `.next/dev/types` dev artifact and exits 0; `npm run build`'s own TypeScript step also passed) |
| `npx prisma validate` | Passed — no schema change (`SCHEMA_BUILD_VERSION` unchanged) |
| Planner suite | 14 files / **154 tests passed**, 51 skipped (opt-in files) |
| Disposable PostgreSQL harness | 15 files / **197 tests passed** |
| Full repository suite | 135 files / **1,415 tests passed, 0 failed**, 50 skipped |
| `npm run audit:secrets` | Passed (+ new-file scan) |
| `npm run mobile:build` + `verify` | Passed |
| `npm run build` | Passed (88 static pages, exit 0) |

New Phase 3 coverage (41 tests): period tiling and granularity; feasibility and segment-required; the measured envelope in both directions; structural rules (period boundaries, target date, coverage, exclusions, dependencies, no daily items); capacity and the per-period weekly ceiling; soft preferences never affecting feasibility; constraint applicability; normalization into application keys; milestone outcome resolution; legacy metadata-free ROADMAP payloads; the generation pipeline, budgets and targeted repair (including rejecting an out-of-scope milestone patch); expansion scope, deterministic rules, rolling weekly enforcement, assembly identity, DoD on every item, targeted repair, and the refusal to accept an Exam-only intent; the mode workspace; the wizard/review/confirm-with-zero-Quests UI and the expansion review; and real-database roadmap confirmation (zero Quests, zero Goals, zero links), period expansion with Focus settlement replay, the double-expansion guard surviving deletion, the pending-draft guards, and quota-bucket independence.

Requirements covered explicitly: 6- and 12-month syllabi, short week-based roadmap, progress and priority variation, hard/soft constraints, scope too large, very short horizon, compact output with no item rows, deterministic boundaries, all units represented or explicitly excluded, nothing scheduled beyond the target date — plus expansion retry/idempotency, partial confirmation, changed capacity, existing workload, and neighbour immutability.

## 19. Live provider smoke

Opt-in, bounded, synthetic, no database writes; results recorded to `/tmp/sylf-planner-phase3/`. Provider reachability held throughout (DeepSeek responded in every attempt; Gemini was reached as the fallback in one run) — Phase 2's HTTP 402/503 did not reproduce.

| Run | Roadmap | Expansion |
| --- | --- | --- |
| 1 | **validated**: 6 milestones, 0 items, 3 calls; critic `ISSUES_REPAIRED` (5 milestones patched); all milestone outcomes bounded; no validation failures | **validated**: 22 items, 3 calls, critic `ISSUES_REPAIRED` |
| 2 (pre-prompt-clarification) | rejected on all three attempts: `ROADMAP_PERIOD_UNPLANNED` | not reached |
| 3 (after clarifying the period-coverage rule in the prompt) | **validated**: 7 milestones, 0 items, 3 calls; critic `ISSUES_REPAIRED` (1 reported issue, 5 milestones patched); all outcomes bounded | **validated**: 11 items, 3 calls, critic `ISSUES_REPAIRED`; **every item carries a bounded completion condition** |

Interpretation: Roadmap generation succeeded in 2 of 3 bounded live runs, and one selected-period expansion validated live in both runs where generation succeeded. The single failure was model non-compliance with the "every period must be planned" rule; the fix was **prompt clarity, not validator weakening**, and no validator rule was relaxed at any point. Both modes produced zero daily items at the strategic layer and a bounded Definition of Done on every actionable expansion item. Live end-to-end success is still intermittent, so this is evidence of a working pipeline — not an availability claim.

## 20. Blockers before Mastery

* Keep Planner Modes gated and review this phase before starting Mastery.
* Live reliability is still not established: Roadmap generation succeeded in 2 of 3 bounded runs and the expansion path validated only where generation succeeded. The Exam-side recurring codes (`MISSING_SPACED_RECALL`, `INVALID_EXAM_INTENT_STAGE`, `INFEASIBLE_CAPACITY`, `MISSING_MISTAKE_REVIEW`) remain an open, separate investigation; nothing in Phase 3 touched them.
* Expansion re-planning of an already-expanded period is deliberately out of scope (Phase 5). A user who wants different work for a period currently has to change the roadmap — a reviewed reconciliation flow is required before that changes.
* The target environment's migration ledger/schema must still be verified and the existing additive planner migration applied through the normal reviewed Prisma workflow before enablement. The historical empty-database bootstrap gap (`ItemCategory`) remains untouched. Phase 3 added no migration, so this is unchanged from Phase 2.
* `npx tsc --noEmit` still reports 89 pre-existing errors from the stale `.next/dev/types` dev artifact; `next build` regenerates it. Repository hygiene, not a planner issue.
* Mastery-specific questions this phase does not answer: how a six-stage sequence maps onto the shared milestone contract, whether mastery needs its own mode metadata block (it will), and how a mastery check's self-reported result is recorded separately from Quest completion without implying node mastery.

## Explicit stop-gate answers

| Question | Answer |
| --- | --- |
| **Can Roadmap generate months/weeks without creating daily Quests?** | **Yes.** Periods are computed deterministically by the server (calendar months or seven-day blocks) with application-issued keys; the model emits milestones only, and a strategic revision containing any item is rejected (`ROADMAP_ITEMS_NOT_ALLOWED`). Both live validated runs produced 0 items over 6–7 milestones. |
| **Can Roadmap confirmation create zero Quests?** | **Yes.** A strategic roadmap confirms with an empty selection and the real-database test asserts exactly zero Quests, zero Goals and zero links afterwards, with the plan ACTIVE and the roadmap revision active. |
| **Can one selected period later become ordinary Quests?** | **Yes.** `POST /api/planner/[id]/milestones/[itemKey]/expand` plans the selected milestone's units inside its own period; confirmation materializes ordinary PENDING Quests through the unchanged Phase 1 path, and the DB test starts and settles a session on one of them with replay idempotence. |
| **Can expansion modify neighbouring periods?** | **No.** The draft copies the parent's topics, milestones and periods verbatim with their keys, and the seal compares a canonical structure fingerprint with the parent, rejecting any drift. Tests assert byte-identical structure and that only the expansion's own items are new. |
| **Can repeated expansion duplicate Quests?** | **No.** Any confirmed EXPAND revision for that milestone permanently blocks re-expansion (`MILESTONE_ALREADY_EXPANDED`) — including after every Quest was deleted or detached — and a sealed-but-unconfirmed draft is reopened with no provider call and no charge. Confirmation receipts and link uniqueness prevent duplicates on retry. |
| **Are all supplied syllabus units represented or explicitly excluded?** | **Yes.** Every confirmed unit must appear in at least one milestone (`MISSING_ROADMAP_TOPIC`), or be excluded by removing its milestones and explicitly acknowledged before confirmation; the UI lists the excluded unit names. |
| **Do hard/soft constraints and priority work correctly?** | **Yes.** HARD `MAX_WEEKLY_MINUTES` caps each period (and a true rolling week during expansion), HARD session/weekday rules are enforced deterministically, soft preferences are measured, explained in one sentence and can never affect feasibility, and priority stays independent of confidence with early-window and effort-floor enforcement plus bounded coverage for LOW-priority weak units. |
| **Is A1 reused rather than duplicated?** | **Yes.** One shared scope-unit and effort-floor module, one constraints model with an applicability map, one Smart Setup catalog/entry point, one semantic gate, one critic/repair call mechanism, one bounded pipeline and one provider-call budget implementation serve both modes; `topicMinutes`/`topicPracticeFloor` were de-duplicated rather than copied, and no new reason or issue code was needed. |
| **Is Classic Planner still independently usable?** | **Yes.** Its endpoint, orchestrator and planning engine are hash-identical, nothing in either direction imports across the boundary, and flag-off behaviour is unchanged. |
| **Is Phase 4 Mastery safe to begin?** | **The shared foundation is ready; enablement is not.** Roadmap proves the mode pattern end to end — one persistence model, one prompt/pipeline/budget, one semantic gate, an immutable strategic layer and an explicit execution layer — so Mastery can reuse it with a new mode block and no new tables. What is not ready is live reliability and the unbuilt Phase 5 reconciliation path, so public enablement must not proceed on the strength of this phase. Await review and an explicit next-phase request. |

Phase 3 stops here. No Mastery, A2, A3, adaptive replanning, autonomous rescheduling or public rollout is included.
