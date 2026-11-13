# Planning Studio — current contract

**Status (13 November 2026):** implemented beside the existing planner, behind `SYLF_PLANNING_STUDIO`. On by default in development, off in production until the owner applies the migration and sets `SYLF_PLANNING_STUDIO=on`. Source, tests, schema and configuration remain authoritative; this page says where they are and what they promise. The design input is the [planner blueprint](reports/2026-11-13-planner-blueprint/README.md); the build and its evidence are in the [implementation report](reports/2026-11-13-planning-studio/README.md).

## What it is

A planning kernel. DeepSeek V4.1 Flash (`deepseek-flash`) reads a compact snapshot of the student's Sylf data and writes typed operations on a **work model** (goals, work items with calibrated estimates and study methods, practices, rules, assumptions, at most two questions). A deterministic TypeScript **solver** fits the work into real free time. **Verifiers** gate every result. Every change is a **versioned proposal** the student accepts, discards or undoes, and accepted plans are **projected** into Goals, Quests and timed blocks. Most interactions never call the model.

**Exams are planned from their syllabus** (since 13 November 2026, [report](reports/2026-11-13-syllabus-planner/README.md)). The topic list (each topic with three to seven key points, its weight, difficulty and the paper's real length) comes from Sylf's checked catalog when the request names a paper it holds, from the student's own list, from one model call, or without the model from the student's own syllabus nodes for the subject; with none of these the planner asks for the topics. A deterministic **study-path compiler** turns it into the whole plan: each topic revised then practised from past papers in syllabus order, mixed reviews of every three topics at least two days later, full timed papers with corrections and the weak topics they expose, and a light formula-sheet review the day before. The model never schedules an exam.

**Presets** (13 November 2026, [report](reports/2026-11-13-planner-presets/README.md)) shape every outline-based plan: **Exam** (above), **Whole course** (each topic studied then practised in order over weeks or months, every three topics reviewed two days later and recalled again about ten days later, a timed checkpoint every six topics, and the exam tail when the course ends in one), **Topic mastery** (subtopics studied and practised in the first half, recall checks at widening gaps of one, three, seven and fourteen days, a mastery test), **Skill** (stages with a lesson, practice sessions and a milestone check, on about the student's days a week at their session length, open-ended without a date), **Reading** (parts in order with written recaps) and **Assignment** (the existing breakdown). **Auto** lets the model choose; without the model a keyword rule does (`inferPreset`). Without a date, a course runs about four days a topic and a skill as many weeks as its sessions, up to a year.

**Research** is optional and the model's call: the outline map returns a confidence and, when it is not high, a search query. Where a search provider is configured (`selectSearchProvider`: DeepSeek Search, then Brave, Serper or SearXNG) the server searches once, reads up to three pages with `fetchSource`, and maps again from them; the syllabus records `researched` and its sources. `SYLF_PLANNING_STUDIO_RESEARCH=off` switches it off.

## Where it lives

| Part | Path | Notes |
| --- | --- | --- |
| Kernel (pure, portable) | [`lib/planner/kernel/`](../../lib/planner/kernel/) | Contracts, operations, solver, verifiers and critics, diff, repair, calibration, strategy library, study-path compiler (`curriculum.ts`), command fast path, signals, streaming JSON. No I/O, no Intl, no framework imports. Exported to Native as `planning` from [`@sylf/shared`](../../native/packages/shared/src/index.ts), with a parity case `planning.solve` |
| Syllabus catalog | [`lib/planner/catalog/syllabi.ts`](../../lib/planner/catalog/syllabi.ts) | Checked topic lists with key points and paper lengths (Cambridge Mathematics 9709 Papers 1–6; Physics 9702 Papers 1, 2 and 4), the matcher (board, level and paper must all be clear), and links to the student's own syllabus nodes. Server only; data, not code |
| Server | [`lib/planner/studio/`](../../lib/planner/studio/) | `snapshot.ts` (context compiler), `gateway.ts` (model gateway), `prompts.ts` (tiers and strict tool schemas), `workflows.ts`, `store.ts` (plan store and projection), `events.ts` (deadline repair), `http.ts`, `config.ts`, `time.ts` |
| Routes | [`app/api/planner/studio/route.ts`](../../app/api/planner/studio/route.ts), [`…/stream/route.ts`](../../app/api/planner/studio/stream/route.ts) | Deterministic actions; model workflows as newline-delimited JSON |
| Schema | [`prisma/schema.prisma`](../../prisma/schema.prisma) (`PlanningSpace`, `PlanVersion`, `PlanBlock`, `PlanItemQuest`), migration [`20261113100000_planning_kernel`](../../prisma/migrations/20261113100000_planning_kernel/migration.sql) | Additive only |
| Native client | [`native/packages/backend/src/studio.ts`](../../native/packages/backend/src/studio.ts) | Loose schemas, keys, NDJSON reader |
| Native Studio | [`native/apps/sylf/src/spaces/home/plan/studio/`](../../native/apps/sylf/src/spaces/home/plan/studio/) | Home → Plan → **Planner** (the first view) |

## The kernel's promises

- **Determinism.** Integer minutes, 5-minute grid, integer flow costs, seeded local search: identical inputs give identical plans on the server and the device.
- **Hard verifiers** (a failing plan is never proposed): reference integrity, no overlap with commitments or other sessions, inside free time and windows, rest days and days off honoured, dependencies in order (spaced methods at least two days apart on shared topics), daily and per-subject caps, every deadline met or reported as an exact shortage, and every demanded minute placed, budgeted to a later week or reported unplaced.
- **Critics** (scored, shown under "How this was planned"): realism against sustainable capacity, exam preparation (share of topics with two spaced retrievals, a light review the day before, no new learning in the final day), front-loading with p80 estimates, interleaving, fragmentation, neglected goals.
- **Modes.** `full` re-solves with a stability term (changes in meaning: new goals, rules, what-ifs) and ends with a fill pass. `repair` keeps every committed session that is still valid exactly where it is and places only the residual (missed, skipped, invalidated or new work). An unchanged world repairs without moving, resizing or removing anything.
- **Imminent sessions** (starting within 30 minutes) and pinned, done, missed and skipped sessions never move.
- **Explanations** come from the solver's trace (`reasons`), never from the model's recollection.
- **Study paths** (`compileStudyPath`) are deterministic. Sessions have stable keys (`<goal>.rev.u3`, `<goal>.paper.1`), so re-compiling after a rating or an unticked topic updates the same sessions, keeps their quests and never touches studied work; unstarted sessions that are no longer wanted are released, and older non-syllabus work of the goal is released on the first compile. Pacing is by date windows from today to the day before the exam over the student's study days; when time is short, sessions shrink to a floor and the plan says so. The rule "no new learning in the final 24 hours" is measured from the exam date, not from a session's own window.
- **Horizon.** The detailed horizon reaches an active exam up to 28 days away (counting an open proposal's exams), so a near exam's whole path lands in the calendar instead of in weekly budgets. Beyond the horizon, weekly budgets reach 52 weeks, so a course can be planned to its end; the study guide lists those weeks as "Later".
- **Hours a day.** A plan's own minutes a day become a `goal_cap` constraint on its sessions (never below its longest single sitting, a full paper). Cap groups are a goal's own limit for its sessions and a subject's limit for every other session of that subject; each item counts against at most one.

## Lifecycle

1. **Sense.** `compileContext` reads availability (fixed and floating rest days, the study day, calendar events through `readPlanningCalendar` including connected calendars, other quests' load), subjects and syllabus nodes, goals (Sylf goals join unplanned; goals owned by another planner are shown and never edited), linked quests (progress, completion, deletion, a student's own rescheduling), four weeks of focus history (calibration, energy curve, sustainable capacity) and the living plan. Past committed sessions become done or missed.
2. **Understand** (only here does the model run). See workflows below.
3. **Fit, check, propose.** `propose()` solves, verifies and diffs against the committed plan. A proposal is a `PlanVersion` in state `PROPOSED`; one is open at a time.
4. **Commit.** `acceptProposal` re-checks the proposal's placements against today's world. If the plan moved on or the calendar changed, it is re-solved and returned for review instead (`rebased`). Otherwise, inside `executionTransaction` (the per-student advisory lock) with the calendar planning lock: projection, block rows, version `COMMITTED`, `PlanningSpace.version + 1`. A replayed key returns the first outcome.
5. **Undo.** A new committed version restoring the previous version's intent and placements, with today's progress and history kept.
6. **Observe and repair.** `POST {action:"open"}` runs sense and repair. *Smart* (default) applies small changes by itself, *Autopilot* every non-destructive repair, *Ask me* nothing; larger repairs become proposals. The overnight deadline check calls `repairBeforeDeadline` for Studio quests before failing anything.

## Projection into Sylf

- A new kernel goal with work becomes a `Goal` (title, `targetDate`, `targetWeeks`, colour; for a syllabus goal the description names the syllabus and its topics).
- Each open work item with a session in the detailed horizon has one `Quest`: `requiredMinutes` and `targetMinutes` from the calibrated p50 (15–240), difficulty from `calculateRecommendedDifficulty`, rewards from `calculateQuestRewards`, `scheduledFor` = the date of its next session, subject and first syllabus node, `createdByAi` for model and template work, and a `description` with the session's aim, its key points and how to study (`questDescription`). Practice occurrences in the next seven days get their own quests.
- **Execution protection:** a quest with elapsed time, a session or a non-open status is never deleted or reshaped; only its date moves. Unstarted quests of released work are deleted. `plannedMinutes` stays null, so V2 execution guards do not apply. The planner never grants rewards.
- `PlanItemQuest` links items to quests; `PlanBlock` holds sessions with local date, minutes and instants.

## Workflows

| Workflow | Route | Model calls |
| --- | --- | --- |
| Open (sense and repair) | `POST /api/planner/studio {action:"open"}` | 0 |
| Edit by command | stream `command` | 0 on the fast path (moves, days off, illness, caps, windows, weights, start earlier, drop goal, new deadlines); otherwise `intent.parse`, then parallel `goal.decompose` for new goals |
| Add a plan with a preset | stream `add_goal` with `preset` (`auto` or one of the six), and optional `minutesPerDay`, `daysPerWeek`, `sessionMinutes`, `start`, `level`, `weak`, `target`, `topics` | As below; Auto adds no call when the catalog decides, and research adds one search and one more map call only when the model is unsure |
| Add or plan an exam | stream `add_goal` (or a command naming an exam) | 0 when the catalog holds the paper or the student lists topics without asking for key points; otherwise 1 streamed syllabus map (`syllabus.map`). The study path is compiled, never written by the model, and the critic does not run. Without any topic list the planner asks for one instead of inventing sessions |
| Add or plan another goal | stream `add_goal` | 1 streamed decomposition, then the semantic critic off the critical path (a revised proposal replaces the open one once, if it adds work) |
| Rate, untick or add topics; confirm the list | `POST {action:"syllabus"}`, or a command such as "I'm weak at integration", "trig isn't in my exam", "skip series" (`parseTopicCommand`, also on the device for the chip) | 0. Re-compiled and proposed for review, on top of the open proposal when the goal is still in it |
| Answer a question | stream `answer` | 1 (0 for a topic list). A question asked in the open proposal is answered on top of it |
| Drag, move, pin, skip, restore | `POST {action:"direct"}` | 0, committed at once with undo |
| What-if | device preview; `POST {action:"whatif"}` to keep | 0 |
| Accept, discard, undo, settings | `POST` actions | 0 |
| Why is this here? | `POST {action:"explain"}`; stream `explain` for one sentence | 0, or 1 short |
| Daily brief, open question | stream `brief`, `question` | 1 short, or a deterministic fallback |

Without a DeepSeek key, or with the `studio` quota spent, model workflows fall back to the strategy library's templates and say so.

## Model gateway

`gateway.ts` owns every call: `deepseek-flash` only; non-thinking; strict function calling on `/beta/chat/completions` with a named tool (falls back once to a named tool without strict mode); streamed tool arguments parsed element by element (`StreamingArrayParser`); per-profile deadlines; two jittered retries; a hedged duplicate after 2.5 s without a first token on interactive profiles; a circuit breaker; `user_id` = HMAC of the Sylf user id; dispatch telemetry through `observeAiDispatch` inside `withAiRequest` (feature `planner`, workload `studio.*`). Quota: `AI_QUOTAS.studio` (60 workflows a day), released when a workflow falls back. Prompts are tiered for DeepSeek's prefix cache; student text travels inside `<data>` tags.

## Native

Home → Plan → **Planner** is Plan's first view; Calendar, Quests and goals, and Classic plans follow. An empty Studio opens on the composer, as the web planner does: preset tiles (Auto first), one title field, the date with relative chips, and prompts that open one small field each (hours a day, topics, board or level, weak spots, target, start date, notes; days a week and session length for a skill). Settings sit beside the command bar; the seven-day health box is gone; while an exam is planned, the activity card shows a stage rail (your week, syllabus, study path, calendar, checks) and the topics as they are mapped. Beside the calendar, an exam's **study guide** has three views: Plan (phases with real dates), Topics (each topic's key points, a Weak/Okay/Strong rating, "In this exam", add a topic, "Topics look right") and Day by day. The inspector shows a session's aim, key points and method before why it is where it is. Sylvie's "Plan it in the Planner" hands requests to it. Layout: health strip, command bar with suggestion chips, live interpretation chip (the kernel's fast path on the device) and activity line; preview bar for drags and what-ifs; diff review; signals with pre-solved options; Day, Week and Term timeline beside the goal map or inspector; What if…; history with undo; settings (autonomy, study day, daily cap, break, day-only lens). On a phone it opens on Today with the next session (Start, Later). Drags and what-ifs re-solve on the device with the same kernel; Start opens Focus with the session's quest.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `SYLF_PLANNING_STUDIO` | on outside production | `on`/`off` |
| `SYLF_PLANNING_STUDIO_AI` | `on` | `off` forces templates |
| `DEEPSEEK_API_KEY` | — | Required for model workflows |
| `SYLF_PLANNER_USER_HASH_KEY` | falls back to existing secrets | HMAC key for `user_id` |

## Verification

| Command | What it proves |
| --- | --- |
| `npm run test -- --run __tests__/planner/kernel` (set `KERNEL_PROPERTY_RUNS=10000` for the exit check) | Kernel properties over random instances, repair stability, operations, fast path, calibration, diff, streaming parser, speed |
| `node scripts/test/test-planning-studio-postgres.mjs` | The migration on disposable PostgreSQL (drift-checked against the schema), commit, replay, concurrency, rebase, undo, direct edits, execution protection, calendar avoidance, overnight repair, ownership and immutability guards |
| `node scripts/test/run-backend-local.mjs --studio --dev [--with-deepseek]` (with the localhost overrides from the [Phase 11 handoff](../native/handoffs/phase-11.md#6-harness)) | The real Electron window against the real server: sign-up, plan, accept, inspect, command, undo, what-if, term, settings, dark, custom colours, phone; with `--with-deepseek`, the model path |
| `cd native && npm run test`, `npm run typecheck`, `npm run check:boundaries` | Native client, views, boundary and parity |
