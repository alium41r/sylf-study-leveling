# Calendar upgrade — Phase 4

Implemented 18 October 2026. [Current calendar contract](../../README.md) · [Sylvie runtime](../../../sylvie/README.md).

## Delivered

The existing floating Sylvie now understands the calendar's selected date, visible period and view, and can retrieve the real schedule without asking the user to describe their screen. This extends the shared chat route, conversations, function-calling registry, routing, quota/metering, confirmation UI and Planner handoff. There is no additional assistant, calendar AI endpoint, conversation store or scheduling authority.

Sylvie can read/search personal events, inspect recurring occurrences, retrieve dated quests and goal deadlines, explain study commitments and rest days, find free time, identify overlaps and overloaded dates, read typed date notes, and provide daily/weekly planning summaries. It can propose and execute personal event creation, edits, rescheduling and deletion, including whole series or individual occurrences, recurrence rules, reminders and time blocks. Every calendar write requires the existing **Confirm change** control. Recommendations and free slots do not change anything by themselves.

The default calendar retains its existing navigation and content. The floating assistant has more useful calendar suggestions, while ordinary calendar operations remain independent of AI. Existing Advanced Options/preferences still control optional workload/time-planning presentation. No proactive recommendations, AI notifications or additional dashboard/settings controls were introduced.

## Tool contracts

All tools are advertised selectively for the current conversational intent. They execute for the authenticated account, never a model/client-supplied owner.

| Tool | Inputs and confirmed behavior |
| --- | --- |
| `readCalendar` | Civil `start`/exclusive `end`, at most 31 days; optional title/description query. Expands the canonical recurring events/exceptions and returns bounded event matches, dated quests, deadlines, rest days, study history and workload/conflict facts. Searching events does not filter the workload calculation. |
| `getCalendarEvent` | Owned UUID and optional **original** occurrence date. Returns the seed or moved occurrence and its current series revision. Missing, cancelled or nonexistent occurrences fail explicitly. |
| `findCalendarAvailability` | Range, duration 15–720 minutes, optional daily minute-of-day window/rest-day choice. Defaults to 08:00–20:00 and respecting rest days. Returns actual-instant gaps, candidate intervals, workload and deadlines; nothing is reserved. |
| `readCalendarNotes` | One civil date and optional text/title query. PostgreSQL searches full typed text, returning at most eight 1,600-character excerpts, truncation/offset metadata and a handwriting-presence flag. Ink vectors never enter the AI read. No recognition or note mutation. |
| `createCalendarEvent` | Structured local clock changes with required title/date/all-day choice. Timed creation requires explicit start/end clocks; timezone defaults to the account. Supports canonical recurrence, reminder offsets and categories, including `time-block`. Server generates stable record/mutation UUIDs and stages the normalized command. |
| `updateCalendarEvent` | Owned UUID, read revision, explicit `event`/`occurrence`/`series` scope, original occurrence date where applicable, and a partial change. Omitted fields remain unchanged. Moving the start preserves elapsed duration unless an end is explicitly supplied. |
| `deleteCalendarEvent` | Owned UUID, read revision and explicit scope. The preview distinguishes one cancellation from deleting all occurrences, individual edits and future reminders. It never deletes quests, goals or notebooks. |

The schemas and tool descriptions live in `lib/ai/sylvie/calendar-contracts.ts`; server composition/normalization lives in `calendar-tools.ts`. The existing chat executor dispatches to these adapters. `lib/calendar/personal-service.ts` remains the owner of event/note reads and writes, including owner-scoped seed/occurrence lookups, ranged exception projections and typed-note excerpts.

## Context and conversation

`CalendarWorkspace` publishes transient navigation only. `useSylvieChat` adds the current hint when sending from `/calendar`; the server validates dates, bounds and view and ignores extra instructions/content. No events or notes are held in this bridge, and unmounting clears it. Actual data is retrieved as needed. Calendar questions bypass older quest-only cheap answers so those cannot masquerade as a complete personal schedule.

Existing persisted history remains account/session scoped and bounded. Valid proposal summaries are included as unexecuted reference data for follow-up interpretation; signatures are never model context. A live “make it 7 PM” refinement retained title, duration, recurrence and reminders. A later user turn supersedes the older calendar preview, which the server refuses to execute. Normal topic changes do not inherit unrelated calendar operations.

Reads share a request-local bounded cache across identical ranges and provider fallbacks; there is no stale cross-request calendar cache. Existing 8,000-character result/24,000-character attempt budgets remain. Compact daily workload summaries precede large event-detail lists, with omissions disclosed. Notes are retrieved only on request. Strict study reads fail closed when schedule/deadline/rest-day data cannot be loaded; the ordinary calendar retains its established fallback behavior.

Gemini's existing adapter now translates nested nullable JSON Schema objects, enums and numeric/array bounds correctly. This prevents recurrence definitions from crashing or degrading in the existing provider fallback. DeepSeek/Groq still use their established adapters, with no new model/provider or extra AI service.

## Deterministic scheduling and safety

`lib/calendar/intelligence.ts` calculates half-open real-instant overlaps, union booked time, free gaps, remaining dated study effort and workload flags. It reuses canonical local date/time and recurrence owners. Touching endpoints do not conflict; overlapping events do not double-count booked time. DST folds retain distinct instants, gaps reject nonexistent clock boundaries, overnight events clip to the local date, and elapsed time is not offered as availability. All-day commitments conservatively block availability.

