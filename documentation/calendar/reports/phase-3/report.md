# Calendar upgrade — Phase 3

Implemented 18 October 2026. [Current calendar contract](../../README.md).

## Delivered

The calendar now combines advanced scheduling with a simple default interface. New users see date navigation, quick add, events, quests/goals and notebooks. Calendar settings contains an **Advanced Options** disclosure with four independent groups: time planning, workload insights, calendar organization and expanded event details. These account preferences persist across sessions/devices. Basic reminders remain accessible in the simple event form; recurrence, categories, colors, descriptions and multiple reminders are available through **More options** without enabling a global mode. Hiding controls preserves schedules, reminder execution and notebook data.

Personal events support daily/weekly/monthly/yearly recurrence, intervals, selected weekdays, monthly date or ordinal/last weekday patterns, end dates/counts, all-day/multi-day ranges, categories, descriptions, multiple reminders, duplication, individual-occurrence edits/deletion and whole-series edits. Recurrence uses local IANA wall time across DST. Invalid month dates are skipped; DST gaps omit that scheduled slot and repeated minutes choose the earlier instant. Counts count scheduled civil dates, as stated in the form; unchanged seed instants retain their exact original offset.

Optional day/week timelines provide snapped creation, moving and resizing, overlap lanes, pointer previews, edge scrolling and keyboard alternatives. Month cells expose date move handles when time planning is enabled. Dedicated handles preserve normal touch scrolling elsewhere. Workload shows booked time, real-instant conflicts and the largest open interval within the labeled 8 AM–8 PM window. It includes hidden events so filtering does not make an occupied interval appear available. Study records, date-based planned quests, deadlines, notebooks and annotations remain integrated.

Quick add uses a deterministic local parser, with no paid AI dependency. All interpretations open an editable review. The requested examples—an exam tomorrow at 10 AM, revision every Monday at 5 PM, and an appointment next Friday—are covered, along with explicit dates, weekday lists, durations and overnight endings. Defaults and uncertain interpretations are explained instead of silently asserted.

## Architecture and persistence

- One `CalendarEvent` owns a recurring series. Indexed series bounds and ranged expansion produce virtual occurrences; only explicit changes/cancellations create `CalendarEventException` rows. A moved occurrence retains its original civil identity. Changing a repeat pattern retains edits and applies them only to matching original dates; returning to a matching date restores its retained edit. Series revision checks serialize whole-series and occurrence changes.
- Time blocks are a category of the same personal event model. They do not generate study sessions, alter quest dates, reserve Planner capacity or award progress. `StudyScheduleService` still owns study history and schedule resolution; Planner revisions/materialization and guarded objective edits remain authoritative. No unfinished Planner V2 capability or deployment flag was activated.
- Event writes persist an owner-scoped retry command with a stable mutation UUID before sending. Atomic owner/revision predicates and mutation hashes prevent silent overwrites and replay a current acknowledged-late operation. Failed commands survive reload; conflicts retain the draft and support a copy. Storage failures retain an explicit in-tab recovery with unload protection. Existing notebook serial autosaving and recovery remain intact. Logout clears private retries and invalidates stale writers.
- `CalendarPreference` owns presentation settings, separately from event/note content. Preference writes serialize, use revisions, and retry explicit patches after conflicts. No preference row is created merely by reading defaults.
- Personal saves refresh the personal projection independently of study data. View switches share the same month projection; focus/visibility refreshes are coalesced. Daily/weekly counted recurrence can jump to relevant periods rather than replaying every earlier date. No future occurrence explosion, new scheduling library, external provider or competing persistence owner was introduced.
- Recurring-item annotation anchors can include the original occurrence date. Existing v1/v2 note documents remain readable. Nested time-grid scrolling remeasures anchors and excludes clipped headings. Note deletion explicitly refreshes its calendar preview.

The additive SQL migration `20261018010000_calendar_scheduling` was applied successfully using the project's existing migration applier. Prisma generation/validation and schema cache version **34** are in sync. New tables use the established integer owner relation, backend-only RLS and revoked public table privileges. Authenticated handlers use the revocation-checked session and ownership predicates.

## Reminder delivery contract

