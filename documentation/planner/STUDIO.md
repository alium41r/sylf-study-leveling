# Planning Studio — current contract

**Status (13 November 2026):** implemented beside the existing planner, behind `SYLF_PLANNING_STUDIO`. On by default in development, off in production until the owner applies the migration and sets `SYLF_PLANNING_STUDIO=on`. Source, tests, schema and configuration remain authoritative; this page says where they are and what they promise. The design input is the [planner blueprint](reports/2026-11-13-planner-blueprint/README.md); the build and its evidence are in the [implementation report](reports/2026-11-13-planning-studio/README.md).

## What it is

A planning kernel. DeepSeek V4.1 Flash (`deepseek-flash`) reads a compact snapshot of the student's Sylf data and writes typed operations on a **work model** (goals, work items with calibrated estimates and study methods, practices, rules, assumptions, at most two questions). A deterministic TypeScript **solver** fits the work into real free time. **Verifiers** gate every result. Every change is a **versioned proposal** the student accepts, discards or undoes, and accepted plans are **projected** into Goals, Quests and timed blocks. Most interactions never call the model.

## Where it lives

| Part | Path | Notes |
| --- | --- | --- |
| Kernel (pure, portable) | [`lib/planner/kernel/`](../../lib/planner/kernel/) | Contracts, operations, solver, verifiers and critics, diff, repair, calibration, strategy library, command fast path, signals, streaming JSON. No I/O, no Intl, no framework imports. Exported to Native as `planning` from [`@sylf/shared`](../../native/packages/shared/src/index.ts), with a parity case `planning.solve` |
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

## Lifecycle

1. **Sense.** `compileContext` reads availability (fixed and floating rest days, the study day, calendar events through `readPlanningCalendar` including connected calendars, other quests' load), subjects and syllabus nodes, goals (Sylf goals join unplanned; goals owned by another planner are shown and never edited), linked quests (progress, completion, deletion, a student's own rescheduling), four weeks of focus history (calibration, energy curve, sustainable capacity) and the living plan. Past committed sessions become done or missed.
2. **Understand** (only here does the model run). See workflows below.
3. **Fit, check, propose.** `propose()` solves, verifies and diffs against the committed plan. A proposal is a `PlanVersion` in state `PROPOSED`; one is open at a time.
4. **Commit.** `acceptProposal` re-checks the proposal's placements against today's world. If the plan moved on or the calendar changed, it is re-solved and returned for review instead (`rebased`). Otherwise, inside `executionTransaction` (the per-student advisory lock) with the calendar planning lock: projection, block rows, version `COMMITTED`, `PlanningSpace.version + 1`. A replayed key returns the first outcome.
5. **Undo.** A new committed version restoring the previous version's intent and placements, with today's progress and history kept.
6. **Observe and repair.** `POST {action:"open"}` runs sense and repair. *Smart* (default) applies small changes by itself, *Autopilot* every non-destructive repair, *Ask me* nothing; larger repairs become proposals. The overnight deadline check calls `repairBeforeDeadline` for Studio quests before failing anything.

## Projection into Sylf

- A new kernel goal with work becomes a `Goal` (title, `targetDate`, `targetWeeks`, colour).
- Each open work item with a session in the detailed horizon has one `Quest`: `requiredMinutes` and `targetMinutes` from the calibrated p50 (15–240), difficulty from `calculateRecommendedDifficulty`, rewards from `calculateQuestRewards`, `scheduledFor` = the date of its next session, subject and first syllabus node, `createdByAi` for model and template work. Practice occurrences in the next seven days get their own quests.
- **Execution protection:** a quest with elapsed time, a session or a non-open status is never deleted or reshaped; only its date moves. Unstarted quests of released work are deleted. `plannedMinutes` stays null, so V2 execution guards do not apply. The planner never grants rewards.
- `PlanItemQuest` links items to quests; `PlanBlock` holds sessions with local date, minutes and instants.

## Workflows

| Workflow | Route | Model calls |
| --- | --- | --- |
| Open (sense and repair) | `POST /api/planner/studio {action:"open"}` | 0 |
| Edit by command | stream `command` | 0 on the fast path (moves, days off, illness, caps, windows, weights, start earlier, drop goal, new deadlines); otherwise `intent.parse`, then parallel `goal.decompose` for new goals |
| Add or plan a goal | stream `add_goal` | 1 streamed decomposition, then the semantic critic off the critical path (a revised proposal replaces the open one once, if it adds work) |
| Answer a question | stream `answer` | 1 |
| Drag, move, pin, skip, restore | `POST {action:"direct"}` | 0, committed at once with undo |
| What-if | device preview; `POST {action:"whatif"}` to keep | 0 |
| Accept, discard, undo, settings | `POST` actions | 0 |
| Why is this here? | `POST {action:"explain"}`; stream `explain` for one sentence | 0, or 1 short |
| Daily brief, open question | stream `brief`, `question` | 1 short, or a deterministic fallback |

Without a DeepSeek key, or with the `studio` quota spent, model workflows fall back to the strategy library's templates and say so.

## Model gateway

`gateway.ts` owns every call: `deepseek-flash` only; non-thinking; strict function calling on `/beta/chat/completions` with a named tool (falls back once to a named tool without strict mode); streamed tool arguments parsed element by element (`StreamingArrayParser`); per-profile deadlines; two jittered retries; a hedged duplicate after 2.5 s without a first token on interactive profiles; a circuit breaker; `user_id` = HMAC of the Sylf user id; dispatch telemetry through `observeAiDispatch` inside `withAiRequest` (feature `planner`, workload `studio.*`). Quota: `AI_QUOTAS.studio` (60 workflows a day), released when a workflow falls back. Prompts are tiered for DeepSeek's prefix cache; student text travels inside `<data>` tags.

## Native

Home → Plan → **Planner** is Plan's first view; Calendar, Quests and goals, and Classic plans follow. Sylvie's "Plan it in the Planner" hands requests to it. Layout: health strip, command bar with suggestion chips, live interpretation chip (the kernel's fast path on the device) and activity line; preview bar for drags and what-ifs; diff review; signals with pre-solved options; Day, Week and Term timeline beside the goal map or inspector; What if…; history with undo; settings (autonomy, study day, daily cap, break, day-only lens). On a phone it opens on Today with the next session (Start, Later). Drags and what-ifs re-solve on the device with the same kernel; Start opens Focus with the session's quest.

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