Quests have dated effort, not invented appointment times. Completed study history does not reserve future hours. “Overloaded” means outstanding dated study effort exceeds remaining free time in the stated window; “heavily booked” means at least 85% of that window occupied. Neither calculation replaces Planner capacity or asserts that all free hours are suitable study hours. Rest days come from `StudyScheduleService`, including floating days.

Calendar proposals contain exact normalized commands, stable UUIDs, target revisions, explicit scope, a human-readable preview and a fingerprint of relevant schedule facts. The existing HMAC binds them to the authenticated user, chat session and persisted message. Confirmation rechecks the schedule snapshot, claims the proposal atomically and executes without another model call or chat quota. Canonical event writes retain their row locks, revision predicates, mutation hashes/replay handling and sparse original occurrence identities. Acknowledged results refresh the existing calendar projection; errors never produce a success acknowledgement.

Previews show detected overlaps and study overload rather than silently moving other commitments. Batches also check overlaps among the proposed events and reject multiple competing edits to the same series. Existing multi-operation behavior remains **sequential, stop on first failure**; earlier acknowledged operations are retained and reported. A consumed failed/uncertain confirmation requires inspecting current state before requesting another proposal. This phase does not add an offline AI mutation queue or cross-operation transaction.

The fingerprint is a bounded snapshot check, not a global lock on every event writer. The calendar continues to permit user-approved overlapping events. Conflict previews cover the explicitly stated range, up to 31 days; a recurring series is not certified conflict-free forever. Unchanged ambiguous seed instants retain their exact offset, while newly specified repeated clock minutes follow the existing earlier-instant policy.

## Planner boundary

`StudyScheduleService` remains the source of study schedules/history/deadlines. Personal time blocks remain personal events and do not generate quests, progress or capacity reservations. Explicit quest actions retain the existing executor's ownership, capacity and linked-plan mutation guards. A linked-plan rejection points the user to Planner review.

Calendar study-preparation/replanning questions can first inspect actual commitments and provide grounded recommendations in chat, then offer the existing **Review in Planner** handoff. The Planner still owns draft generation, revisions, materialization and application. Ordinary study-planning handoffs remain available without a chat model call, including exhausted chat quota. No unsupported direct adjustment of authoritative Planner schedules or unfinished Planner V2 functionality was enabled.

## Validation

Final command results and screenshots are in [evidence/](evidence/).

| Check | Result |
| --- | --- |
| Targeted calendar, Sylvie, provider, chat, Planner delegation/client-boundary suites | **281 passed**. Twelve database cases are intentionally skipped in the ordinary command and run separately. |
| Isolated PostgreSQL with actual calendar SQL migrations | **12 passed** using PGlite PostgreSQL; Docker not used. Actual event/note persistence, RLS, ownership, revisions, replay, recurrence, exceptions and typed excerpt SQL are exercised. The AI adapter cases use a strict study projection fixture; they do not pretend the minimal fixture is the full Planner schema. |
| Route type generation / full TypeScript | Passed. |
| Scoped source/new-test ESLint | Passed. Legacy executor rules/warnings are qualified below and in `legacy-lint.txt`. |
| Web production build | Passed; full output in `build.txt`. |
| Mobile production build / bundle integrity audit | Passed; zero server-only symbols or secrets detected. Generated distribution changes restored. |
| Live configured AI route | Selected-day read, recurring creation proposal, conversational time refinement, confirmed persistence and confirmed deletion verified below. |
| Responsive / appearance / accessibility | Twelve combinations, zero targeted Axe violations; details below. |

The live configured AI route was exercised in the existing Pixel Production QA account: it answered a selected-day schedule question, proposed a recurring time block with a reminder, refined 6 PM to 7 PM in the same conversation, and persisted two correct occurrences only after confirmation. A later confirmed whole-series deletion returned zero remaining occurrences. The exact temporary event and newly created QA chat were removed; AI usage receipts remain in the normal accounting ledger. No fixture quests, goals or study schedules were written. Appearance was verified through the actual token generator/application attributes without persisting preference changes, then restored by reload.

The floating chat, real confirmation preview, scrolling and keyboard containment were inspected at **390×844**, **820×1180**, and **1440×1000**. Targeted Axe WCAG 2 A/AA and 2.1 AA reported **zero violations across all 12 size/appearance combinations**, with no page-level horizontal overflow. Themes include light mint/yellow, dark slate/violet, light mode with a dark custom surface and dark mode with a light pink surface. Testing identified and fixed muted timestamp contrast on tinted user bubbles; multiline confirmation previews now retain their line breaks.

Provider mocks verify tool security and routing across supported adapters; the live conversation qualifies the configured route, not every model/vendor or every possible phrase. Physical devices, operating-system notifications and handwriting hardware were not requalified in this phase; Phase 3's delivery/device limitations still apply. Existing legacy executor lint warnings and two pre-existing `@ts-ignore` comments are recorded separately; scoped verification exempts those existing rules without adding source suppressions.

## Phase 5 handoff

No schema migration, dependency or database capability was needed; schema cache version remains **34**. Extend the same event service, recurrence/exception identities, typed-note projection, deterministic intelligence and exact signed proposal boundary. Preserve account-scoped bounded context and normal-calendar independence from AI failures. Additional Planner constraint support must use its capacity/revision lifecycle explicitly; stronger bulk transactions or recovery guarantees need an intentional shared design. Recurring lookahead, free/busy semantics and notification delivery must retain their disclosed limits until backed by stronger infrastructure. External synchronization, handwriting recognition and collaboration remain outside this phase.
