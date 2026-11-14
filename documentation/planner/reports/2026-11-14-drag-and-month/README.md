# Drag and drop that always lands, and a Month view — 14 November 2026

Branch `native/studio-drag-month`, from `main`. Current behaviour is in the [Studio contract](../../STUDIO.md).

## What the owner asked for

Drag the planner's sessions (quests) across the calendar very smoothly. Add a Month tab to follow them across a whole month. Whatever would stop a drop from landing on a day or a time must not apply to a drag: the student's placement comes before everything else, however many hours a day they chose.

## What was wrong with dragging

- **Only an 18-pixel grip on each session started a drag.**
- **The session left the grid on its first move.** It was filtered out of the list, which unmounted the component holding the gesture, so a drag stalled almost at once.
- **Every pointer move re-rendered the session**, and every new slot re-solved the whole plan on the device.
- **A drop was refused or quietly undone in many cases:**
  - by the device preview when the slot overlapped a commitment;
  - by the server on any overlap, any day beyond the planning horizon, or any time before now;
  - by the verifier when a session shared a day with a full paper;
  - by `write`, which dropped a second move made while the first was saving.
- **The grid showed only the planner's study hours**, so a session could not be dropped earlier or later in the day. Missed sessions could not be dragged at all.

## What was built

| Area | Change |
| --- | --- |
| Gesture (`studio/drag.ts`) | **The whole session is the handle.** A mouse picks it up after 4 px; a finger after a 260 ms press, so a swipe still scrolls. The session follows the pointer on the UI thread with a slight lift, and React hears only slot changes. The grid scrolls by itself near its top and bottom. After a drop the session keeps its place on screen and glides into its slot; reflowed sessions glide to theirs. |
| Week and Day (`Timeline.tsx`) | Sessions sit in one layer over the day columns, so a session crossing days stays one view. The grid covers 00:00–24:00 (hours outside the study day lightly shaded) and opens at the start of the study day. While dragging, a dashed outline and a label show the exact landing day and time, with "rest day" or "over Class" as notes, never refusals. |
| Month (`MonthView.tsx`) | **Monday-first month:** every session is a coloured chip by day, with deadlines, rest days, "+N more", and the weekly budget on Mondays beyond the detailed calendar. Weeks already over fold to a row of marks. A chip dragged to another day keeps its time, and a day's number opens that day. On a phone sessions are colour marks and a tap opens the day. |
| Moves (`useStudio.dropMove`) | A drop shows at once and commits in the order made, as many as the student likes. A failure puts the session back and says why. Each move offers Undo. |
| Where a drop lands (`studentLanding`, kernel) | **Only the clock bounds it:** a time already past moves to the next five minutes from now, nothing runs past midnight, and with no room left today it goes to the same time tomorrow. Device and server use the same function. |
| Server (`runDirect`) | **No refusal** for overlaps, rest days, caps, study hours or the horizon. A day beyond the horizon widens the snapshot, and a missed or skipped session that is moved is planned again. Only a session already done cannot move. |
| Repair (`solver.ts`, `verify.ts`) | **A placed session is fixed and the plan makes way.** Its minutes count against its plan's daily room when other sessions are kept, and a fixed full paper keeps its day (a paper allocated beside fixed work moves). Work the student placed beside a full paper themselves is not a failure. |

## Verification

| Check | Result |
| --- | --- |
| `KERNEL_PROPERTY_RUNS=600 npx vitest run __tests__/planner/kernel/student-moves.test.ts` | 4 passed. Random drops onto any day and time across 600 random plans (caps, subject caps, rest days, days off, evening no-study windows, commitments), several per plan. Further drops on compiled exam plans with an hour-a-day limit, full papers and topic order. Rest day at night, over a commitment, at 05:00. The landing rule. Every drop lands exactly and the plan verifies. **Before the repair changes, 8 of the exam-plan drops failed verification** (a session beside a full paper) |
| `KERNEL_PROPERTY_RUNS=500 npx vitest run __tests__/planner/kernel` | 94 passed |
| `npx vitest run __tests__/planner` | 1,803 passed, 271 skipped. One Quick Plan UI test timed out under load, as in earlier runs, and passes alone (8/8) |
| `node scripts/test/test-planning-studio-postgres.mjs` | 16 passed, including a move to a rest day at 23:00, to 40 days out (beyond the horizon) and to three days ago (lands today from now on) |
| `cd native && npm run typecheck && npm run test && npm run check:boundaries` | clean; 658 passed; parity hash unchanged |
| Electron Studio check against the local server | 51 of 51 ([evidence](evidence/studio-check.json)), with real mouse drags. Week: from Mon 16 08:30, dropped one day right and an hour down, landed Tue 17 09:30, pinned. Month: one day right, landed Tue 17 at the same time ([week](evidence/week-after-drag.png), [month](evidence/month-after-drag.png), [week opening at the study day](evidence/week-opens-at-study-day.png)) |

## Limits

- **Week paging during a drag.** A drag within Week moves across the seven days shown; to move a session to another week, drop it in Month (or use the inspector).
- **No drag in two places.** The day-only lens (a settings option) and the phone's month marks have no drag; a tap opens the day.
- **Plan warnings still appear.** A placement can leave the plan short or over a commitment. The plan says so (for example "You are 10 m short before Thu 19 Nov", with fixes to choose) but never moves the placed session.
- **Not yet tested by touch.** The tablet, where a short press starts a drag, has not been tried. Nothing is merged or deployed.
