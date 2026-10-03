# SYLF PLANNER EXPERIENCE — PHASE 0 ARCHITECTURE REPORT

**Scope:** architecture and contracts for the Planner experience upgrade (Quick Plan, research, hierarchical scope, optional preparedness, Planner Copilot).

**Status:** architecture only. Nothing in this report is implemented. No migration, no flag change, no new route, no UI. Sections 19 and 20 (validation classes and the override contract) are additions made during review of the first draft; every other section is the set the phase asked for.

**Method:** every claim below was read from the current repository, not inferred from earlier phase reports. Where the repository and an earlier report disagree, the repository is the authority and the disagreement is noted. The evidence for each load-bearing constraint is cited inline as `file:line`.

---

## 1. Repository reconciliation

### 1.1 What the planner is today

The engine completed in Phases 1–6 is intact and is treated as trusted infrastructure: `PlannerPlan` / `PlannerRevision` / `PlannerQuestLink` / `PlannerCheckResult` / `PlannerPreference` / `PlannerFrictionEvent`, the operation and quota lifecycle, transactional materialization, lineage and tombstones, the shared generation pipeline with its bounded critic and repair, A1 Smart Setup, A2 (retrieval, intensity, Core/Stretch, Coverage Map), A3 (preferences, friction) and Phase 5's user-approved replanning with atomic reconciliation. This upgrade is an **intake and experience** layer in front of that engine; it proposes no change to any engine contract except the two additive ones argued in §11 and §19.

### 1.2 Verification baseline recorded for this phase

| Item | State |
| --- | --- |
| Feature flag | `PLANNER_MODES_ENABLED` is **unset** in `.env` and `.env.example`. It is read server-side only, in four places: `lib/planner/server/core.ts:32` (`requireEnabled` → 404 `NOT_FOUND`), `lib/planner/server/mutation-guards.ts:13,17,22,36,52`, `app/api/planner/capabilities/route.ts:11`, and one projection in `lib/study-schedule-service.ts:344`. The client never reads the variable; it learns the state from `/api/planner/capabilities` (`PlannerCapabilities` = `{enabled, today, timezone, restDays, subjects}` — `lib/planner/transport.ts:24`). A local-only `.env.local` (gitignored by `.gitignore:34` `.env*`) currently holds `PLANNER_MODES_ENABLED=true` for inspection; that file is not shared configuration. |
| Migrations | 54 of 54 applied to the development database; the six planner tables exist with RLS enabled and **zero** grants to `anon`/`authenticated`/`service_role`. |
| Schema build | `SCHEMA_BUILD_VERSION = 21` (`lib/prisma.ts:21`). |
| Tests | Whole repository **1,642 passed / 110 skipped** (166 files); planner suite on disposable PostgreSQL **478 passed / 7 skipped** (44 files). |
| Feature boundaries | Classic Planner (`app/api/ai-planner/route.ts`, `lib/ai/orchestrator.ts`, `lib/ai/planning-engine.ts`) is architecturally independent and hash-pinned by a test; it is not in scope and must not be touched. |
| Pre-existing working-tree changes | Unrelated to this phase and not introduced by it: a modified `app/api/ai-planner/route.ts` (quota in the SSE result, present before the planner phases), a modified `.gitignore`, several modified non-planner test/route files, and all phase reports plus the two addenda as untracked files. |

### 1.3 Two contract facts that shape everything downstream

1. **`scope` is derived, not free text.** Each mode's normalizer requires `input.scope === input.<mode>.topics.map(t => t.label).join("\n")` (`lib/planner/exam-policy.ts:50`, `lib/planner/roadmap-policy.ts:180`) and rejects duplicate labels case-insensitively (`DUPLICATE_SCOPE_TOPIC`). A hierarchical source scope therefore cannot be sent as-is: it must be flattened into **unique** labels, in order, and the same string must accompany it.
2. **Capacity is a seven-weekday vector, not a total.** The contract is `availability = { dailyMinutes: number[7] (0–720 each), recoveryPercent: 0–50, blockedDates: string[] }` (`lib/planner/contracts.ts:56`). Everything else about a real schedule — the account's rest weekdays, floating rest dates, and the minutes already committed to existing Quests — is supplied by the **server** as an `AvailabilitySnapshot` (`lib/planner/capacity.ts:7`), and the effective day capacity is computed there as `budget − reserve − existing − proposed` (`lib/planner/capacity.ts:16`).

### 1.4 Pre-existing observations recorded, not fixed

* `executeGoogleSearch` hardcodes `model: "gemini-3.7-flash"` instead of reading `GEMINI_MODELS` (`lib/ai/chat-tool-executor.ts:1268`). Phase 6 centralized the *DeepSeek* surface; this Gemini literal is outside that remit and is flagged here because §12 depends on the same call path.
* `PlannerConstraintSourceSchema` admits `LEARNED_PREFERENCE` while the code deliberately rejects it (`lib/planner/constraints.ts:44-54`). The schema anticipates A3's authority story; §8 must respect that it is not yet usable.

---

## 2. Current UX architecture

### 2.1 Entry and routing

`PlannerWorkspace` (94 lines, `app/components/planner/PlannerWorkspace.tsx`) is the single entry point. It renders only when the server capability is on — `app/api/planner/capabilities/route.ts:11` returns disabled otherwise — and it owns the outcome-based mode choice (PRD FR-01), then hands off to one of three self-contained mode components. Saved plans are listed inside each mode component, not in the workspace.

### 2.2 The three mode surfaces

| Component | Lines | Shape |
| --- | --- | --- |
| `ExamPlanner.tsx` | 1,377 | Seven steps: subject → scope → exam date → weekday minutes → per-topic preparedness → Smart Setup → generate, plus a saved-plan list and a review/confirm branch |
| `RoadmapPlanner.tsx` | 1,524 | The same shape plus strategic/expansion branches and per-milestone "revise this period" |
| `MasteryPlanner.tsx` | 1,419 | The same shape with stage-oriented review, progress and the check self-report |

The step titles are a literal array (`app/components/planner/ExamPlanner.tsx:97-102`): "What are you preparing for?", "What is included?", "When is the exam?", "When can you study?", "How prepared are you?", "Review your assumptions" — with generation as step 6. The wizard is therefore a **linear six-question form followed by a generation step**, and this is the structure the upgrade replaces as the default path.

### 2.3 Review, saved plans and post-confirmation surfaces

After generation the same components render the review branch: the plan item editor (`PlanItemEditor.tsx`, 189 lines) with Core/Stretch markers, friction capture and retrieval hints; `CoverageMapPanel.tsx` (125); `PreferencePanel.tsx` (125); `StretchPromotion.tsx` (114); `FrictionFeedback.tsx` (91); `IntensityNote.tsx` (22); and `RebalancePanel.tsx` (547) for Phase 5 replanning. `ExamPlannerQuickModal.tsx` (50) is a small modal.

### 2.4 Transport and routes

Client helpers are small and uniform (`lib/planner/exam-client.ts` 60, `roadmap-client.ts` 95, `mastery-client.ts` 53, `rebalance-client.ts` 114, `coverage-client.ts` 114, plus stretch/preferences/friction/retrieval clients, and a shared `transport.ts`). Sixteen planner routes exist today, all following one convention (`plannerRoute` + `readBody` from `lib/planner/server/http.ts`, `Cache-Control: private, no-store`):

```
/api/planner                                 GET (saved plans, cursor-paged)
/api/planner/capabilities                    GET
/api/planner/generate                        POST (streaming generation)
/api/planner/recover/[key]                   GET
/api/planner/[id]                            GET/PATCH/DELETE (plan detail/archive)
/api/planner/[id]/commit                     POST
/api/planner/[id]/revisions                  GET
/api/planner/[id]/operations/[key]           GET (recovery)
/api/planner/[id]/check-result               POST
/api/planner/[id]/friction                   POST
/api/planner/[id]/preferences                GET/POST
/api/planner/[id]/stretch                    POST
/api/planner/[id]/rebalance                  POST
/api/planner/[id]/rebalance/confirm          POST
/api/planner/[id]/milestones/[itemKey]/expand POST
```

### 2.5 Generation, cancellation and recovery

