# Calendar upgrade — Phase 2

Implemented 18 October 2026. [Current calendar contract](../../README.md).

## Delivered

- One daily notebook for typed reflections, editable handwriting, sketches, calculations, and diagrams. Existing version 1 notes open unchanged; editing upgrades the same record to version 2. Multiple notes per date, date changes, and journal revisits remain integrated with the existing calendar.
- Pen, highlighter, stroke eraser, theme-aware ink colors, thickness, undo/redo, pan, pinch/toolbar zoom, finger-drawing toggle, and an expanded writing mode. Pressure and optional coalesced samples feed smooth vector ribbons. Recent pen contact and palm-sized touches are rejected; fingers pan by default. Outside the explicit writing modes, calendar navigation and scrolling keep their normal behavior.
- Handwritten previews in month cells, week entries, and daily cards. Each opens the complete editable notebook. Preview crops fit the actual ink, while the full document retains its original page geometry.
- Direct calendar annotation mode with hide/show. Date circles and item marks follow semantic anchors across responsive layouts and month/week/day navigation. Optional second anchors allow cross-date connectors. Off-view endpoints retain the visible primary portion; removed/hidden item anchors retain their saved marks until available again.
- Debounced serial autosaving, owner-scoped device recovery, retries, acknowledgement reconciliation, optimistic revision conflicts, and a save-copy recovery path. A drawing interrupted by page hiding is committed before recovery persistence. Temporary local drafts disappear after successful saving and on logout; stale-account writers are invalidated. Storage failures are visible and prevent silent dismissal.

## Architecture

The existing `CalendarNote` JSON document and authenticated personal-calendar service remain the owners. Version 2 adds vector ink and `note`/`annotation` modes; no new note store, scheduling system, database columns, migration, paid service, or AI dependency was introduced. The Prisma change in this phase is a comment describing the already-JSON document. RLS and the integer `User.id` ownership model remain intact. The note-by-ID recovery read is explicitly owner-scoped.

A focused native SVG/Pointer Events implementation was chosen over a general scene editor or a separate bitmap persistence path. The active path is updated outside React; saved paths are memoized. Point tuples, bounded document size, coalesced input with a fallback, and subpixel geometry/pressure-aware simplification reduce rendering and storage cost. Annotations store anchor-local geometry and semantic identities, never viewport origins. See the implementation owners in `lib/calendar/ink.ts`, `lib/calendar/note-autosave.ts`, and `app/calendar/components/`.

Browser input choices were checked against [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events), [coalesced events and their optional availability](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents), and [touch-action behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action). Device pressure, hardware palm filtering, and stylus behavior remain subject to browser/OS support; software guards and fallbacks are implemented.

The known build blocker was traced to an outdated import in `AppearanceStep.tsx`. Its swatch checkmark now aliases the existing `getAccentForeground` helper; unrelated appearance changes were preserved. Full typecheck and production build now pass.

## Verification

- **109 targeted tests passed**, with five opt-in database tests skipped in that ordinary invocation and **all five passing separately** against isolated PostgreSQL. Automated suites cover legacy/new document validation, pressure ribbons, point simplification, erasure, coalesced samples, palm/finger separation, two-finger gesture cancellation, hardware-eraser input, anchor projection, pending edits during saves, uncertain acknowledgements, recovery, conflicts/copies, account invalidation, secure note reads, and existing calendar/Planner/appearance behavior. Exact final counts and command output are beside this report in `evidence/`.
- The focused PostgreSQL suite passes against isolated PGlite PostgreSQL, including editable ink round-trip, changed-ink create conflicts, revisions, owner isolation, and role/RLS checks. The existing Docker runner remains available for standard PostgreSQL reproduction.
- Changed-file ESLint, web typecheck/build, mobile production build, and mobile bundle security verification pass. Generated mobile outputs are kept out of the source diff.
- Live authenticated browser checks: created mixed text/ink, saved/reloaded, used highlighter/eraser/undo/redo/zoom, revisited a second journal date, and deleted a test note through the interface. With writes deliberately returning 503, edited text and ink survived closing/reloading, reopened from recovery, and saved after retrying online. Expected test 503 network errors are distinct from application runtime errors.
- Visual inspection: 1440×1000 and 1366×1000 desktop, 820×1180 and 768×1024 tablet, and 390×844 mobile. Tested light, dark, and custom light/dark surfaces independent of mode. Targeted Axe WCAG 2 A/AA and WCAG 2.1 AA checks report zero violations for the checked workspace and notebook states. Thirty consecutive Tab presses stayed in the notebook; reduced-motion animation duration was 0s.
- Mouse interactions and synthetic pen/touch input are verified. Physical Apple Pencil/S Pen hardware, device-specific latency, and OS palm rejection have **not** been tested on actual tablets in this environment. These remain a device-QA handoff, not a claim of physical-device certification.

Screenshots and final logs are in [evidence/](evidence/). QA notes/marks are temporary and are removed after verification; original appearance preferences are restored. No fixture quests or goals were created in this phase.

## Phase 3 handoff

Keep original editable strokes as the source; recognition/search can be derived later. Preserve v1/v2 compatibility, semantic date/item anchors, owner checks, serial revisions, and acknowledgement reconciliation. Existing study/Planner capacity is untouched. Any later scheduling feature must extend its established authorities. No Phase 3 functionality is implemented or advertised here.
