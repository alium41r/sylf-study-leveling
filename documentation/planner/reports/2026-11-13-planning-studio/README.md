# Planning Studio implementation — 13 November 2026

Branch `planner/planning-kernel`. Implements the [planner blueprint](../2026-11-13-planner-blueprint/README.md) beside the existing planner, behind `SYLF_PLANNING_STUDIO`. The current contract is [STUDIO.md](../../STUDIO.md). Evidence is in [`evidence/`](evidence/): `template/` (no model) and `deepseek/` (the real model), each with `studio-check.json` and screenshots.

## Outcome

A working, integrated planner: DeepSeek V4.1 Flash understands goals and requests and writes typed operations; a deterministic kernel fits them into the student's real free time, verifies them and explains every session; plans are versioned proposals the student accepts, discards or undoes; accepted plans become Goals, Quests and timed sessions that Focus, rewards, Today and Calendar already understand; the plan repairs itself as sessions are missed; and Sylf Native has a Planning Studio as Plan's first view.

| Measured | Result | Blueprint target |
| --- | --- | --- |
| Hard verifiers over random instances | 10,000 of 10,000 pass | No failures across 10,000 |
| Repair of an unchanged plan (300 stress instances) | Nothing moved, resized or removed; 12 single additions of leftover capacity, then stable | Replanning moves as little as possible |
| Full solve, 60 items over 14 days (M1, V8) | 27.6 ms p50, 28.6 ms p95 | < 30 ms p95 on the Tab S9 FE (not yet measured there) |
| Drag reflow and repair (same instance) | 0.6 ms p50 | < 5 ms warm re-solve |
| Command on the fast path, in the real app | 0.2 s to a reviewable diff, no model | — |
| New exam, real model, in the real app | First token 1.3 s; proposal shown at 10.1 s; 2,140 output tokens; 95% of input from DeepSeek's cache | First blocks ≈ 2 s; complete ≈ 5 s p50 |
| Open-ended command, real model | First streamed item 3.1 s; proposal 5.4 s | ≈ 2 s to diff |
| Plan quality score (critics) | 87 on the model's plans in the final run | — |
| Live model spend for all verification | About $0.03 (three probe calls, three Electron runs) | — |

The first-sessions latency meets the spirit of the target (items appear on the timeline as they stream); the complete-plan latency is about twice the target and is the main open performance item (see Remaining work).

## Audit: what was kept, replaced and extended

| Existing part | Decision | Why |
| --- | --- | --- |
| DeepSeek configuration (`DEEPSEEK_MODELS`), `cleanDeepSeekApiKey`, `openAIUsage`, `observeAiDispatch`, `withAiRequest` | **Reused** by the new gateway | One model registry and one dispatch ledger |
| `DeepSeekAdapter` | **Not extended** for the Studio | It sends `tool_choice: "auto"` and cannot stream tool arguments; the gateway needed strict named tools on `/beta` and argument streaming. Probed live before building (see below) |
| Quota (`reserveQuota`, `releaseQuota`, entitlements) | **Reused** with a new `studio` bucket (60 workflows a day) | The weekly `planner` bucket (1) fits the old heavy pipeline, not frequent cheap calls |
| `readPlanningCalendar`, the calendar advisory lock (73642) | **Reused** | Complete capacity including connected calendars; commits refuse a calendar mid-change |
| `executionTransaction` (advisory lock 73641) | **Reused** for every commit | Same serialization as every quest and reward write |
| `StudyScheduleService` rest-day semantics, `TimezoneService` | **Reused** (rest weekdays and floating rest days in the snapshot) | One rest-day rule |
| `calculateRecommendedDifficulty`, `calculateQuestRewards`, `calculateSemanticScopeWeight` | **Reused** in projection | Rewards stay Sylf's; the planner grants nothing |
| Quests, Goals, StudySession, the Native session `setPlan` → Focus | **Reused** as the execution model | Quests stay the unit of work and reward |
| PlannerPlan, PlannerRevision, PlannerIntentVersion, PlannerQuestLink and their SQL guards | **Not reused for Studio data**; left untouched | They are bound to the V2 attempt machinery (`planner_v2_*` triggers need attempts, coordination fences and apply owners) and lock linked quests against any edit, which contradicts drag, repair and undo. The Studio has its own additive tables with ownership and immutability triggers and enforces execution protection inside its commit. Goals owned by those plans are shown in the Studio as fixed and never edited |
| Backtracking allocator, multi-role pipeline | **Replaced** for the Studio path, **not deleted** | Strangler: the old planner keeps working (Plan → Classic plans) until the Studio wins on evaluation and live metrics |
| Native Plan destination, Sylvie handoff | **Extended**: Planner is the first view; Sylvie's handoff now goes to it | One place for new planning |

