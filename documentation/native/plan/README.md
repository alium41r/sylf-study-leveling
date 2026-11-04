# Plan on Sylf Native

Home's second destination answers what is ahead, and how to shape it. Three views, chosen with `SubNav`: Calendar, Quests and goals, and Plans. Source wins over this page.

| View | Does | Reads and writes |
| --- | --- | --- |
| Calendar | Month, Week and Agenda beside a day page. One add field ("Lab at 3pm") through `lib/calendar/quick-add.ts`, with a toggle for an event or a quest. A rest day explains itself and offers "Move to the next day" or "Change rest days". A stale save keeps the draft and offers the latest | `calendar/personal` (revisions, 409 when stale), `calendar/month` (study data, `month` 0 to 11, read only for Month), `quests`, `floating-rest-day` |
| Quests and goals | Goals as threads with their own progress, quests with no goal on their own, subjects, and the study week (target and rest days). A planned quest says it belongs to a plan, and a refused edit shows the server's reason | `quests`, `quests/[id]`, `goals`, `subjects`, `user/study-schedule` |
| Plans | A read-only list and readiness, from `planner/workspace` with contract 2. It stops at the seam: building, watching and confirming a plan arrive in Part 3, in this same view | `planner/workspace` |

Files: `spaces/home/destinations/PlanDestination.tsx` and `spaces/home/plan/` (`CalendarView`, `EventSheet`, `QuestSheet`, `QuestsView`, `PlansView`, `usePlan`, `shared`). Reads are in `packages/backend/src/plan.ts`, and a write invalidates the `plan`, `today`, `progress` and `traveller` tags so Today and Plan never disagree.

## Rules that hold

- **A tick works in Today and Plan,** through the server, and a planned quest follows the versioned protocol (`executionProtocol: 2`) and `lib/planner/server/mutation-guards.ts`.
- Quests have a date and no time of day (G-3), so they sit in an "Unscheduled" lane and never on the line.
- `REST_DAY_ALLOCATION_PROHIBITED` is answered in place, with a way forward, never as a bare error.
- A native session never triggers HP reconciliation: `calendar/month` charges nobody ([ADR 0017](../decisions/0017-hp-stays-off-native.md)).

## Not built

- Drag to move or resize in Week. An event is created by tap only.
- Reminders as local notifications.
- Connecting an external calendar, and shared calendars, stay on the web (G-13).
- Notebook, annotations and ink wait for Phase 14.
