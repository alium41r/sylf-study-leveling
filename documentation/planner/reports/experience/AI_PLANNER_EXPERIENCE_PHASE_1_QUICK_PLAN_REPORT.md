# SYLF PLANNER EXPERIENCE — UX PHASE 1 REPORT
## BASELINE TELEMETRY + QUICK PLAN FOUNDATION

**Scope:** the first usable version of the new Planner intake experience — Phase 1a (instrument the existing wizard) followed by Phase 1 (Quick Plan as the default entry). No research, no upload/PDF/photo extraction, no curriculum comparison, no preparedness matrix, no Planner Copilot, no natural-language action parsing, no `plannerResearch` quota, no public enablement.

**Status:** implemented and verified. Phase 1a is green and was completed *before* the default entry was touched. Quick Plan is the default Planner Modes creation path; the six-step wizard survives unchanged as Advanced setup. The engine completed in Phases 1–6 is not redesigned: `PlannerPlan`, `PlannerRevision`, `PlannerQuestLink`, `PlannerCheckResult`, `PlannerPreference`, `PlannerFrictionEvent`, generation, quota, critic/repair, A1/A2/A3, Core/Stretch, Coverage Map, exam policy, roadmap strategy/expansion, mastery progression, Phase 5 replanning and focus settlement are all as they were.

**Method:** every claim below was read from the current repository or measured by running it. Test counts, sizes and timings are actual outputs, quoted with the command that produced them. Where the goal asked for something and the implementation differs, the difference is in §23 rather than smoothed over.

---

## 1. Repository reconciliation

### 1.1 What was already true when this phase began

The Phase 0 report ([AI_PLANNER_EXPERIENCE_PHASE_0_ARCHITECTURE_REPORT.md](AI_PLANNER_EXPERIENCE_PHASE_0_ARCHITECTURE_REPORT.md)) specified this phase's architecture; its §19–20 (two validation classes, override contract) are the source of the finding infrastructure built here. The reconciliation below is against the repository as it actually is, not against the reports.

| Item | State at the start of Phase 1 |
| --- | --- |
| Feature flag | `PLANNER_MODES_ENABLED` unset in `.env` and `.env.example`; read server-side only; the client learns it from `/api/planner/capabilities`. **Superseded:** the flag no longer exists at all — see the coexistence report |
| Migrations | 54 of 54 applied to the development database, RLS enabled on all planner tables, zero client grants |
| Schema build | `SCHEMA_BUILD_VERSION = 21` → **22** (this phase, §10) |
| Planner engine | Phases 1–6 intact, hash-pinned by tests |
| Classic Planner | Architecturally independent, hash-pinned by tests, untouched |

### 1.2 What this phase added, in one map

| Layer | Files |
| --- | --- |
| Brief (pre-generation state) | `lib/planner/intake/brief.ts`, `scope-sync.ts`, `actions.ts` (wire contract) |
| Deterministic advice | `readiness.ts`, `distribution.ts`, `preparedness.ts` (engine-wide policy), `findings.ts` |
| Translation to the engine | `to-input.ts` |
| Persistence | `PlannerIntakeSession` + `lib/planner/server/intake-session.ts` |
| Service + API | `lib/planner/server/intake.ts`, `app/api/planner/intake/route.ts`, `.../[id]/route.ts`, `.../[id]/action/route.ts` |
| Client | `lib/planner/intake/client.ts`, `app/components/planner/quick-plan/*` |
| Telemetry (Phase 1a) | `lib/planner/telemetry.ts` (extended), `lib/planner/intake-telemetry.ts` |
| Default entry | `app/components/planner/PlannerWorkspace.tsx` |

### 1.3 The two contract facts that shaped the implementation

1. **`scope` is derived, not free text.** Each mode's normalizer requires `scope === topics.map(t => t.label).join("\n")` (`lib/planner/exam-policy.ts:50`, `lib/planner/roadmap-policy.ts:180`) with case-insensitively unique labels. The brief therefore stores a tree and flattens it deterministically (`flattenScope`), and duplicate labels are qualified rather than mangled.
2. **Capacity is a seven-weekday vector.** `availability = { dailyMinutes: number[7] (0–720), recoveryPercent (0–50), blockedDates[] }` (`lib/planner/contracts.ts:56`), with rest weekdays, floating rest dates and existing Quest load known only to the server (`lib/planner/capacity.ts`). This is why the weekly-budget distributor runs on the server and the UI displays its output rather than estimating one.

### 1.4 Defects found in this phase's own new code, and fixed

Recorded because each one was a real failure mode, not a style note:

| Defect | Why it mattered | Fix |
| --- | --- | --- |
| `emptyBrief()` was invalid against `PlanBriefV1Schema` (blank goal title, unstated subject) | The read path silently fell back to a fresh empty brief, so a student could set a constraint, reload, and find it gone with no error | "Not stated yet" is now representable: `goal.title` may be empty, `subject.kind` is nullable (§3, §6) |
| `briefOf()` returned `emptyBrief(...)` for any unparseable stored brief | Silent data loss on a schema bug | It now distinguishes "never written" from "written but unreadable"; the latter fails loudly (§12) |
| `distributeWeeklyBudget` reported a partial horizon as fully reachable | A three-day plan claimed a full week's budget | `reachableMinutes`/`shortfallMinutes` are computed from the weekdays the horizon actually contains (§8) |
| `IntakeView.questions` sent option labels but not values | The answer action is keyed by value; the surface could not answer a Smart Setup question at all | Both travel (§16) |
| The scope editor's wrapper and its textarea shared one DOM id | The label pointed at a `<div>`; `getByLabelText` (and a screen reader) could not find the field | One id per control; the weekly fieldset is a focus target (§13, §19) |
| `syncScopeNodes` could derive the same id for two different labels | `DUPLICATE_SCOPE_NODE`, a hard rejection | Ids are claimed uniquely and deterministically (§3) |
| Intake responses were rendered without a shape check | A contract mismatch produced a blank screen | The client validates the envelope and raises `INVALID_RESPONSE` (§12) |

