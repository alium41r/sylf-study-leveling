# Expansion Part 2 — resume handoff (paused mid-part)

**Superseded the same day: Part 2 was finished, and [the Part 3 handoff](expansion-part-2.md) replaces this page. It is kept for its record of step 0 and the owner's standing instructions.** Written 4 November 2026 while Part 2 was paused, not finished. The session ran out of context. A fresh session continues Part 2 from §4. Start from this page, then the [Part 2 brief](../expansion/part-2-study-progression-personalization.md), the [blueprint](../expansion/blueprint.md) and the [Part 1 handoff](expansion-part-1.md). Source wins over prose.

## 1. Owner's standing instructions (1–4 November)

- **Testing is deferred to the end of Part 4.** Write tests, don't run them. Keep `tsc` clean as you go. After Part 4, full automated, integration, security, performance and tablet testing is authorized, with a **disposable local backend only**. Ask before changing device settings or dismissing security prompts.
- **Commits and pushes are authorized** to a dedicated development branch: commit and push meaningful milestones without asking. Never force-push, rewrite history, deploy, or touch hosted data. Scan for secrets before every push. **Stage only your own paths** (see §2).
- **Work autonomously.** Skip blockers and report them at the end. Stop after Part 2 for review.
- Expect a **major upgrade in function and UX**: minimal text, clean and calm, every section complete and useful.
- **HP is deferred on Native.** It must never appear, and backend penalties must never silently reach a Native-only student (done, §3).
- Approved: the Home navigation with Plan, the immersive Focus environment, moving Calendar and Planner to Home (done), dependencies `expo-keep-awake`, `expo-audio`, `expo-notifications`, `expo-image` (installed, subject to compatibility tests in Part 4), `@supabase/realtime-js` for a Part 3 spike only (not installed), and password reset after the email-change fix.
- **Part 3 must run in its own Git worktree on its own branch**, isolated from other agents: a committed checkpoint with everything Part 3 needs, without losing unrelated uncommitted changes, the necessary files present in the worktree, and separate ports and services. **No automatic merges.** Part 2's final step creates it (§5).

## 2. Repository state

| Fact | Value |
| --- | --- |
| Branch | `expansion-part-2`, pushed to `origin`. `main` untouched at `f5a900b` |
| Baseline commits | `c2f359b` baseline, `c81df16` step 0 repairs, `4bc56c5` Foundations and Plan, then the Focus checkpoint committed with this page |
| Recovery backups | `~/Desktop/sylf-recovery/2026-11-01-expansion-part-1/` and `…-part-2-start/`, each with `RESTORE.md`. Preserve them |
| **Another agent shares this tree** | Between 1 and 2 November it committed eight `perf(...)` commits to this branch, and it has **uncommitted Planner work** in `lib/planner/v2/**`, `app/components/planner/student/**`, `__tests__/planner-v2/**`, `documentation/planner/**` and `scripts/qa/planner-workspace/`. **Never stage, revert or reformat those.** Its commits kept every step 0 repair (checked) |
| The remote branch was once deleted | Recreated with a plain push. Check `git ls-remote --heads origin` before assuming it exists |

## 3. Done in Part 2

**Step 0, backend repairs** (`c81df16`, reproduced first on real SQL, 136 of 136 backend tests passed before testing was deferred):

- Cosmetic ownership (`lib/cosmetic-policy.ts`) in `POST /api/cosmetics` and `PATCH /api/profile/customization`.
- A 4,000-character message limit and 30 a minute (`lib/message-limits.ts`), plus rate limits on friend requests, invites, new conversations and profile writes.
- Image addresses limited to https, an embedded image, or a local path (`lib/image-address.ts`).
- Email change needs the password, or a `CHANGE_EMAIL` code for an account with no password, and the old address is told (`sendEmailChangedNotice`). The web account form asks for it.
- **HP:** `enableHpPenalty` was never honoured anywhere, and now is: in reconciliation, the overdue job, and the late path of `claim_quest_reward` (migration `20261101120000_quest_penalty_honors_setting`, not applied anywhere hosted). Native sessions never trigger reconciliation (`heartbeat`, `calendar/month`). Accounts created on Native, by password or OAuth, start with the penalty off.
- `check-deadlines` reads a bounded batch. The test harness reapplies that migration after its retries (`scripts/test/lib/disposable-backend.mjs`).
- Tests: `__tests__/backend/postgres/expansion-repairs.postgres.ts`. Evidence: `documentation/native/reports/expansion-part-2/evidence/repairs-*.json`.
- **Correction to Part 1:** A-24 was not a defect. `PATCH quests/[id]` takes `requiredMinutes`, and the probe sent `targetMinutes`.

**Slice A, Foundations** (`4bc56c5`):

- `HOME_DESTINATIONS` has five entries, with views per destination and the account page in the Home snapshot (`packages/spaces/src/home.ts`, with tests).
- Rail icons, `SubNav`, `PushedPage`, `useHomeView`.
- The account sheet became `shell/account/AccountPage.tsx`, a shell only: sign-out and sign-in.
- `OnboardingSurface.tsx`: subjects, target and rest days, begin. It shows from `AccountGate` when `hasCompletedOnboarding === false`.
- Presence (`packages/backend/src/presence.ts`): 60 s, foreground only, `backend.sleep()` on backgrounding.
- Today rewritten: one next action, today's target, quests ticked in place.

