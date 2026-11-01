# Sylf Native — Phase 5 handoff

**Written 30 October 2026 at the end of Phase 5. Phase 5 is complete and awaiting the owner's approval. Phase 6 must not start without that approval.** This file is self-contained: a fresh session needs only the repository. Source, tests and configuration win over any prose that disagrees. Read this, then the [Spaces shell guide](../spaces/README.md), the [design system guide](../design/README.md) and [`AGENTS.md`](../../../AGENTS.md). For the stack, project rules and this machine, the [Stage 1 handoff](stage-1.md) is still current.

## 1. How this project is run (unchanged)

The owner briefs one phase at a time, and each is completed, reported and approved before the next starts. Never build ahead of the current phase. Keep the [master plan](../master-plan.md) status log, [decision records](../decisions/) and phase reports current, and write a self-contained handoff at the end of each phase. Label planning statements Confirmed, Proposed or Open. Preserve the owner's many uncommitted edits, leave the web app, backend and database alone, and **ask before** installing substantial dependencies, deleting experimental files, or changing device or system settings. The owner connects and rotates the tablet when asked. The tablet can drop off USB during long runs, so check `adb devices` first. A command that expands a shell variable inside `rm` is blocked by the harness: use literal paths. Nothing is committed.

## 2. What Phase 5 delivered

The app now opens into the Spaces shell instead of the Showcase. Details are in the [Spaces shell guide](../spaces/README.md).

- **Switcher:** a small plate at the top left holds the Spaces icon, and the plate grows into a bar with Home, Workspace and World. It closes on selection, an outside tap, Escape or Back. The Marker sits in a different cell of the icon for each Space when closed, and flies to the current tab when open.
- **Three placeholder Spaces:** Home reserves the rail column and restores its scroll position. Workspace is a dot-grid canvas. World is an entry environment with a pixel island, a demonstration game flow and Save and leave.
- **State:** `createSpacesStore` in `@sylf/spaces`, outside React, persisted through `adapters.preferences`.
- **Unloading:** one Space mounted at a time, each a separate `import()`. The Showcase replaces the Spaces.
- **Development entry:** a palette button and app links, behind `DEV_TOOLS`.

## 3. Finalized decisions

All 12 are in [ADR 0004](../decisions/0004-global-spaces-shell.md). The ones Phase 6 will meet most:

- `@sylf/spaces` has no React. UI goes in `apps/sylf/src/shell/` and `apps/sylf/src/spaces/`.
- Keep each Space's default export, so `SpaceStage` can load it lazily.
- Restorable state goes through `setSpaceSnapshot`, and a Space can unmount at any moment.
- `useShellMetrics()` gives `rail`, the column Home's rail should use, so the Spaces icon stays centered above it, and `contentTop`, which clears the corner.

## 4. Rules Phase 5 learned on the device

These came from measurements, and browser checks catch none of them.

1. **Never animate the size of a surface that has a `boxShadow`.** The GPU keeps a render target for each size: 137 MB after 30 opens. Use a transform, and put the shadow on a still layer.
2. **Never put a full-window SVG on screen.** `react-native-svg` rasterizes to a bitmap the size of the view on Android, and `resizeMode="repeat"` does the same. The dot grid cost 50 MB as an SVG and about 9 MB as shared tiles.
3. **Set `tabIndex` on web only.** On Android a `tabIndex` of -1 hides a control from TalkBack.
4. **Do not remount small, frequently used controls.** Mounting costs native memory (see §6). Keep them mounted and hidden.
5. **`uiautomator` cannot read a screen with a breathing Marker,** because the accessibility service never goes idle. Read logs instead.
6. **A sweep that peaks high hides a small leak,** because new allocations reuse free memory. Test growth from a low baseline, for several hundred repetitions.

## 5. Owner direction for the Workspace canvas

**Confirmed (30 October 2026).** The Workspace canvas is a dot grid larger than the screen. People can zoom in and out, and tools rest within the grid. Phase 5 shows a fixed grid only. Open question W5 in the [master plan](../master-plan.md#22-workspace--advanced-study-environment) covers the extent, snapping, what zoom scales, presets, and pen and gesture conflicts. Phases 7 and 8 must design panel coordinates and a saved camera around this.

## 6. Known limits and unfinished work

Listed in full in the [Phase 5 report](../reports/phase-5/report.md#8-limitations-and-untested-behavior). The ones that matter for planning:

- **Native memory grows with every mount.** A Space switch costs about 0.33 MB that is not returned, and plain React Native views and text show the same growth with no app code involved. This is below the app, in the React Native 0.88 and Hermes V1 stack. **Reproduce it in a bare app and report it upstream before Phase 8,** because Workspace will mount far more than these placeholders. It is the top open technical item.
- **iOS and iPadOS never built or run.** Unresolved until real iPad testing (owner). The Swift code is uncompiled, and the Spaces shell has never run there.
- **Windows not run. TalkBack not run** (tree audit only). **S Pen, physical keyboard and mouse on the tablet not exercised.**
- **Keyboard shortcuts for Spaces are not built** (Phase 10). `Press`'s `hint` still does not map on web.

## 7. Phase 6 — Home Interface Template (only after approval)

**Prerequisite:** the owner approves Phase 5 and briefs Phase 6. The brief takes precedence over this summary.

- Replace the placeholder in `apps/sylf/src/spaces/home/` with the Home template: the compact vertical rail (Today, Focus, Circle, Progress) and empty destination templates. Master plan §2.1 has the proposed rail behavior.
- Use the reserved rail column (`useShellMetrics().rail`). The Spaces icon stays at the top of it.
- Save the destination, and each destination's scroll position, as Home's snapshot. Replace the current single `scrollY`.
- Read open questions H1 to H3 in master plan §8.2 first.
- Check Home's memory with `android:memory-check`, and add a sweep through the destinations.
- No backend. Follow the typed mock adapter approach in master plan §5.4.

## 8. Commands (run from `native/`)

```bash
npm run verify
npm run web
npm run desktop:self-test
SYLF_DESIGN_CHECK_OUT=<dir> npm run desktop:design-check
SYLF_SPACES_CHECK_OUT=<dir> npm run desktop:spaces-check
npm run android:build             # needs JAVA_HOME (JDK 17) and ANDROID_HOME (see the Stage 1 handoff)
npm run android:smoke
npm run android:spaces-check -- --out=<dir>
npm run android:design-check -- --out=<dir>
npm run android:interaction-check -- --out=<file>
npm run android:memory-check -- --cycles=24 --rest-every=8 --sweep=spaces --out=<file>
```

A real pop-up window can be driven over ADB with no setting changed: `adb shell am start -n app.sylf.client/.MainActivity --windowingMode 5`, then `adb shell cmd activity task resize <task> <left> <top> <right> <bottom>`. These captures can include the owner's home screen, so crop them to the window before saving them as evidence.

Root web checks are unchanged. The known baseline of 35 to 36 failing root tests is unchanged.