---

## 2. Phase 1a — baseline telemetry

### 2.1 What was added

Five events in the existing closed vocabulary (`lib/planner/telemetry.ts`), emitted through one once-only registry (`lib/planner/intake-telemetry.ts`):

`intake_started`, `intake_first_input`, `intake_readiness_changed`, `intake_first_draft_requested`, `intake_abandoned`.

Bounded context fields: `entryPath` (`LEGACY_WIZARD | QUICK_PLAN | ADVANCED`), `abandonReason` (`LEFT | CANCELLED | SWITCHED_MODE`), `mode`, `latencyMs` (intake start → first generation request), and the numeric counts `fieldsTouched`, `topicsManual`, `topicsResearched`, `topicsImported`, `preparednessEdited`, `copilotTurns`, `warningsAccepted`, `missingRequired`.

The event names, the enums and every count were added to the existing allowlists, so a value outside them is dropped by the telemetry layer rather than written. **No academic content is emitted**: no titles, topics, syllabus text, exam names, user messages or plan content — the payload is an id, closed enums and integers.

### 2.2 Once-only emission

Identity is the intake's own UUID (one per wizard session) held in a bounded module registry (256 entries). Each emitter checks a per-identity flag (`started`, `firstInput`, `draftRequested`, `abandoned`, `completed`) and returns if already set. `intake_abandoned` is suppressed only after `intakeCompleted()` runs on a sealed generation, so an explicit cancel *during* generation still reports `CANCELLED` while a successful generation never reports abandonment. React strict-mode double-invocation, remounts and duplicate renders hit the same identity.

### 2.3 Comparison of old and new flows

| | Legacy wizard | Quick Plan |
| --- | --- | --- |
| `entryPath` | `LEGACY_WIZARD` | `QUICK_PLAN` |
| Emitted by | `ExamPlanner` / `RoadmapPlanner` / `MasteryPlanner` | `useIntakeSession` |
| `topicsManual` | topic count at request time | unit count at request time |
| `topicsResearched` / `topicsImported` | `0` | `0` (no research exists yet) |
| `warningsAccepted` | `0` | accepted advisory findings |

### 2.4 Proof that instrumentation changed nothing

The wizard's step gating was extracted into a shared `readinessFor(step)` / `stepError(step)` helper with byte-identical conditions and error strings, and a test asserts `requestExam` receives the same body shape after instrumentation. `__tests__/planner/intake-telemetry.test.tsx` (15 tests) proves once-only emission with exact counts, a `<StrictMode>` walk and a remount walk.

**Honest limitations:** one enum value is vocabulary-only this phase. `SWITCHED_MODE` is never emitted, because no back-to-chooser control exists inside the wizard. And a student who reaches the wizard through "Fine-tune first" reports `entryPath: "LEGACY_WIZARD"`, not `"ADVANCED"`, because the wizard does not know how it was reached (§23.4). The comparison this phase actually needed — Quick Plan versus the old flow — is correct: the quick surface reports `QUICK_PLAN` and the wizard reports `LEGACY_WIZARD`.

---

## 3. PlanBriefV1

`lib/planner/intake/brief.ts` implements the Phase 0 brief: strict, versioned (`schemaVersion: 1`), mode-discriminated for its required minimums, bounded, and deterministically convertible to engine input.

**Shape:** `goal`, `subject` (`kind` nullable), `target` (`endDate`, `examDate`), `budget` (`weeklyMinutes`, `dailyOverrides`, `blockedDates`, `recoveryPercent`, `acceptReducedReserve`, `distribution`), `backgroundCurriculum`, `scope` (`source`, `confirmedAt`, `provenanceRefs`, `nodes`), `preparedness`, `constraints`, `unresolved`, `assumptions`, `authority`, `appliedActions`, `readiness`.

**Bounds:** `BRIEF_LIMITS` — 200 scope nodes, depth 3, 8 provenance refs, 12 recent turns, 20 assumptions, **64 KiB serialized**. Measured: an empty brief is 516 B, ten units 1,627 B, and a 198-node brief 19,847 B (§20).

**Two states that had to be representable.** A brief being filled in has no goal title and no subject yet. Encoding "not stated" as a free-text subject with no name made `emptyBrief()` invalid against its own schema, which is how the silent-reset defect in §1.4 began. Now:
* `goal.title` may be empty — readiness, not the schema, requires a real title (`GOAL_MISSING`).
* `subject.kind` is `null` when unstated, beside `SYLF_SUBJECT` and `FREE_TEXT`; a value with `kind: null`, a free-text subject with no name, and a Sylf subject with no id are all rejected as contradictions.
* `{}` — the storage layer's "never written" placeholder — is *not* a valid brief, so a schema change cannot quietly start reading real sessions as empty.

### 3.1 Hierarchy, flattening and the large-scope rule

`flattenScope(nodes, { unitCap })` implements the review amendment exactly:

1. selected **topics** become units; a container with selected descendants but no selected topic of its own becomes one unit;
2. if that exceeds the engine's unit cap, **coarsen** — a chapter replaces its selected children (this is measured: 200 leaves become 20 chapter units against a cap of 50);
3. only if the coarsened scope still cannot be represented do we **segment**, contiguously and in order;
4. nothing is truncated and unrelated chapters are never merged to hit a number; the detailed children stay in the brief for review and traceability.