The shared web/mobile wrapper runs one reminder agent. A private authenticated endpoint expands only nearby reminder-bearing events and checks the existing **Calendar & Focus Reminders** preference. A transaction locks the series, creates unique delivery receipts and writes the existing Sylf inbox entry. Claims coordinate tabs/devices and survive inbox dismissal. Recent offsets for one occurrence are collapsed; already claimed entries do not starve the next bounded batch.

In-app alerts work while Sylf is running. Opt-in browser alerts use the existing service worker where available, with a constructor fallback and permission/capability handling. Browser alerts share a replacement tag to limit spam. Polling has timeouts and online/visibility retries, with a five-minute catch-up window and at most twenty newly due occurrences per poll.

There is **no push subscription, background delivery worker or OS alarm infrastructure** in this phase. Suspended/closed browsers cannot guarantee delivery. Notification permission is requested only through a user action; unsupported platforms retain in-app alerts. These choices follow the browser [Notifications API capability guidance](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API). Physical-device notification delivery and actual Apple Pencil/S Pen behavior remain device qualification work; this report does not claim hardware certification.

## Validation

| Check | Result |
| --- | --- |
| Calendar, Planner client-boundary, appearance and color suites | **140 passed**. Nine database cases are intentionally skipped in the ordinary command and exercised separately. |
| Isolated PostgreSQL suite | **9 passed** using PGlite PostgreSQL with the real SQL migrations. Covers ownership, RLS/privileges, replay/CAS, overlap queries, ink round-trip, DST recurrence, sparse exceptions, preserved occurrence edits, preference persistence, notification preferences, deduplication and reminder batch fairness. The updated Docker PostgreSQL runner is provided; Docker was not used for this phase's run. |
| Type generation / full TypeScript check | Passed. |
| Changed-source and new-test ESLint | Passed. The two legacy database/rest-day test files were also checked with their existing explicit-`any` fixture casts exempted; no new production exemption was added. |
| Production web build | Passed. |
| Mobile production build / bundle verification | Passed; zero server-only symbols or secrets found. Generated distribution changes were restored. |
| Prisma generation / validation / migration | Passed. |
| Live browser behavior | Quick-added a recurring event, moved one occurrence across dates, resized it, loaded the whole-series editor, created a time block and an overlapping commitment, saved a basic reminder, and verified persistence. A simulated 503 write survived closing/reload and exact retry with no duplicate. Mixed typed text and editable ink survived save/reopen; notebook deletion removed its preview immediately. |
| Progressive disclosure | Advanced tools persisted across reloads. Disabling time planning/workload/organization hid their interface while all four projected QA event entries remained stored. Hiding a time block did not change the booked-time/free-window summary. |
| Responsive / appearance | Inspected 360×780 and 390×844 phone, 820×1180 tablet, and 1440×1000 desktop layouts. Checked populated timelines, overlap, event/occurrence editors, settings, notebook and simple default states. The phone week grid scrolls to reveal the selected date; checked layouts have no page-level horizontal overflow. |
| Accessibility | Targeted Axe WCAG 2 A/AA and 2.1 AA: zero violations for all three views in four appearance combinations, including both opposite-polarity custom surfaces. Checked event/settings dialogs and the final phone default state also pass. Keyboard move/resize, touch pointer cancellation, stable cross-column capture, dialogs and existing ink-input regressions are covered by tests. |

Exact logs, verification metadata and screenshots are in [evidence/](evidence/). The temporary events/notebook created in the existing Pixel Production QA account were removed after identity checks; zero QA content or pending device drafts remain. Original appearance and simple calendar preferences were restored. No fixture quests/goals or study sessions were written to the hosted database. Unrelated appearance work was preserved. A pre-existing unrelated trailing-blank-line warning in `lib/color-utils.ts` was left untouched; the scoped calendar diff check passes.

## Phase 4 handoff

Extend the current event service, typed recurrence rules, sparse exception identity, receipt claims and preference owner. Preserve note v1/v2 readers, original vectors, semantic anchors and revision/recovery behavior. Future sync identities or handwriting-derived indexes should reference these stable records rather than replace them. Any future use of personal commitments as study constraints must explicitly integrate with Planner's capacity/revision guards. Stronger background reminder promises require real delivery infrastructure and target-device qualification. No external sync, AI scheduling, handwriting recognition or collaboration was started.
