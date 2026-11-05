# Plan on Sylf Native

Home's second destination answers what is ahead, and how to shape it. Three views, chosen with `SubNav`: Calendar, Quests and goals, and Plans. Source wins over this page.

| View | Does | Reads and writes |
| --- | --- | --- |
| Calendar | Month, Week and Agenda beside a day page. One add field ("Lab at 3pm") through `lib/calendar/quick-add.ts`, with a toggle for an event or a quest. A rest day explains itself and offers "Move to the next day" or "Change rest days". A stale save keeps the draft and offers the latest | `calendar/personal` (revisions, 409 when stale), `calendar/month` (study data, `month` 0 to 11, read only for Month), `quests`, `floating-rest-day` |
| Quests and goals | Goals as threads with their own progress, quests with no goal on their own, subjects, and the study week (target and rest days). A planned quest says it belongs to a plan, and a refused edit shows the server's reason | `quests`, `quests/[id]`, `goals`, `subjects`, `user/study-schedule` |
| Plans | The AI Planner V2 journey ([Part 3 slice A](../expansion/part-3-social-sylvie-planner.md)): the list and readiness, **New plan** (accepted details, free to save), the authorization step (spending ceiling up to the server's $1.75, explicit consent, optional research), a live view of a run, questions with exact retained text, inspection of the strategy and review notes, and a separate confirmation with required acknowledgements. The server owns the journey: `workspace.allowedActions` says what may happen, and Native offers only that | `planner/workspace` (GET with `planId`, `activity`, `history`; POST `CREATE`, `NOTE`, `GENERATE`, `CONTINUE`), `planner/[id]/operations/[attemptId]` (`CANCEL`), `planner/[id]/commit` |

Files: `spaces/home/destinations/PlanDestination.tsx` and `spaces/home/plan/` (`CalendarView`, `EventSheet`, `QuestSheet`, `QuestsView`, `PlansView`, `NewPlanSheet`, `PlannerFlow`, `usePlanner`, `usePlan`, `shared`). Planner reads and writes are in `packages/backend/src/planner.ts` (loose schemas, `buildIntent`, a key per action). Reads are in `packages/backend/src/plan.ts`, and a write invalidates the `plan`, `today`, `progress` and `traveller` tags so Today and Plan never disagree.

## Rules that hold

- **A tick works in Today and Plan,** through the server, and a planned quest follows the versioned protocol (`executionProtocol: 2`) and `lib/planner/server/mutation-guards.ts`.
- Quests have a date and no time of day (G-3), so they sit in an "Unscheduled" lane and never on the line.
- `REST_DAY_ALLOCATION_PROHIBITED` is answered in place, with a way forward, never as a bare error.
- A native session never triggers HP reconciliation: `calendar/month` charges nobody ([ADR 0017](../decisions/0017-hp-stays-off-native.md)).

## The planner journey

- **Nothing advances on a timer.** While a run is going, and only while the app is in the foreground, the view and its activity are read every 5 seconds, stopping on any settled state. Leaving never cancels a run; **Stop planning** is a durable `CANCEL`.
- **No client decisions.** The client never picks a model, budget, compiler or permission. Spending is capped at the server's ceiling, and `ApplyService` rechecks everything at confirmation.
- **Lost acknowledgement.** Each action holds one key. If the answer is lost, the same action is offered again with the same key and cannot be done twice. A definite refusal (invalid, conflict, forbidden, not found) drops the key. Mutations never retry on their own and never queue offline.
- **Provider text is untrusted.** It is drawn as plain text. Quality issues and strategy text are never executed.
- **Replanning.** `rebalance`, `reoffer` and `stretch` refuse V2 plans; a new request is how a student replans.

## Not built

- (Built 5 November 2026) Materials: **Add a PDF or text file** (up to 3 MB) through the system picker, sent to `planner/[id]/documents` with one key per upload. Tested to the unit level only: the live Planner flow needs the flags on (E-6).
- Full artifact browsing by id and long-document paging. Strategy and review text show; deeper history is read through `history` and `artifact` in `planner.ts` but has no screen yet.
- Streaming (`?stream=true`) waits for the streaming spike (ADR 0016). The poll is the dependable path.
- Real-provider runs and educational quality are **unverified**: only fixtures may run until the owner names a spend (E-6).

- Drag to move or resize in Week. An event is created by tap only.
- Reminders as local notifications.
- Connecting an external calendar, and shared calendars, stay on the web (G-13).
- Notebook, annotations and ink wait for Phase 14.

## Part 5 (5 November 2026)

Quests carry their subject colour, XP and a Study action; goals are cards with progress and days left. The calendar has Month, Week, Day and Agenda, a quest lane in Week and Day, week and day navigation, and **natural-language events** through `lib/calendar/quick-add` (the draft is previewed before it is saved). Not built: notebooks and ink (Phase 14), shared calendars, external connections.
