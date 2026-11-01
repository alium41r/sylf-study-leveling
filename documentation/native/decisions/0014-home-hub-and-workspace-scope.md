# ADR 0014 — Home is the planning hub, and Workspace is for studying

**Status: Accepted by the owner for decisions 1 to 3, 6 and 7, 1 November 2026. The rest stay Proposed.** The owner approved the proposed Home navigation and moving Calendar and Planner to Home after parity is verified. It changes [ADR 0005](0005-home-interface-template.md) decision 2 and [ADR 0006](0006-workspace-canvas-and-windows.md)'s tool list, and answers master plan H2. It builds on [ADR 0013](0013-expansion-stage.md). Nothing here is built yet.

## The problem

Phase 1 proposed that full Planner and Calendar live in Workspace, and that Home show only summaries (H2). Phases 7 and 13 built to that. In use it splits one activity across two Spaces: a student sees their day in Home, goes to Workspace to change it, and arranges their week inside a study canvas. Workspace was designed to hold what you are working on, not to run your life.

## Decisions

| # | Decision | Status | Why |
| --- | --- | --- | --- |
| 1 | **Calendar, AI Planner, quests and objectives belong in Home.** Home is the central hub for planning, daily objectives, schedules and educational progress. | Confirmed (owner) | The owner's brief. Replaces H2's proposed default |
| 2 | **Workspace is a dedicated multitasking study environment:** Notes, PDFs, Whiteboard, Calculator, Timer, Sylvie and study resources. | Confirmed (owner) | The owner's brief |
| 3 | **Home gains one destination, Plan.** The rail is Today, Plan, Focus, Circle, Progress. | Confirmed (owner, E-1) | See the options below |
| 4 | **Today answers "what now", and Plan answers "what's ahead".** Today reads, ticks and starts. Plan creates, edits and arranges. | Proposed | Two questions, one rail entry each. It keeps Today short |
| 5 | **Plan's spine is the calendar,** with three views: Calendar, Quests and goals, Plans. AI Planner V2 lives in Plans. | Proposed | Quests, goals and plans all land on dates, so selecting a date shows them together |
| 6 | **A sub-view is a control on the page, and a long flow is a pushed page.** Neither is a second rail. Both are in the Home snapshot. | Confirmed (owner, with the navigation) | Keeps one navigation level, and Home's restoration keeps working |
| 7 | **Workspace's Planner and Calendar tools are removed last, after a parity list passes,** in one change. | Confirmed (owner) | The list is in [Part 2 slice C](../expansion/part-2-study-progression-personalization.md#removing-workspaces-planner-and-calendar). A removal in stages would leave two owners |
| 8 | **Stored windows for removed tools are dropped by the existing parser.** The rest of a layout survives. No migration. | Proposed | `parseWindow` already drops what it cannot read, and a test will prove it for these two |
| 9 | **The Timer's picker keeps today's quests,** read from Home's `today` resource. Nothing else from planning stays in Workspace. | Proposed (E-12) | It starts a session, so it belongs to the Timer. The picker is not a planner |
| 10 | **Audio stays a Workspace tool** and plays in the Focus environment, through one engine. | Proposed (E-2) | The brief's list says "such as", and sound is part of studying |
| 11 | **Command Center gains no link to Plan.** | Proposed | Master plan §3.3 principle 6: Home and World navigation never leak into it. The Spaces switcher is one action away |
| 12 | **Progress, Circle and Account grow by sub-views, not rail entries.** Stats, Rankings, Achievements, Skills and Codex are Progress. People, Messages and Parties are Circle. | Proposed | The same reasoning as decision 3 |

## Options for where planning goes

| Option | For | Against |
| --- | --- | --- |
| **One new destination, Plan (chosen)** | One rail entry for one activity. Today stays short. Room for a real calendar and a long AI flow | The rail goes from four to five. Needs checking at short heights and in the 340 pt bottom bar, where each entry still has about 59 pt |
| Grow Today | No new rail entry | Today becomes a long scroller, and it already has Home's worst scroll. "What now" gets buried |
| Calendar, Quests and Plans as three entries | Direct | Exactly the unnecessary sections the owner ruled out. Seven entries is no longer compact |
| Plan inside Focus | Near the session | Focus is about now. A week does not belong there |
| A tool that opens Home inside Workspace | No move needed | Contradicts Confirmed decision 1 |

## Consequences

- `HOME_DESTINATIONS` gains `plan`, and `HomeSnapshot` gains sub-view state. `parseHomeSnapshot` keeps reading older snapshots.
- `TOOL_IDS` loses two entries, so **Alt+1 to 9 and Alt+0 shift.** The Workspace guide changes with it.
- `mapPlanner`, `mapCalendar` and `monthRange` move to Home's data, with no copy left behind.
- `home-check.mjs`, the Android checks, `workspace-check.mjs`, `session-check.mjs`, `journey-check.mjs` and `android-memory-check.mjs` all change. Slice C names them.
- T-3 goes with the old surface.
- **Memory.** Home keeps a destination mounted after its first visit, so Plan's views must mount on first use and be separate chunks (R17).
- Master plan §2.1, §2.2 and H2, and the Home and Workspace guides, are updated to say what is planned. They keep describing what is built until it changes.