## What was built, by roadmap stage

| Stage | Built | Not yet |
| --- | --- | --- |
| 0 · Measure | Live probe of strict tools, named tool choice, streamed arguments, `user_id` and cache fields on `deepseek-flash` (all accepted; ≈1.2–2 s for ≈110 output tokens). Latency, tokens and cache hits recorded per proposal in `PlanVersion.trace` | The 60-scenario bank and the baseline scoring of the old planner |
| 1 · Kernel | Contracts, operations with precise errors, min-cost-flow allocation with comfortable and sustainable tiers, pace caps and weekly budgets, timed placement with breaks, transition buffers, energy, preferences, interleaving and seeded local search, diagnostics and reasons, hard verifiers and six critics, diff, repair mode, fill pass, calibration, strategy library and templates, command fast path, signals, streaming JSON. Property tests over 10,000 random instances; `@sylf/shared` export with a V8 parity hash | Tablet benchmark; Hermes and Chromium parity values; HiGHS fallback (not needed so far); Phase D probabilistic forecast |
| 2 · Intelligence | Context compiler with short refs and byte-stable tiers; gateway profiles (`intent.parse`, `goal.decompose`, `plan.critique`, `copy.brief`, `copy.explain`, `assistant.answer`); fast path; streamed parallel decomposition with progressive solving; one targeted repair turn; the semantic critic off the critical path | The evaluation rubric and release gates; `review.weekly` (thinking) and off-peak precompute; `ingest.document` (syllabus and timetable photos) |
| 3 · Plan store and action | Migration, versions with idempotency keys, stale re-validation and rebase, undo, autonomy levels, projection into Goals, Quests and blocks, execution protection, PostgreSQL suite | Calendar export of blocks (optional in the blueprint); a Plan layer inside the Calendar view |
| 4 · Planning Studio | Native: health strip, command bar with interpretation chip and suggestion chips, activity line, diff review with questions and assumptions, signals with what-if options, Day/Week/Term timeline (hatched commitments, subject colours, dashed proposals, done and missed states, rest shading, now line), drag with device reflow and pinning, keyboard-accessible Move, inspector (why, first step, calibration note, Start, Move, Pin, Skip), goal map with streamed items, what-if controls, settings, history with undo, phone Today agenda | Web app parity; Split in the inspector; swipe gestures on the phone agenda (buttons today); the five-student usability session; tablet verification |
| 5 · Adaptive loop | Missed and done detection, repair on open and overnight before the deadline check, calibration from history (estimate factors, energy curve, sustainable capacity) with plain-language notes, signals (shortage with options, tight deadlines, overload, untouched goals, exam checkpoints, missed sessions), daily brief and open questions | Shutdown check-in rating, weekly review, notifications for signals, FSRS reviews |
| 6 · Intake, rollout, retirement | Feature flag, strangler coexistence, Sylvie handoff | Syllabus and timetable intake, import of existing V2 plans, staged rollout, deleting replaced code |

## Verification