`POST /api/planner/generate` takes exactly `{schemaVersion, requestKey, input: UserInputV1}` (`lib/planner/server/generation.ts:51`). It parses the input against the mode's envelope, calls `createPlanShell` with `creationKey = requestKey` and `digest(input)` as the creation hash, runs the mode's preflight feasibility check (returning 422 with the mode's infeasible code and a feasibility object), then `beginOperation` → a PREPARING revision carrying the input snapshot, the availability snapshot and a quota reservation, and only then streams generation with stage events. Cancellation and recovery are served by `recoverGeneration` / `recoverOperation` plus an in-process registry (`lib/planner/server/running.ts`); the durable state is the operation row.

The consequence for this upgrade is decisive: **there is no server-side home for anything before the first generate call.** A DRAFT `PlannerPlan` shell exists only once generation starts, and it is bound to one `requestKey` and one input digest (`IDEMPOTENCY_MISMATCH` on a different input), so it cannot serve as a mutable working brief.

---

## 3. Current pain points mapped to code

| # | Pain point | Where it lives | Why it costs the student |
| --- | --- | --- | --- |
| 1 | The student must author the scope | Step 1 renders a topic entry surface that has to produce `scope === labels.join("\n")` (`exam-policy.ts:50`) with unique labels | For a 40-topic syllabus this is typing out a syllabus Sylf could retrieve. Manual entry is the dominant effort in the current flow. |
| 2 | Preparedness is mandatory per topic | Step 4 (`ExamPlanner.tsx:1010`) drives `ScopeTopicSchema`'s required `covered` / `confidence` / `difficult` (`scope-topic.ts:22-27`) | 40 topics × 3 answers before any plan exists, for a signal the addendum treats as optional. |
| 3 | Capacity is expressed as seven daily numbers | Step 3 (`ExamPlanner.tsx:983`) writes `availability.dailyMinutes[7]` as weekday minute fields | A student thinks in hours per week, not minutes per weekday; and the fields imply precision they do not have. |
| 4 | The horizon is a manual date | Step 2 requires an exam date within 365 days (`ExamPlanner.tsx:305`) | Fine for a fixed exam; for anything derived, the student must compute it. |
| 5 | Structure is flat | Topics are a flat list; `LIMITS.topics = 50`, roadmap has its own envelope | Real syllabi are Section → Chapter → Topic; a flat list loses grouping the user recognises, and 50 is easily exceeded (see §10). |
| 6 | The same form is the only entry | `PlannerWorkspace` → one wizard per mode | There is no short path: a student who can say "10 hours a week, mocks in June" has no way to express that in one turn. |
| 7 | Warnings are refusals | `assertCoreSufficient`, `MISSING_*`, `INSUFFICIENT_*`, `INFEASIBLE_CAPACITY` all throw (`contracts.ts:285`, `exam-policy.ts:271-276`, `capacity.ts:16`) | Intentionally imperfect plans are impossible to express, and a student who wants to study longer than recommended or delete a generated task has no consenting path (§19). |
| 8 | Effort is invisible | No telemetry for entering, first input, time to first draft, abandonment, or fields touched (`lib/planner/telemetry.ts:26-160`) | Today the redesign cannot be compared with the current wizard on the axis that matters (§24). |
| 9 | Refresh loses work | Wizard state is React state inside the component | A reload during a long intake loses everything the student entered. |

---

## 4. Preserve / reuse / refactor / replace matrix

| Component / module | Decision | Reason |
| --- | --- | --- |
| `PlannerWorkspace` | **Preserve and extend** | It is already the mode chooser; Quick Plan / Advanced become a layer under it |
| `ExamPlanner`, `RoadmapPlanner`, `MasteryPlanner` | **Refactor, then preserve as Advanced setup** | Their step bodies are the detailed controls the addendum keeps; each is split into shared controls rather than deleted |
| `PlanItemEditor`, `RebalancePanel`, `CoverageMapPanel`, `PreferencePanel`, `StretchPromotion`, `FrictionFeedback`, `IntensityNote` | **Preserve unchanged** | Post-generation surfaces the upgrade does not touch |
| `ExamPlannerQuickModal`, `ExamPlanner.module.css` | **Reuse** | Modal pattern and the token-only stylesheet (26 `var(--…)` uses, no hardcoded colours) stay the styling home |
| Per-topic preparedness UI (inside step 4) | **Refactor into `PreparednessMatrix`** | Shared by Quick Plan (optional, fast) and Advanced (detailed) |
| Weekday minutes UI (step 3) | **Refactor into `WeeklyBudgetControl` + `AvailabilityControl`** | Weekly hours become the default; per-day detail moves behind "Customize days" |
| Scope entry (step 1) | **Refactor into `ScopeReview`** | Manual entry stays as one source among research/import/manual |
| Smart Setup step 5 | **Reuse as-is, re-hosted** | `smartQuestions` / `applySmartAnswers` already implement bounded clarification (§12 note below) |
| Saved-plan list, review branch, confirm dialog | **Preserve** | Unchanged Phase 0–6 surfaces |
| `lib/planner/server/*` except two additive changes | **Preserve** | Operation lifecycle, materialization, reconciliation are the trusted engine |
| `ScopeTopicSchema` (§11) and validator severity (§19) | **Two additive changes** | The only engine-adjacent edits this upgrade needs |

**Reuse discovered by inspection, worth stating explicitly:** `lib/planner/smart-setup.ts` already provides the "0–3 material questions" mechanism the Quick Plan needs — `SMART_QUESTION_MAX = 3` (`:39`), four closed uncertainty reasons (`lib/planner/constraints.ts:56`), a closed answer vocabulary (`SMART_ANSWER_OPTIONS`, `:696`), server-side validation (`assertAnswerSchema` `:703`, `assertSupportedAnswers` `:722`) and application (`applySmartAnswers` `:760`). The Quick Plan's clarification step is therefore a **re-host**, not a new subsystem, and the Copilot's clarification actions should reuse the same vocabulary.

---

## 5. Plan Brief V1 contract

The brief is a **pre-generation structured object**, owned by the intake layer, which converts deterministically into the existing mode input. It is not sent to the engine and is never stored in a revision snapshot.

```ts
export const PlanBriefV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: ModeSchema,                       // EXAM | ROADMAP | MASTERY — fixed once chosen

  // What is being planned
  goal: z.strictObject({
    title: title,                         // reused bound (1..200)
    objective: z.string().trim().max(500).optional(),
  }),
  subject: z.strictObject({
    kind: z.enum(["SYLF_SUBJECT", "FREE_TEXT"]),
    subjectId: z.number().int().positive().nullable(),   // when SYLF_SUBJECT
    name: z.string().trim().min(1).max(200).nullable(),  // when FREE_TEXT
  }),
  target: z.strictObject({
    endDate: DateKeySchema,               // horizon end; equals examDate for EXAM
    examDate: DateKeySchema.nullable(),   // EXAM only; ROADMAP/MASTERY may derive a horizon
    dateProvenance: BriefAuthoritySchema,
  }),

  // Capacity (see §9)
  budget: z.strictObject({
    weeklyMinutes: z.number().int().min(0).max(10080).nullable(),  // null = not yet stated
    dailyOverrides: z.array(z.number().int().min(0).max(720).nullable()).length(7).nullable(),
    blockedDates: z.array(DateKeySchema).max(366),
    recoveryPercent: z.number().int().min(0).max(50).nullable(),   // null = engine default
    acceptReducedReserve: z.boolean(),
    distributionNote: z.string().max(300).optional(),              // human-readable summary of the last distribution
  }),

  // Background (optional, drives comparison only — §15)
  backgroundCurriculum: z.strictObject({
    label: z.string().trim().min(1).max(200),
    level: z.string().trim().max(60).nullable(),     // reuses ACADEMIC_LEVELS values
    board: z.string().trim().max(60).nullable(),     // reuses EXAM_BOARDS values
  }).nullable(),

  // Scope (see §10)
  scope: z.strictObject({
    source: z.enum(["USER_MANUAL", "RESEARCH_CONFIRMED", "IMPORT_CONFIRMED", "SYLF_SUBJECT"]),
    confirmedAt: z.string().datetime().nullable(),
    provenanceRefs: z.array(z.string().max(60)).max(8),   // ids into the session's provenance records
    nodes: z.array(ScopeNodeSchema).max(BRIEF_LIMITS.scopeNodes),
  }),

  // Preparedness is SPARSE: only units the student actually stated appear here (§11)
  preparedness: z.array(z.strictObject({
    unitRef: UnitRefSchema,
    covered: z.boolean().nullable(),
    confidence: z.number().int().min(1).max(5).nullable(),
    difficult: z.boolean().nullable(),
    priority: TopicPrioritySchema.optional(),
    prioritySource: TopicPrioritySourceSchema.optional(),
  })).max(BRIEF_LIMITS.scopeNodes),

  constraints: PlannerConstraintsSchema,          // reused unchanged
  unresolved: z.array(z.strictObject({            // at most SMART_QUESTION_MAX
    code: PlannerQuestionReasonSchema,
    promptKey: z.string().max(60),
  })).max(3),

  assumptions: z.array(z.string().trim().max(300)).max(20),
  readiness: ReadinessStateSchema,                // derived server-side, echoed for display
});

export const ScopeNodeSchema = z.strictObject({
  nodeId: z.string().min(1).max(60),              // intake-local, never a durable planner key
  label: z.string().trim().min(1).max(200),
  kind: z.enum(["SECTION", "CHAPTER", "TOPIC"]),
  parentId: z.string().max(60).nullable(),
  selected: z.boolean(),
});

export const BRIEF_LIMITS = {
  scopeNodes: 200,          // tree nodes including containers
  provenanceRefs: 8,        // per brief
  recentTurns: 12,          // conversation (§22)
  assumptions: 20,
} as const;
```

**Bounds and modes.** `mode` is fixed at creation (a mode change starts a new brief; switching is a UI affordance, not a mutation). `target.examDate` is required for EXAM and must equal `target.endDate`, mirroring the engine's `EXAM` refinement (`contracts.ts:78`). `budget.dailyOverrides` is `null` until the student customizes days, in which case stated weekdays win over the computed distribution. Everything else is optional, and "absent" is a meaningful state, not a zero.

**Deliberately not in the brief:** item-level plan content (the engine owns it), durable planner keys, Quest identifiers, the confirmed revision, and any preparedness for units the student did not state.

---

## 6. Plan Brief → existing planner input mapping

The bridge is a pure, deterministic adapter set — `lib/planner/intake/to-input.ts` — with one function per mode. It never mutates the brief and never invents academic content.

```
PlanBriefV1 → (weekly distribution §9) → availability
            → (flatten §10)            → scope string + topics[]
            → (preparedness §11)        → per-topic covered/confidence/difficult
            → mode details              → UserInputV1
```

**Shared mapping.**

| Brief field | `UserInputV1` field | Rule |
| --- | --- | --- |
| `goal.title` | `title` | verbatim |
| flattened labels | `scope` **and** `<mode>.topics[].label` | the same array, joined with `\n` — the engine requires equality (`exam-policy.ts:50`) |
| `target.endDate` | `endDate` | verbatim; horizon ≤ 365 (`LIMITS.horizonDays`) |
| `budget.weeklyMinutes` → distribution | `availability.dailyMinutes` | §9 |
| `budget.blockedDates` | `availability.blockedDates` | verbatim, inside the horizon |
| `budget.recoveryPercent ?? default` | `availability.recoveryPercent` | engine default when unstated |
| `constraints` | `constraints` | verbatim |

**Exam.**

| Brief | `exam` detail field (`ExamDetailsSchema`) |
| --- | --- |
| `subject.name` / SYLF subject | `subjectName`, `subjectId` |
| flattened units + `preparedness` | `topics[]` (`ScopeTopicSchema`) |
| `target.examDate` | `examDate` (and `endDate`) |
| `budget.acceptReducedReserve` | `acceptReducedReserve` |
| session-length soft preference, else 45 | `preferredMinutes` |
| not asked in Quick Plan | `format` = `"UNSPECIFIED"`, `allowExamDayStudy` = `false`, `approach` = `"STANDARD"`, `mockMinutes` = `null`; each is editable in Advanced |

**Roadmap.**

| Brief | `roadmap` detail field (`RoadmapDetailsSchema:35`) |
| --- | --- |
| `subject.name` | `subjectName`, `subjectId` |
| `backgroundCurriculum.level`/`board` | `qualification` |
| flattened units + `preparedness` | `topics[]` |
| horizon length | `granularity` (derived: short → `WEEK`, long → `MONTH`; user-overridable) |
| `budget.acceptReducedReserve` | `acceptReducedReserve` |

**Mastery.**

| Brief | `mastery` detail field (`MasteryDetailsSchema:62`) |
| --- | --- |
| `goal.title` | `focus` **and** `unitTitle` |
| `subject.name` | `subjectName`, `subjectId` |
| flattened units + `preparedness` | `topics[]` |
| not asked in Quick Plan | `desiredDepth` = `"SOLID"`, `priorExposure` = `"NEW"`, `checkPreference` = `"MIXED_PRACTICE"` (Advanced-editable) |
| `target.endDate` | `targetDate` (nullable in the contract; the brief always supplies one) |
| `budget.acceptReducedReserve` | `acceptReducedReserve` |

**Why `UserInputV1` is not expanded.** Every one of these targets already exists with a defined meaning, and the engine's digests, validators and snapshots are all keyed to those shapes. Adding intake-shaped fields to `UserInputV1` would put pre-generation state inside the immutable revision history that Phase 5 depends on. The only two additive contract changes this upgrade needs are `ScopeTopicSchema` nullability (§11) and warning severity (§19), both argued on their own terms.

---

## 7. Readiness model

Five states, exactly as the addendum defines them, computed by **one pure server-owned function** — `lib/planner/intake/readiness.ts` — and rendered from the same module by the client so the two can never disagree.

```ts
export type ReadinessState =
  | "NEEDS_CORE_INFO" | "RESEARCH_AVAILABLE"
  | "NEEDS_SCOPE_CONFIRMATION" | "READY_FOR_DRAFT"
  | "ADVANCED_REFINEMENT_AVAILABLE";

export function briefReadiness(brief: PlanBriefV1, ctx: ReadinessContext): {
  state: ReadinessState;
  missing: CoreRequirementCode[];       // closed vocabulary
  canGenerate: boolean;                 // true only in READY_FOR_DRAFT
  notes: string[];                      // why, in display terms
};
```

`CoreRequirementCode` is closed: `GOAL_MISSING`, `SCOPE_MISSING`, `SCOPE_UNCONFIRMED`, `TARGET_DATE_MISSING`, `CAPACITY_MISSING`. The per-mode minimum, per the addendum's §18:

| Mode | Required before a first draft | Optional |
| --- | --- | --- |
| EXAM | identifiable goal/exam, confirmed scope, exam date, capacity input | background curriculum, preparedness, difficulty, priority, mock, session length, soft constraints |
| ROADMAP | goal, confirmed scope, target date, capacity input | same |
| MASTERY | unit/goal, confirmed scope, target date (or derivable horizon), capacity input | depth, prior exposure, check preference, preparedness |

`RESEARCH_AVAILABLE` means "a usable scope could be researched or imported, and none is confirmed yet" — the state that offers research. `NEEDS_SCOPE_CONFIRMATION` means a candidate scope exists (researched or imported) and has not been confirmed by the student. `ADVANCED_REFINEMENT_AVAILABLE` means a draft is possible *and* Advanced setup has something worth offering (unstated preparedness, no per-day detail, no constraints).

**Ownership.** The server owns readiness: the generate endpoint recomputes it and refuses with 422 `BRIEF_NOT_READY` plus `missing[]` when `canGenerate` is false. The client renders the same function's output for live feedback. **The model never decides completeness**, never sees `canGenerate` as an instruction, and cannot set a readiness state: a Copilot action that would produce a "ready" state does so only because the deterministic function says so after the action is applied.

---

## 8. Authority model

Six levels, resolved per field:

| Level | Source | May set | May not |
| --- | --- | --- | --- |
| 1 | Explicit instruction in the current session | anything except hard-constraint violations | override a hard blocker (§19) |
| 2 | Student-edited / confirmed Plan Brief | anything in the brief | be overwritten by 3–6 |
| 3 | Confirmed research or import result | scope nodes, provenance, target-date *suggestions* pending confirmation | set preparedness, priorities, or anything the student stated |
| 4 | Existing Sylf data (subjects, rest days, quota, existing Quests) | capacity inputs, subject identity | scope content or preparedness |
| 5 | Learned SOFT preferences (A3) | unset optional fields only (session length, density, placement, detail, buffer) | override an explicit value; create a constraint |
| 6 | Model suggestion | nothing directly — it becomes a *proposal* per §17 | be applied without server validation |

**Field provenance.** Each brief field carries the level that last set it (`BriefAuthoritySchema`), which is what makes the ladder enforceable rather than aspirational: a level-3 research result can only write fields whose current provenance is *unset* or *level 3*; a level-5 preference can only write fields whose provenance is *unset*; a level-6 suggestion is stored as a proposal with its own id.

**Conflict resolution.** When a lower-authority source proposes a different value for a set field, the higher value wins, the proposal is **not discarded** — it is returned to the client as `briefConflicts: [{ field, kept: {value, authority}, shadowed: {value, authority} }]` and shown as "you set X, so we ignored Y". Nothing is silently overwritten; nothing is silently dropped. Hard constraints sit outside this ladder entirely: they are validated deterministically (§19) and no authority level can relax one.

---

## 9. Weekly-hours capacity architecture

### 9.1 The decision

Weekly hours are the **default capacity input**, and they are a **target budget, not a constraint**. They are converted to the engine's existing availability contract by a deterministic, **server-authoritative** distributor:

```ts
export function distributeWeeklyBudget(args: {
  weeklyMinutes: number;                 // the stated budget
  firstDate: string; lastDate: string;   // the horizon actually being planned
  restWeekdays: number[];                // the account's rest days (server)
  floatingRestDates: string[];           // dated rest days (server)
  existingLoadByDate: Record<string, number>; // minutes already committed (server)
  hardUnavailableWeekdays: number[];     // from HARD UNAVAILABLE_WEEKDAY constraints
  softHints: {                           // A1 soft preferences, when the student set them
    evenSpread?: boolean; fewerDates?: boolean; weeklyWorkloadWeight?: number;
  };
  dailyOverrides: (number | null)[] | null; // per-weekday explicit values
}): {
  dailyMinutes: number[];                // length 7 — the engine contract
  blockedDates: string[];                // inside the horizon
  perDay: { date: string; minutes: number; reason: string }[];
  note: string;                          // one-line human summary
};
```

### 9.2 Distribution rules (deterministic, load-balanced)

1. **Usable weekdays** are those not in `restWeekdays` or `hardUnavailableWeekdays`. If fewer than one remains, the student is told the budget cannot be placed and the brief stays in `NEEDS_CORE_INFO` — the function does not invent a day.
2. **Balancing signals, in fixed order:** (a) an explicit `dailyOverrides` value wins for that weekday; (b) hard unavailable/rest weekdays get 0; (c) remaining minutes are spread over usable weekdays weighted by (i) existing load — days with more committed minutes receive proportionally less of the new budget, (ii) `softHints.evenSpread` favouring uniformity or `fewerDates` favouring concentration, (iii) the weekly workload preference weight. The weighting is an integer, documented formula, not a heuristic the reader has to guess.
3. **Remainder handling** uses the **largest-remainder method**: minutes are floor-divided by weight, and leftover minutes go to the days with the largest fractional remainders, ties broken by weekday index ascending. This is deterministic and balanced; assigning the remainder to the earliest days (the first draft of this design) is explicitly rejected because it systematically front-loads the week.
4. **Bounds:** every produced value is clamped to 0–720 (`contracts.ts:57`); a weekly budget above what the horizon can hold is accepted but reported in `note` as a shortfall, never silently prorated upward.
5. **Short horizons:** when the horizon contains fewer than seven usable days, the *stated* weekly figure is distributed across the days available and the note states that the week is partial; the budget is never scaled up to fill a short horizon.
6. **Floating rest dates and blocked dates** are excluded per date, not per weekday, and appear in `perDay[].reason` so the UI can explain each day.
7. **Existing workload is a balancing signal, not a subtraction.** `validateCapacity` already computes `budget − reserve − existing − proposed` (`capacity.ts:16`); subtracting existing load again inside the distributor would under-plan the week twice. This is stated because it is the easy mistake.

### 9.3 Where it runs, and what stays authoritative

The distributor runs **server-side** whenever the brief's capacity fields change (the patch/action endpoint returns the new distribution), because two of its inputs — floating rest dates and existing Quest load — exist only on the server. The client shows the result and offers "Customize days", which writes `dailyOverrides`. The engine's capacity model remains the sole authority for whether a plan actually fits: a distributed budget that a particular plan cannot honour still fails or warns per §19, and the hard limits (`MAX_SESSION_MINUTES` 15–240, `UNAVAILABLE_WEEKDAY`, `MAX_WEEKLY_MINUTES` 60–5040, and the absolute 15–240 minute item bounds — `constraints.ts:66-75`, `:229`) remain blockers.

### 9.4 Interaction with the existing weekly constraint

`MAX_WEEKLY_MINUTES` (HARD) and `WEEKLY_WORKLOAD_PREFERENCE` (SOFT) already exist, and Smart Setup already emits them from a weekly answer (`constraints.ts:20`, `smart-setup.ts:922`). The brief distinguishes them cleanly: `budget.weeklyMinutes` is the **distribution input**; a hard cap remains a `MAX_WEEKLY_MINUTES` constraint. When the student sets a budget above an existing hard weekly cap, the brief surfaces the conflict at intake rather than deferring it to a validator error at generation.

---

## 10. Hierarchical scope architecture

### 10.1 Representation

Research, import and manual entry all produce a tree inside the brief (`ScopeNodeSchema`, §5): containers (`SECTION`, `CHAPTER`) and leaves (`TOPIC`), depth ≤ 3, ≤ 200 nodes, addressed by **intake-local `nodeId`s that are never durable planner keys**. The tree is the UI's currency and the review surface; the engine never sees it.

### 10.2 Flattening into planner units

```
selected tree → selected leaves (or a container with no selected children, treated as one unit)
              → label disambiguation → ordered unique labels ≤ 50 → scope string + topics[]
```

Rules, each forced by a verified engine constraint:

1. **Selection semantics.** A `TOPIC` node is a unit when selected; a `CHAPTER`/`SECTION` with no selected descendants becomes a single unit labelled by itself; an unselected node contributes nothing.
2. **Label uniqueness.** The engine rejects case-insensitive duplicate labels and requires `scope === labels.join("\n")` (`exam-policy.ts:50-56`). Flattening therefore disambiguates: when a bare label collides, the unit is labelled `"Parent · Child"`, and on a further collision the grandparent is prepended. The **display** label stays the original; only the engine-facing label is qualified, and the mapping is kept in the brief (`flattenMap: { label → nodeId[] }`) so the UI can show one unit per student-recognised topic.
3. **Order** follows the tree depth-first, matching the order the student sees, so the scope string reads like the syllabus.
4. **Cap and segmentation.** The floor is `LIMITS.topics = 50` for EXAM/MASTERY; Roadmap has its own envelope (`ROADMAP_LIMITS.topics`, `roadmapInputBytes`). When selection exceeds the cap, the intake **segments**: it proposes an ordered set of segments (by chapter), plans segment 1, and states plainly that the rest are planned later — mirroring the existing segmentation precedent rather than inventing one. It never silently truncates, and it never merges units to fit.
5. **Deduplication is conservative:** identical labels under the same parent collapse; identical labels under different parents do not (they are distinct units that merely share a name).
6. **Grouping metadata stays in the brief.** Because `UserInputV1` has no hierarchy, `flattenMap` plus the node tree are kept on the intake session, which is what lets the Coverage Map, the preparedness matrix and later replans regroup units by chapter without any change to the engine.

---

## 11. Preparedness representation

### 11.1 The problem, measured

The current contract requires `covered: boolean`, `confidence: 1–5`, `difficult: boolean` per topic (`lib/planner/scope-topic.ts:22-27`). Mapping "unknown" onto `covered: false, confidence: 1` is **not** neutral — it is read as "has not studied this and is very weak" by at least five rules:

| Rule | Code | Effect of unknown-as-weak |
| --- | --- | --- |
| `isHighPriorityWeak` = `priority === HIGH && confidence <= 2` | `lib/planner/priority.ts:80` | every high-priority unstated unit is escalated as "weak": earlier placement and deeper treatment |
| LOW priority && `confidence <= 2` | `exam-policy.ts:124` | unstated units are pulled into the weak-topic set |
| weight `!covered \|\| confidence <= 2 ? 4 : 2` | `exam-policy.ts:157` | unstated units receive double weight in the effort model |
| `confidence <= 2 && !work.some(MISTAKE_REVIEW)` | `exam-policy.ts:276` | forces extra mistake-review work for unstated units |
| `covered && confidence >= 4 ? 2 : 4` | `mastery-policy.ts:213` | unstated units get the heavier provision |

`covered: false` additionally forces coverage work for a unit the student may already know, and any accidental `confidence = 3` would be an equally silent claim in the other direction. There are **42 read sites** of `covered`/`confidence`/`difficult` across 11 files, so the policy must be centralized rather than patched in place.

### 11.2 The decision: nullable, with one policy module

The three fields become **nullable** in `ScopeTopicSchema`:

```ts
covered: z.boolean().nullable(),        // null = not stated
confidence: z.number().int().min(1).max(5).nullable(),
difficult: z.boolean().nullable(),
```

* **Additive and backward-compatible.** Every sealed snapshot carries booleans and numbers, which remain valid; the digest only covers what was stored, so no revision changes meaning.
* **`null` is the honest representation of "you did not tell us".** It can never be coerced to a number, and TypeScript forces every one of the 42 read sites to handle it explicitly — the compiler is what makes a silent default impossible.
* **The policy lives in one module**, `lib/planner/preparedness.ts`, exporting named predicates that replace the inline comparisons:

| Predicate | Unstated behaviour | Rationale |
| --- | --- | --- |
| `isStated(topic)` | `false` | drives the UI's three-state cell and the assumption note |
| `isWeak(topic)` | **`false`** | unknown is not weakness: no priority escalation, no extra catch-up |
| `isSecure(topic)` | **`false`** | unknown is not security: never refuse learning, never treat as known |
| `provisionWeight(topic)` | **standard** weight | no 4× weighting, no exemption |
| `needsLearning(topic)` | **`true`** | learning a unit you know nothing about is the safe plan; skipping it would assume knowledge |
| `needsMistakeReview(topic)` | `false` unless stated weak | avoids the forced extra work of `exam-policy.ts:276` |

* **The model is told the truth.** Payloads carry `preparedness: "UNKNOWN"` alongside the null fields, so a model never reads a fabricated 1 or 3.
* **The student sees the assumption.** Units with unstated preparedness produce a short brief assumption ("preparedness not stated for N units — planned with standard provision") rather than a silent default, and the Coverage Map and matrix show an explicit unstated state.

### 11.3 Representation for large scopes (contract and component boundaries only)

Brief-level states are `UNSTATED`, `NOT_STUDIED`, `WEAK`, `OKAY`, `STRONG`, plus an independent `difficult` flag and `priority`. Mapping to the contract: `UNSTATED` → all three fields `null`; `NOT_STUDIED` → `covered: false` with `confidence: null`; `WEAK` → `covered: true, confidence: 1–2`; `OKAY` → `3`; `STRONG` → `4–5`. The matrix writes sparse entries into `brief.preparedness` (only touched units appear), supports one-click column/row apply, chapter-level bulk apply, and a mobile alternative (a stacked per-unit list with the same vocabulary) rather than a wide grid. No implementation in this phase.

---

## 12. Research architecture

### 12.1 Two bounded stages

**Stage A — scope research (before generation).** Triggered by the student (or offered by the readiness state `RESEARCH_AVAILABLE`). Input: goal/exam identity, subject, target date, optional background curriculum. Output: a *candidate* hierarchy with provenance and an extraction confidence, plus explicit open questions when the result is weak. It never writes the brief.

**Stage B — generation research (after the Plan Brief is confirmed).** Only when bounded extra official context would genuinely improve generation (for example, the confirmed scope arrived by import and lacks official structure). It is not a browsing loop and is not triggered automatically.

### 12.2 What exists and what must be added

The repository already has the right *pattern* and the wrong *shape*:

* `executeGoogleSearch({query, qualification})` performs Gemini Google-Search grounding (`lib/ai/chat-tool-executor.ts:1244`).
* `lib/ai/syllabus-compiler.ts:85-124` already encodes the correct discipline: search runs **first and always**, under a timeout (`withTimeout`, `COMPILE_RESEARCH_TIMEOUT_MS`), and a generic placeholder snippet is treated as *no research* rather than fed to the model (`GENERIC_SEARCH_FALLBACK_SOURCE`) — i.e. the codebase already refuses to let a model research from memory.
* **The gap:** the executor returns `{query, qualification, source, summary}` and **discards Gemini's grounding metadata**, so there are no source URLs and no per-source provenance. Until that is extended, provenance (§13) cannot be honest.

**The extension is additive and isolated:** a research-facing provider function `researchScope(query, qualification)` returning `{ findings, sources: [{ uri, title, publisher, retrievedAt }], confidence }`, built on the same grounding call but capturing `groundingMetadata.groundingChunks`; the existing chat tool keeps its current return shape so nothing outside the intake changes.

### 12.3 Service boundary

```
lib/planner/research/
  provider.ts   — the bounded grounded call (timeout, cancellation, one attempt + one retry max)
  sources.ts    — source ranking, official-domain classification, secondary labelling
  extract.ts    — findings → candidate ScopeNode[] + extraction confidence + open questions
  service.ts    — orchestration, in-memory + session-scoped result cache, error mapping
```

Contract: `ResearchResult = { status: "OK" | "WEAK" | "UNAVAILABLE", nodes: ScopeNode[], sources: ResearchSource[], confidence: "HIGH"|"MEDIUM"|"LOW", openQuestions: string[], retrievedAt }`. Determinism applies to *ranking and mapping*, not to the search itself; the result is always reviewable data, never applied.

**Operation state, cancellation, timeout, caching.** Research is a bounded request inside the intake session: it is cancellable (`AbortSignal` through to the provider, as the existing pipeline does), capped at one attempt plus at most one retry, and its result is cached on the session keyed by a hash of (goal, subject, target date, provider query) so a repeat is free until the inputs change. Freshness is explicit: `retrievedAt` is stored and shown, and a cached result older than the configured window is re-researched rather than presented as current.

**Failure behaviour.** `UNAVAILABLE` returns the fallbacks the addendum requires (upload, photo, pasted outline, official link, manual entry) and never a fabricated syllabus; `WEAK` returns what it found plus open questions. Concurrency: research never runs against a brief that is being edited — the service reads a snapshot hash and refuses (`RESEARCH_STALE_BRIEF`) if the brief changed under it, mirroring the engine's stale-proposal discipline.

---

## 13. Source provenance

A bounded record, stored **by reference on the intake session** (never inside planner revision snapshots):

```ts
export const ResearchSourceSchema = z.strictObject({
  sourceId: z.string().max(60),                                   // intake-local
  url: z.string().url().max(2000).nullable(),                     // null for private uploads
  title: z.string().trim().max(300),
  sourceType: z.enum(["OFFICIAL", "OFFICIAL_PDF", "SECONDARY", "USER_UPLOAD"]),
  publisher: z.string().trim().max(120).nullable(),               // domain or organisation
  retrievedAt: z.string().datetime(),
  version: z.string().max(60).nullable(),                         // when the document states one
  stableId: z.string().max(120).nullable(),                       // content hash where practical
  coversNodeIds: z.array(z.string().max(60)).max(200),
  mappingConfidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  private: z.boolean(),                                           // upload vs public URL
});
```

Rules: no full scraped pages are stored anywhere (title, url, classifier and hashes only); private uploads keep an owned file identity and a storage path, never a public URL; secondary sources are labelled as secondary in the UI and can never be the sole basis for a confirmed scope without the student seeing the label; `mappingConfidence` describes how well the source maps to nodes — never the student's ability (§15).

**Source ranking** (from the addendum): official exam/university/admissions body → official syllabus/specification PDF → official curriculum page → official handbook/FAQ → reputable secondary only when necessary. Implemented in `sources.ts` against a maintained official-domain list, with the rank shown next to each source.

**Existing vocabulary to reuse rather than reinvent.** `lib/study-systems.ts` is already the repository's single source of truth for exam boards and academic levels (`EXAM_BOARDS`, `ACADEMIC_LEVELS`, with defaults) and is consumed by onboarding and the timer's Add Subject form; the syllabus compiler already takes a `{name, code, examBoard, level}` tuple. The board value is therefore the natural **lookup key** for official-source discovery and the official-domain list can be keyed off it (for example CAIE → the Cambridge International domain), which is what makes ranking verifiable rather than a guess.

**The mandatory flow:** `RESEARCH RESULT → REVIEW → USER CONFIRMATION → PLAN BRIEF AUTHORITY`. Confirmation is a typed action (§17, `confirmScope`) which stamps `scope.source = "RESEARCH_CONFIRMED"`, sets `confirmedAt`, and records the provenance refs. Research that was never confirmed has no authority and cannot leak into a generated plan.

---

## 14. File / import architecture

### 14.1 What exists

`lib/upload-security.ts` provides a 5 MB cap, a MIME allowlist, image type sniffing, safe filename generation and a single `validateUpload` gate; `lib/supabase-storage.ts` provides buckets (`focus-backgrounds`, `focus-backgrounds-user`) with signed URLs and delete helpers. There is **no PDF or OCR parsing anywhere in the repository** — that capability would be new work, which is why this phase fixes interfaces only.

### 14.2 Interfaces (no implementation)

```
POST /api/planner/intake/[id]/import        multipart or pasted text
  → validateUpload (reused)                 size, MIME, sniffing
  → store privately in a new planner bucket (owner-scoped path, signed access only)
  → extraction job (future)                 PDF text · image OCR · pasted outline
  → ImportResult { nodes: ScopeNode[], sources: [USER_UPLOAD provenance],
                   coverage: "COMPLETE" | "PARTIAL" | "SEGMENTED",
                   pages?: { from: number; to: number }[] }
  → REVIEW (same surface as research) → confirmScope
```

Requirements carried from the addendum and enforceable in this shape: hierarchy and nesting are preserved where the source has them; the extraction names its source (filename, and page range when available); **large inputs are segmented with an explicit review, never silently truncated** (`coverage: "SEGMENTED"` plus a per-segment confirm); extraction produces **no** preparedness, confidence or priority claims (`USER_UPLOAD` provenance carries `mappingConfidence` only); and a private upload is distinguishable from a public URL in provenance (`private: true`). Accepted inputs: PDF, document, screenshot/photo, pasted text, copied outline.

---

## 15. Curriculum comparison architecture

Purpose: "what do I probably already know?" as a **curriculum-overlap statement only**, never a claim about the student.

```
input:  targetScope: ScopeNode[]                 (confirmed scope)
      + backgroundCurriculum: { label, level, board }   (student-stated)
        (+ optionally a confirmed background syllabus, imported the same way)
output: for each target unit:
        LIKELY_COVERED_BY_CURRICULUM | PARTIAL_OVERLAP | LIKELY_NEW_TO_CURRICULUM | UNCLEAR
        + overlapSourceIds: string[]   (provenance refs)
        + confidence: HIGH | MEDIUM | LOW
```

Hard rules:

* **Vocabulary discipline.** These four states mean *curricula overlap*; the code, the API and the UI never map them to remembered, confident, proficient or mastered. `UNCLEAR` is the default and is a first-class answer.
* **Comparison may suggest coverage only.** It can pre-set the *displayed* preparedness suggestion; it can never write `confidence`, `difficult` or `priority`, and a suggestion is applied only through an explicit action (`bulkSetPreparedness` with a stated source) which records `prioritySource`/preparedness provenance as user-stated.
* **Corrections win.** Any student change to a suggested state sets the mapping to student authority and the suggestion is recorded as shadowed (§8), so a later re-run cannot silently restore it.
* **Provenance required.** Every statement carries `overlapSourceIds`; a comparison with no sources degrades to `UNCLEAR` rather than to a claim.

No implementation in this phase; the input/output schemas above are the contract the later phase implements.

---

## 16. Planner Copilot architecture

A **bounded planning interface**, not a general assistant: it can only emit typed planner actions (§17), and the server applies them.

**Layout.** Desktop: conversation left, live Plan Brief right (the brief is the source of truth and is never hidden behind chat). Mobile: conversation primary, Plan Brief as a collapsed, stacked sheet that expands to full screen; no desktop-width grids.

**Behaviour.** The Copilot's turns are one of three shapes: (a) a *question* the student answers, mapped onto the existing Smart Setup vocabulary where one fits (`smart-setup.ts`); (b) one or more *proposed actions*, which — when the instruction was explicit and pre-generation — are applied and visibly reflected in the brief (§18); (c) a *clarification request* when the instruction is ambiguous or would need a warning acknowledged.

**What it never does:** write planner state directly, mutate execution after confirmation (that is Phase 5), browse the web on its own initiative, set readiness, apply research without confirmation, or claim preparedness on the student's behalf.

---

## 17. Typed action contract

One closed discriminated union, applied by one endpoint. For each action: `deterministic` marks whether it needs no AI at all; `confirm` marks whether an explicit acknowledgement is required; `cost` is the quota class from §23.

| Action | Arguments (bounded) | Authority | deterministic | confirm | may research | cost |
| --- | --- | --- | --- | --- | --- | --- |
| `setGoal` | `title ≤200`, `objective? ≤500` | session | yes | no | no | none |
| `setMode` | `EXAM \| ROADMAP \| MASTERY` | session, only while no draft exists | yes | yes (resets brief) | no | none |
| `setSubject` | `subjectId?` or `name ≤200` | session/profile | yes | no | no | none |
| `setTargetDate` | `endDate`, `examDate?` (≤365-day horizon) | session | yes | no | no | none |
| `setWeeklyBudget` | `weeklyMinutes 0–10080` | session | yes (runs §9) | no | no | none |
| `setDailyOverrides` | `(number \| null)[7]`, 0–720 | session | yes | no | no | none |
| `markUnavailableDay` | `date` or `weekday` | session | yes | no | no | none |
| `setRecoveryReserve` | `recoveryPercent 0–50` | session | yes | yes when below the accepted threshold (existing acceptance rule) | no | none |
| `setBackgroundCurriculum` | `label ≤200`, `level? ≤60`, `board? ≤60` | session | yes | no | no | none |
| `researchScope` | `{ forceRefresh?: boolean }` | session | no | no | **yes** | research |
| `importScope` | upload ref or pasted text ≤ 20 000 chars | session | no (extraction) | no | no | research |
| `confirmScope` | `sourceId(s)`, `nodeIds` | session, **required** before generation | yes | yes (explicit) | no | none |
| `updateScopeUnits` | add/remove/rename/regroup, `nodeId`s, labels ≤200 | session | yes | no | no | none |
| `compareCurricula` | `background label` or confirmed background scope | session | no (may reason) | no | no | light |
| `bulkSetCoverage` | `unitRefs ≤200`, `covered: boolean \| null` | session | yes | no | no | none |
| `bulkSetPreparedness` | `unitRefs ≤200`, `confidence: 1–5 \| null`, `difficult?: boolean \| null` | session | yes | no | no | none |
| `setPriority` | `unitRefs ≤200`, `priority`, `source: USER_EXPLICIT` | session | yes | no | no | none |
| `setConstraint` | existing `PlannerConstraintKind` + value within `BOUNDS` | session | yes | yes for HARD kinds | no | none |
| `setPreference` | existing SOFT kinds + weight 0–5 | session | yes | no | no | none |
| `answerSmartQuestion` | existing `SmartAnswer` vocabulary | session | yes | no | no | light (if parsed from NL) |
| `requestGeneration` | `{}` | **server decides** | yes | yes (explicit) | no | planner |
| `releaseGeneratedItem` | `itemKey` (post-confirmation only) | execution, **must reuse Phase 5 or the release path in §20** | yes | yes | no | none |

Rules: arguments are validated against the same closed vocabularies the engine uses (so an action cannot express something the engine cannot); every action carries an `actionKey` for idempotent application; a natural-language turn is parsed into *proposed* arguments with a confidence, and the **server** decides whether they are applied, refused or turned into a clarification; `requestGeneration` re-derives readiness (§7) and never trusts the client; `setMode` is refused once any draft revision exists.

---

## 18. Mutation and confirmation rules

**Pre-generation.** An explicit student instruction (`"Friday is unavailable"`, `"I can do 10 hours a week"`) applies immediately, visibly, and is reflected in the brief with its provenance. An ambiguous instruction (`"maybe keep Fridays light"`) becomes a *suggestion* with an accept affordance, never a silent change. A lower-authority source that conflicts with a higher one produces the conflict record of §8 rather than an overwrite. Anything that would breach a hard blocker is refused with the code and the reason (§19).

**Post-confirmation.** The Copilot has **no mutation path into execution**. Every execution-changing change continues through Phase 5: proposal → diff → review → explicit confirmation → atomic reconciliation. Chat is a way to *start* that flow and to *see* the diff; it is never a way to skip it. This preserves the Phase 5 invariants verbatim: no autonomous mutation, protected execution never rewritten, stale proposals fail closed.

**Everything else after confirmation** (renaming a plan, archiving, recording a Mastery Check self-report, promoting Stretch work) reuses its existing endpoint and rules — the Copilot becomes a typed front-end to those actions, not a new mutation system.

---

## 19. Validation classes: hard blockers and overrideable warnings

*(Added in review. This is the formal model for "warn → explain → accept" instead of "validator says no".)*

### 19.1 The two classes

**Class A — BLOCKERS.** Never overridable, because no student consent can make them true or safe:

| Category | Codes / rules |
| --- | --- |
| Ownership and existence | `NOT_FOUND` on a plan, revision or item not owned by the session user; all owner-scoped reads |
| State and version safety | `STALE_REVISION`, `SCHEDULE_CHANGED`, `CONTENT_CHANGED`, `REVISION_ALREADY_CONFIRMED`, `IDEMPOTENCY_MISMATCH`, `PLANNER_REVIEW_REQUIRED` |
| Execution and lineage safety | `PLANNER_EXECUTION_PROTECTED`, `REBALANCE_TOUCHES_HISTORY`, `REPLAN_STALE_*`, `REPLAN_CONFLICTED_EXECUTION`, `PLANNER_LINEAGE_IMMUTABLE` |
| Malformed structure | mode/scope mismatch (`MODE_MISMATCH`, `SCOPE_MISMATCH`, `EXAM_MODE_MISMATCH`), duplicate keys/references (`DUPLICATE_KEY`, `DUPLICATE_SCOPE_TOPIC`, `UNKNOWN_REFERENCE`), dependency cycles, `INVALID_JSON`, schema violations |
| Impossibility by definition | item minutes outside 15–240 (`contracts.ts` item bounds), dates outside the horizon, `startDate > endDate`, horizon > 365, exam date not equal to the horizon end for EXAM |
| Explicit HARD constraints | `HARD_SESSION_LIMIT_EXCEEDED` (MAX_SESSION_MINUTES), `HARD_UNAVAILABLE_DAY_USED` (UNAVAILABLE_WEEKDAY), `HARD_WEEKLY_LIMIT_EXCEEDED` (MAX_WEEKLY_MINUTES) — `constraints.ts:229`, `expansion-policy.ts:111` |

**Class B — OVERRIDEABLE WARNINGS.** The student may accept the tradeoff, and the acceptance is recorded:

| Category | Codes / rules |
| --- | --- |
| AI-recommended duration and shape | a session longer than the recommended/soft value (`SESSION_LENGTH_PREFERENCE`, `EVEN_SPREAD_PREFERENCE`), and the soft-preference breaches that already have a shape (`SoftViolation` with `kind`, `preferenceWeight`, `explanation` — `constraints.ts:246`). Note that `INVALID_ITEM_CAPACITY` is **not** overrideable: it guards the absolute 15–240 minute bounds, and the "recommended" length is a soft preference rather than that code |
| Educational completeness | `MISSING_COVERAGE`, `MISSING_SPACED_RECALL`, `MISSING_LATER_RETRIEVAL`, `MISSING_FINAL_REVIEW`, `MISSING_MIXED_PRACTICE`, `MISSING_MOCK_EXAM`, `MISSING_UNDERSTAND`, `MISSING_LEARN`, `INSUFFICIENT_PRIORITY_ALLOCATION`, `INSUFFICIENT_UNIT_ALLOCATION`, `UNNECESSARY_RELEARNING`, `CHECK_SCOPE_TOO_NARROW`, `MISSING_PERIOD_TOPIC` |
| Capacity targets | `INFEASIBLE_CAPACITY` and `INSUFFICIENT_PERIOD_CAPACITY` when they express "this exceeds the target/budget" (accepted overage); a *soft* weekly workload preference overrun |
| Scheduling softness | placing work on a **rest day** (a schedule fact) as opposed to an explicitly forbidden weekday (a blocker); uneven intensity (`INTENSITY_SPIKE`, `DENSITY_SPIKE`) |
| Semantic advisories | the deterministic advisories and critic findings that today are non-fatal (`TASK_VAGUE`, `REDUNDANT_TOUCH`, `SEQ_WEAK`, `PRIORITY_MISS`, `ROBOTIC_PATTERN`) |
| Dropping generated work | `releaseGeneratedItem` on planner-owned **pending, unstarted** work (§20) |
| Feasibility | the preflight `feasibility_warning` families (`SEGMENT_REQUIRED`, reduced reserve below threshold with explicit acceptance, overloaded availability) |

### 19.2 Mechanism (reuses three existing patterns)

```ts
export interface PlannerFinding {
  code: string;                       // the existing closed code, unchanged
  severity: "BLOCKER" | "WARNING";
  scope: { kind: "DRAFT" | "ITEM" | "UNIT" | "PERIOD" | "PLAN"; ref?: string };
  consequence: string;                // one sentence of user-facing consequence
  acknowledgementCode: string;        // what the client sends back to accept
}
```

* Validation **collects** findings and throws only when a blocker is present; warnings are returned with the response (HTTP 200/422 with a `findings` array), never hidden.
* The client re-submits with `acknowledged: string[]` (the acknowledgement codes). The server verifies each code corresponds to a real warning **for this draft at this version**, so a stale acceptance cannot be replayed, and it records accepted codes on the revision.
* This generalises what already exists rather than inventing a fourth mechanism: `acceptReducedReserve` (input-level acceptance, `exam-policy.ts:59`), `acknowledgeExclusions` (commit-level acceptance, `materialize.ts:72`), and the tool `REQUIRES_CONFIRMATION` + `confirmationToken` pattern for consequential mutations.
* Telemetry gains one content-free counter for accepted warnings by code (§24).

### 19.3 Product behaviour this buys

* **Delete a generated task:** an explicit release of planner-owned pending work — see §20.
* **Study longer than recommended:** a warning with the consequence ("this is longer than the 45-minute session you prefer") and an accept; the hard `MAX_SESSION_MINUTES` and the 15–240 bounds remain blockers.
* **Keep an intentionally imperfect plan:** completeness warnings can be accepted, so a student who does not want a mock exam keeps their plan — with the tradeoff stated once, recorded, and visible in the plan's own history.

### 19.4 Staging (so this is not a big-bang refactor)

Phase 1 introduces the envelope, the endpoint contract and the codes that are *already* advisory (soft violations, semantic advisories, feasibility warnings, rest-day scheduling). Later phases flip specific codes with their own tests: educational completeness in the phase that adds fast preparedness editing; capacity-overage acceptance in the phase that adds the weekly budget override; release in the phase that adds post-confirmation editing. Each flip is a named, testable change — never a blanket loosening of validators.

---

## 20. Override contract, persistence and Phase 5 interaction

*(Added in review, alongside §19.)*

**Acceptance record.** `acknowledged: string[]` is stored on the revision that carries the accepted draft — for a generated plan, in the input snapshot's intake block; for an edit, on the appended EDIT revision — with the codes and a timestamp. It is never a licence to ignore the rule later: it is a record that the student saw the consequence.

**Release action.** `releaseGeneratedItem` (post-confirmation, explicit) applies only to planner-owned work that is **pending and unstarted** — the same predicate the engine uses for replannable work (`isPlannerQuestReplannable`). It tombstones the link with a `USER_RELEASED` reason and removes the Quest through the existing `sylf.planner_manual_quest` capability path (`lib/planner/server/mutation-guards.ts:76`; the DB guard at `prisma/migrations/20260924010000_planner_foundation/migration.sql:237`), so lineage survives and the Quest guard is respected rather than bypassed. Completed, started, overdue-with-time and in-session work is a **blocker** (`PLANNER_EXECUTION_PROTECTED`), unchanged from Phase 5.

**Interaction with Phase 5, stated explicitly.** An accepted override belongs to the revision that carries it. When a later replan runs on such a plan:

1. the replan is validated against frozen history plus the proposed remaining work, exactly as today;
2. a requirement the student deliberately accepted as unmet **may be surfaced again as a warning** — it may never be silently re-inserted as required work;
3. protected execution rules, atomic reconciliation, idempotency and stale-proposal handling are untouched;
4. the diff shows any newly proposed work that exists only because a warning was surfaced, so the student's acceptance history is visible rather than silently reversed.

---

## 21. Working-brief persistence decision

**Decision: one narrow additive table, `PlannerIntakeSession`, in UX Phase 1** (moved forward from Phase 2 in review, so a refresh cannot lose a Quick Plan).

```prisma
model PlannerIntakeSession {
  id            String   @id @default(uuid()) @db.Uuid
  userId        Int
  clientKey     String                       // client-minted, idempotent create
  mode          String                       // EXAM | ROADMAP | MASTERY
  brief         Json                         // PlanBriefV1, bounded (see budgets, §29)
  version       Int      @default(0)          // optimistic concurrency for actions
  planId        String?  @db.Uuid             // set when generation starts
  expiresAt     DateTime
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  plan          PlannerPlan? @relation(fields: [planId], references: [id], onDelete: SetNull)
  @@unique([userId, clientKey])
  @@index([userId, updatedAt])
  @@index([expiresAt])
}
```

* **Owner-scoped through `userId`, RLS enabled, no client grants** — the posture every planner table already has.
* **Expiry and cleanup:** `expiresAt` (default 30 days, refreshed on write); a cleanup pass deletes expired sessions, and an expired session produces a clear "this intake expired" state rather than a silent empty brief. Research provenance and recent turns live **inside** `brief`/`conversation` JSON, so no second table is needed at this scale.
* **Optimistic concurrency:** every mutation sends the `version` it read; a mismatch returns `INTAKE_STALE` with the current brief, so a second tab cannot clobber the first.
* **Idempotent create and actions:** `(userId, clientKey)` makes creation safe to retry; action keys inside the brief make replays return the prior receipt.
* **Why not the alternatives.** A PREPARING revision is a live operation: it holds a quota reservation and a lease, and its state machine is designed to end in SEALED/FAILED/CANCELLED, not to be edited for twenty minutes (Phase 1 semantics, `lib/planner/server/operations.ts:26`). Sealed revisions are immutable by trigger. Quest metadata is execution state. The DRAFT `PlannerPlan` shell is created *during* generation and is bound to one `requestKey` and one input digest, so it cannot be the working brief either. One small new table beside the engine is the smallest correct answer.
* **Client mirror:** a bounded `sessionStorage` copy gives an instant reload and works offline for the last state; the server copy is authoritative and wins on conflict.

---

## 22. Conversation persistence decision

**No transcript platform.** The structured brief is the truth; the conversation is a bounded, disposable view of how it got there.

* At most `BRIEF_LIMITS.recentTurns = 12` recent turns are stored on the session — the student's message and the *structured outcome* (which actions were applied, which warnings were raised, which clarification is open), not a general chat log.
* Turns are deleted with the session on expiry; nothing is written to the general chat store, and no planner conversation appears in System AI history.
* Action receipts (the applied actions with their keys and outcomes) outlive individual turns within the session, so a reload reconstructs the brief's history without needing the prose.
* Content-free telemetry only: turn counts, action kinds, outcomes. No message text, no academic content (§27).

---

## 23. Quota and cost plan

| Operation class | Examples | Cost | Reasoning |
| --- | --- | --- | --- |
| Deterministic (no AI) | `setWeeklyBudget`, `updateScopeUnits`, `bulkSetPreparedness`, `setConstraint`, `markUnavailableDay`, `confirmScope`, `setGoal` | **none** | Pure functions and brief writes; charging for these would make the redesign feel expensive for no reason |
| Light AI | parsing a natural-language turn into actions, `answerSmartQuestion` from free text, `compareCurricula` | existing **`chat`** bucket (10/day shared with chat and Focus) | Bounded, user-visible, already the bucket for conversational turns |
| Research | `researchScope`, `importScope` extraction | **recommended new bucket `plannerResearch`** (proposed 5/day) in the phase that implements research | Each research operation is a grounded search plus a synthesis; research is not a plan generation and must not consume the single weekly `planner` allowance. Recommended, not created in this phase |
| Generation | `requestGeneration` | existing **`planner`** (1/week) | Unchanged |
| Expansion / replan | existing flows | `plannerExpansion` (3/week), `plannerRebalance` (3/week) | Unchanged |
| Release / acknowledged overrides | §19–20 | none | No provider calls, no AI; charging would penalise the feature that reduces frustration |

No new bucket is created in this phase, and no existing bucket's semantics change. The `plannerResearch` recommendation will be revisited with measured research volume when that phase lands; if volume is low, the `chat` bucket absorbs it.

---

## 24. Telemetry and baseline plan

### 24.1 Decision: measure the current wizard first

A small instrumentation slice — **UX Phase 1a** — ships *before* any Quick Plan UI, so the redesign can be compared with the flow it replaces rather than merely asserted. It adds to the existing closed event vocabulary (`lib/planner/telemetry.ts:26`) and the numeric `COUNTS` list (`:134`); no new analytics system, no content.

**New events:** `intake_started` (with `entryPath: QUICK | ADVANCED`), `intake_readiness_changed` (state + missing codes), `intake_first_input` (mode only), `intake_first_draft_requested`, `intake_abandoned` (reason code: `LEFT`, `EXPIRED`, `SWITCHED_MODE`), `research_requested|completed|confirmed|declined`, `copilot_turn` (action kinds + outcome), `override_accepted` (warning codes only).

**New counts:** `fieldsTouched`, `topicsManual`, `topicsResearched`, `topicsImported`, `preparednessEdited`, `copilotTurns`, `warningsAccepted`, `timeToFirstDraftMs` (the existing `latencyMs` where it already fits).

**Reused:** `planner_mode_selected`, `*_generation_started/completed/failed`, `proposal_edited`, `proposal_confirmed`, `smart_question_asked/skipped`, `smart_setup_applied/skipped`, `feasibility_warning`, `operation_recovered`.

**What the redesign will be judged on** (the addendum's success criteria, made measurable): time from entering the planner to the first valid draft; the share of fields the student had to touch; how many topics were entered manually versus researched/imported; abandonment before generation; and — after generation — how many items were edited, how often a plan was regenerated, and whether it was confirmed.

### 24.2 Honest limits

The current wizard has no equivalent of `intake_*`, so the before/after comparison uses the events that *do* exist today (mode selected → generation started → completed/failed → edited → confirmed) plus session-level timing derived from them. Two cohorts (wizard sessions before the switch, Quick Plan sessions after) over a comparable window will be reported, and a single window cannot prove causality — the report says so rather than claiming a win.

---

## 25. API surface

The goal's example route list is collapsed to **three coherent endpoints** plus reuse:

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/planner/intake` | `POST` | Create or resume a session (`clientKey` idempotent); returns brief + readiness + distribution |
| `/api/planner/intake/[id]` | `GET`, `PATCH` | Read the brief (+ readiness, findings); patch brief fields with `version` (optimistic concurrency) |
| `/api/planner/intake/[id]/action` | `POST` | Apply one typed action from §17 — including `researchScope`, `importScope`, `confirmScope`, `compareCurricula`, `requestGeneration` |

**Why fewer routes.** Each action is already a validated, idempotent object with its own key and confirmation rules; giving every action its own URL would multiply the audit surface (auth, ownership, no-store, idempotency, cancellation) for no gain. `requestGeneration` reuses the existing generation service and streaming behaviour internally, so the Phase 0–6 generation path is exercised unchanged.

Conventions inherited from the existing sixteen routes: `plannerRoute` + `readBody` (`lib/planner/server/http.ts`), cookie session with `tokenVersion` validation, owner-scoped access, `Cache-Control: private, no-store`, bounded bodies, and error codes from the closed vocabulary. Uploads (§14) add a fourth route only because multipart does not belong in a JSON action body: `POST /api/planner/intake/[id]/import`.

**Operation boundaries.** Session writes are small transactions; research runs as a bounded, cancellable operation recorded on the session; generation is the existing operation lifecycle with its lease, quota receipt and recovery. Cancellation is honoured at each boundary (`AbortSignal`), and an abandoned research operation never leaves a half-written brief.

---

## 26. Client / component architecture

```
PlannerWorkspace (mode choice, capabilities)          ← preserved
 ├─ QuickPlan (per mode: thin)                          ← new
 │   ├─ PlannerCopilot (conversation, typed actions)   ← new
 │   ├─ PlanBriefPanel (live, expandable rows)         ← new
 │   ├─ ScopeReview (tree, confirm, provenance)        ← new
 │   ├─ WeeklyBudgetControl + AvailabilityControl      ← refactored from step 3
 │   ├─ PreparednessMatrix (optional, bulk, mobile alt)← refactored from step 4
 │   └─ GenerationPanel (stages, cancel, recovery)     ← extracted from the monoliths
 ├─ AdvancedPlannerSetup                               ← the existing wizard, re-hosted
 │   └─ (the refactored shared controls above, plus the
 │       mode-specific detail steps and Smart Setup)
 └─ Confirmed plan surfaces (review, editor, coverage,
     preferences, replan)                              ← preserved
```

**Extraction targets** (from the 1,377 / 1,419 / 1,524-line components): scope entry, availability, preparedness, generation progress, saved-plan list and the review shell. Target: no new component above ~400 lines, and the monoliths shrink by *extraction*, not deletion — Advanced setup is the same controls in a longer arrangement.

**State ownership.** Server state (brief, readiness, distribution, findings, research results) lives in the session and is fetched/mutated through the client helpers; working UI state (which row is expanded, matrix selection) is local; optimistic UI is limited to deterministic actions (`setWeeklyBudget`, `bulkSetPreparedness`) and is reconciled against the server's returned brief and `version`; research and generation have explicit `idle | running | done | failed` states with `aria-live` updates; conflicts (`INTAKE_STALE`) surface as a refresh prompt rather than a silent merge.

---

## 27. Security and privacy

Preserved without exception: cookie `getSession` with `tokenVersion`, owner-scoped planner access, server-only Prisma, no service-role exposure, private/no-store planner responses, no mobile Bearer planner auth, no private planner Realtime publication, no chain-of-thought storage or display. The intake session follows the same posture as every planner table (RLS enabled, no client grants, owner-scoped).

**Research and intake must not log:** private syllabus content, Plan Brief academic content, uploaded document text, prompts, raw model output, or conversation text. Telemetry carries counts, closed codes and states only (§24). Public source provenance (URL, title, publisher, retrieval time) may be stored because it is public and necessary to explain scope construction; **private uploads carry an owned file identity and storage path, never a public URL**, and the `private` flag on provenance keeps the two distinguishable in every read path. Uploads reuse `validateUpload` (size, MIME, sniffing) and the existing private bucket conventions.

---

## 28. Mobile and accessibility

**Mobile:** the Copilot is primary; the Plan Brief is a collapsible, stacked surface rather than a side column; the preparedness matrix has a stacked alternative (per-unit rows with the same vocabulary) because a 40-column grid is unusable on a phone; generated-weekly distribution is shown as a compact list, not a table; all targets ≥ 44px.

**Accessibility:** real form controls for every brief row (no click-only divs); the matrix is keyboard navigable with roving focus and does not encode meaning in colour alone (each state carries a label or icon); research status is announced through `aria-live`; focus moves predictably after a Copilot action (to the changed brief row, announced); provenance is exposed as accessible text (source type, title, publisher, retrieved date) with links where public; reduced-motion respect and the existing token-based appearance system (dark/light/custom accent and background) continue to apply, since the planner stylesheet already uses 26 token references and no hardcoded colours.

---

## 29. Performance and bounds

| Budget | Value | Basis |
| --- | --- | --- |
| Plan Brief payload (client ↔ server) | ≤ 64 KiB | Bounded by 200 nodes + 12 turns + provenance refs; the engine's own input envelope for comparison is 32 KiB (`LIMITS.inputBytes`) |
| Intake session row (`brief` + `conversation`) | ≤ 256 KiB | Room for the brief plus 12 turns without unbounded growth; enforced on write |
| Max scope units sent to the engine | 50 (EXAM/MASTERY), roadmap envelope | Existing `LIMITS.topics`; exceeded selection segments (§10) |
| Max tree nodes in the brief | 200 | Allows a 50-unit plan with chapter structure; read/derived cost is linear |
| Research provenance | ≤ 8 sources per brief, ≤ 200 node refs each | Enough to explain scope construction, bounded for storage and render |
| Copilot turns retained | 12 | §22 |
| 40-unit matrix render | single pass; ≤ 16 ms interaction budget on a mid-range device | Component-level target to be measured in the phase that builds it |
| 100+ unit source | segmentation at 50 confirmed units | §10; never truncated, never silently merged |
| Query shape | one read per session fetch; ≤ 2 for a research result; no per-node or per-source queries | Mirrors the engine's bounded-read discipline (Phase 6 measured 3 queries for the whole A2/A3 context) |

These are budgets to verify in the phases that implement them, not measurements — the measured numbers this report relies on are the ones recorded in §1.2.

---

## 30. Migration expectations

| Phase | Migration | Content |
| --- | --- | --- |
| UX Phase 1a (baseline telemetry) | none | Telemetry vocabulary and counts only |
| UX Phase 1 (Quick Plan) | **one** | `PlannerIntakeSession` (§21), additive; plus the two additive contract changes: nullable preparedness fields (§11) and the findings/acknowledgement shape (§19), neither of which alters stored data |
| UX Phase 2 (research / import) | possible small | Only if provenance outgrows the session JSON; a private storage bucket is configuration, not a migration |
| UX Phase 3 (comparison + fast preparedness) | none expected | Brief and session JSON only |
| UX Phase 4 (Copilot) | none expected | Uses the session from Phase 1; action receipts live in its JSON |
| UX Phase 5 (integration/quality) | none expected | Quality and consistency work |

All additive, no historical migration edits, applied through the reviewed Prisma workflow, with `SCHEMA_BUILD_VERSION` bumped as the existing convention requires.

---

## 31. Implementation roadmap for UX Phases 1–5

### UX Phase 1a — baseline instrumentation (before replacing anything)

* **Scope:** add the §24 events and counts; emit them from the *existing* wizard so the current flow is measured on the same axes the redesign will be.
* **Dependencies:** none. **Files:** `lib/planner/telemetry.ts` (vocabulary + counts), the three mode components (emit on step entry, first input, generation request, abandonment), and nothing else.
* **Migration:** none. **Stop gate:** events verified in a local flag-on session; no UX change shipped.
* **Risk:** instrumenting the wizard must not alter its behaviour — the change is additive logging only, verified by the existing UI suites.

### UX Phase 1 — Quick Plan (default path)

* **Scope:** `PlanBriefV1` + adapters, readiness, weekly budget distribution, `PlannerIntakeSession`, three endpoints, `QuickPlan` / `PlanBriefPanel` / `WeeklyBudgetControl`, re-hosted Smart Setup questions, the findings envelope for already-advisory codes, generation through the existing route, Advanced setup reachable but not default.
* **Dependencies:** Phase 1a (to measure the change). **Files:** `lib/planner/intake/*` (brief, adapters, readiness, distribution), `lib/planner/server/intake.ts`, three routes, the new components, and the additive `ScopeTopicSchema`/findings changes.
* **Migration:** one (`PlannerIntakeSession`). **Stop gate:** a student can go from goal to first draft without the six-step form; Advanced setup still works unchanged; all Phase 0–6 suites green.
* **Risks:** the nullability refactor (42 read sites) is the largest single risk and gets its own task with the predicate module; the weekly distributor must not double-count existing load (§9.2); keeping Advanced and Quick from diverging as the controls are extracted.

### UX Phase 2 — scope research and import

* **Scope:** extend the search result to carry ranked sources; `lib/planner/research/*`; research/import actions and their review surface; provenance records; private upload path and bucket; the `plannerResearch` bucket if volume justifies it.
* **Dependencies:** Phase 1 (session, brief, actions). **Migration:** possibly none. **Stop gate:** research produces a reviewable candidate scope with provenance and **cannot** reach the brief unconfirmed; import segments large inputs rather than truncating.
* **Risks:** provider variability and grounding quality; official-source ranking maintenance; making the fallbacks (paste/photo/manual) genuinely usable rather than an afterthought.

### UX Phase 3 — curriculum comparison and fast preparedness

* **Scope:** comparison contract and vocabulary, bulk/chapter matrix operations, the three-state preparedness UI, `bulkSetCoverage`/`bulkSetPreparedness`/`setPriority` actions, and the flip of the completeness codes to warnings with their tests.
* **Dependencies:** Phases 1–2. **Migration:** none expected. **Stop gate:** a 40-unit scope can be prepared in a few interactions, unknown stays unknown end-to-end, and no comparison output claims mastery.
* **Risks:** the vocabulary discipline ("overlap is not ability") must survive UI copy review; bulk actions must stay within the 200-ref bounds and remain reviewable.

### UX Phase 4 — Planner Copilot

* **Scope:** the action parser, the action endpoint's NL path, the conversation surface, layout (desktop split, mobile stacked), focus and `aria-live` behaviour, and the release action for pending generated work.
* **Dependencies:** Phases 1–3. **Migration:** none expected. **Stop gate:** every Copilot effect is a typed, server-validated action; post-confirmation instructions route to Phase 5 and cannot mutate execution.
* **Risks:** the parser proposing actions the server refuses (must degrade to clarification, not retry loops); keeping chat from becoming a second source of truth; token cost discipline.

### UX Phase 5 — integration and quality closure

* **Scope:** cross-mode consistency, measured comparison against the Phase 1a baseline, accessibility and mobile QA, performance verification against §29, the remaining warning flips, and a readiness assessment.
* **Dependencies:** Phases 1–4. **Migration:** none expected. **Stop gate:** the redesign is measured, the engine is untouched, and enablement remains a separate decision.
* **Risks:** declaring victory on a small sample; letting accumulated overrides make plan quality invisible — mitigated by reporting accepted warnings alongside plan quality metrics.

---

## 32. Risks and unresolved questions

1. **Nullability is the biggest engine-adjacent change.** 42 read sites across 11 files must move to the predicate module; the report deliberately makes the compiler the enforcement mechanism. If any site is missed, TypeScript will catch it, but the *policy* at each site still needs review — the per-rule table in §11 is the checklist.
2. **What "standard provision" means numerically for an unstated unit** is a policy choice inside the mode policies (floors are computed from `priority`/`sizeSignal`/coverage). This phase fixes the *semantics* (no weakness escalation, no exemption, no fabrication); the exact floor arithmetic is verified in the phase that implements it, against the existing floor tests.
3. **Research quality is the largest product risk.** The current search path cannot supply honest provenance until the grounding metadata is captured, and a weak result must degrade to the fallbacks visibly.
4. **Segmentation changes the shape of the review** for large syllabi: the student confirms a segment, not the whole course. The report recommends this over silent truncation, but it is a product decision worth explicit review.
5. **Override accumulation** could hide plan quality: mitigated by recording accepted codes, surfacing them in the plan's history and quality metrics, and requiring re-acceptance when the underlying draft changes.
6. **Two homes for planner content** (the intake session and the revision history) need one retention story: 30-day expiry with explicit deletion, and no intake content in revision snapshots.
7. **Open questions for review:** (a) should the weekly budget be per-plan or account-wide by default; (b) is 30 days the right session expiry; (c) should `ADVANCED_REFINEMENT_AVAILABLE` be surfaced as a nudge or only as an affordance; (d) does the `plannerResearch` bucket need to exist before research volume is measured; (e) should a released item be re-offerable by a later replan (recommended: surfaced as a warning, never auto-inserted).

---

## Explicit answers

| Question | Answer |
| --- | --- |
| **Can the six-step wizard be removed from the default path without changing the planner engine?** | **Yes.** The wizard is a client that assembles `UserInputV1`; Quick Plan assembles the same contract through the brief adapters. The engine's inputs, validators, pipeline and reconciliation are untouched, and the wizard survives as **Advanced setup** rather than being deleted. |
| **Can weekly hours deterministically feed the existing capacity system?** | **Yes**, and it should be *load-balanced*, not merely prorated: `distributeWeeklyBudget` produces `dailyMinutes[7]` + `blockedDates` deterministically (largest-remainder distribution balancing rest days, floating rest dates, existing workload, hard unavailable weekdays and soft preferences), run server-side because two inputs exist only there. The weekly figure stays a target budget; the engine's capacity model and the explicit hard limits remain authoritative and blocking. |
| **Can unknown preparedness remain valid?** | **Yes** — and it must not be faked. `covered`, `confidence` and `difficult` become nullable; `null` means unstated, TypeScript forces all 42 read sites to handle it, and one policy module defines unstated as *not weak, not secure, standard provision, learning still required*. The `covered:false, confidence:1` mapping is explicitly rejected, with the five rules that would have misread it listed in §11.1. |
| **Can hierarchical research scope map safely into current flat planner units?** | **Yes**, under three rules the engine already implies: unique labels (collisions qualified as `Parent · Child`, display labels unchanged), `scope === labels.join("\n")` exactly, and segmentation at the 50-unit cap with no truncation and no silent merging. Grouping metadata stays on the brief (`flattenMap`), so no engine or database change is needed. |
| **Where should pre-generation Plan Brief state live?** | In a bounded intake session **beside** the engine — never in a PREPARING revision (a live operation holding a quota reservation and lease), never in a sealed revision, never in Quest metadata, and not in the DRAFT plan shell (created only when generation starts and bound to one request key and input digest). |
| **Is a new table required?** | **Yes — exactly one, and in UX Phase 1.** `PlannerIntakeSession` (owner-scoped, `clientKey`-unique, bounded `brief` JSON, `version`, `expiresAt`, nullable `planId`, RLS, no client grants) gives refresh recovery from the first phase, per review. A second table is only warranted if provenance outgrows the session JSON. |
| **Does the Copilot need its own persistent transcript?** | **No.** At most 12 recent turns live inside the session, the structured brief is authoritative, action receipts reconstruct history, and everything expires with the session. No second chat-history platform. |
| **What is the minimum typed action vocabulary?** | The 22 actions in §17, each with bounded arguments drawn from existing closed vocabularies: goal/subject/mode/target/budget/overrides/unavailable/reserve/background, the scope verbs (research, import, confirm, update), the preparedness verbs (bulk coverage, bulk preparedness, priority), constraint/preference, smart-answer, and the two terminal actions (`requestGeneration`, `releaseGeneratedItem`). |
| **Can Copilot updates remain server-validated?** | **Yes, necessarily.** Natural language is parsed into *proposed* arguments; only the server applies an action, against the same closed schemas the engine uses, under optimistic concurrency and idempotency keys, with blockers refused and warnings requiring acknowledgement. |
| **Can research remain bounded and source-confirmed?** | **Yes.** Two bounded stages, one attempt plus at most one retry, timeouts, cancellation, snapshot-hash concurrency, cached by input hash with explicit `retrievedAt` freshness, and a mandatory `RESEARCH RESULT → REVIEW → USER CONFIRMATION → AUTHORITY` flow. Nothing researched or imported reaches the brief unconfirmed, and a weak result degrades to upload/paste/manual rather than to an invented syllabus. |
| **Can uploaded/private content remain out of telemetry?** | **Yes, by construction.** Telemetry carries counts, closed codes and states only; uploads carry an owned file identity with a `private` provenance flag and no public URL, and no document text, brief content, prompt or model output is logged anywhere in the intake path. |
| **Can confirmed-plan chat changes reuse Phase 5 rather than create a new mutation system?** | **Yes, and they must.** Post-confirmation the Copilot has no execution mutation path: it starts and explains Phase 5's proposal → diff → review → confirm → atomic reconciliation. Protected execution, staleness and idempotency rules are unchanged. |
| **Which existing UI components should survive as Advanced setup?** | The three mode components (refactored into shared controls), their per-topic preparedness and availability steps, the Smart Setup step, the review shell, saved-plan lists, and every post-generation surface (`PlanItemEditor`, `RebalancePanel`, `CoverageMapPanel`, `PreferencePanel`, `StretchPromotion`, `FrictionFeedback`, `IntensityNote`). Nothing is deleted in Phase 1. |
| **Can a student keep an intentionally imperfect or custom plan — delete generated work, study longer, skip a recommended step?** | **Yes, through the two-class model in §19–20, not by loosening validators.** Validation returns findings instead of throwing on the first breach: **blockers** (ownership, state/version safety, execution and lineage safety, malformed structure, impossibility by definition, explicit HARD constraints) are never overridable; **warnings** (AI-recommended duration, educational completeness, over-budget capacity, rest-day scheduling, semantic advisories) are surfaced with their consequence and accepted by acknowledgement code, recorded on the revision. Concretely: a session longer than recommended is a warning up to the hard and absolute limits, which stay blockers; a mock exam the student does not want can be dropped by accepting the completeness warning; and a generated task can be **released** while it is still pending and unstarted, through an explicit action that tombstones the link with `USER_RELEASED` via the existing manual-mutation capability, preserving lineage. A later replan may surface an accepted gap again as a warning, but never silently re-inserts the work. |
| **What telemetry must exist before UX Phase 1?** | The Phase 1a set in §24: `intake_started` (with entry path), first-meaningful-input, readiness transitions, first-draft-requested, abandonment with reason, plus counts for fields touched and manual versus researched/imported units, and `entryPath` on the existing generation events — enough to measure time-to-draft, effort and abandonment before and after the switch. |
| **Are UX Phases 1–5 independently shippable and testable?** | **Yes.** Each has its own scope, dependencies, migration expectation and stop gate; Phase 1a is purely additive instrumentation, Phase 1 delivers a usable Quick Plan behind the existing flag, and Phases 2–4 each add one capability (research/import, comparison/fast preparedness, Copilot) without requiring the next. |
| **Is UX Phase 1 safe to begin?** | **Yes, once this report is reviewed and approved** — starting with Phase 1a (baseline instrumentation) so the redesign can be measured, then the brief/adapters/readiness/distribution work, the nullability refactor with its predicate module as its own reviewed task, and the one additive migration. The engine, Classic Planner and the existing wizard remain untouched throughout. |

---

## Appendix — primary evidence inspected

`lib/planner/contracts.ts`, `lib/planner/scope-topic.ts`, `lib/planner/constraints.ts`, `lib/planner/capacity.ts`, `lib/planner/priority.ts`, `lib/planner/exam-fields.ts`, `lib/planner/roadmap-fields.ts`, `lib/planner/mastery-fields.ts`, `lib/planner/exam-policy.ts`, `lib/planner/roadmap-policy.ts`, `lib/planner/mastery-policy.ts`, `lib/planner/expansion-policy.ts`, `lib/planner/smart-setup.ts`, `lib/planner/telemetry.ts`, `lib/planner/transport.ts`, `lib/study-systems.ts`, `lib/planner/server/{core,generation,operations,revisions,materialize,mutation-guards,http}.ts`, `lib/ai/{config,usage-limiter,syllabus-compiler,chat-tool-executor}.ts`, `lib/upload-security.ts`, `lib/supabase-storage.ts`, `prisma/schema.prisma`, `prisma/migrations/20260924010000_planner_foundation/migration.sql`, `app/api/planner/**` (all sixteen routes), `app/components/planner/**` (all components), [Sylf_AI_Planner_Experience_Research_Addendum_v1.0.md](../../specifications/Sylf_AI_Planner_Experience_Research_Addendum_v1.0.md), plus the Phase 0–6 reports for reconciliation.