Duplicate labels are qualified by ancestor (`"Genetics · Introduction"`) — only the *colliding* unit is rewritten, so a label a revision already refers to is never churned — and a numeric suffix (`"Cells (2)"`) is the fallback when the ancestor chain cannot separate two units.

### 3.2 `appliedActions`

A bounded ring (40) of applied action keys. Actions that *add* state (scope units, for example) would double up if a client retried after a lost response; the server replays the prior result instead. Tests prove a replayed key changes nothing.

---

## 4. Readiness

`lib/planner/intake/readiness.ts` — `briefReadiness(brief, context)` → `{ state, missing, canGenerate, refinements, summary }`.

States are the Phase 0 five: `NEEDS_CORE_INFO`, `RESEARCH_AVAILABLE`, `NEEDS_SCOPE_CONFIRMATION`, `READY_FOR_DRAFT`, `ADVANCED_REFINEMENT_AVAILABLE`. In Phase 1 there is no research, so `RESEARCH_AVAILABLE` is only produced when the caller passes `researchAvailable`, which nothing does yet; the state exists in the contract and is never fabricated.

Three properties that make it trustworthy:

* **The server decides, and re-derives.** The brief carries `readiness` for display, but the service recomputes it on every read and on the generate action itself, so a client cannot assert its own readiness.
* **The model never decides it.** Readiness is a function of the brief and the account schedule, never of anything a provider returned.
* **Optional refinement is not a deficiency.** A brief that can generate is reported `ADVANCED_REFINEMENT_AVAILABLE` when optional detail exists, with `canGenerate: true` and a `refinements` list that is an *offer*.

Required minimums per mode (all four, otherwise `NEEDS_CORE_INFO`): goal, scope, target date, capacity. Preparedness is optional and never blocks.

---

## 5. Authority handling

The ladder is `USER_CURRENT > USER_CONFIRMED_BRIEF > RESEARCH_CONFIRMED > SYLF_DATA > LEARNED_SOFT > MODEL_SUGGESTION`, implemented by `mayApplyAuthority`. A lower authority may only fill a field nothing has claimed; the stronger claim wins, and the conflict is retained in the brief for display rather than silently dropped. Every mutation through the service claims `USER_CURRENT` for the field it touches. HARD constraints sit outside the ladder entirely — they are enforced, not outranked.

---

## 6. Preparedness nullability refactor

`covered`, `confidence` and `difficult` are nullable in `lib/planner/scope-topic.ts`. Old snapshots keep parsing unchanged (a previously written boolean or number is still valid), and TypeScript forced every read site to say what it means: the earlier refactor produced `TS18047` at 42 sites across 11 files.

One asymmetry was verified empirically rather than assumed: TypeScript catches `number | null <= 2` but **does not** catch `!booleanNullable` (and `!null === true`), so the `covered` reads were audited by hand rather than trusted to the compiler. That is recorded here because it is the reason `covered` handling is centralised in one policy module.

---

## 7. Centralised preparedness policy

`lib/planner/preparedness.ts` is the single policy: `isPreparednessStated`, `isCoverageStated`, `isStatedCovered`, `isStatedNotCovered`, `isWeak`, `isSecure`, `provisionWeight`, `needsLearning`, `needsMistakeReview`, `isDifficult`, `preparednessState`, `isConfidenceStated`, `preparednessForModel`, `preparednessSummary`.

For unstated preparedness, all of the following hold:

| Property | Value | Reason |
| --- | --- | --- |
| weak? | no | silence is not a struggle |
| secure? | no | silence is not mastery |
| provision weight | 2 (standard) | neither escalated nor discounted |
| learning still required? | yes | planning less would *assume* knowledge |
| forced mistake review? | no | it is earned by a stated low confidence |
| priority escalation | none | a high-priority unrated unit is not "weak" |
| model context | `preparedness: "UNKNOWN"` with real `null`s | never a fabricated rating |

The apparent tension — "not weak, yet still given the learning floor" — is deliberate and documented in the module: an unrated unit is planned as *work that may need learning*, never as a struggling student. The floors are 105 minutes base / 60 practice for a unit that may need learning, 75 / 30 for a stated-weak unit, 45 / 30 for a standard one.

Migrated read sites: `priority.ts`, `exam-policy.ts`, `mastery-policy.ts`, `roadmap-policy.ts`, `retrieval.ts`, the model-facing payloads in `critic.ts`, `roadmap.ts`, `mastery.ts`, `expansion.ts`, `rebalance-run.ts`, and the quality corpus. `expansion.ts` lost two fabrications (`?? false`, `?? 3`) and now sends `preparednessForModel`.

**Mastery is deliberately different:** its `needsMistakeReview` keeps the progression requirement (`!secure || needsLearning`) because the stage is part of the progression, whereas the exam rule adds *extra work* — which unstated preparedness must not trigger. `lib/planner/preparedness.ts` names both, and the tests pin both.

`__tests__/planner/preparedness-policy.test.ts` (12 tests) covers high-priority unstated, unstated exam and mastery topics, no unnecessary relearning, no weak escalation, no forced mistake review, previous explicit values behaving identically, and an A/B: `MISSING_MISTAKE_REVIEW` fires for `confidence: 2` and not for `confidence: null` on the same proposal.

---

## 8. Weekly-budget distributor

`lib/planner/intake/distribution.ts` — `distributeWeeklyBudget(input)` → `{ dailyMinutes[7], blockedDates, preview, reachableMinutes, shortfallMinutes, note }`, plus `weeklyFromSchedule` for "use my normal Sylf schedule".

Every property the phase asked for, with how it is achieved:

