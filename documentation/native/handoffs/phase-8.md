# Sylf Native — Phase 8 handoff

**Written 31 October 2026 and updated the same day. Phases 7 and 8 are complete on the Mac and await the owner's review. Tablet verification is deferred until after Phase 10, and Phase 9 must not start without the owner's approval.** This file is self-contained: a fresh session needs only the repository. Source, tests and configuration win over any prose that disagrees. Read this, then the [Workspace guide](../workspace/README.md), [ADR 0006](../decisions/0006-workspace-canvas-and-windows.md), the [Spaces shell guide](../spaces/README.md), the [design system guide](../design/README.md) and [`AGENTS.md`](../../../AGENTS.md). For the stack and this machine, the [Stage 1 handoff](stage-1.md) is still current.

## 1. How this project is run

The owner briefs one phase at a time, and each is completed, reported and approved before the next starts. The overnight run was a one-time exception for Phases 7 and 8 only. Never build ahead of the current phase. Keep the [master plan](../master-plan.md) status log, [decision records](../decisions/) and phase reports current, and write a self-contained handoff at the end of each phase. Label planning statements Confirmed, Proposed or Open. Preserve the owner's many uncommitted edits, leave the web app, backend and database alone, and **ask before** installing substantial dependencies, deleting experimental files, or changing device or system settings. Nothing is committed, and all of `native/` is untracked.

