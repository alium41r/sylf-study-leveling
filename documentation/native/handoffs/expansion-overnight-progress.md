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
| Part 3 D Parties | not started |
| Part 3 report + handoff | not started |
| Part 4 A–F | not started |
| Part 4 report + `handoffs/expansion.md` | not started |
| Final verification run | not started |

## Next action

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