**Slice C, Plan** (`4bc56c5` plus this checkpoint):

- `spaces/home/plan/`: `CalendarView` with Month, Week and Agenda beside a day page, quick add, move-to-today, and floating rest days. Also `EventSheet`, `QuestSheet`, `QuestsView` (goals, subjects, study week), and `PlansView` (read-only list and readiness).
- Reads in `packages/backend/src/plan.ts`.
- **Workspace's Planner and Calendar tools are removed.** Workspace has eight tools, and the checks were updated.

**Slice B, Focus, in progress** (this checkpoint):

- `lib/timer-modes.ts` holds the seven modes. Definitions moved verbatim from web's Modes screen, and the rules from `FocusScreen`. Web now imports it, and the root `tsc` is clean.
- The Native session model has `mode`, `modeSettings`, `phase`, `setMode`, `setModeSetting` and `takeBreak`, with phases advancing in `settle` through `transitionSnapshot`. It keeps the v1 record with optional fields, and the countdown stays the default.
- Built: `shell/focus/` (`environment.ts`, `FocusEnvironment.tsx`, `PhaseLine.tsx`, `ModeChooser.tsx`, `useFocusBackground.ts`, `alerts.ts`), `shell/audio/engine.ts`, the environment mounted in `SpacesShell`, and `AudioTool` playing for real.

## 4. Continue Part 2 from here, in order

1. **Finish Slice B.**
   - Rewrite `spaces/home/destinations/FocusDestination.tsx` as the Threshold from the blueprint: What (subject, plus today's quests), `ModeChooser`, Where (background tiles from `useBackgroundCatalog`, with `choose`), and **Enter**, which starts the session if idle, calls `askOnce()` for a timed mode, and opens `focusEnvironment`. Keep Recent sessions and On this device.
   - Make Today's **Begin** start and open the environment.
   - Add **Enter focus** to the dock panel and Workspace's Timer.
   - Show `Take a break` in `SessionActions` for Free Flow and Flowtime.
   - Add the `expo-audio` and `expo-notifications` config plugins to `apps/sylf/app.config.ts`, for background audio and the notification channel.
   - Write `__tests__/timer/timer-modes.test.ts`, table-driven against web's phases, plus session model tests for modes and breaks. Don't run them.
   - Update ADR 0008 (decision 20 is replaced) and the timer contract.
2. **Slice D, Progress.** Views Overview, Stats, Standing, Honours, Skills and Codex (`HOME_VIEWS.progress` already exists), following the brief's table. **No HP anywhere.** Codex: add `lib/archive-catalog.ts` to `@sylf/shared` behind `import()`. Add **Claim all**.
3. **Slice E, Account and profile.** Fill `AccountPage` with identity, security, devices, privacy (no `GROUPS`), notification preferences, appearance (Theme Studio out of `DEV_TOOLS`, seeded from `activeTheme` only), profile customization (owned items only), and delete or reset (code or password).
   - **Password reset:** an unauthenticated route with a neutral answer, rate limited, single-use 30-minute tokens through `sendPasswordResetEmail` (already in `lib/email.ts`), a web page, and the Native sign-in link.
4. Update the journey (`apps/desktop/src/journey-check.mjs` lines about 205 to 223 and 391 to 481 still open Planner and Calendar windows: move them to Home's Plan) and the Home and Spaces checks for the fifth destination. Don't run them.
5. Write `reports/expansion-part-2/report.md` and the Part 3 handoff. Update the feature map, the guides, ADRs 0005, 0006, 0012 and 0015 (adding ADR 0017 for "HP stays off Native"), and the master plan log.
6. **Create Part 3's worktree** (§5), then stop for the owner's review.

## 5. Part 3 worktree, the last step of Part 2

```bash
git -C /Users/aliumair/Desktop/sylf worktree add ../sylf-expansion-part-3 -b expansion-part-3 expansion-part-2
```

- Branch from the final Part 2 commit, never from a tree with the other agent's uncommitted files. Push `expansion-part-3` with `-u`.
- `node_modules` are not in git. In the worktree run `npm ci` at the root and in `native/` (slow: about 3.4 GB). Copy no `.env` files. Part 3 tests use the disposable harness, which blanks hosted variables.
- **Separate services:** run the harness server on a port other than 3111 (`--port 3121`). The disposable PostgreSQL picks its own container name and port, so check `docker ps` before and after. Metro and Electron must not share ports with another worktree's dev server.
- Never merge `expansion-part-3` into anything automatically.

## 6. Known open items

- **Not run:** anything since testing was deferred. Every UI item in §3 is unverified on screen, on Hermes, and on the tablet. The new dependencies are unverified on Android: prebuild and native build not done.
- **Not deployed:** production still has S-1 and the other fixed defects (deployment checklist), plus the four step 0 repairs and migration `20261101120000`.
- **Scheduler:** U-5 is still the owner's to check. Whether anything calls `check-deadlines`, daily briefings and calendar sync is unknown.
- **Party credit (E-13)** stays open for Part 3.
- The unexplained `.env.local` change, and Antigravity's 10:42 run, are both from Stage 3.
- **The phase chime** plays only through the background notification. In the foreground a phase change is silent, as there's no chime asset yet.
- The Timer tool's quest picker (E-12) isn't built: only the subject picker exists.
- Week view creates an event by tap only. Drag to move or resize isn't built.