**Sylf Native is a redesigned frontend, not a new backend (Confirmed).** Before adding a feature, name the existing model, route or `lib/` owner it will use. A feature needing significant backend work is deferred and written down. See [master plan §7.3](../master-plan.md#73-scope-boundaries).

**Mac only until Phase 10 is complete (Confirmed, owner, 31 October 2026).** Work and run all available tests on the Mac. Do not connect to, install on, or test using the Samsung tablet. All Android tablet verification, performance testing and device-specific debugging wait until after Phase 10, when the owner explicitly authorizes them. Test thoroughly on the Mac, write down what stays unverified, and do not let unavailable tablet testing block development.

**The tablet, once authorized.** It can drop off USB, so check `adb devices`. `adb` is at `~/Library/Android/sdk/platform-tools/adb` and is not on `PATH`. Installing a build can raise an **Avast One** "Suspicious app" dialog or a **Google Play Protect** "Send app for a security check?" dialog. Each blocks automated runs. These are the owner's security software, so do not dismiss them or change their settings: stop and ask. Play Protect sending the app to Google would upload an unreleased build, and the owner chose not to. USB does not charge the tablet, and it lost about 20% over a full run.

## 2. What Phases 7 and 8 delivered

Workspace is a real window manager over tool shells. Details are in the [Workspace guide](../workspace/README.md).

- **Canvas:** finite, 5600 × 3640 pt, a 28 pt dot grid, 20% to 200%, panning and zooming from mouse, wheel, trackpad and touch, with Fit Workspace and Reset View.
- **Command Center:** ten tools, open state as pips, the Marker on the focused tool, menus by right-click or long press, layouts, canvas controls, minimized chips, auto-hide in Focus.
- **Windows:** several at once, several of one tool, move, resize, focus, minimize, restore, close, landing on the grid.
- **Layouts:** Free, Focus, Split, Assistant. Computed fresh, closing nothing, with a way back.
- **Restoration:** windows, tool state, layout and camera survive a restart and a Space change.
- **Efficiency:** one world transform, one grid plate, lazy tools, a budget of 8 seen and 3 warm, overview below 45%.
- **Keyboard:** every action on desktop, plus a quick switcher.
- **Compact:** one tool at a time under 600 pt.
- **State:** `createWorkspaceModel(store)` in `@sylf/spaces`, outside React, writing through the `workspace` snapshot.
- **Data:** typed view models in `spaces/workspace/data/`, with `provenance`. Without `DEV_TOOLS`, the empty adapter binds. The Calculator is real, and the Timer is a labelled practice countdown.

## 3. Finalized decisions

All 34 are in [ADR 0006](../decisions/0006-workspace-canvas-and-windows.md). The ones Phase 9 and later will meet most:

- **While something moves, shared values are the truth. At rest, the model is.**
- **The camera is one transform on one view.** Never position anything from the camera in React.
- **A tool runs only when seen.** Derive time from epochs.
- **A window's state is a pointer, never a document.**
- **W1 to W5 are built to their proposed defaults,** and the owner has not yet reviewed them.

## 4. Rules from earlier phases that still apply

Keep what is switched often mounted and hidden, with opacity 0, no touches, out of the accessibility tree, and `visibility: hidden` on web, never `display: none`. No animated size on a surface with a shadow. No full-window SVG. `tabIndex` on web only. Text is `soft` or stronger. A line-shaped Marker is wide. `provenance` drives notices. Real where it can be, disabled and explained where it cannot. Only a tall window can measure scrolling. Plant saved state from a page with no app on it. `wm size` gives the physical size, so use `cur=` from `dumpsys window displays` for orientation.

New from this run:

1. **`TravellingMarker`'s `baseline` measures from the bottom.**
2. **`IconButton` aligns to the start.** Center it in a row with `style={{ alignSelf: "center" }}`.
3. **`enableContextMenu` on a `GestureDetector` stops `contextmenu` before React sees it.** Leave it off.
4. **`data-*` props do not reach the DOM on react-native-web.** Use `dataSet`.
5. **A menu returns focus to its anchor when it closes.** Anything that reveals on focus must check `getInputMode()`.
6. **Use `event.absoluteX` under a transform.** Translation is not comparable across platforms inside a scaled view.
7. **`overflow: clip` on web stops the browser scrolling a stage to reveal focus,** which would move the canvas without moving the camera.
8. **On this Mac an Electron window is at most about 746 pt tall.** Read `innerHeight` in checks.

## 4a. State of verification

**Mac: finished, on the final code.** `npm run verify` passes with 176 tests. Electron Workspace passes 184 of 184, Home 71 of 71, Spaces 52 of 52, Design and the security self-test pass, and the Android build compiles. Details are in the [Phase 8 report](../reports/phase-8/report.md).

New on the Mac: the Workspace check now sends real two-finger touch through Electron's debugger, measures dots from the screen, and measures contrast in every theme. The touch check found that a pinch on Notes, PDFs and Whiteboard still zoomed the canvas on the web, which is fixed.

**Tablet: partial, and deferred.** The owner authorized tablet checks on 31 October, stopped them, and then deferred the rest until after Phase 10. Evidence is in [`reports/phase-8/evidence/android/`](../reports/phase-8/evidence/android/). These results are from an earlier build, and no statement here covers the final code.

- **Passed on the build from 10:44:** `android:pinch-check` 13 of 13 with a focal error of 0 to 3 px, and `android:workspace-check` 21 of 21.
- **Passed on an older build:** Spaces 34, Home 40, Design, Interaction, and the scroll check (Home 0.22% to 0.56% janky against 0.34% for the Showcase, same pop-up window).
- **Fixed from the owner's tablet report:** a pinch across a window edge panned instead of zooming, every pinch snapped by half the fingers' spread as a finger lifted, and dots changed size. Two fingers on Notes, PDFs or Whiteboard belong to the tool, which has no zoom of its own yet (ADR 0006, decisions 10 and 31 to 34).
- **Memory:** native heap levels off in every sweep, including 60 Layout cycles at about 145 MB. Two sweeps exceed their `--budget-native` on rest-to-rest noise, and neither keeps climbing. GPU memory from entering Workspace fell from about 66 MB to about 15 MB per entrance. It can still reach the renderer's fixed 159 MB budget over many entrances or layout changes, stays there, and has shown no effect on frames. The cause of what remains is not found.
- **Not on the tablet:** the final code. The tablet still has the 10:44 build, which lacks the web-side `ceded` change to `WorkspaceCanvas.tsx`. That change also runs on Android, so the pinch check must run again.

## 5. Known limits and unfinished work

Listed in full in the [Phase 8 report](../reports/phase-8/report.md#8-limitations-and-untested-behavior). The ones that matter most:

- **The final code has not run on Android.** See §4a. Worklets on the UI thread are still the largest risk, and a change made on the Mac can break on the tablet.
- **Risk R15 stays open.** The harness is ready, and the bare reproduction has never run.
- **GPU memory after repeated Workspace entries is not explained.**
- **A pinch that lifts one finger at a time cannot be tested on the Mac,** because Electron's debugger lifts all fingers together. It passed on the tablet at 10:44.
- **Two fingers in a Notes, PDFs or Whiteboard window with one on a resize grip can resize it.** Found on the tablet, and left as it is.
- **Notes, PDFs and Whiteboard have no zoom of their own yet,** so a pinch on them does nothing.
- **iOS and iPadOS never built or run. Windows not run. TalkBack not run.**
- **Owner decisions outstanding:** W1 to W5 as built, H1 to H3, and T1 (Student or Scholar).
- **For release:** the APK uses the public debug key and carries `SYSTEM_ALERT_WINDOW`.

## 6. Tablet checklist, deferred until after Phase 10

**Superseded by the consolidated [tablet checklist](tablet-checklist.md), which includes everything below.**

**Do none of this until Phase 10 is complete and the owner explicitly authorizes it.** Start with a normal `npm run android:build`, because later phases will have changed the code. Run `android:pinch-check` and everything below, because every result so far is from an older build. Run the steps in order, one at a time, because this Mac has 8 GB. Save results under `documentation/native/reports/phase-8/evidence/android/`, and crop anything showing the owner's own apps.

**Setup**

```bash
export ANDROID_HOME=~/Library/Android/sdk
export JAVA_HOME=~/development/jdk17/zulu17.70.113-ca-jdk17.0.21.0.3-macosx_aarch64/Contents/Home
export PATH="$PATH:$ANDROID_HOME/platform-tools"
```

```bash
adb devices
```

Build first, as above. The APK is at `native/apps/sylf/android/app/build/outputs/apk/release/app-release.apk`. From `native/`:

```bash
npm run android:smoke
```

```bash
adb shell dumpsys window | grep mCurrentFocus
```

If that shows Avast or Play Protect, **stop and ask the owner.**

**A. Automated (about 15 minutes)**

| # | Command | What to look for |
| --- | --- | --- |
| 1 | `npm run android:workspace-check -- --out=<dir>` | 21 checks. Read `dragFrames` and `panFrames` |
| 2 | `npm run android:spaces-check -- --out=<dir>` | 34 checks |
| 3 | `npm run android:home-check -- --out=<dir>` | 40 checks |
| 4 | `npm run android:interaction-check -- --out=<file>` | 9 checks |
| 5 | `npm run android:design-check -- --out=<dir>` | 12 themes, 0 crashes |
| 6 | `npm run android:scroll-check -- --window=<left,top,right,bottom> --out=<file>` | Home against Showcase. A full-screen portrait page does not scroll, so use a pop-up window |
| 7 | `npm run android:pinch-check -- --out=<file>` | 13 scenarios of real two-finger input |

**B. By hand, with the owner (about 15 minutes).** `adb` cannot do these.

| # | Try | Pass if |
| --- | --- | --- |
| 1 | Pinch on empty canvas, then over a window | Zoom follows the fingers, and the point between them stays put |
| 2 | Pinch while a tool is scrolling | No fight, and no jump |
| 3 | Fling the canvas | It coasts and stops at the world's edge, with no jump at the end |
| 4 | Drag a title bar at 50%, 100% and 200% | The window stays under the finger at every zoom |
| 5 | Resize from each corner, on the focused window, with a finger | Live and smooth, and the shadow returns cleanly |
| 6 | Zoom to 200% and read a note | Text stays sharp |
| 7 | S Pen on empty canvas, on a title bar, in a tool | Pans, moves, and acts as a tap in a tool. Nothing is drawn yet |
| 8 | Rest a palm while dragging | No stray pinch |
| 9 | Swipe from the bottom edge near the Command Center | The gesture bar and the dock do not fight, and the dock is clear of it |
| 10 | Rotate with windows open, in Free and in Focus | Nothing is lost, and the camera keeps its place |
| 11 | Split-screen and pop-up windows, resized across 600 pt | Compact layout appears, and nothing remounts |
| 12 | A hardware keyboard, if there is one | Tab reaches windows and the dock |
| 13 | Ten minutes of real use: open, arrange, switch Spaces | It feels smooth, and the owner's judgment is the result |

**C. Memory (about 45 minutes).** All from `native/`, one at a time.

```bash
npm run android:memory-check -- --sweep=workspaceEntry --cycles=48 --rest-every=12 --wait=500 --budget-native=10 --out=<file>
```

```bash
npm run android:memory-check -- --sweep=workspaceTools --cycles=24 --rest-every=6 --wait=800 --budget-native=10 --out=<file>
```

```bash
npm run android:memory-check -- --sweep=workspaceCamera --cycles=24 --rest-every=6 --wait=500 --budget-native=5 --out=<file>
```

```bash
npm run android:memory-check -- --sweep=workspaceLayouts --cycles=24 --rest-every=6 --wait=800 --budget-native=5 --out=<file>
```

**D. R15, the bare reproduction (about 30 minutes).** This replaces the app on the tablet, so finish by reinstalling the normal build.

```bash
EXPO_PUBLIC_SYLF_R15=1 npm run android:build
```

```bash
npm run android:install
```

```bash
npm run android:r15-check -- --scenario=views --minutes=6 --out=<file>
```

```bash
npm run android:r15-check -- --scenario=text --minutes=6 --out=<file>
```

```bash
npm run android:r15-check -- --scenario=pressable --minutes=6 --out=<file>
```

Then rebuild and reinstall the normal app, and run the same scenarios inside it with `--in-app`:

```bash
npm run android:build
```

```bash
npm run android:install
```

```bash
npm run android:r15-check -- --scenario=views --minutes=6 --in-app --out=<file>
```

**How to read D.** If native heap climbs steadily in the bare build, the cause is in the stack, so it is a bug to report and a cost to budget. If it levels off bare and climbs in-app, the cause is in how Sylf uses the stack, and the next suspects are Reanimated and the design system's shared values. If both level off, R15 as a per-mount leak is hard to sustain, and Phase 6's plateau is the better description.

**E. Report.** Add an Android section to the Phase 8 report, update R15 in the master plan, and do not claim anything these steps did not show.

## 7. Phase 9 — Sylf World (only after approval)

**Prerequisite:** the owner reviews Phases 7 and 8 and briefs Phase 9. Tablet verification is not a prerequisite, because it waits until after Phase 10. The brief takes precedence over this summary. Read [master plan §2.3](../master-plan.md#23-sylf-world--immersive-fantasy-game) first. World is a placeholder with its exit flow already in `packages/spaces/src/world.ts`. Replace the timed steps with a real host, and keep the phases it reports. Keep it isolated: nothing of World runs under Home or Workspace. R6 and G1 to G4 are due.

## 8. Commands (run from `native/`)

```bash
npm run verify
```

```bash
npm run web
```

```bash
SYLF_WORKSPACE_CHECK_OUT=<dir> npm run desktop:workspace-check
```

The other Electron checks are `desktop:self-test`, `desktop:design-check`, `desktop:spaces-check` and `desktop:home-check`, each with its own `*_OUT` variable. `SYLF_WORKSPACE_CHECK_ONLY=<groups>` runs part of the Workspace check, from `canvas`, `dots`, `pinch`, `dock`, `tools`, `windows`, `layouts`, `restore`, `lifecycle`, `keys`, `compact`, `a11y`, `contrast`, `frames`, `sizes`, `themes`, `retention`, `probe` and `homescroll`. A web build takes about 10 seconds, and the full Workspace check about 9 minutes. Run Electron checks one at a time. When the Mac is short of memory they can stall or fail on timing, so check swap and run a failure again before reading it as a bug. An Android build takes about 3 minutes and needs `JAVA_HOME` and `ANDROID_HOME`. Root `npx tsc --noEmit` needs `NODE_OPTIONS=--max-old-space-size=4096` on this Mac. Root web checks are unchanged, and the known baseline of 35 to 36 failing root tests is unchanged.
