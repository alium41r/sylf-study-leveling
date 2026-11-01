# Sylf Native — Stage 3 final verification

**1 November 2026. Mac and Galaxy Tab S9 FE, local disposable databases only.** Nothing is committed or deployed, and no hosted service was touched. This was the first real run on Hermes and a device. Phase 14 has not started.

## Verdict

**The core student journey works on the real tablet.** Sign-in, a session reaching the server exactly once, kill and restart, offline, a change of account and revocation all passed on Hermes. Testing found five defects that Electron could not or did not show, and all are fixed. The owner stopped testing before the by-hand and landscape checks, so those remain.

## Repository findings

| Question | Answer |
| --- | --- |
| Antigravity's changes | 52 web files changed from about 08:00, last at 10:44. It closed before the baseline. Reviewed where Native depends on them, and the full suites ran on that tree |
| Deleted Planner Studio harness | **Resolved, nothing lost.** Antigravity conversation `6444c437` created it as a temporary test page and ran `rm -rf` on it |
| `.env.local` change at 08:12:31 | **Cause not proven.** No write appears in today's Antigravity logs, and no repository script writes it. Variable names only were read: Calendar encryption key, two Planner flags, worker database URL, worker health port. **`DATABASE_WORKER_URL` does not point at this Mac**, and every test here blanked it |
| Antigravity's 10:42 test run | Its database settings are unknown. Check before trusting that hosted data was untouched |

## Mac, final code

| Check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Journey in real Electron, three runs in a row | 98 each | 0 | 0 |
| Real-server integration | 24 | 0 | 0 |
| Backend, auth, ownership | 112 | 0 | 0 |
| Timer / Pixel | 81 / 8 | 0 | 0 |
| Planner | 1,916 | 0 | 34 |
| Planner V2 | 424 | 0 | 0 |
| HTTP smoke, RLS, migrations, calendar, notes | Pass | 0 | |
| Electron: Design, Spaces 52, Home 72, World 189, Session 113, Workspace 184 | Pass | 0 | |
| Root tests | 4,472 | 1 | 300 |
| `native` verify | 480 | 0 | 1 |
| Root typecheck, ESLint on changed files, mobile | Pass | | |

Compared with the baseline: root failures 36 to 1, Planner 4 to 0, Planner V2 2 to 0. The one root failure is `__tests__/notes/ink.test.ts`, which reaches its 60-second limit under full-suite load on this 8 GB Mac and passes alone. It was not masked. The 34 skipped Planner tests are live-provider suites. Electron Workspace failed twice while other heavy work ran, and passes on a quiet machine.

## Tablet

| Result | Checks |
| --- | --- |
| **Passed on Hermes** | P1 to P6 and P8 to P23, in portrait. Install, `expo-secure-store` across a kill, wrong password, sign-up, `TimerSync`, zod and `SessionProtocolV2`, one session after a kill, a change of account with no trace, offline with honest labels, automatic saving within 60 seconds, ending then backgrounding, 100 seconds in the background, revocation with the session kept, the ownerless question once, Today, Focus, Circle, Progress with Claim, Planner, Calendar, Sylvie with no provider, limited tools, World |
| Automated | Workspace 21 of 21, Home 40 of 40, interaction, design, pinch all pass |
| Smoothness | Workspace drag 0.7% and pan 2.2% janky. Home rail 0.65%. Scroll: Today 4.8 to 5.3%, other Home pages 2.2 to 2.7%, reference page 1.3 to 1.4% |
| Memory, no crashes | Native growth: entry 1.6, tools −11.3, camera 0.9, World −8.9 MB, all in budget. **Layouts 10.7 against a 5 MB budget** |
| R15 | **No steady per-mount leak.** Second-half growth: bare views −33.4, text −36.2, pressable −4.0, in-app views −19.7 MB |
| **Not run** | P7, real OAuth. Spaces check stopped at World after 15 passes, because World's animation stops `uiautomator` reading the screen. Landscape, split screen and pop-up by hand. Timer dock numbers 1, 2, 8 to 14. Part 5, numbers 15 to 35, the owner's judgment of feel. Device-setting checks, which need approval. Backup restore and a locked-device read of secure storage. The dock panel and five sign-in cycles by hand with `dumpsys meminfo` |

Offline was simulated by removing the `adb reverse` tunnel, so no device setting changed. Play Protect appeared on two reinstalls, and the owner chose Don't send each time. Two captures that showed the home screen were deleted.

## Fixes

| ID | Severity | Defect | Fix | Proof |
| --- | --- | --- | --- | --- |
| T-8 | **High** | With the server gone, Focus could fall back to its loading skeleton during a running session, hiding Pause and End and closing the End dialog | The session card never waits for a read, and only history does | Journey three times, tablet offline capture |
| T-4 | **High** | The keyboard hid Workspace windows and Create account, because Android does not resize this app's window | `shell/useKeyboardLift.ts`, with focus announced by `TextField` | Tablet: Add and Create account above the keyboard |
| D-7 | Medium | `lastSuccessAt` was read in the server's zone, so a just-synced calendar looked stale on any non-UTC server | `AT TIME ZONE 'UTC'` in `lib/calendar/planning.ts`, and a fixture corrected | Planner V2 424 of 424 |
| T-1 | Medium | With the keyboard up, the first tap only closed it, on `Segmented` and 12 other scroll views | `keyboardShouldPersistTaps="handled"`, with `shell/keyboard-taps.test.ts` to keep it that way | Tablet: one tap |
| T-2 | Low | Sign-up said "Invalid data" | The field's own message | Tablet: "Enter a valid email address" |
| — | Low | Test-only `ECONNREFUSED` branches sat in `user/stats` and `profile/customization` | Removed, and the mocks fixed | Root tests |

Stale tests repaired: `coordinator-pooler`, `exam-entry` (the header now navigates, as its source says), and the Home and Spaces device checks, which looked for "Objectives" after it became "Quests". The journey now accepts a read recovering by itself before a click lands, and still requires the data to come back. New real-server test: a quest and an achievement each pay exactly once, and the refused-password test has now run.

**Performance.** No optimization was made, because no measurement justified one. Opening Today makes 4 requests, and a running session makes none.

## Outstanding, most important first

1. **Production still has the OAuth flaw and the other fixed defects** until this deploys. See the [deployment checklist](../../backend/deployment-checklist.md). Eleven migrations are untracked, and eight Planner ones were missing from earlier handoffs.
2. Confirm the `.env.local` change, and what the 10:42 Antigravity run connected to.
3. Real OAuth has never run.
4. Landscape, split screen, pop-up, S Pen and feel on the tablet.
5. T-3: Calendar's add form sits below the window's visible area, so a student has to scroll to find it.
6. Layout switching adds about 0.6 MB of native memory per cycle, with view counts flat. Low impact and unexplained.
7. Today scrolls with about twice the jank of other Home pages. Nothing in its code explains it, and it is the first page the check scrolls.
8. T-6: Sylvie's reply arrives whole on React Native, after about ten seconds with no sign of progress, so a long reply needs an indicator.
9. T-7: a revoked device with a running session learns of it when it next asks the server.
10. A quick second tap on Claim can land on the next ready achievement after the list reflows.
11. `ink.test.ts` under full load, and Spaces check's World step.

Evidence is under `evidence/`. Run details and the tablet driver notes are in [progress.md](progress.md).
