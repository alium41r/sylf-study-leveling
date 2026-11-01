# Sylf Native — Phase 10 report: Device Adaptation, Universal Timer Dock and Frontend Refinement

**31 October 2026. Status: complete on the Mac and awaiting the owner's review. This reaches Milestone 1 on the Mac and ends Stage 2.** Decisions are in [ADR 0008](../../decisions/0008-study-session-and-timer-dock.md), the contract is the [Spaces guide §10](../../spaces/README.md#10-the-study-session-and-the-timer-dock), and the next session starts from the [Stage 2 handoff](../../handoffs/stage-2.md).

**Read this first.** Everything here ran on the MacBook Air. The Android build compiles, and it has not run on any device, as the brief required. On Electron, worklets run on the JavaScript thread, so nothing below proves motion on a tablet's UI thread. Window sizes were simulated with an Electron window, which is not the same thing as Android split screen. Touch, stylus, safe areas, system bars and system gestures were reasoned about and not observed. Where the report says "tablet portrait", it means a window of that shape. Physical tablet verification is the [tablet checklist](../../handoffs/tablet-checklist.md), and it waits for the owner.

## Summary

| Deliverable | Result |
| --- | --- |
| A polished universal timer dock across the three Spaces | Built. Home, Workspace and the World lobby, and absent in the game |
| One synchronized timer across the dock, Focus and Workspace | Built. One model, proven from every surface in the real window |
| Consistent responsive behavior and refined interactions | Built. Ten window shapes in three Spaces at rest and open, with no overlap |
| Improved navigation and shortcuts | Built on desktop: Command or Control + 1, 2, 3, Alt + T and Alt + P. **Not on tablets**, which need a native key hook |
| Performance investigation and fixes | Done, §5 |
| Mac verification and regressions | **Pass on the final build, with one caveat:** Workspace passed only when split into three parts, §3 |
| Screenshots, measurements, unresolved issues | [Screens](evidence/screens/), §5, §8 |
| Report, master plan, ADR | Written |
| Stage 2 handoff | [Written](../../handoffs/stage-2.md) |
| Consolidated tablet checklist | [Written](../../handoffs/tablet-checklist.md) |
| Android build | Compiles: APK 33.8 MiB (Phase 9: 33.7). **Not installed or run** |
| iOS, Windows | Not built or run |
| Web app, backend, database | Unchanged by this phase. Nothing is committed |

## 1. What was built

```
native/packages/spaces/src/session/
├── model.ts            createStudySessionModel: the one session, its clock and its record
├── dock.ts             placeDock and spaceForDigit, with no UI
└── session.test.ts     tests of time, durability, the clock, World's refusal, placement
native/apps/sylf/src/shell/
├── TimerDock.tsx       the dock and its panel
├── session/SessionParts.tsx   the clock, lengths, progress and actions all three surfaces share
└── shell-keys(.web).ts Spaces and dock shortcuts
native/apps/desktop/src/session-check.mjs   the session check, 12 groups
```

**Changed.** `FocusDestination` now runs the session. `TimerTool` is a view of it, with its own snapshot gone. `Lobby` reads the real session and offers Pause session. `createWorldController` gained `entryAllowed`. `createWorkspaceModel` gained `summon` and `detach`. `resolveSky` follows the clock alone. `HomePage`'s strip stops short of the dock. `Chip` can be a radio, and `useNoticeClearance` is new.

**Removed.** The Timer's private practice countdown, `useTicking`, `formatClock`, `FocusView.presets`, the World adapter's `session()` and the `worldData=session` link. Each would have been a second source of truth.

### The timer

One object owns the session, outside React, and time is always derived from the web engine's own `TimerSnapshot`. Start a session anywhere and it is the same session everywhere. It survives navigation, unmounting, backgrounding and a process kill because there is nothing to survive: no tick is ever counted.

The brief's example runs in the real window: begin from the dock in Workspace, go to Home → Focus, and the same running time appears with the same `clientKey`, the same second and no reset. Pause in Focus and the dock follows at once. Resume in Workspace's Timer. Pause in the World lobby. End in Focus, which asks first.

### Local is not a record

Every surface says "Tracked on this device. Not saved to your study record yet." Ended sessions appear under **On this device** with a **Not saved yet** badge, apart from Recent sessions. No XP, no reward and no server call exists anywhere in this code.

### World

While a session runs there is no way in, and the plate offers **Pause session** and **Go to Focus**. A paused session may enter, and it stays paused for the whole visit. The controller refuses a running session whatever asks, so no other path can skip the safeguard. In the game there is no dock and no shortcut, and a session comes back to the lobby exactly as it was.

