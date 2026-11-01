# Sylf Native — Phase 5 report: Global Spaces System

**30 October 2026. Status: complete, awaiting approval.** Decisions are in [ADR 0004](../../decisions/0004-global-spaces-shell.md), the contract is the [Spaces shell guide](../../spaces/README.md), and the entry point for the next session is the [Phase 5 handoff](../../handoffs/phase-5.md). The code is in [`native/packages/spaces`](../../../../native/packages/spaces/) and [`native/apps/sylf/src`](../../../../native/apps/sylf/src/).

## Summary

| Deliverable | Result |
| --- | --- |
| Global Spaces switcher | Built. The icon's plate grows into a Home, Workspace and World bar, with the Marker on the current Space. Closes on selection, outside tap, Escape and Back |
| Three placeholder Spaces | Built, each distinct and loaded separately. Home reserves the rail column, Workspace is a dot-grid canvas, and World shows entry, play, pause, saving and saved |
| Theme-aware transitions and indicators | Built through `move()` and `fade()`, with no theme branching. Checked in all six themes in both modes and with custom colors |
| Persistence and restoration | Built. The Space survives process kills. Home restores its scroll position, and a kill during play returns to World's entry |
| Desktop and tablet interaction | Mouse and keyboard in Electron; touch and Back on the tablet |
| Responsive behavior | Portrait, landscape, real split-screen, and a live-resized pop-up window from 1029 to 331 pt wide |
| Automated tests and device checks | See §2 to §4 |
| Screenshots | [`evidence/android/`](evidence/android/) and [`evidence/electron/`](evidence/electron/): collapsed, expanded and every Space in all six themes and both modes, plus portrait, split-screen and pop-up windows. Start with [the open bar](evidence/android/theme-signature-dark-home-expanded.png) |
| Memory investigation | **Done, with one open issue.** See §5. Two defects of mine are fixed. A native growth below the app remains |
| Visual QA | Done. See §6 |
| iOS and iPadOS | **Not verified.** Unresolved until real iPad testing |
| Web app, backend, database | Unchanged. Nothing is committed |

## 1. What was built

```
native/packages/spaces/src/       contracts, store, world, switcher (no React)
native/apps/sylf/src/
├── App.tsx                       providers, foundation report, store creation, dev links
├── shell/                        SpacesShell, SpacesSwitcher, SpaceStage, context, links, dev-surface
├── spaces/home|workspace|world/  placeholders, each lazily loaded
└── showcase/                     unchanged in content, now behind DEV_TOOLS
native/apps/desktop/src/          spaces-check.mjs, review-capture.mjs
native/tooling/checks/            android-spaces-check.mjs, android-memory-check.mjs
```

Other changes:

- **Design system:** five icons (66 in total), a `ref` prop on `Press`, `svgId()`, `Segmented` now brings the chosen tab into view, and `move`, `fade` and `useDismiss` are exported.
- **Android:** `enforceNavigationBarContrast` is off, which removes a dark band behind the gesture bar in every Space.
- **Build scripts:** `build:web` and `build:android` set `EXPO_PUBLIC_SYLF_DEV_TOOLS=1`.

