# Sylf Native — Phase 6 handoff

**Written 30 October 2026 at the end of Phase 6. Phase 6 is complete and awaiting the owner's approval. Phase 7 must not start without that approval.** This file is self-contained: a fresh session needs only the repository. Source, tests and configuration win over any prose that disagrees. Read this, then the [Home guide](../home/README.md), the [Spaces shell guide](../spaces/README.md), the [design system guide](../design/README.md) and [`AGENTS.md`](../../../AGENTS.md). For the stack and this machine, the [Stage 1 handoff](stage-1.md) is still current.

## 1. How this project is run

The owner briefs one phase at a time, and each is completed, reported and approved before the next starts. Never build ahead of the current phase. Keep the [master plan](../master-plan.md) status log, [decision records](../decisions/) and phase reports current, and write a self-contained handoff at the end of each phase. Label planning statements Confirmed, Proposed or Open. Preserve the owner's many uncommitted edits, leave the web app, backend and database alone, and **ask before** installing substantial dependencies, deleting experimental files, or changing device or system settings. Nothing is committed, and all of `native/` is untracked.

**New rule (Confirmed, applies to every phase).** Sylf Native is a completely redesigned frontend, not a new backend or product. Before adding a feature, name the existing model, route or `lib/` owner it will use. A feature needing significant backend work is deferred and written down as a future possibility. See [master plan §7.3](../master-plan.md#73-scope-boundaries).

**The tablet.** It can drop off USB, so check `adb devices`. Installing a build can raise an **Avast One** "Suspicious app" dialog or a **Google Play Protect** "Send app for a security check?" dialog. Each blocks automated runs. These are the owner's security software, so do not dismiss them or change their settings: stop and ask. After an install, check `adb shell dumpsys window | grep mCurrentFocus` before a run. Play Protect sending the app to Google would upload an unreleased build, and the owner chose not to. USB does not charge the tablet, and it lost about 20% over a full run.

## 2. What Phase 6 delivered

Home is a complete frontend template: a rail, Today, Focus, Circle and Progress, each with loading, empty and sample states. Details are in the [Home guide](../home/README.md).

- **Rail:** `HomeRail.tsx`, in the column under the Spaces icon, with visible labels. Under 600 pt it is a bottom bar, from the same element.
- **Today:** the day as one line with the Marker on the next item, then objectives and quick actions that navigate for real.
- **Focus:** an instrument. Begin is disabled and says why. A study desk is a focus background.
- **Circle:** people around a ring, then people and parties.
- **Progress:** level, three numbers, a week chart, subjects, achievements.
- **State:** `createHomeNavigation(store)` in `@sylf/spaces`, outside React, writing through the Spaces store's `home` snapshot.
- **Data:** typed view models in `spaces/home/data/`. Every result carries `provenance`, which drives the Sample data badge. Without `DEV_TOOLS`, Home binds the empty adapter.

## 3. Finalized decisions

All 20 are in [ADR 0005](../decisions/0005-home-interface-template.md). The ones Phase 7 will meet most:

- **Keep what is switched often mounted and hidden.** Over 240 changes this held 55 MB of native heap, flat, against 73 to 94 MB when remounting. Hide with opacity 0, no touches, out of the accessibility tree, and `visibility: hidden` on web. **Not `display: none`,** because Fabric drops the native views.
- **`provenance` drives notices.** Screens never decide what is sample.
- **Real where it can be, disabled and explained where it cannot.**
- **Text is `soft` or stronger.** `faint` is 3:1, for marks.
- **A line-shaped Marker is wide.** Never size a dot from `marker.width`.

## 4. Rules learned on the device

Phase 5's rules still hold, and the Spaces guide has them: no animated size on a surface with a shadow, no full-window SVG, `tabIndex` on web only, no remounting small frequent controls, no breathing Marker where `uiautomator` must read, and test growth from a low baseline.

New in Phase 6:

1. **Only a tall window can measure scrolling.** A full landscape page barely scrolls, and the count comes back invalid.
2. **Plant saved state from a page with no app on it.** The app writes its state as it unloads.
3. **`wm size` gives the physical size.** Use `cur=` from `dumpsys window displays` for orientation.
4. **`input keyevent` reaches Pressables.** Tab, D-pad and Enter work on Android and show the focus ring.

## 5. Known limits and unfinished work

Listed in full in the [Phase 6 report](../reports/phase-6/report.md#8-limitations-and-untested-behavior). The ones that matter for planning:

- **Risk R15 stays open, and a bare-app reproduction is still due before Phase 8.** Home re-entry levelled off at about 104 MB of native heap over 120 cycles, unlike Phase 5's straight line, and the reason is not established. A high peak can hide a small leak.
- **Home's scrolling shows 2.64% to 3.72% janky frames** in a pop-up window, against 0.14% for the Showcase. No valid full-screen figure exists, and it is not explained. Worth a look before Workspace adds more.
- **iOS and iPadOS never built or run. Windows not run. TalkBack not run.** S Pen, a real keyboard and a mouse on the tablet are not exercised.
- **Owner decisions outstanding:** H1 to H3 stay on their defaults, and T1 (Student or Scholar) is open.
- **For release:** the APK uses the public debug key and carries `SYSTEM_ALERT_WINDOW`. A real signing key and removing that permission belong to the release work.

## 6. Phase 7 — Workspace Interface Template (only after approval)

**Prerequisite:** the owner approves Phase 6 and briefs Phase 7. The brief takes precedence over this summary.

The roadmap makes Phase 7 the Workspace template and Phase 8 the Command Center. Read [master plan §2.2 and §3.3](../master-plan.md#22-workspace--advanced-study-environment) first.

- Replace the placeholder inside `apps/sylf/src/spaces/workspace/`, and keep the default export.
- **The dot grid stays until the owner's brief changes it.** Owner direction (Confirmed): the canvas is a dot grid larger than the screen, people can zoom, and tools rest within the grid. Open question W5 covers the extent, snapping, what zoom scales, presets, and pen and gesture conflicts. Design panel coordinates and a saved camera around this.
- **W1 must be settled before Phase 7:** how the Workspace Space and Study Workspaces relate ([master plan §8.2](../master-plan.md#82-open-product-questions)). W2 to W4 are due in Phases 7 and 8.
- **Name a backend owner for each tool** before building its template: Notes, Planner, Calendar, Sylvie, Timer, Calculator, Audio, PDFs, Whiteboard, Resources. Follow [Home guide §4](../home/README.md#4-backend-compatibility) as the pattern, and [Home guide §7](../home/README.md#7-data) for adapters.
- Save the layout and camera through `setSpaceSnapshot`. Do not add a second persistence path.
- Never put the grid in a full-window SVG (Phase 5 rule 2). It is 25 or so tiles sharing one bitmap.
- Reuse `HomePage`-style ideas only where they fit. Workspace has no rail and no permanent sidebar (Confirmed).
- Extend `android:memory-check` with a Workspace sweep from a low baseline, and add a `desktop:workspace-check` in the style of `home-check.mjs`.

## 7. Commands (run from `native/`)

```bash
npm run verify
npm run web
npm run desktop:self-test
SYLF_DESIGN_CHECK_OUT=<dir> npm run desktop:design-check
SYLF_SPACES_CHECK_OUT=<dir> npm run desktop:spaces-check
SYLF_HOME_CHECK_OUT=<dir> npm run desktop:home-check
npm run android:build             # needs JAVA_HOME (JDK 17) and ANDROID_HOME (see the Stage 1 handoff)
npm run android:smoke
npm run android:home-check -- --out=<dir>
npm run android:spaces-check -- --out=<dir>
npm run android:design-check -- --out=<dir>
npm run android:interaction-check -- --out=<file>
npm run android:memory-check -- --sweep=destinations --cycles=60 --rest-every=15 --wait=350 --budget-native=5
npm run android:memory-check -- --sweep=homeEntry --cycles=48 --rest-every=12 --wait=500 --budget-native=10
```

`SYLF_HOME_CHECK_ONLY=capture` with `SYLF_HOME_THEMES`, `SYLF_HOME_MODES`, `SYLF_HOME_WIDTH` and `SYLF_HOME_HEIGHT` captures destinations without the full check. A build takes about 4 minutes. Root `npx tsc --noEmit` needs `NODE_OPTIONS=--max-old-space-size=4096` on this Mac. Root web checks are unchanged, and the known baseline of 35 to 36 failing root tests is unchanged.