## 2. Unit and static checks (`native/`)

| Check | Result |
| --- | --- |
| Typecheck, native and desktop | Pass |
| ESLint | Pass |
| Unit tests | **268 pass** in 16 files (Phase 9: 223). 43 are new for the session, the dock and World's refusal |
| Boundary audit | 0 violations |
| Single-copy check | Pass |
| Web build | Pass |

`npm run verify` ran last, on the final code.

## 3. Electron on macOS (Electron 45.1.0, MacBook Air M1, 8 GB)

| Check | Result on the final build |
| --- | --- |
| Session, new | **113 of 113** in 12 groups |
| Workspace | **All 19 groups pass, run in three parts:** 89, 57 and 40, which add up to 186 because each part repeats the console check. The one change since its last whole run was the rail's width at large text. A whole run on the build before that passed 184 of 184 |
| World | 189 of 189 |
| Home | 72 of 72 |
| Spaces | 52 of 52 |
| Design | Pass, all 19 checks |
| Security self-test | Pass |
| Console errors | None in any passing run |

**What changed in the older checks.** Home no longer expects a disabled Begin, and counts the dock as the second tab stop. Workspace drives the real session rather than the practice countdown. World plants a real session, and now proves that appearance mode does not change the sky.

**This Mac was unreliable during final verification, and that needs saying plainly.** It sat 4.7 to 5.5 GB into swap throughout. On long runs:

| Run | What went wrong | What happened next |
| --- | --- | --- |
| Design, right after verify | The keyboard walk was still queued when the check read it | Passed on rerun, alone and with a pause |
| Workspace, whole | "Script failed to execute" | Passed 184 of 184 alone |
| Workspace, whole, final code | `spaceDragPansOverWindow`, `entersUnder300ms`, `noOverflow_medium` | Passed in the parts below |
| Workspace, whole, final code | `capturePage` failed | Passed in the parts below |
| Workspace, first part | Seven zoom and dot checks, after 60 rapid wheel events | Passed 89 of 89 alone |
| Session and Workspace | A page load aborted by Chromium (`-3`) | A retry was added to both harnesses |
| Session | A click landed on a dialog's fading scrim | The check now waits until the dialog has gone |

Every one of these passed on a rerun, and the failures moved around rather than repeating, which points to load and not a bug. **That is an inference.** A fast intermittent fault could look the same, and nothing here rules that out. The checks to watch are `spaceDragPansOverWindow`, `entersUnder300ms` and `noOverflow_medium`. Running the Workspace check whole on a freshly restarted Mac would settle it.

## 4. Device adaptation

The session check measures the dock against everything that shares its line, at rest and open, in all three Spaces, at each of these window shapes. All pass with nothing overlapping, nothing leaving the window, and no horizontal overflow.

| Window | Size, pt | What happens |
| --- | --- | --- |
| Wide | 1680 × 1000* | Dock in the middle |
| Expanded | 1280 × 820* | Dock in the middle |
| Tablet landscape shape | 1200 × 740 | Dock in the middle |
| Tablet portrait shape | 800 × 740 | Dock in the middle. Home's sections wrap rather than squeeze |
| Medium | 700 × 740 | Dock in the middle. The Spaces bar reaches it, so it steps aside until the bar closes |
| Split-screen shape | 600 × 740 | Home's line of context steps aside, and the traveller glance goes |
| Compact | 480 × 740 | Dock at the right. One tool at a time. Bottom bars in Home and World |
| Narrow | 340 × 640 | Dock at the right, and the sample badge still fits |
| Short | 900 × 420 | Panel fits, and World's way in moves to the corner |
| Tiny | 340 × 400 | Panel scrolls inside its height |

*Heights are clamped to what this Mac allows, about 746 pt, so `innerHeight` is read and not assumed.

**Also checked.** Large text at 1.3 fits the dock and the panel. Resizing across three widths with the panel open keeps it mounted and keeps the session. Keyboard: the Spaces icon, the dock, then the page, with Tab held inside the open panel and focus returned to the dock on close.

**Prepared and not observed.** The dock uses safe-area insets for its place and its panel's height. It sits below the top inset, so the notification shade's edge should stay clear. It leaves the bottom edge to the gesture bar. Touch uses the design system's hit targets, and the pen reaches it as a touch. None of this has met a real device.

**Compact windows (master plan §4.4), decided as Proposed.** A compact window on a tablet keeps the tablet's compact layouts, and the phone companion is for phones.

### Shortcuts