The **Student and Scholar** naming difference is documented in [ADR 0004](../../decisions/0004-global-spaces-shell.md#student-and-scholar). The implementation is unchanged.

**Owner direction during the phase.** The owner asked to keep the dot grid and plans a canvas larger than the screen, with zoom, where tools rest in the grid. Phase 5 keeps a fixed grid, drawn so it can grow into that. The direction is recorded in the [master plan](../../master-plan.md#22-workspace--advanced-study-environment) as open question W5 for Phases 7 and 8.

## 2. Unit and static checks (`native/`)

| Check | Result |
| --- | --- |
| `npm run typecheck`, `lint` | Pass, 0 errors, 0 problems |
| `npm run test` | Pass: 80 tests in 8 files (Phase 4: 57 in 7) |
| `check:boundaries`, `check:single-copy` | Pass, 0 violations |
| `build:web` | Pass. Home, Workspace, World and the Showcase are separate chunks |

New tests cover the store (immediate writes, corrupt storage, throwing writers, delayed snapshots), World's flow, navigation blocking, return Space, restart behavior, keyboard logic, bar fitting, app links and the development-tools default. Root web checks were not run: no root file was edited.

## 3. Electron on macOS (Electron 45.1.0, Chromium 156)

| Check | Result |
| --- | --- |
| Security self-test | **11/11** |
| Phase 4 design check (regression) | **19/19.** Marker p95 18.6 ms; theme switch 51.0 to 56.1 ms |
| Spaces check, real mouse and keyboard events | **52/52** on the final code ([results](evidence/electron/electron-spaces-check.json)) |

The Spaces check covers first launch; opening; outside click; Escape; keyboard-only use, including focus order, wrapping and focus return; unloading; World's full flow, including Escape held during transitions; reloads, including mid-game; scroll restoration; five window sizes down to 340 pt; a live resize with the bar open; every theme in both modes; custom colors; reduced motion; the Showcase entry; and retention.

| Measure | Value |
| --- | --- |
| Click to the new Space's heading being in the page | Median 13 ms. The first switch to World took 236 ms. The ≤ 300 ms budget holds, though this measures readiness and not a finished transition |
| Frame pacing with the shell on screen | p50 16.7 ms, p95 17.9 ms, max 18.6 ms (60 Hz) |
| Retention after a forced full GC, 48 switches | DOM nodes flat at 78 |
| Working set | 494 MB after the full run |

## 4. Android on Galaxy Tab S9 FE (SM-X510, Android 16, font scale 1.15)

| Check | Result |
| --- | --- |
| Smoke | **4/4.** Cold start 268 ms median, 99 MB, APK 30.3 MiB |
| Spaces check, portrait | **34/34** with real taps, swipes and Back ([results](evidence/android/android-spaces-check-portrait.json)). This build differed from the final one only by one accessibility label on the hidden tab list |
| Spaces check, landscape | **34/34** on the final build ([results](evidence/android/android-spaces-check-landscape.json)) |
| Real split-screen | Passed by hand-driven input in the owner's split with another app: Sylf at 654 × 808 pt, bar open, all Spaces reachable, no crash ([cropped capture](evidence/android/split-open.png)) |
| Pop-up window, live resize | Passed in both orientations, at 1029, 743, 486 and 349 pt wide in landscape and 777, 663, 469 and 331 pt in portrait. The bar stayed inside, labels dropped only at the narrowest, and the Space did not remount |
| Phase 4 interaction check (regression) | **9/9** |
| Phase 4 design check (regression) | Pass: 24 renders, 0 crashes, 38 controls, 0 unnamed |
| Frames across bar and Space changes | Landscape: 939 frames, 1.60% janky; p50 8 ms, p90 14 ms, p99 22 ms. Portrait: 913 frames, 1.97% janky. `uiautomator` was running between steps, so these are not clean timing figures |

The Spaces check covers every item in the brief: restoration across a process kill, a kill during play, scroll restoration, the World flow with Back held or captured at each stage, touch targets, the accessibility tree in each Space, and every theme in both modes by real taps.

**Not valid this run:** the Android design check's scrolling frame count reported a single frame, so it says nothing about scrolling. Phase 4's figure (713 frames, 0.14% janky) stands as the last valid scrolling measurement.

## 5. Memory investigation

**The question:** why Android went from 98 MB to 245 MB in Phase 4, and whether resources are retained unnecessarily.

**The short answer:** the 245 MB was mostly high-water memory, not a runaway. Looking for it exposed two defects in new Phase 5 code, now fixed, and one real growth below the app, which is not fixed.

Tool: `android-memory-check.mjs` samples `dumpsys meminfo` categories across repeated sweeps. All figures are PSS in MB on the tablet.

### The Phase 4 figure

Repeating the same 24-render sweep five times on the Phase 4 build:

| Point | Total | Native heap | Graphics | JS heap (approx.) |
| --- | --- | --- | --- | --- |
| Launch | 114 | 31 | 25 | 12 |
| After 1 sweep | 235 | 104 | 24 | 52 |
| After 2 / 3 / 4 / 5 | 218 / 222 / 219 / 207 | 100 / 102 / 103 / 98 | 24 | 39 / 38 / 37 / 32 |
| 30 s idle, then trim | 190, then 189 | 91 | 23 | 32 |

It is not a sweep-over-sweep leak. Java memory returns. About 60 MB of native heap and 20 MB of JS heap stay, which is what mounting every chapter leaves behind. Launch memory on the Phase 5 build is about 100 to 107 MB in Home.

The Hermes V1 and Reanimated regression Expo noted for SDK 56 and 57 could not be confirmed or excluded directly. The growth in §5.3 appears with no Reanimated in the mounted content, so Reanimated is not its only cause.

### Two defects found and fixed

| Defect | Evidence | Fix | After |
| --- | --- | --- | --- |
| **A blurred shadow on the plate whose width animated.** The GPU kept a render target per size | 109 → 375 MB in 30 opens; `RenderTarget: 136.93 MB (335 entries)` | The plate has no shadow and scales with a transform. One still layer holds the shadow | Render targets 0.5 MB; Graphics flat at 25 MB |
| **Tabs remounted on every open** | +0.7 MB native per open after the shadow fix | Tabs stay mounted and hidden | About +0.15 MB per open, levelling off. 30 opens: 104 → 149 MB |
| **The full-window SVG dot grid.** `react-native-svg` rasterizes to a bitmap the size of the view | About +50 MB in Workspace | Shared image tiles, tinted | About +9 MB, Graphics flat |

The check suite now includes the switcher loop, so the first of these cannot return unnoticed.

### What remains: growth with every mount

**This is a real leak, not garbage-collection lag, and it is not fixed.** Native heap grows in a straight line as Spaces mount and unmount, at about 0.33 to 0.38 MB per switch. It went from 29 to 170 MB over 420 switches on the pre-fix build. On the final build, native heap after each 30 s rest was 64, 83 and 100 MB at 48, 96 and 144 switches ([data](evidence/memory/memory-spaces-rounds.json)). A collection request does not return it.

| Experiment (Space content replaced, no animation) | Native growth per 48 switches |
| --- | --- |
| Empty | 2 MB |
| 40 plain views | 4 MB |
| 40 text nodes | 8 MB |
| Real placeholders, with animation | About 13 to 19 MB |

Chromium shows nothing retained (48 switches, DOM nodes flat after a forced GC), so the app's own React tree releases correctly. The growth scales with element count even with plain React Native primitives and none of Sylf's components. That places it below the app, in the React Native 0.88 and Hermes V1 stack, or in how Sylf's real components use it. Which one is **not established**: a bare app has not been tested, and a release build allows no native heap profile.

**Impact today:** about 7 MB for 20 switches, cleared on restart. **Impact later:** Workspace will mount far more, so this matters before Phase 8. **Recommendation:** reproduce it in a bare Expo app and report upstream before Phase 8, and keep tools suspended rather than remounted.

**Also true:** leaving the Showcase does not return its memory. After a full sweep and returning to Home, the app stayed at 207 MB with about 98 MB of native heap. That is a development tool, but it shows what heavy screens leave behind.

## 6. Visual QA

Every chapter Phase 4 left unreviewed was captured with `review-capture` and inspected: Color, Type, Icons, Fields, Feedback, Layout and Input in Signature by day and night, Fields, Feedback and Input in the other five themes at night, the Fine tune panels, and Theme Studio.

| Finding | Result |
| --- | --- |
| **Day and Night ground Fine tune sliders were solid black.** The SVG gradient id contained a space, so `url(#Day ground-hue)` broke. Never reviewed in Phase 4 | Fixed with `svgId()` and a test |
| Showcase tabs clipped the last chapter with no way to know it was there | Fixed: the chosen tab is brought into view |
| Sample text used "colour" | Fixed |
| Arcane and Voxel surfaces carry the accent's hue on a ground of another hue, because of Vivid presence. Arcane's trays read brown on indigo, and its callouts read strong | **Left as approved.** Worth a look by the owner, because it is taste, not a defect |
| Custom colors | A neon accent on a mid-gray ground was reviewed in the Spaces, Theme Studio, Controls, Feedback and Fields. Everything stays readable ([Controls](evidence/review/custom-colors-controls.png)). Fine tune is confirmed fixed ([capture](evidence/review/fine-tune-fixed.png)) |
| Switcher in six themes, both modes | Reviewed on Electron. The plate, corners, Marker and type follow each theme |

## 7. Defects that verification found

| Where found | Defect | Resolution |
| --- | --- | --- |
| Tablet | Shadow on an animating surface (137 MB) | Fixed (§5) |
| Tablet | Full-window SVG grid (50 MB) | Fixed (§5) |
| Tablet | Tabs remounted on each open | Fixed (§5) |
| Tablet | **`tabIndex={-1}` removed Workspace and World tabs from the accessibility tree**, so TalkBack could not have reached them | Web only now, with the rule documented |
| Tablet | Dark band behind the gesture bar | Fixed in `app.config.ts` |
| Electron | Home's scroll position was not restored on web | Restored after content has a size |
| Electron | The bar's tooltip stayed up after a click, the small plate's corners showed through the bar, and World's entry could flash while leaving | Fixed |
| Review | Black Fine tune sliders | Fixed (§6) |
| Harness | One fixed-delay race. `tabLeavesAndCloses` failed once and could not be reproduced in later runs. Its cause was not identified | The harness now waits for elements. The check has passed in every run since |

## 8. Limitations and untested behavior

- **iOS and iPadOS: not built or run.** Unresolved until real iPad testing. The Swift code is uncompiled.
- **Windows: not run.**
- **Native memory growth (§5):** open.
- **TalkBack was not run.** The accessibility tree was audited, so spoken output and focus movement are unverified. A Space change is announced in code, not by observation.
- **S Pen, physical keyboard and mouse on the tablet:** not exercised. Taps came from `adb`, and desktop input was synthetic.
- **Split-screen:** one layout with one other app, not a resize of the divider.
- **Rotation during a transition:** not tested deliberately.
- **Android More contrast, larger font scales:** not tested. Only the tablet's 1.15.
- **Frame rate:** the tablet ran at 60 Hz. Motion quality was reviewed from still frames and frame statistics, so **how the animation feels is for the owner to judge.**
- **Direct keyboard shortcuts:** not built (Phase 10).
- **Known small issue:** `Press`'s `hint` still does not map on web.
- **Performance figures** are single-device measurements, not guarantees.

## 9. Reproducing

From `native/`: `npm run verify`; `npm run desktop:self-test`; `SYLF_DESIGN_CHECK_OUT=<dir> npm run desktop:design-check`; `SYLF_SPACES_CHECK_OUT=<dir> npm run desktop:spaces-check`; then with the tablet connected `npm run android:build`, `npm run android:smoke`, `npm run android:spaces-check -- --out=<dir>`, `npm run android:interaction-check -- --out=<file>`, `npm run android:design-check -- --out=<dir>` and `npm run android:memory-check -- --cycles=24 --rest-every=8 --sweep=spaces`.

## 10. Handoff

See the [Phase 5 handoff](../../handoffs/phase-5.md). **Phase 5 stops here. Phase 6 needs the owner's approval.**
