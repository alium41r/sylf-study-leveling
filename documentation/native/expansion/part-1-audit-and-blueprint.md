# Expansion Part 1 — Web-to-Native audit and design blueprint

**Complete, 1 November 2026, awaiting the owner's review.** Results: the [report](../reports/expansion-part-1/report.md), [blueprint](blueprint.md), [feature map](feature-map.md), [urgent issues](../reports/expansion-part-1/urgent-issues.md) and [Part 2 handoff](../handoffs/expansion-part-1.md). **The device spikes in step 4 did not run, because no tablet run was authorized,** and they moved to Part 2 step 0. This brief is kept as the record of what was asked. It changed no product code.

## Goal

Replace this plan's starting assumptions with verified facts, design every new surface, and prove the unproven, so Parts 2 and 3 can build without planning again.

## Prerequisites

- The [entry gate](README.md#3-entry-gate) is passed or waived in writing.
- The owner has answered, or accepted the default on, E-1, E-2, E-7, E-9, E-11 and E-12.

## Read first

1. [Stage plan](README.md), [feature map](feature-map.md), ADRs [0013](../decisions/0013-expansion-stage.md), [0014](../decisions/0014-home-hub-and-workspace-scope.md), [0015](../decisions/0015-session-modes-focus-environment-and-parties.md).
2. [Stage 3 handoff](../handoffs/stage-3.md), [verification report](../reports/stage-3-verification/report.md), [Phase 11 report](../reports/phase-11/report.md) §2 to §7.
3. [Design guide](../design/README.md), [Home](../home/README.md), [Workspace](../workspace/README.md), [Spaces](../spaces/README.md) and [backend](../backend/README.md) guides.
4. For the audit: [timer](../../timer/README.md), [Calendar](../../calendar/README.md), [Sylvie](../../sylvie/README.md), [Planner index](../../planner/README.md), [Student workspace](../../planner/STUDENT_WORKSPACE.md), [System Hub](../../system-hub/README.md).

Load only what a task needs. Reports describe their own run, so check source.

## Work

### 1. Contract audit

For every row of the feature map marked Must or Should:

- Open the route. Record its methods, inputs, response shape, limits, side effects, error codes, ownership checks and whether a bearer request works.
- Note anything refused to native: `requireOrigin`, `sessionHash`, cookies set or expected, `Sec-Fetch-Site`, `FormData` handling.
- Note what a web screen does around the route that a client must repeat: revisions, retries, idempotency keys, cache invalidation.
- Confirm or correct status and priority in the feature map, in place, with a dated note.
- Run read-only calls against a disposable server where reading is not enough, through `run-backend-local.mjs --serve`.

Questions to close:

| # | Question |
| --- | --- |
| Q1 | What does `GET conversations/[id]` return, and is history paging a real gap (A-12)? |
| Q2 | How does a client change its timezone after registration, and does Native need to? |
| Q3 | Does `calendar/personal` return connected-calendar events? |
| Q4 | Where else is study intensity available, so `calendar/month` can be avoided (A-6)? Should reconciliation move out of the read? |
| Q5 | What exactly does `/api/planner/workspace` need for each V2 step, and do `rebalance`, `reoffer`, `stretch`, `friction` and `check-result` apply to contract-v2 plans? |
| Q6 | Does `planner/[id]/documents` accept a native multipart body? |
| Q7 | How does a Sylvie confirmation travel, from `action` in a reply to `confirmationToken` on the next turn? |
| Q8 | How is the focus background preference stored and refreshed, and how do signed URLs expire? |
| Q9 | Which user fields does `user/stats` lack that Account needs, and is there one good read? |
| Q10 | What does `quests/check-deadlines` do, who calls it, and what happens if Native never does? |
| Q11 | Do any web-only cron or client side effects leave a Native-only student behind, as heartbeat did? **Search for every lazy reconciliation.** |
| Q12 | Does `Quest` have a usable source for a day's order, and what do weekly missions need? |

### 2. Workflow audit

Trace each web workflow end to end, as a student: onboarding, create a quest on a rest day, edit a goal linked to a plan, change the schedule, the eight Planner steps, a chat with a blocked person, a party from invite to leave. Record every state and error a student can reach. These become the designs' state lists.

### 3. Architectural weaknesses

Record duplication and weaknesses found, with a recommendation, in `reports/expansion-part-1/report.md`. Check especially: mode logic between `FocusScreen` and `ModesSettingsScreen`, `reads.ts` size, `data/live.ts` growth, `mapPlanner` and `mapCalendar` moving to Home, Realtime lifecycle against `SpacesShell` keyed by account.

### 4. Spikes

Each proves one thing on the **tablet if authorized**, and on Electron always. Keep them removable.

| Spike | Proves | Decides |
| --- | --- | --- |
| Realtime | `supabase-js` connects from Hermes with a minted token, survives backgrounding, and works in Electron | E-7, the fallback's interval |
| Streaming | Whether Hermes can read a response incrementally, and the cost of a native streaming fetch | T-6, Planner's live view |
| Audio | Looping ambient sound with the screen off, in the background, on Android, and how it stops | The audio dependency, the foreground policy |
| Local notification | A countdown-end alert with the app in the background, after a restart | R9's Android half |
| Keep-awake | Holding the screen in the Focus environment, and release on every exit | The dependency |
| Focus background | A large image: decode time, memory, release on exit | The environment's budget |
| Avatar and companion | A sprite from Pixel Display content: prerendered image, `react-native-svg` or Skia | A-15, with size and memory |

### 5. Design blueprint

For each surface, in Aloft, with no web layout copied: purpose, hierarchy, the five states, compact and wide layouts, keyboard, screen reader order, motion, and the components needed.

| Surface | Must answer |
| --- | --- |
| Plan: Calendar, Quests and goals, Plans | How one destination holds three views. How Today and Plan differ. How adding is one action |
| AI Planner V2 | How six stages, long waits, questions, findings and an exact confirmation stay calm. How leaving and returning feels |
| Focus and Focus environment | What leaves the screen. How breaks feel. How seven modes are chosen without a settings page. How the dock hands over |
| Progress | How stats, rankings, achievements, skills and Codex sit together with gamification still subtle |
| Circle | How People, Messages and Parties fit. What a conversation looks like on a tablet at both widths |
| Sylvie | Assistant and companion as one presence. Where quick-ask opens. What a proposal looks like |
| Account and profile | One page, not a settings tree. What is private and what others see |
| Onboarding | The smallest flow that gives a useful first day |

**Produce** a design document at `documentation/native/expansion/blueprint.md`, with reference mockups as images or HTML beside it if useful. New components go in a list for `@sylf/design-system`: chart, calendar grid, time grid, message bubble, sheet stack, and whatever else is needed, each with its token use. Reuse before adding.

### 6. Implementation plan

Update the Part 2 and Part 3 briefs in place: slices, order, files, reads to add, schemas, tests, and any new cut. Finalize the budgets in [stage plan §9](README.md#9-quality-gates), including a memory figure per destination. Each spike's result becomes an ADR from 0016, or a line in the report.

## Dependencies

The entry gate. Owner answers above. A tablet authorization for spikes that need Android.

## Risks

| Risk | Response |
| --- | --- |
| The audit becomes an exercise in reading | Only Must and Should rows, and time-box workflows. Stop when the next part's unknowns are closed |
| A design drifts toward generic dashboards | Test each against "a calm instrument". Design from a student's moment, not from the web page |
| A spike leaks into product code | Separate folder, removed at the end, and the report says what it proved |
| Findings change the plan | That is the point. Change the briefs, and tell the owner what moved |

## Deliverables

- A corrected [feature map](feature-map.md), with Q1 to Q12 answered in the report.
- `expansion/blueprint.md`.
- Spike results, with numbers.
- A proposed dependency list with size, maintenance and platform support.
- Updated briefs for Parts 2 and 3, and finalized budgets.
- `reports/expansion-part-1/report.md`, `handoffs/expansion-part-1.md`.

## Testing

No product code changes, so the full set need not rerun. Prove the docs: every link resolves, every path named exists, and `git status` shows no change outside documentation and removed spikes. Spikes record device, build and result.

## Completion criteria

1. Every Must and Should row is verified from source or marked with what stopped it.
2. Q1 to Q12 are closed, or the owner has accepted them open.
3. Every surface has a design with all five states at both widths.
4. Every spike has a result, and no unproven dependency enters Part 2 without a fallback.
5. Part 2 can start from its brief with no further planning.
6. The owner has approved the blueprint. **Stop here.**
