# Stage 3 final verification — progress

Started 1 Nov 2026 by the main session, working directly. Owner authorized the tablet. No commits, no hosted services, no device settings changed.

## Mac, on the fixed tree (13:20)

Journey, smoke, backend 112, integration 24 (new quest and achievement test), Planner 1,916 and 0 failed, native verify 479, Electron all pass, root typecheck 0 errors. Workspace check passes 184 on a quiet Mac, and failed twice under load (dots, then dock-reveal). Root: 4,472 passed, 1 failed (`ink`, a 60 s timeout under full-suite load, passes alone). Planner V2: 423 passed, 1 failed, a fixture fixed after that run, needs its rerun.

## Fixes so far

- D-7: `lib/calendar/planning.ts` read `lastSuccessAt` in the server's zone, so a fresh calendar looked stale on a non-UTC server. Fixture in `calendar-capacity.postgres.ts` corrected to store UTC.
- Removed the test-only `ECONNREFUSED` branches from `user/stats` and `profile/customization`, and fixed the mocks.
- Repaired stale tests: `coordinator-pooler`, `exam-entry`.
- `keyboardShouldPersistTaps="handled"` on all product scroll views, with `shell/keyboard-taps.test.ts`. **Not yet in an Android build.**

## To do in the next build

- Native register and login: return the field's message rather than "Invalid data".

## Tablet (app.sylf.client, local server through `adb reverse tcp:3111 tcp:3111`)

Driver: `scratch/backend-stage/tab.mjs`. Uses `uiautomator`, which fails while a session runs, so use screenshots then.

Passed, on real Hermes: P1 to P6, P8 to P23, except landscape parts of P1 and P14. P7 needs a real OAuth app. Offline cut by removing the `adb reverse` tunnel, so no device setting changed.

Found and fixed, verified on the tablet:
- T-1: a press lost on `Segmented` with the keyboard up, and the same risk on 12 other scroll views.
- T-2: "Invalid data" on a bad email. Now the field's message.
- T-4: with the keyboard up, Workspace windows and Create account sat behind it. `shell/useKeyboardLift.ts`, with `FIELD_FOCUS_EVENT` from `TextField`.

Recorded, not fixed: T-3, Calendar's add form sits below the window's visible area. T-6, Sylvie's reply arrives whole on React Native, with no streaming. T-7, a revoked device with a running session and nothing else happening learns of it when it next asks the server, seen on return.

Play Protect appeared on one reinstall. The owner tapped Don't send. Two of my captures showed the home screen and were deleted.

Parts 4 and 6 running through `scratch/backend-stage/stage3v-tablet-auto.sh`, log beside it.

## Finished 1 Nov 2026, about 19:00

The owner ended testing. The final report is [report.md](report.md). T-8 was found by repeating the journey, fixed, and proven on the tablet.
