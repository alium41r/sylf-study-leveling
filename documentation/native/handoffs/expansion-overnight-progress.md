# Expansion Parts 3 and 4 — overnight progress checkpoint

**Started 4 November 2026.** This is the live resume file for the autonomous run the owner requested ("Overnight Expansion Parts 3 & 4"). A fresh session reads this page first, then continues at **Next action**. Update it at every commit.

## Standing rules (from the owner)

- Work only in `/Users/aliumair/Desktop/sylf-expansion-part-3` on branch `expansion-part-3`. Do not touch `~/Desktop/sylf` (it holds another agent's uncommitted Planner files).
- Order: Part 3 slices A (AI Planner V2) → B (Sylvie) → C (Social + Realtime) → D (Parties), then Part 4 slices A–F. **Stop after Part 4.** No Phase 14.
- **Testing is deferred until all Expansion features are built.** Write tests as you go but do not run them; keep `npm run typecheck` and `node tooling/checks/check-boundaries.mjs` (in `native/`) clean. After the features are done, comprehensive verification is authorized with a **disposable local backend only** (Docker is not running now; start Docker Desktop or report it as a blocker).
- Commit and push safe checkpoints to `expansion-part-3` without asking. Never force-push, never deploy, never touch hosted data, never merge branches. Scan for secrets before each push. Stage only your own paths and check `git diff --cached --name-only` before every commit.
- HP stays off Native. Tablet: do not touch without the owner's authorization (it is authorized only for the final verification if the owner says so; otherwise list as unverified).
- Make reasonable decisions; record decisions needing owner approval in the "Owner decisions" list below.
- Reports: `documentation/native/reports/expansion-part-3/report.md`, `.../expansion-part-4/report.md`; handoffs `handoffs/expansion-part-3.md` and `handoffs/expansion.md`.

## Usage / resume protocol

- Check `mcp__ccd_session_mgmt__get_usage` regularly. At **5% remaining in the 5-hour window**: finish the current small unit, typecheck, commit and push, update this file, then create a one-shot scheduled task (`mcp__scheduled-tasks__create_scheduled_task`, `fireAt` shortly after the window's `resetsAt`) whose prompt says "Read documentation/native/handoffs/expansion-overnight-progress.md in /Users/aliumair/Desktop/sylf-expansion-part-3 and continue the run". Then stop.
- If the weekly limit is near exhaustion, schedule for its reset instead.
- The scheduled task only fires while the Claude desktop app is open. If it did not fire, the owner continues manually by opening a session in the worktree and pasting the same sentence.

## Status

| Item | State |
| --- | --- |
| Part 3 A AI Planner V2 | built (reads, intent builder, hook, NewPlanSheet, PlannerFlow in Plans view); tests written not run; **not yet done:** materials upload (needs a file-picker dependency, owner approval), docs, ADR 0012 d16 update, planner stage-state unit tests for the hook |
| Part 3 B Sylvie | partly built (Today briefing done, `TodayBriefing.tsx`): status events, safe `RichText` (no maths typesetting yet), proposal preview + Apply/Not now with `confirmSylvieAction`, widened contracts. **Remaining:** KaTeX via Expo DOM (new dependency, needs approval), quick-ask overlay, in-environment entry, images (multipart + bearer `RemoteImage`), daily briefing on Today, planner handoff to Plans, insights/memories, companion. Tests for these written-not-run: `rich-text/parse.test.ts` |
| Part 3 C Social + Realtime | started: `packages/backend/src/social.ts` (search, requests, remove/block/unblock, conversations, messages, groups; wired as `reads.social`). Circle now has People/Messages/Parties sub-views (`spaces/home/circle/{MessagesView,FindPeopleSheet,PersonSheet,useSeen}.tsx`, `HOME_VIEWS.circle` + test), message fallback polls 30 s seen-only. **Remaining:** group create/manage UI, blocked-list/unblock UI, notifications list, Parties lifecycle view (currently the old read-only list), Realtime client (spike; `@supabase/realtime-js` not installed), bounded polling fallback via `createResourceStore`, presence respecting `showOnlineStatus`, notifications list, backend fixes A-28/S-15/Realtime migration (owner decision), two-account tests |
| Part 3 D Parties | lifecycle built: `backend/src/party.ts`, `spaces/home/circle/PartiesView.tsx` (invitations, start, invite, leave). **Remaining:** party session start/pause/resume through the one session owner (`focus-party/[id]/session`, `session/timer`), TimerSync party branch for leaving, room view in the Focus environment, "ask before joining while a solo session runs", World guard for party sessions, invites in Today. **Blocked on owner: E-13.** Leave uses the member row id found by matching `userId` in `GET focus-party/[id]` (unverified against the route: check `members/[memberId]` semantics when testing) |
| Part 3 report + handoff | not started |
| Part 4 A–F | not started |
| Part 4 report + `handoffs/expansion.md` | not started |
| Final verification run | not started |

## Next action

**Window 1 ended** with Part 3 mostly built (see `reports/expansion-part-3/report.md`, the living Part 3 report). Do next, in order: (1) party session through `createStudySessionModel` (read ADR 0015 and `packages/spaces/src/session/model.ts`; party time comes from `parties.timer`; add a session-owner test), (2) Sylvie images/maths/environment entry/insights if dependencies are approved (otherwise log), (3) Realtime spike *design* only if no device/server (else keep fallback), (4) finish Part 3: update report, write `handoffs/expansion-part-3.md`, update feature map, Home guide §4, Sylvie contract native note, Workspace guide §5, ADR 0012 decision 16, then (5) Part 4 slices A–F. Older text below is superseded by this paragraph.

Slice B remainder (planner handoff via `lib/ai/sylvie/planner-bridge.ts`, quick-ask overlay, images, KaTeX), then Slice C UI on top of `reads.social` (Circle People/Messages/Parties), Realtime, then D (parties). Slice A docs (`documentation/native/plan/README.md`, ADR 0012 d16) are batched with the Part 3 report.

## Owner decisions / blockers (append)

- E-6 (hosted Planner flags, real-provider spend): default **off**; Native says so plainly. No real provider calls.
- E-13 (party time counts as study?): default is the stage plan's "Yes, through `StudySession`"; needs the owner before slice D settles anything. Build the client without computing rewards.
- Docker is not running on the Mac: Postgres suites cannot run until it is started.

## Log

- 2026-11-04: checkpoint file created.

- 2026-11-04: Slice A code committed: `native/packages/backend/src/planner.ts` (+test), `spaces/home/plan/{usePlanner.ts,NewPlanSheet.tsx,PlannerFlow.tsx,PlansView.tsx}`. typecheck, boundaries and ESLint clean. Decision: planner types are loose zod schemas in `@sylf/backend` (not exported from `@sylf/shared`), because the server enforces the strict contracts and a loose parse tolerates additive fields.

- 2026-11-04: Slice B first cut committed (RichText parser/renderer, proposal card, status events). typecheck, ESLint, boundaries clean.
- 2026-11-04: Today briefing + `reads.social` committed. typecheck/ESLint clean.
- 2026-11-04: Circle People/Messages UI committed. typecheck/ESLint/boundaries clean.
- 2026-11-04: Parties lifecycle UI committed.
- 2026-11-04: group chats, notifications sheet, docs (`plan/README.md`, new `circle/README.md`) committed. Slice B gaps still open: planner handoff (the web handoff targets the older Copilot, `lib/ai/sylvie/planner-bridge.ts`; Native should open Plans with `request` prefilled in NewPlanSheet and needs cross-space navigation), quick-ask overlay, images, KaTeX, insights/memories, companion. Slice C gaps: Realtime client + presence, blocked list, backend repairs A-28/S-15/publication migration. Slice D gap: party session. Then Part 3 report + `handoffs/expansion-part-3.md`, then Part 4.
- 2026-11-04: **S-15 fixed** (additive): `areUsersBlocked`/`areAnyUsersBlocked` take `{ failClosed }`; `POST /api/conversations` and `POST .../messages` pass it. Regression test `__tests__/security/s15-block-fails-closed.test.ts` (written, not run). Web behavior elsewhere unchanged. Not reproduced on disposable PostgreSQL (Docker is down); the logic is unit-level. A-28 still open.
- 2026-11-04: **A-28 fixed** in `app/api/conversations/[id]/route.ts` (creator leaving hands `createdBy` to the longest-standing remaining member). Regression test `__tests__/security/a28-group-keeps-manager.test.ts` written, not run (mocks prisma; fix it if the mocks disagree with the route when tests run).
- 2026-11-04: quick-ask built (`spaces/home/destinations/QuickAsk.tsx`, `shell/sylvie/useSylvieTurn.ts`), opened from a button on Today's non-empty page only (add it to the clear-day page and to the Focus environment later; move SylvieTool onto the hook). Slice B still open: planner handoff, images, KaTeX, insights/memories, companion, environment entry.
- 2026-11-04: planner handoff done for quick-ask: result `plannerHandoff.request` -> "Review in Plans" -> `plan/prefill.ts` -> NewPlanSheet goal prefilled (the web's handoff targets the older Copilot planner; Native only carries the words, proposal-only). Workspace's SylvieTool does not offer it (cross-space).

- 2026-11-05: **Run stopped.** Part 3 handoff, Part 4 report and `handoffs/expansion.md` written and pushed. Part 4 was not performed (needs Docker, a disposable backend, the tablet and owner decisions); only static checks ran. Remaining Part 3 features (party session, Realtime, Sylvie images/maths, blocked list) are unbuilt and listed in `handoffs/expansion-part-3.md`. A resumed session should do nothing except report this unless the owner gives new instructions.