| Keys | Does | Where |
| --- | --- | --- |
| Command + 1, 2, 3 on a Mac, Control + 1, 2, 3 elsewhere | Home, Workspace, World | Desktop |
| Alt + T | Opens or closes the dock | Desktop |
| Alt + P | Pauses or resumes | Desktop |

The conflict table is in [ADR 0008](../../decisions/0008-study-session-and-timer-dock.md#shortcuts-what-was-checked). Only the macOS and Electron rows were tried. **Control + digit was tested as left alone on a Mac.** Windows keys are in the code and were not run on Windows. No key works during play or behind a modal. Tablets have no hardware keys yet, because React Native delivers them only to a focused text field, and a native hook could not have been tested in this phase.

## 5. Performance

| Measure | Result |
| --- | --- |
| Timers while a session runs | **One.** 3 timer calls in 3 s, with the dock and Timer both showing |
| DOM changes in a 4 s window, dock only | **8**, about 2 a second, all in the dock |
| The same with Focus showing too | 16 |
| Changes in a hidden Focus, 3 s | **0** |
| Changes in a minimized Timer, 2 s | **0** |
| Changes with no session, 2 s | **0** |
| Writes while a session runs | **0**, from a unit test. A write happens only when something changes |
| Panel open and close, on a busy Workspace | p50 16.7, p95 18.1, max 18.5 ms |
| DOM nodes over 12 opens, with a clock running | 377 to 377 |
| Event listeners over 12 opens | 235 to 235 |
| JavaScript heap over 12 opens | 10.54 to 10.73 MB after forced collection |
| Space change | 20.9 to 38.5 ms, frames p95 17.3 ms |
| Home destination change | 26.1 to 28.2 ms, frames p95 17.7 ms |
| Lobby frames | p95 17.7, max 17.7 ms |
| Lobby nodes and listeners across 7 visits | 311 and 230 at every reading |
| Lobby heap across 7 visits | 10.98 to 11.46 MB (Phase 9: 10.47 to 10.97) |
| Whole-app working set, Home, lobby, after leaving, after 7 visits | 463, 468, 444, 378 MB (Phase 9: 451, 456, 436, 349). Noisy, and not a measured cost |
| First web chunk | 2.49 MB, about what it was |
| Timer tool chunk | 1.3 KB (Phase 9: 2.2 KB) |
| APK | 33.8 MiB (Phase 9: 33.7) |

**Reading these honestly.** These are Electron numbers on a Mac under heavy swap, not tablet numbers. Frame times are capped by the 60 Hz display. A DOM mutation count says what React wrote, not what a tablet will pay. The dock adds nodes to every Space: 43 in World compared with Phase 9, 268 to 311. That is a mount cost R15 cares about, and it can only be judged on the device.

**Findings from the investigation.**

| Looked at | Found | Done |
| --- | --- | --- |
| One timer per surface | Three surfaces with a ticking clock would mean three timers and three seconds | One timer on the model, armed for the next whole second |
| A clock high in the tree | Re-rendering a screen each second | Only the small pieces that print the time subscribe |
| Hidden views | Home keeps Focus mounted and hidden, and Workspace keeps a minimized Timer warm | `live={false}`, measured at 0 changes |
| Panel mounting | Mounting on every open costs native memory | First use only, then hidden |
| Panel animation | Animating a surface with a shadow is Phase 5's 137 MB bug | A uniform scale with no shadow, then one still layer |
| Writes | A clock must not write | Storage is written on a change only, checked by a test |
| Background | A clock behind the app wastes battery | It stops, and catches up on return |
| Startup | The session adds to the first chunk | The timer engine was already there for the parity suite, so the engine costs nothing new |

## 6. Defects that verification found

All are fixed, unless noted.

| Found by | Defect | Fix |
| --- | --- | --- |
| Reading the owner's brief | World's "Follow the day" forced the night sky in dark mode, which contradicts the confirmed rule that the sky stays independent of the appearance theme. It dates from Phase 9 | The clock alone decides. ADR 0007's decision 8 is replaced |
| Size sweep | A preset or tool opened before Workspace mounted used a guessed frame, so windows ran under the dock and the Command Center | `model.summon` waits for the canvas. The sweep now presses the real key |
| Keys group | Closing the panel from a key left focus nowhere | Focus returns to the dock, after the trap lets go |
| Size sweep | At 600 pt, World's traveller glance lay across the way in. This dates from Phase 9 | It steps aside under 720 pt |
| Screenshots | Home's strip showed stubs such as "S." and "Study ..." in narrow windows | The line steps aside, and the badge stays |
| Screenshots | The Sample badge ran under the dock at 340 pt | The dock goes right in a compact window |
| Screenshots | Three sections in Home at 600 to 800 pt squeezed into narrow columns | They wrap below 260 pt each |
| Reviewing the panel | Wrapped chips left "No limit" alone on a row | The panel is 372 pt wide |
| Reading code | `Chip` inside a `radiogroup` was a button, so Focus's lengths were announced wrongly since Phase 6 | `Chip` takes `radio` |
| Reading code | Shared components set words in `faint`, which is 3:1, against the project's rule: menu details, list row details, radio details and Theme Studio notes | All `soft` |
| Reviewing the dock | Notices sat over the Command Center and Home's bottom bar | `useNoticeClearance` |
| Reviewing the bar | The open Spaces bar ran into the dock between about 600 and 820 pt | The dock steps aside until the bar closes |
| Reading the lobby | The plate said "Study session is running" for an untitled session | It says "Your session" |
| Screenshots at large text | Home's rail clipped "Progress" to "Progr…" at 1.3× | The rail grows with its labels, and the Spaces icon stays centered over it |

**Faults in the checks, not the app.** A test id `tool-clock` matched the Workspace check's `[data-testid^=tool-]` count. `npm run verify` stops before building, so two Electron runs tested an old build, and those results were thrown away. A `Tab` walk began from a blurred element. A page load could be aborted by the one before it. A press could land on a closing dialog's scrim.

## 7. Open questions at Phase 10

| Question | State |
| --- | --- |
| G1, World during a session | **Confirmed by the brief** |
| Space shortcuts | Built on desktop, Proposed |
| Compact windows on a tablet | Decided, Proposed |
| The dock's place, the five lengths, Keep going, the confirmation to end | Proposed. The owner may want to look at these first |
| Whether a dock belongs in Workspace's Focus layout | Kept, as the plan's "minimal session indicator" |
| W1 to W5, H1 to H3, G2, G4, T1 | Still the owner's |
| Who owns a session made before sign-in | **New, for Phase 11.** A local session has no account |

## 8. Limitations and untested behavior

- **Nothing here has run on a device,** and neither has the final code from Phases 7 to 9.
- **The Workspace check has not passed whole on the final code,** only in three parts, §3.
- **Worklets on the UI thread are the largest risk.** The dock's scale and the lobby's motion have only run on the JavaScript thread.
- **Window shapes are not split screen.** Android multi-window, rotation, the camera cutout and One UI's pop-up windows are untested.
- **Safe areas, system bars and system gestures are untested.** Electron has no insets.
- **Touch and the S Pen were not used on the dock.** Electron clicks only. Earlier phases sent real touch to Workspace, and this phase did not.
- **Hardware keys on a tablet do nothing yet.**
- **Windows was not run.** Its Control keys are in the code only.
- **iOS and iPadOS were never built.**
- **TalkBack and VoiceOver have not been run.** Roles, names and announcements are in the code, and only DOM attributes were checked.
- **Backgrounding was tested in unit tests with fake timers,** and by restarting the page. A real suspended process has not been tried.
- **A countdown ending in the background tells nobody** until the app returns. There is no notification (risk R9).
- **A clock moved forwards is credited.** So is a long gap after a process kill with a session running: reopen after a day and a no-limit session shows a day. The web behaves the same way and the server clamps it, but nothing clamps it here yet. Phase 13's delivery has to meet this.
- **Only one window of the app is assumed.** Electron holds a single-instance lock, and Android runs one activity. Two tabs of a plain web build would each hold a session, which only a developer can reach. `lib/timer-leader.ts` is the owner if that changes.
- **Sessions have no subject or quest id,** only display text, and no breaks.
- **The dock unmounts abruptly at the gate,** with the switcher. A fade would be nicer, and it is not worth a shared animation yet.
- **Audio only opens the tool.** Playback waits for the native audio engine.
- **Theme Studio is still development only,** because there is no settings surface before accounts exist.
- **Contrast on the dock was measured by computed color,** which is sound because its plate is opaque, in each theme and in two custom sets.
- **`android-home-check` was edited for the real Begin button and has not run.**
- **For release:** the APK uses the public debug key and carries `SYSTEM_ALERT_WINDOW`, and a store build must not set `DEV_TOOLS`.

## 9. Reproducing

From `native/`:

```bash
npm run verify
```

```bash
SYLF_SESSION_CHECK_OUT=<dir> npm run desktop:session-check
```

The other checks are in the [Stage 2 handoff](../../handoffs/stage-2.md#11-commands-run-from-native). Evidence is in [`evidence/`](evidence/).

## 10. Handoff

Read the [Stage 2 handoff](../../handoffs/stage-2.md). **Stop here. Phase 11 and any tablet testing wait for the owner.**