| Requirement | Implementation |
| --- | --- |
| Load-balanced, not "remainder on the earliest days" | Largest-remainder allocation over integer weights; ties break by weekday index |
| Deterministic | Integer arithmetic only, no clock, no randomness; the same input is byte-identical output |
| No double subtraction of existing workload | Existing load scales a day's weight (bounded at ¼) but is **never** subtracted from the budget — the engine subtracts it per day in `capacity.ts` |
| Rest and hard-unavailable days excluded | Rest weekdays, floating rest dates and `UNAVAILABLE_WEEKDAY` constraints all yield zero |
| Existing workload influences balancing | A loaded day's share falls monotonically as its load rises |
| Partial weeks scale down, never up | The weekly pattern is *not* inflated; `reachableMinutes` is what the horizon can actually realize and `shortfallMinutes` says the rest falls outside it |
| Explicit daily override wins | A stated value is used verbatim and removed from the pool being spread |
| Server authoritative | Floating rest dates and existing Quest load exist only server-side |
| Target, not a cap | Nothing here blocks; `MAX_SESSION_MINUTES`, `UNAVAILABLE_WEEKDAY` and `MAX_WEEKLY_MINUTES` are enforced by the engine |

The partial-week rule is the one the test suite caught: a three-day horizon now reports `reachableMinutes: 78` and `shortfallMinutes: 102` for a 3-hour week instead of claiming the full 180, and the note distinguishes the two reasons a budget can be unplaced (a day ceiling versus the plan ending).

`__tests__/planner/intake-distribution.test.ts` — 21 tests, covering 3h and 10h weeks, partial weeks, by-weekday scaling over a month, rest weekdays, a floating rest date, existing workload, an unavailable weekday, even-spread and fewer-dates hints, a daily override, remainder determinism, impossible placement, and no double subtraction.

---

## 9. Weekly-budget UX

