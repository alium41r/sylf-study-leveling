# Calendar modernization — Phase 1

Implemented 18 October 2026. The [current contract](../../README.md) describes the architecture and extension boundaries.

## Delivered

- Month overview with readable event/quest/deadline chips, compact mobile indicators, note previews, selected/today states, and optional study heatmap. Month statistics, target/rest-day schedule settings, floating-rest controls, daily metrics, subject distribution, completed topics, and rewards remain available.
- Seven-day week agenda and a daily workspace. Container queries account for the sidebar's width; narrow tablets use a vertical agenda rather than crushed columns. The day workspace organizes events, existing quests/goals, and multiple notes. Navigation supports Today, previous/next periods, a date picker, and month arrow keys. Switching views reuses the loaded month projection.
- Personal all-day/multi-day and timed/overnight events: create, edit, move, describe, color, and delete. Daily notes: optional titles, multiple per date, minimized previews, expanded typed editor, date changes, save and delete.
- Private authenticated persistence, strict input validation, UTC/timezone and date-only contracts, atomic revision checks, replay-safe creates, visible save/error state, discard confirmation, keyboard containment/restoration, and reduced-motion support.
- Additive migration `20261018000000_personal_calendar` was successfully applied to the configured Supabase database. Prisma client generation and schema cache version were updated. No existing study/Planner tables or scheduling rules changed.

## Verification

| Check | Result |
| --- | --- |
| Calendar and Planner client-boundary Vitest suites | 56 passed; four opt-in database tests skipped in this ordinary invocation. |
| Focused PostgreSQL suite | All four passed separately against isolated PGlite PostgreSQL using a local socket. Covers real SQL migration, owner isolation, replay/conflict handling, timed/all-day overlaps, revisions, deletion, RLS and role privileges. Docker's local daemon was unavailable; the committed Docker runner is provided for standard PostgreSQL reproduction. |
| Changed-file ESLint | Passed. |
| Prisma generation and migration | Passed; new tables applied successfully. |
| Mobile production build and bundle verification | Passed; no server-only symbols or secrets in the bundle. Generated bundle changes were removed from the source diff. |
| Full TypeScript check / web production build | Blocked by the unrelated existing import of missing `getContrastForeground` in `app/onboarding/components/AppearanceStep.tsx:6`. No calendar type errors remain. The sandboxed build initially stalled; the permitted rerun produced this concrete source error. Existing appearance edits were preserved. |
| Live authenticated browser CRUD | Created timed and all-day events, created two notes on one date, reloaded to verify persistence, edited an event/note, deleted through the interface, and removed remaining QA entries. Zero temporary entries remain. |
| Responsive inspection | 360×780, 390×844, 768×1024, and 1440×1000. Inspected populated, empty/loading, editor, study-details, and schedule states. No horizontal overflow in the checked layouts. Tablet crowding was found and repaired with container queries. |
| Appearance / automated accessibility | Axe WCAG 2 A/AA and WCAG 2.1 AA checks returned zero violations for month/week/day in light mode, dark mode, a light custom background under dark mode, and a dark custom background under light mode; event/note editors also passed. A subtle text contrast failure on tinted surfaces was repaired. This is targeted automated coverage, not a claim of exhaustive accessibility certification. |
| Keyboard / motion | Arrow selection, date jump, Today, Escape/discard protection, editor autofocus, 25 consecutive Tab presses contained in the modal, and reduced-motion animation duration of 0s verified. |

Visual evidence is in [evidence/](evidence/). Personal-content CRUD used temporary `Calendar QA ·` records in the authenticated QA account. Screenshots whose names include `populated` use intercepted **read-only study projection fixtures** to display quests, deadlines, and subject history together; no fixture quests or goals were written to the database. Appearance preferences were restored after inspection. The task preserved pre-existing working-tree changes.

Representative captures: [desktop month](evidence/month-desktop-light-populated.png), [desktop day](evidence/day-desktop-dark.png), [tablet agenda](evidence/week-tablet-light-populated.png), [mobile day](evidence/day-mobile-light-populated.png), [mobile event editor](evidence/event-editor-mobile-light.png), and [custom surface polarity](evidence/day-mobile-light-mode-dark-surface.png).

## Next phase

Notes already have stable identities, civil-date anchors and a versioned JSON document. Add ink/annotation support through a new document version with compatible readers, accessible typed text, and a private asset strategy. Events have stable identities, explicit date/instant semantics and revision checks ready for future relations. Recurrence, reminders, time blocking, AI scheduling, sync and sharing are deliberately not implemented or advertised. Any later use of personal events as Planner constraints must integrate with Planner capacity/revision guards rather than create a second scheduler.
