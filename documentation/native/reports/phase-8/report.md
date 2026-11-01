# Sylf Native — Phase 8 report: Workspace Multitasking

**31 October 2026. Status: complete on the Mac and awaiting the owner's review. Tablet verification is deferred until after Phase 10.** The owner approved Phase 6 and authorized Phases 7 and 8 as one overnight run on the Mac. Tablet checks ran for part of the next day, and the owner then ruled that all testing stays on the Mac until Phase 10 is complete. Decisions are in [ADR 0006](../../decisions/0006-workspace-canvas-and-windows.md), the contract is the [Workspace guide](../../workspace/README.md), Phase 7's checkpoint is in the [Phase 7 report](../phase-7/report.md), and the entry point for the next session is the [Phase 8 handoff](../../handoffs/phase-8.md).

**Read this first.** The final code has run on the Mac only. An earlier build ran on the tablet, and [§6a](#6a-tablet-results-partial-and-deferred) lists what it showed. On Electron, worklets run on the JavaScript thread, so a pass there does not prove the UI thread. The final Android build compiles and has not been run.

## Summary

| Deliverable | Result |
| --- | --- |
| Several tools at once, and several of one tool | Built. 16 windows at most. Each instance keeps its own state |
| Move, resize, focus, minimize, restore, close | Built, with mouse, keyboard and touch. Touch passed on an earlier tablet build |
| Canvas navigation preserves windows | Verified: a camera move changes no window |
| Focus, Split, Assistant | Built, computed fresh, closing nothing, with a way back |
| Restoration across restart and Space changes | Verified on Electron, including tool state, minimized windows and the camera |
| Lazy loading, viewport rendering, suspension | Built and measured. Budget of 8 seen and 3 warm |
| Compact windows | Built: one tool at a time under 600 pt, with no remount at the line |
| Keyboard | Every action on desktop, plus a quick switcher |
| Accessibility | Audit passes. **TalkBack and VoiceOver not run** |
| R15 | **Still open.** The bare reproduction has not run, and it waits until after Phase 10 |
| Phase 6 scrolling | **No longer a concern.** On an earlier tablet build, Home ran level with the Showcase ([§6a](#6a-tablet-results-partial-and-deferred)) |
| Android build | Compiles: release APK 30.4 MiB. **Final build not run** |
| iOS, Windows | Not built or run |
| Web app, backend, database | Unchanged. Nothing is committed |

## 1. What was built

On top of Phase 7:

```
native/packages/spaces/src/workspace/
├── windows.ts         move, resize, minimize, restore, placement, presets, saved arrangement
└── lifecycle.ts       seen windows and the budget
native/apps/sylf/src/spaces/workspace/
├── WorkspaceWindow.tsx    title bar drag, eight resize handles, shadow layer, keyboard, compact placement
├── DockShelf.tsx          minimized chips, Focus auto-hide
├── QuickSwitcher.tsx      type to open or switch
└── workspace-keys(.web).ts   desktop shortcuts
native/apps/sylf/src/r15/R15Probe.tsx          bare memory probe, with no Sylf code in it
native/tooling/checks/android-workspace-check.mjs, android-scroll-check.mjs, android-pinch-check.mjs     run on an earlier build
native/tooling/checks/android-r15-check.mjs     prepared, never run
```

Other changes: `Segmented` idle labels and `TextField` helpers moved from `faint` to `soft`. `android-memory-check` gained four Workspace sweeps. App links gained `wsOpen`, `wsClear`, `wsLayout`, `wsZoom` and `r15`. `index.ts` can select the bare probe at build time. `SYLF_SPACES` logs a window count, not the whole layout.

## 2. Unit and static checks (`native/`)

| Check | Result |
| --- | --- |
| `npm run verify` | Pass: typecheck, lint, 176 tests in 12 files, boundaries, single-copy, web build |
| Android release build | Pass on the final code, 5 m 15 s while the Mac was short of memory. Hermes bytecode and all native modules compile. APK 30.4 MiB (Phase 6: 30.3) |
| Bare probe bundle (`EXPO_PUBLIC_SYLF_R15=1`) | Pass. 1 MB, containing the probe and none of Spaces, the design system or Reanimated's hooks |

Root web checks were not run, because no root file was edited.

## 3. Electron on macOS (Electron 45.1.0, Chromium 156, MacBook Air M1, 8 GB)

| Check | Result |
| --- | --- |
| Workspace check | **184/184** ([results](evidence/electron/electron-workspace-check.json)) |
| Spaces check (regression) | **52/52**, on the third run ([note below](#how-steady-these-runs-were)). Median switch about 25 ms |
| Home check (regression) | **71/71** |
| Design check (regression) | **19/19** |
| Security self-test | Pass |

All of these ran on the final code. The Workspace check uses real mouse, wheel, keyboard and two-finger touch events. It covers: the canvas and its bounds, the Command Center and its menus, all ten tools, dragging at 60% zoom, grid landing, focus and stacking, corner and edge resizing with tool limits, minimize and restore, instance independence, every preset and the way back, restart and Space-change restoration, a partly corrupt and a fully corrupt record, lifecycle states, overview, a timer surviving suspension, an idle Workspace writing nothing, all shortcuts, the quick switcher, Space-drag, compact windows and the width crossing, five window sizes, every theme in both modes, two hard custom color pairs, an accessibility audit, reduced motion, frames and retention.

### How steady these runs were

The last full round ran while the Mac was in heavy use, with swap at 3 to 4 GB. The first round failed everywhere at once, and all of those failures came from the machine or the harness:

- **Spaces** failed twice before passing with no code change: once on one reload, and once at the 340 pt size, where the bar's labels had not yet dropped. The size failure is a timing guess, because the third run passed the same check and nothing further was measured. Watch for it recurring.
- **Workspace** failed once on a screen capture in new code, which had no retry. It has one now.
- **Frame timing** showed gaps of 30 seconds to about 9 minutes. They moved between actions from run to run, with neighboring frames at 17 ms. No code path explains that, so the likely cause is the system pausing a covered or starved window. This is inferred, not proven.

### Pinch and dots on the Mac

These groups are new and came from the owner's tablet report. Pinch uses real touch events through Electron's debugger.

| Case | Zoom | Focal error |
| --- | --- | --- |
| Empty canvas, in and out | 131%, 58% | 2.5 pt, 1.6 pt |
| Fingers apart and moving, then lifted | 163% | 0 pt |
| Inside the Calculator | 131% | 2.5 pt |
| Across the Calculator's edge, and across Notes' edge | 131% | 2.5 pt |
| From a title bar to the canvas | 131%, and the window stays put | 0 pt |
| Inside Notes, PDFs and Whiteboard | 100%, and the camera does not move | 0 pt |

Dots were measured from screenshots at seven zoom levels from 20% to 200%. Each gives the same light to within 1% (1651 to 1667), and they stay 28 to 45 pt apart. A dot between two pixels looks slightly softer and is not larger.

The debugger lifts all fingers together, so a pinch that lifts one finger at a time cannot be tested on the Mac.

### Frames (60 Hz display)

| Action | Windows | p50 | p95 | Max |
| --- | --- | --- | --- | --- |
| Pan | 4 | 16.7 ms | 17.3 ms | Not usable |
| Zoom | 4 | 16.7 ms | 16.8 ms | 17.7 ms |
| Drag a window | 4 | 16.7 ms | 17.2 ms | 17.6 ms |
| Resize a window | 4 | 16.7 ms | 17.3 ms | 17.7 ms |
| Pan, full Workspace at 50% | 16 | 16.7 ms | 17.1 ms | 17.6 ms |

These come from the last full run on the final code. **The pan maximum is not usable** because of a 30 second gap from the stall described above. Two separate frames runs had their gaps in zoom, resize and drag instead, and pan stayed at or under 17.7 ms in both, so pans are not the cause. **Frames do not change with the number of windows,** which is the point of one world transform. A Mac is far faster than the tablet, so this shows the design holds and not that the tablet will.

### Cost

| Measure | Value |
| --- | --- |
| Entering Workspace with six tools, click to first window | Median 18 ms (17 to 22) |
| DOM nodes, 16 windows in view | 2,009, with content mounted in 11 of them, the budget |
| Content mounted at 30% zoom, 6 windows | 3, the warm budget. Frames stay |
| Writes to storage in a settled Workspace over 2.2 s | 0 |
| Working set at the end of the run | 551 MB across 4 processes, of which the renderer is 325 MB |
| Grid | One view repeating one gradient, at every size |
| Code | Workspace 47 KB. Tools 1.3 to 3.6 KB each, loaded on first use |

The working set varies with the run and with what the Mac is doing, and it is not comparable with the 406 MB Phase 6 recorded on Home. No Workspace budget has been set yet.

### Retention, after a forced GC

| Sweep | Nodes | JS heap |
| --- | --- | --- |
| 28 tool opens and closes | 241 to 420, no growth past the second round | 11.79 to 12.04 MB over the last five rounds, slowing |
| 12 Workspace re-entries, four tools open | Flat at 863 | 14.55 to 15.03 MB over the last five rounds, slowing |

Nodes return exactly. **The heap is not flat:** it still rises by about 0.05 to 0.1 MB a round at the end of the run, and the rise is shrinking. Longer runs would show whether it stops. The check's limit is 1.2 MB over the run.

### Accessibility

| Check | Result |
| --- | --- |
| Named controls | 121 checked, 0 unnamed |
| Rendered text contrast, every theme in both modes and two hard custom pairs | Lowest 4.50:1 (Student, dark), measured with the same audit in all 14 |
| Windows, Command Center | Named. The Command Center is a labelled toolbar |
| Minimized windows | Out of the tab order |
| Keyboard | Every action. A title bar moves with arrows and resizes with Shift. Tabbing to a window out of view brings it into view |
| Reduced motion | Everything works, and a drag does not coast |
| Screen readers | **Not run.** Android actions (move, fill the view, minimize) are declared and untested |

## 4. Tool behavior

Each tool has an owner named in the [Workspace guide](../../workspace/README.md#5-backend-compatibility). The Calculator is real: `√(25)+3` gives 8 through Sylf's own engine. The Timer is a practice countdown on the real timer engine that records nothing and says so. Its time comes from an epoch snapshot, and it kept counting through a minimize, an overview and a return (24:59 to 24:55 by that run's clock) with no clock running while hidden. Resources opens the right tool on the right document. Two Notes windows show two notes.

## 5. Risk R15

**R15 stays open.** The bare reproduction needs the tablet. The first attempt was stopped during its build, so none of it ran, and it now waits until after Phase 10.

**What was prepared.** `R15Probe.tsx` uses React Native and nothing of Sylf's. It mounts and unmounts 300 plain elements on a 250 ms beat. Building with `EXPO_PUBLIC_SYLF_R15=1` makes it the app's entire entry, and that bundle is 1 MB with no design system or Reanimated hooks. `npm run android:r15-check` samples meminfo through it, with scenarios for views, text and pressables, then idles and trims. The link `?r15=views` runs the same probe inside the full app, so the two can be compared. Four Workspace sweeps join `android:memory-check`.

**What the Mac showed.** Electron, 129 cycles of 300 elements. "Between mounts" is the floor the sample should return to.

| Scenario | Nodes between mounts | JS heap between mounts |
| --- | --- | --- |
| Views | Flat at 52 | 7.46 to 7.64 MB |
| Text | Flat at 52 | 7.45 to 7.70 MB |
| Pressable | Flat at 52 | 7.55 to 7.76 MB |

**What this means.** Nothing is retained in the DOM. The JS heap's floor moves by about 0.2 MB in the first 90 cycles, which is not a leak of what was mounted (300 elements would be far more), and this run is too short to say where it stops. This says nothing about Android's native heap, which is a different renderer, allocator and engine. R15 sits in that native heap, so **no Android conclusion follows from any of this.**

**Design response, whatever R15 turns out to be.** Workspace mounts as little as it can: frames persist, content stays warm up to a budget, and a Space change costs one remount of what is on screen.

## 6. Phase 6 scrolling

**No longer a concern on the evidence so far.** On an earlier tablet build, in a shared pop-up window, Home was 0.22% to 0.56% janky against 0.34% for the Showcase. The original cause was never isolated. From the Mac: with the CPU throttled 6×, each Home page and the Showcase scrolled with the same frames (p95 18.0 to 18.3 ms, none over 20 ms). So there is no expensive JavaScript on scroll that a Mac can see, and Home's scroll handler does nothing but note a position at a 64 ms throttle. Home was not changed. Android draws differently, so `npm run android:scroll-check` should run again on the final build.

## 6a. Tablet results, partial and deferred

The Tab S9 FE, 31 October, on builds **older than the final code**. Evidence is in [`evidence/android/`](evidence/android/). The final build differs at least by the `ceded` change to `WorkspaceCanvas.tsx`, which also runs on Android.

| Check | Result | Build |
| --- | --- | --- |
| Smoke | Pass. Cold start 249 ms | Earlier |
| `android:pinch-check`, real two-finger input | 13 of 13. Focal error 0 to 3 px | 10:44 |
| `android:workspace-check` | 21 of 21. Drag 1.47% janky, pan 2.22% | 10:44 |
| Spaces, Home, Design, Interaction | 34, 40, pass, pass | Older |
| Scroll, Home against Showcase | 0.22% to 0.56% against 0.34% | Older |
| Memory, native heap | Levels off in every sweep. `workspaceZoom` (12.2 MB against a 5 MB budget) and `workspaceLayouts` (7.5 against 5) exceed budget on rest-to-rest noise, and neither climbs steadily | 10:44 |
| Memory, GPU | Growth per Workspace entrance fell from about 66 MB to about 15 MB. It can still reach the renderer's fixed 159 MB budget, stays there, and showed no effect on frames. The cause of the rest is not found | 10:44 |
| R15, the by-hand list, TalkBack | **Not run** | None |

The checklist for after Phase 10 is in the [Phase 8 handoff](../../handoffs/phase-8.md#6-tablet-checklist-deferred-until-after-phase-10).

## 7. Defects that verification found

| Where found | Defect | Resolution |
| --- | --- | --- |
| Screenshot | Canvas buttons and close buttons sat high, because `IconButton` aligns to the start | Centered |
| Screenshot | The dock Marker sat on the top edge, because `baseline` measures from the bottom | Fixed, and pips give way to it |
| Screenshot | A new window panned the first one off screen | `revealRect` nudges only as far as needed |
| Unit test | Snapping could push a window under the chrome by a few points | Snap stays inside the clear area |
| Unit test | A second large window had nowhere to go, and overlapped | Beside, then free in view, then out of view with the camera following |
| Check | Right-click opened nothing, because `enableContextMenu` stops the event before React's root sees it | Prop removed |
| Check | A closing menu returned focus to the dock and undid Focus's auto-hide | Focus reveals only for a keyboard |
| Check | `data-*` attributes never reach the DOM on react-native-web | `dataSet` |
| Check | Split and Assistant left a hole beside a tool with a size limit | The group stays together and centered, and Sylvie keeps her share |
| Audit | `Segmented` idle labels and `TextField` helpers at 3.61:1 | Moved to `soft` in the design system |
| Review | No visible keyboard focus on title bars or the Calculator | `FocusRing` |
| Review | A compact window restored with nothing focused showed nothing | Focuses the last used window |
| Review | Tool content inherited the canvas's grab cursor | Reset on the window |
| Review | Two Notes windows opened the same note | A new window starts on a document not already open |
| Owner, on the tablet | A pinch with one finger on a window panned the canvas instead of zooming, and every pinch snapped as a finger lifted | The second finger takes over at once, and the lift update is ignored |
| Owner, on the tablet | Dots changed size with the zoom | One view repeating a gradient, with only the spacing following the camera |
| Owner, on the tablet | Pinching on Notes zoomed the canvas | Notes, PDFs and Whiteboard own their pinch |
| Touch check on Electron | That pinch rule did nothing on the web, because the second finger arrives before the gesture can be failed | The canvas keeps its own `ceded` flag |
| Tablet memory sweep | The Command Center's blurred shadow left GPU copies through each entrance | Workspace enters without a scale, and the shadow fades in afterward |
| Harness | Saved state read before a flung camera committed, fixed window sizes assumed on a shorter screen, retention thresholds that assumed no last-Space trace | Fixed |

## 8. Limitations and untested behavior

- **The final code has not run on Android, and nothing has run on iOS.** S Pen, palm rejection, gesture bar conflicts, rotation, TalkBack and the tablet's hardware keyboard were never tried by hand. See [§6a](#6a-tablet-results-partial-and-deferred).
- **Electron cannot lift one finger at a time** through its debugger, so that case rests on the tablet run at 10:44.
- **`android-r15-check` has never run.** Expect to fix it on first use.
- **Notes, PDFs and Whiteboard have no zoom of their own yet,** so a pinch on them does nothing.
- **Two fingers in one of those windows with one on a resize grip can resize it.** Seen on the tablet, and left as it is.
- **Dragging a window to the edge of the view does not pan the camera.** To move a window far, zoom out first.
- **Global shortcuts are desktop only.** Android has focus navigation only.
- **Resize handles are on the focused window only,** and at low zoom they shrink with the world.
- **Zoom scales text.** Text on Electron stays sharp in the captures. On Android this waits for the by-hand list.
- **No session indicator,** because nothing can start a session until Phase 13.
- **Tool state in Notes, PDFs and Whiteboard is a pointer.** Nothing is editable, and Planner ticks stay in the window.
- **Sample data is invented,** and is shown only with development tools on.
- **Contrast covers text on opaque surfaces in windows and the Command Center.** It does not cover open menus.
- **Performance figures** come from one Mac, at 60 Hz. No CPU or energy figure was taken.

## 9. Reproducing

From `native/`: `npm run verify`; `SYLF_WORKSPACE_CHECK_OUT=<dir> npm run desktop:workspace-check`; `SYLF_SPACES_CHECK_OUT=<dir> npm run desktop:spaces-check`; `SYLF_HOME_CHECK_OUT=<dir> npm run desktop:home-check`; `SYLF_DESIGN_CHECK_OUT=<dir> npm run desktop:design-check`; `npm run desktop:self-test`; and `npm run android:build`, with `JAVA_HOME` set to JDK 17 and `ANDROID_HOME` set. Run Electron checks one at a time, and run a failure again before reading it as a bug when the Mac is short of memory. The tablet steps are in the [Phase 8 handoff](../../handoffs/phase-8.md#6-tablet-checklist-deferred-until-after-phase-10).

## 10. Handoff

See the [Phase 8 handoff](../../handoffs/phase-8.md). **Phase 8 stops here. Phase 9 needs the owner's approval, and tablet verification waits until after Phase 10.**