The default is one question — *"How much time can you give this each week?"* — with `3h 5h 8h 10h 15h Custom`, then **"Use my normal Sylf schedule"** as a button that states no number (the server supplies the figure the account's own schedule implies), and the server-computed spread shown underneath as a weekday list with the distribution's own one-sentence note.

`Customize days` is a single disclosure (`<details>`) below it; only when opened does the per-weekday editor appear. **Seven daily numeric fields are never shown by default**, and the surface never predicts a distribution: it renders `brief.budget.distribution`, which the server computed, including the hard weekly limit the engine will apply (`view.limits`).

---

## 10. PlannerIntakeSession

One narrow additive table, exactly as Phase 0 specified:

* owner-scoped (`userId` FK, cascade), `clientKey` with a unique `(userId, clientKey)` so create/resume is idempotent;
* `mode` with a CHECK constraint; `schemaVersion` CHECK;
* `brief` as bounded JSON (`Json`), with the 64 KiB envelope enforced in the module (`PAYLOAD_TOO_LARGE`);
* optimistic `version` (integer, incremented on every successful mutation);
* nullable `planId` FK with **`ON DELETE SET NULL`**, so deleting an intake never deletes a plan that was created from it;
* `expiresAt` with a sliding 30-day window (`INTAKE_TTL_DAYS`) refreshed on every meaningful mutation;
* `createdAt`/`updatedAt`, indexes on `(userId, updatedAt)` and `expiresAt`;
* RLS enabled, **zero** grants to `anon`/`authenticated`/`service_role`, no Realtime publication.

Nothing is stored in PREPARING revisions, sealed revisions or Quest metadata. `SCHEMA_BUILD_VERSION` moved 21 → 22.

`lib/planner/server/intake-session.ts` is deliberately ignorant of the brief's shape: it treats it as opaque bounded JSON, which is why the service — not the session layer — decides what "empty" means (§12).

---

## 11. Migration and security

`prisma/migrations/20260926020000_planner_intake_session/migration.sql` is additive and historical migrations are untouched. Verified on disposable PostgreSQL: `npx prisma validate` reports the schema valid; the harness rebuilds the schema from the staged chain, applies this migration unchanged, and the full planner suite passes against it (623 passed / 7 skipped). On the development database all **54 of 54** migrations are applied with RLS enabled and zero client grants.

---

## 12. Refresh recovery and conflict

| Concern | Behaviour |
| --- | --- |
| Refresh | The server is the authority: the session is re-read on mount. A bounded `sessionStorage` mirror (the brief, ≤ 64 KiB) paints the student's own words immediately, then the server's answer replaces it |
| Which session? | The `clientKey` lives in `localStorage` per mode, so a new tab or a restart resumes the same unfinished intake instead of starting a second one |
| Stale writer | Every action carries `expectedVersion`; a mismatch raises `INTAKE_STALE`, the server's state is shown, and the notice says the last change was not applied — with **"Apply my last change again"** rather than a silent replay |
| Two tabs | They cannot silently merge: one wins the version and the other is told |
| Expiry | `INTAKE_EXPIRED` fails clearly and offers an explicit "Start a new brief"; nothing is ever silently recreated over a student's work |
| Unreadable stored brief | Distinguishes "never written" (`{}` — the storage placeholder, seeded with the real empty brief at create time) from "written but unparseable", which fails loudly rather than reading back as empty |
| Malformed response | The client validates the envelope and raises `INVALID_RESPONSE`; a contract mismatch is a message, not a blank screen |
| Deleting an intake | `planId` is `SET NULL`; a created plan survives its intake |

---

## 13. Quick Plan UI

`app/components/planner/quick-plan/` — `QuickPlan.tsx`, `useIntake.ts`, `ScopeEditor.tsx`, `WeeklyBudgetControl.tsx`, `AvailabilityControl.tsx`, `PlanBriefPanel.tsx`, `GenerationPanel.tsx`, `quick-plan.module.css`. Components are bounded (the largest is 340 lines) rather than a second monolith.

The surface: what are you preparing for → subject (optional) → target/exam date → what you need to cover → weekly time → *the live Plan Brief* → readiness and generation. There is no step counter and no final assumptions page; the student is preparing one brief.

Two behaviours worth naming:

* **Typed actions, serialized.** Edits are sent as actions (`setGoal`, `setTargetDate`, `updateScopeUnits`, …) with the version they were written against, queued so two fast edits cannot race each other into `INTAKE_STALE`. Text fields commit on blur, not per keystroke, and the scope editor only reconciles on blur.
* **Identity-preserving scope.** A unit that was not renamed keeps its `nodeId`, which is what the student's stated preparedness is keyed by; editing a unit's wording in place is a rename, not a delete-and-add. Positional pairing only applies when the list length is unchanged, so inserting a line cannot silently rename the unit below it.

---

## 14. Plan Brief UI

`PlanBriefPanel.tsx` shows mode, goal, subject, target date, scope (units, and the leaf count when grouping happened), weekly time, the computed availability, prepared-ness ("Stated for N of M units", or plainly unstated), exclusions, recovery reserve, readiness and open questions — as **rows, not cards**.

Rows are editable by moving focus to the control that owns the field rather than editing in place, so each field keeps one validation path. Preparedness is the honest exception: in Phase 1 its control lives in Advanced setup, so "Edit" opens Advanced setup instead of pretending a control exists here.

---

## 15. Advanced setup preservation

The detailed wizard is not deleted, not reduced and not made a prerequisite. `PlannerWorkspace` renders it behind **"Fine-tune first"** (and "Open Advanced setup" in the footer), with "Back to Quick Plan" to return. Everything it contained is still there: per-day availability, blocked dates, reserve, preparedness, priorities, session preferences, mock/check options, mode-specific fields, Smart Setup, the saved-plan list, the review/confirm branch and the Phase 5 rebalance panel. Nothing in this phase had to be filled in before a Quick Plan generation.

---

## 16. Smart Setup reuse

No second clarification framework exists. `IntakeView.questions` is produced by the existing `smartQuestions` engine (max 3, only when an answer would change the plan), served one at a time, with closed choices and a visible "skipping changes nothing" note. Answers go back through the existing `applySmartAnswers` merge via `answerSmartQuestion`, so the same code that already understood these answers still does.

The defect fixed here was in the transport, not the engine: the view originally sent option *labels* while the answer action is keyed by *value*, so the surface could not answer at all. Both now travel, and `whyItMatters` is shown with the question.

---

## 17. Generation adapter

`lib/planner/intake/to-input.ts` — `examInputFromBrief`, `roadmapInputFromBrief`, `masteryInputFromBrief`, `inputFromBrief`, plus `assertBriefGeneratable` and `inputBytesFor`. Pure, deterministic, no model call, no inference beyond what the student typed.

It satisfies every existing engine requirement: `scope` is the flattened labels joined with newlines in the same order, labels are unique, the horizon is inside `LIMITS.horizonDays`, the availability vector is the distributor's output, the recovery reserve is the mode default unless stated, and every mode detail is either a stated value or a documented default in `ADAPTER_DEFAULTS`.

Nothing intake-shaped reaches a revision snapshot: the engine never learns that a brief existed.

`expansion.ts` is where a fabrication used to live (`?? false`, `?? 3` for preparedness), and it now sends `preparednessForModel` — for the model, an unrated unit is `preparedness: "UNKNOWN"` with real nulls.

---

## 18. Warning / finding infrastructure

`lib/planner/intake/findings.ts` implements the Phase 0 envelope: `PlannerFinding { code, severity, scope, consequence, acknowledgementCode }`, `finding()`, `findingEnvelope()` (`{ok, findings, warnings, blockers, accepted}`), `verifyAcknowledgements()` — which rejects an acknowledgement for a warning that was not raised, **and** for a blocker, so a client cannot pre-accept something it has not been shown — and `ADVISORY_CONSEQUENCE` copy for every advisory code this phase can raise.

**Only genuinely advisory codes are raised, and hard blockers stay hard.** All of the following remain non-overrideable: ownership, stale/version conflicts, malformed schema, duplicate references, dependency cycles, impossible date structure, item duration outside 15–240, explicit HARD session limit, explicit HARD unavailable weekday, explicit HARD weekly limit, protected execution, lineage immutability and Phase 5 stale/reconciliation safety.

What is wired in this phase:

* The intake itself raises schedule advisories for the current brief — an overloaded availability (`FEASIBILITY_OVERLOADED_AVAILABILITY`), an intensity spike at the absolute daily ceiling, and a plan that starts on a day the student excluded — and ships them in the `IntakeView` envelope.
* Quick Plan shows each warning with its consequence and an explicit "Understood" acknowledgement, and **generation is never blocked by them**; accepting counts into telemetry as `warningsAccepted`.
* At confirmation, a revision that cannot cover its scope reports `EXCLUSIONS_REQUIRE_ACCEPTANCE`, and Quick Plan offers "Accept this and continue" beside "Change the brief" — the warn → explain → accept-the-tradeoff shape, with the existing server contract underneath.

Deliberately **not** done: bulk-converting educational-completeness validators, and the full release/editing relaxation. Those need their UI and tests reviewed in a later phase (§26 of the goal), and weakening them now would be the opposite of the review decision.

---

## 19. Mobile, accessibility and appearance

**Mobile:** single-column essentials, no horizontal form or page overflow, 44px minimum targets on every control (shared with the wizard's stylesheet), long titles wrap (`overflow-wrap: anywhere`), the Plan Brief is one collapsible disclosure, and the generation panel is sticky at the bottom on a phone and static from 700px up.

**Accessibility:** real `<label>` elements bound to real controls (one id per control — one duplicate-id defect was found and fixed this way), `<fieldset>`/`<legend>` for the weekly budget and the warnings, `role="status"` + `aria-live="polite"` on readiness and the server's distribution note, `role="alert"` on generation failure, `aria-pressed` on the time choices, a native disclosure for `Customize days`, focus moved to the field a Plan Brief row names, and no colour-only meaning.

**Appearance:** tokens only (`var(--text-primary)`, `var(--bg-panel)`, `var(--accent-primary)`, …) with no dark-only planner colours; the new stylesheet adds layout only and inherits element styling from `ExamPlanner.module.css`, so dark, light and both custom-background variants are covered by the same rules. The existing appearance suites (`phase6-ui`, `render-bounds`, `intelligence-ui`) still pass.

---

## 20. Performance measurements

Measured on an idle machine; `__tests__/planner/intake-measurements.test.ts` prints and asserts them (the runtime assertion carries a generous ceiling because a parallel full-suite run is a noisy machine — the figure below is the idle-run value).

| Measurement | Actual | Bound |
| --- | --- | --- |
| Empty brief | **516 B** | 65,536 B |
| Brief with 10 units | **1,627 B** | 65,536 B |
| Brief with 198 nodes (just under the schema maximum) | **19,847 B** | 65,536 B |
| Adapter payload, 40 units (EXAM) | **5,980 B** | 32,768 B (`LIMITS.inputBytes`) |
| Adapter payload, minimal EXAM brief | **590 B** | 32,768 B |
| Scope node cap | **200** (schema; 220 is rejected) | — |
| Engine unit cap after flattening | 200 leaves → **20 chapter units** | 50 (`LIMITS.topics`) |
| Weekly distribution runtime | **0.43 ms** per call (2,000 calls, 84-day horizon) | asserted < 10 ms |
| Session row | the brief is serialized once and capped at **64 KiB before any write** (`INTAKE_BRIEF_BYTES`); it is the only variable-size content in the row, so the row sits far inside the existing planner-wide `LIMITS.payloadBytes` of 256 KiB | 64 KiB brief / 256 KiB payload |
| Session reads per intake read | `todayFor` (1) + `intakeScheduleFacts` (3 bounded queries: schedule, floating rest dates, existing load) | no N+1 |
| Refresh recovery payload | the mirror is the brief, so it is bounded by the same 64 KiB and is skipped entirely when larger | 64 KiB |
| Quick Plan render with a 40-unit brief | **21.5 ms** (jsdom, cold render of the whole surface) | asserted < 5 s; the surface stays bounded because 40 units are one textarea and counts, not 40 cards |

---

## 21. Tests, build and database verification

Every command below was run for this report; the numbers are its output.

| Check | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | **0 errors** |
| Schema | `npx prisma validate` | valid |
| Planner suite (parallel) | `npx vitest run __tests__/planner` | **43 passed / 14 skipped files; 504 passed / 131 skipped tests** |
| Disposable PostgreSQL (serial, migrations + RLS + DB suites) | `node scripts/test-planner-postgres.mjs` | **51 passed / 5 skipped files; 623 passed / 7 skipped tests** |
| Full repository suite | `npx vitest run` | **165 passed / 14 skipped files; 1,770 passed / 131 skipped tests, 0 failures** on one run; see the note below about load-sensitive suites |
| Secrets | `npm run audit:secrets` | no credential patterns in tracked files |
| Model migration | `npm run audit:models` | 0 active retired-model references |
| Mobile | `npm run mobile:build` / `npm run mobile:verify` | built; **verify PASSED**, zero server-only symbols or secrets in `mobile/dist` |
| Production build | `npm run build` | compiled; `/api/planner/intake`, `/api/planner/intake/[id]`, `/api/planner/intake/[id]/action` present |
| Flag | `grep PLANNER_MODES_ENABLED .env .env.example` | **absent** — and the flag itself was removed entirely by the later coexistence patch ([AI_PLANNER_CLASSIC_MODES_COEXISTENCE_REPORT.md](AI_PLANNER_CLASSIC_MODES_COEXISTENCE_REPORT.md)), which is the current authority on how Planner Modes are reached |

Test suites added or extended by this phase:

* `__tests__/planner/intake-telemetry.test.tsx` — 15 (Phase 1a)
* `__tests__/planner/intake-brief.test.ts` — 16, `intake-distribution.test.ts` — 21, `intake-readiness.test.ts` — 11, `intake-adapter.test.ts` — 11, `intake-findings.test.ts` — 7
* `__tests__/planner/intake-brief-invariants.test.ts` — 7 (the round-trip invariant that caught the silent-reset defect)
* `__tests__/planner/intake-scope-sync.test.ts` — 10
* `__tests__/planner/intake-measurements.test.ts` — 4
* `__tests__/planner/planner-workspace.test.tsx` — 4 (updated: Quick Plan is the default entry, Advanced setup still reachable)
* `__tests__/planner/quick-plan.test.tsx` — 12 (essentials without a seven-day form, typed actions, readiness gating, generation through the existing pipeline, confirmation, refresh recovery, second-tab handling, advisories, the server's spread, a 40-unit brief)
* `__tests__/planner/database-intake-session.test.ts` — 12 and `database-intake-service.test.ts` — 11 (real PostgreSQL: create/resume, version increment, `INTAKE_STALE` with no overwrite, foreign user, expiry, generation hand-off with `null` preparedness, the ROADMAP and MASTERY compact paths end to end — goal + scope + date + weekly hours → `canGenerate` → a valid `UserInputV1` with a 480-minute distributed vector and no invented preparedness — and `NOT_AVAILABLE` for later phases)

**Two failures appeared during the sweep, and both were investigated rather than papered over:**

1. `intake-measurements.test.ts` — the distribution benchmark's original 1 ms ceiling is not a meaningful bound under full-suite CPU contention. It is a cost measurement, not a correctness property, so the ceiling is now one only a change of algorithm could breach (anything quadratic fails immediately) while the figure is still printed; the idle-run value is in §20.
2. `mastery-ui.test.tsx` > "renders a maximum-scope draft without losing a stage or an item" and, on a later run, four tests in `focus-backgrounds-cascade-triggers.test.ts` — pre-existing load-sensitive tests (a jsdom render test and a live-database cascade test) that pass alone in this same working tree (`mastery-ui` 10/10, `focus-backgrounds` 4/4) and fail only under a parallel full-suite run. Neither is touched by this phase, nothing was changed to make them pass, and both are green in the serialized configurations.

The final state is green in every configuration: the planner suite in parallel, the full repository suite, and the serialized disposable-PostgreSQL run the repository's own harness uses.

**Browser QA was not performed.** No browser automation is available in this environment, so there is no claim of manual QA. Interaction is covered by component tests with `@testing-library` (including `axe-core` in the pre-existing suites that use it); everything visual (dark/light/custom backgrounds, real-device tap targets, sticky generation panel) is verified by tokens, CSS rules and shared stylesheet reuse rather than by inspection.

---

## 22. Classic coexistence

Classic Planner is not routed through the brief and was not modified: `app/api/ai-planner/route.ts`, `lib/ai/planning-engine.ts` and `lib/ai/orchestrator.ts` keep their pinned hashes, the endpoint, prompting, persistence, quota, history and UI are unchanged, and the Phase 6 DeepSeek Flash migration stands (`npm run audit:models` reports zero active retired-model references). The planner system is still unreachable unless the server capability is on, and `PLANNER_MODES_ENABLED` remains unset in committed configuration. *(Superseded by the coexistence patch, which removed the flag outright.)*

---

## 23. Deviations, and what they cost

1. **`preparedness.ts` lives at `lib/planner/preparedness.ts`, not under `intake/`.** The goal listed it in the intake directory, but it is engine policy read at 42 sites across the exam, mastery, roadmap, retrieval and quality layers. Putting it under `intake/` would have implied the engine's preparedness rules belong to the intake layer. Names were allowed to adapt to repository conventions.
2. **Scope reordering appends rather than inserts.** The text editor's list is the stored order, and a line typed into the middle is appended (the service applies additions by appending). Showing the stored order means the UI never claims an order the plan does not have. Reordering belongs with research/import, where a scope arrives with a real structure to preserve.
3. **Preparedness has no Quick Plan control.** Its editor remains in Advanced setup, and the Plan Brief row's "Edit" goes there rather than inventing a second control. Phase 3's preparedness matrix is where this becomes a first-class surface.
4. **`entryPath: "ADVANCED"` is never emitted.** The wizard does not know how it was reached, so a student arriving via "Fine-tune first" reports `LEGACY_WIZARD`. `QUICK_PLAN` — the comparison this phase needed — is correct. `SWITCHED_MODE` is likewise vocabulary-only.
5. **Findings are intake-time advisories only.** No existing educational validator was converted, and the commit-time `EXCLUSIONS_REQUIRE_ACCEPTANCE` path is the only generation-stage acceptance this phase exercises.
6. **`GET /api/planner/intake/[id]` returns 409 `INTAKE_EXPIRED` rather than a soft "expired" flag.** The contract is refusal-plus-explanation; no silent recreation exists.
7. **The session envelope (64 KiB brief inside ≤ 256 KiB) is enforced in the module, not by a database constraint**, because the brief is stored as JSON and the pre-write check is the only place the serialized size exists.
8. **One pre-existing test expectation was updated rather than removed:** `mastery-ui.test.tsx` and `planner-workspace.test.tsx` asserted that choosing a mode lands on the wizard. That *is* the change this phase was asked to make, so the assertions now describe the new contract (Quick Plan default, Advanced one step away) and keep their original intent that only the chosen mode's surface renders.

---

## 24. Blockers and gaps before UX Phase 2

Not blockers to this phase's stop gate, but things Phase 2 must not inherit silently:

1. **Provenance is contract-only.** `provenanceRefs` exists and is bounded, and `RESEARCH_CONFIRMED` / `IMPORT_CONFIRMED` are scope sources readiness understands — but nothing produces a source URL yet. `executeGoogleSearch` (`lib/ai/chat-tool-executor.ts:1244-1295`) returns `{query, qualification, source, summary}` and **discards grounding metadata**, and it hardcodes `gemini-3.7-flash` instead of reading `GEMINI_MODELS`. Phase 2 must extend that result shape before any provenance claim can be honest.
2. **Research has no measured cost.** No `plannerResearch` quota exists, by decision: Phase 2 should measure calls, latency, provider cost and retry rate under strict session bounds first.
3. **`RESEARCH_AVAILABLE` and `SCOPE_UNCONFIRMED` are unexercised in Phase 1** (no research, and manual scope counts as confirmed). Their first real use is Phase 2, and `scopeCandidateAwaitingConfirmation` is the input that will drive them.
4. **The scope editor is a placeholder by design.** It is flat, has no hierarchy affordance and cannot reorder; Phase 2's research/import replaces the *source*, and the flattening contract underneath is already the one Phase 2 needs.
5. **Advisory findings have no persistence.** Acceptances are shown, counted in telemetry and re-derived per read; nothing is stored, which is fine while the only advisories are intake-time. Semantic advisories from a generated draft (`semanticReview`) are displayed but not yet routed through `verifyAcknowledgements`.
6. **The 30-day sliding expiry is a product guess.** It is implemented and tested; whether it should be shorter (a week of inactivity) or longer is a review decision.
7. **`ADVANCED_REFINEMENT_AVAILABLE` is deliberately quiet** — presented only as the "Fine-tune first" affordance. If review wants refinement discoverable in another way, that is a copy/placement change, not an architecture change.
8. **No browser QA exists in this environment** (§21), so visual verification of the five appearance variants remains open until a harness can do it.

---

## Answers to the 18 explicit questions

1. **Can a user generate without entering seven daily values?** Yes. The default asks one weekly figure; `Customize days` is a closed disclosure, and the readiness path needs only a capacity statement (weekly hours, or the account's own schedule).
2. **Can a user generate without rating every topic?** Yes. Preparedness is optional and readiness never requires it; the "preparedness may remain completely unstated" case is asserted in the adapter, service and component suites.
3. **Does unknown preparedness remain genuinely unknown?** Yes. Unstated is `null` end to end — brief, adapter and model context (`preparedness: "UNKNOWN"` with real nulls). The two fabrications in `expansion.ts` (`?? false`, `?? 3`) were removed.
4. **Can high-priority unknown topics avoid being falsely classified as weak?** Yes. `isWeak` is false when nothing was stated, `provisionWeight` stays at the standard 2, and `isHighPriorityWeak` does not escalate. Pinned by test.
5. **Is weekly-hours distribution deterministic and server-authoritative?** Yes. Integer largest-remainder allocation, no clock or randomness, and floating rest dates plus existing Quest load are read only on the server; the client displays the result and never estimates one.
6. **Is existing workload balanced against but not subtracted twice?** Yes. It scales a day's weight (floor ¼) and is never subtracted from the budget; the engine subtracts it per day in `capacity.ts`. Asserted directly.
7. **Is weekly budget per-plan rather than account-global?** Yes. It lives in the brief (and its session), and no account-wide setting is written. The account's own schedule may *inform* it as `SYLF_DATA` only when the student explicitly chooses "use my normal Sylf schedule".
8. **Does Quick Plan survive refresh?** Yes. The session is the authority and is re-read on mount; the bounded mirror paints instantly and loses every disagreement to the server.
9. **Can two tabs overwrite one another silently?** No. Optimistic versioning returns `INTAKE_STALE`, the server's state is shown, the student is told their change was not applied, and re-applying is an explicit action.
10. **Is the six-step wizard gone from the DEFAULT path?** Yes. Choosing a mode opens Quick Plan; the wizard is reached only through "Fine-tune first" / "Open Advanced setup".
11. **Is Advanced setup still available?** Yes, unchanged and complete, one click away in both directions.
12. **Is optional refinement presented as an affordance rather than a warning?** Yes. When the essentials are in place the panel says "I have enough to make a first draft" and offers "Fine-tune first" beside it; there is no warning styling and no block on generation.
13. **Does Quick Plan use the existing planner generation pipeline?** Yes. It sends the server-built `UserInputV1` to `/api/planner/generate` with the same request key, streams the same stages, recovers the same operation, and confirms through the same commit contract — quota, operations, provider budget, critic, repair, cancellation and lost-response recovery all intact.
14. **Were hard validators preserved?** Yes. Every hard blocker named in the goal is untouched and non-overrideable; the findings infrastructure flips no validator.
15. **Is the warning/acknowledgement framework present without globally weakening educational validators?** Yes. The envelope, the consequence copy and `verifyAcknowledgements` exist and are used for intake-time advisories and the existing exclusions acceptance; no educational-completeness validator was converted.
16. **Is segmentation treated as a fallback rather than the automatic response to fine-grained large syllabi?** Yes. Fine-grained nodes are preserved, chapter-level units are attempted first (200 leaves → 20 units, measured), and segmentation happens only if the coarsened scope still cannot be represented. Nothing is truncated or merged across unrelated chapters.
17. **Is Classic Planner unchanged?** Yes — endpoint, prompting, persistence, quota, history and UI, with hashes pinned by tests and `audit:models` clean.
18. **Is UX Phase 2 safe to begin?** Yes. The intake foundation is complete and verified: brief, readiness, authority, distribution, adapter, session, API, telemetry, findings envelope and the Quick Plan surface. Phase 2 can build research and import on top of it without reopening any of it — provided §24.1 is done first: the search result shape must carry source URLs before any provenance is presented to a student.

---

## Stop gate

| Condition | State |
| --- | --- |
| Phase 1a telemetry implemented | ✔ (5 events, bounded fields, once-only, no academic content) |
| Quick Plan is the default Planner Modes creation path | ✔ |
| Plan Brief works | ✔ (live panel, server-computed readiness and distribution) |
| Weekly study budget works | ✔ (per plan, choices + custom + normal schedule, server spread, Customize days disclosure) |
| Unknown preparedness is safe | ✔ (null end to end, no weak escalation, no forced review, `UNKNOWN` for the model) |
| Intake refresh recovery works | ✔ (server authority, bounded mirror, `INTAKE_STALE` surfaced, explicit restart on expiry) |
| Advanced setup remains available | ✔ (unchanged, one click away) |
| Generation still uses the Phase 0–6 engine | ✔ (same endpoint, same input contract, same commit) |
| Tests, build and database checks pass | ✔ (see §21) |
| Report complete | ✔ |

**Stopped here, awaiting review before UX Phase 2.** Not begun, as instructed: syllabus web research, provenance implementation beyond Phase-1 contracts, upload/PDF/photo parsing, curriculum comparison, the preparedness matrix, Planner Copilot, natural-language action parsing, the `plannerResearch` quota, the full editing-relaxation rollout, and public enablement. `PLANNER_MODES_ENABLED` remains unset in committed configuration. *(Superseded by the coexistence patch, which removed the flag outright.)*
