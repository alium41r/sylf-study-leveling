# Expansion Part 2 — report

**4 November 2026. Branch `expansion-part-2`. Built, not verified.** The owner deferred all testing to the end of Part 4, so what ran here is `tsc` (the web repository and `native/`), ESLint over `native/`, and the boundary audit (`check-boundaries.mjs`). **No test suite, no browser, no Electron, no Hermes and no tablet was run for anything below.** Treat every UI item as unproven on screen.

## What was built

| Slice | Result | Guide |
| --- | --- | --- |
| 0, repairs | Cosmetic ownership, message and social limits, image addresses, email-change proof, `enableHpPenalty` honoured, `check-deadlines` bounded. These were reproduced on real SQL first, and 136 of 136 backend tests passed before testing was deferred | [Part 2 resume handoff](../../handoffs/expansion-part-2-resume.md) |
| A, foundations | Five Home destinations, `SubNav`, `PushedPage`, onboarding, presence, a rewritten Today with a tick | [Home guide](../../home/README.md) |
| C, Plan | Calendar (Month, Week, Agenda, day page, quick add), Quests and goals, Plans (read only). Planner and Calendar left Workspace | [Plan guide](../../plan/README.md) |
| B, Focus | Seven modes from `lib/timer-modes.ts`, real breaks, the threshold, the environment, backgrounds, one audio engine, a phase alert | [Focus guide](../../focus/README.md) |
| D, Progress | Overview, Stats, Standing, Honours with Claim all, Skills (attributes), Codex from the shared catalog, a quiet level-up line | [Progress guide](../../progress/README.md) |
| E, Account | Seven sections, profile with a live preview, devices, privacy, notifications, delete and reset in two steps, appearance seeded once, **password reset** | [Account guide](../../account/README.md) |

## Decisions made on the way

- **HP stays off Native** ([ADR 0017](../../decisions/0017-hp-stays-off-native.md)). No read carries it, attribute copy that mentions it is dropped, and accounts created on Native start with the penalty off.
- **The session record stays `v1`** with optional `mode`, `modeSettings` and `phase`, so a running session survives the upgrade (a refinement of ADR 0015 decision 5).
- **Skill nodes moved to Later:** the catalog is a generic frame with no names or perks. Objectives and the weekly milestone moved too, each with its reason in the Progress guide.
- **Password reset** only for accounts that have a password, with the link built from `APP_PUBLIC_URL`, never the Host header, and the token in the URL fragment and stored hashed.
- **A new shared entry, `@sylf/shared/catalogs`,** carries the Codex and the achievement catalog, behind `import()`. The boundary audit and the ESLint rule were extended to cover it, and the audit passes.
- **Deleting an account** also removes its sessions and unsent journal from the device (`forgetOwner`), because the journal otherwise survives sign-out by design (ADR 0011).

## Not done, and why

| Item | State |
| --- | --- |
| **All testing** | Deferred by the owner to the end of Part 4. Tests were written and not run: `timer-modes.test.ts`, the session model's modes, breaks and `forgetOwner`, `progress/shared.test.ts`, `appearance-seed.test.ts`, `forget-owner.test.ts`, `one-clock.test.ts`, the auth model's reset call, the proxy's pass-through, and `password-reset.postgres.ts` |
| **Journey additions** | Not written: onboarding, a week arranged, a Pomodoro with one break, a quest created, a profile changed, a password-reset request, sign-out with nothing left. The journey, Home and Android Home checks were corrected for the fifth destination and for Planner and Calendar leaving Workspace, and not run |
| New dependencies on Android | `expo-keep-awake`, `expo-audio`, `expo-notifications` and `expo-image` are installed and their config plugins added, but **prebuild and a native build were not done** |
| Foreground phase chime | No chime asset exists, so a phase change is silent with the app in front |
| Week view | Tap to create only. No drag to move or resize |
| Plan reminders as local notifications | Not built |
| Timer tool's quest picker (E-12) | Only the subject picker exists |
| Aura choice, banner and avatar upload, provider linking | Not built |
| Codex deep link from "what's this?" | The view exists, the entry route does not |
| Another device's session in the dock | Noted, not adopted |
| Web: `app/login/page.tsx` link, two reset pages, two routes | Typechecked and linted only. Not seen in a browser |
| ESLint on the web repository | `lib/email.ts` and two auth routes had existing `any` and unused-variable findings before this work, left alone |

## Production and the owner's operations

Production still lacks the fixed defects and the step 0 repairs, including migration `20261101120000_quest_penalty_honors_setting`, which is **not applied anywhere hosted**. Password reset needs **`APP_PUBLIC_URL`** set in production (or `VERCEL_PROJECT_PRODUCTION_URL` present), a working email provider, and no migration. U-5, whether anything calls `check-deadlines`, daily briefings and calendar sync, is still the owner's to check.

## The shared tree

Another agent kept uncommitted Planner work in `lib/planner/v2/**`, `app/components/planner/student/**`, `__tests__/planner-v2/**` and `documentation/planner/**` throughout. None of it was committed, reverted or reformatted. One `git add` briefly staged it by mistake, and that was undone with `git restore --staged` before the commit, leaving the files as they were.

## Commits

`c81df16` step 0, `4bc56c5` foundations and Plan, `f7bf408` Focus modes and environment, `42baa9d` Focus threshold, `876a25a` Progress, `12685e9` Account and password reset, `79c3173` checks, then the documentation commit. Nothing was force-pushed, deployed, or run against hosted data.