- **Kernel:** `__tests__/planner/kernel` (29 tests). With `KERNEL_PROPERTY_RUNS=10000`: every hard verifier passes on 10,000 random instances (overloads, classes, rest days, day-offs, caps, subject caps, preferences, practices, pins, dependencies). Repair stability over 300 instances. Speed test.
- **PostgreSQL:** `node scripts/test/test-planning-studio-postgres.mjs` builds the schema without the four tables, applies the migration unchanged, checks there is no drift from `schema.prisma`, and runs 10 tests (commit and replay, concurrent commits, stale rebase, direct move and undo, execution protection on dropping a goal, calendar avoidance, overnight repair, ownership and immutability triggers, unchanged-world repair). Passed repeatedly.
- **Live app:** `run-backend-local.mjs --studio --dev [--with-deepseek]` signs a new student up in the real Electron window against the real Next.js server on a disposable database and checks 20 steps. Both runs passed with no console errors. Screenshots cover empty, new goal, planning, proposal, week, inspector, command chip, command proposal, undo notice, what-if, term, settings, the model's streaming and proposal, dark, a custom midtone accent and ground, and a 390-pixel phone.
- **Native:** typecheck, lint, 653 tests (652 passed, 1 skipped as before), boundary and single-copy checks.
- **Root:** full typecheck; lint on every changed file; the AI, quota and kernel suites together (588 passed).

### Defects found by verification and fixed

- A PL/pgSQL trigger read `NEW."questId"` on `PlanVersion` rows because `AND` does not short-circuit (found on real PostgreSQL).
- Direct edits closed open proposals instead of leaving them to rebase; undo kept a pin the undone version had added.
- Re-solving an unchanged plan was not a fixed point: led to repair mode, minute-level stability, warm-started placement, the fill pass and a consistent break rule.
- Consolidation and fixed sessions could exceed per-subject caps (now a hard verifier).
- A session about to start could be "repaired" away as the clock passed it.
- The semantic critic waited on the critical path and could add work to the wrong goal; the device waited for it before showing the proposal.
- The exam reason named the item's finish-by date as the exam; fresh plans claimed "Kept where it was"; ten-minute crumb sessions; conversational lead-ins in goal titles.

## Deviations from the blueprint

- **Plan store tables.** The blueprint suggested reusing PlannerRevision, PlannerIntentVersion and PlannerQuestLink. Their V2 guards make every linked quest read-only outside the attempt pipeline, which cannot coexist with drag, repair and undo, so the Studio has additive tables and enforces the same protections in its own transaction. Nothing in the old tables changed.
- **Open questions** use one bounded call over a deterministic fact pack rather than a four-step tool loop; it answers within the latency budget and cannot act.
- **Repair mode** was added to the kernel (not in the blueprint) to make P6 ("replanning moves as little as possible") hold by construction.
- **Proposals and the critic.** The proposal is shown first; a critic finding replaces it once while it is still open.

## Remaining work

Ordered by value:

1. **Owner actions to switch it on:** review, apply `20261113100000_planning_kernel` to the hosted database, set `SYLF_PLANNING_STUDIO=on` (and, if wanted, `SYLF_PLANNER_USER_HASH_KEY`). Disclosure of what is sent to DeepSeek in the privacy policy, and the blueprint's review of under-18 data, are the owner's decisions.
2. **Tablet:** benchmark the solver on the Tab S9 FE (target < 30 ms p95), record the Hermes value of `planning.solve`, and walk the Studio on the device (drag on touch, phone agenda).
3. **Complete-plan latency** (10 s for an exam): shorter decomposition output (lazy first steps, fewer fields), and showing the streamed preview as reviewable earlier.
4. **Evaluation:** the scenario bank, rubric scoring against the 7 November baseline, and release gates; the exam-preparation critic shows that broad retrieval sessions leave many syllabus nodes with fewer than two retrievals.
5. **Integrations still to wire:** a Plan layer in the Calendar view, a next-session card on Today, planner intents in the command palette, Sylvie and the daily briefing calling the Studio's facts, notifications for signals.
6. **Stage 5–6 features:** weekly review (thinking, off-peak), shutdown rating, FSRS reviews, syllabus and timetable intake by photo, import of V2 plans, web parity, staged rollout and retirement of the old pipeline.
