# Sylf Native — Phase 4 report: UI Design System and Theme Studio

**30 October 2026. Status: complete, awaiting approval.** Decisions are in [ADR 0003](../../decisions/0003-design-system-and-theme-engine.md), the contract is the [design system guide](../../design/README.md) and [component reference](../../design/components.md), and the entry point for the next session is the [Phase 4 handoff](../../handoffs/phase-4.md). The code is in [`native/packages/design-system`](../../../../native/packages/design-system/). The owner's brief grew during the phase (appearance customization, then six themes and a Theme Studio, then the handoff); all of it is covered here.

## Summary

| Deliverable | Result |
| --- | --- |
| Original visual identity and philosophy | **Aloft**: surfaces held in quiet air, with one point of light (the Marker) showing what is alive. Documented in the design guide §1. |
| Tokens, themes, components, primitives | A theme engine of 15 independent axes; an OKLCH palette solver; six themes; 3 type roles with 13 bundled OFL families; 61 original icons; 40+ components and primitives. |
| Theme Studio | Live previews rendered by the real engine, undo and redo, Revert, Save as, System/Day/Night, color picker, type, surface, feel and access sections. |
| Preserved web capabilities | Light and dark; custom accent and background; all 8 accent and 9 background presets and all legacy ids; recents; hex entry; reset; keyboard adjustment; account import and export of `activeTheme` and `activeBackground` (not connected). |
| Design System Showcase | 16 chapters in the native app, with deep links that select a chapter, theme and mode. |
| Verified on the Android tablet | **Yes.** Galaxy Tab S9 FE: smoke 4/4, design sweep (24 renders) with 0 crashes, real-input interaction check 9/9. Landscape and portrait captured. |
| Verified on Electron | **Yes.** macOS, Electron 45.1.0: security self-test 11/11, design check 19/19. |
| Performance, accessibility, responsive checks | Measured; see §3–§5. Untested platform behavior is listed in §7. |
| Documentation | Design guide, component reference, ADR 0003, this report, the Phase 4 handoff, and updated master plan and indexes. |
| Web app, backend, database | Unchanged. The only file outside `native/` and `documentation/native/` is a new `.claude/launch.json` (a dev-preview entry). |

## 1. What was built

```
native/packages/design-system/
├── assets/fonts/                30 OFL TTFs (13 families), licenses beside them
└── src/
    ├── color/      oklch.ts, palette.ts           perceptual math and the contrast solver
    ├── theme/      axes, fonts, presets, preference, store, resolve, context, font-loader(.web)
    ├── runtime/    motion, input, dismiss, focus-trap(.web), system(.web), input-listeners(.web)
    ├── primitives/ Press, Text, Plane, Marker, Layout
    ├── components/ Button, Selection, Slider, Field, Overlays, Feedback, Structure
    ├── logic/      geometry.ts (placement, split, clamp) with tests
    ├── studio/     ThemeStudio, ColorPicker
    └── icons.tsx   61 icons and SylfMark
native/apps/sylf/src/App.tsx, showcase/   the Showcase (replaces the Phase 3 diagnostics screen, which lives on as the System chapter)
```

Other native changes: a synchronous preferences adapter (`SharedPreferences` / `UserDefaults` / `localStorage`) in `@sylf/platform` and `@sylf/native-platform`; the `expo-font` plugin in `app.config.ts`; Electron host updates (verification mode, throwaway profile for checks, polarity-matched startup color); three verification tools (below); the single-copy audit now also covers Reanimated, Worklets, Gesture Handler, SVG and safe-area-context.

**The six themes** differ on every structural axis. A unit test enforces it.

| Theme | Character | Distinguishing choices |
| --- | --- | --- |
| Sylf Signature | Quiet, held in air | Newsreader, soft corners, tonal depth, a mote on an arcing flight |
| Studio | Exact, dense | IBM Plex, precise corners, hairlines, compact density, a snapping bar |
| Arcane | Inlaid gold and old light | Cinzel, double-ruled inlay, ornamental corners, a glowing drifting rune |
| Voxel | A block you can press | Pixelify and Jersey 10, square corners, extruded buttons that sink, 12 fps stepped motion |
| Cozy | Warm and soft | Fraunces and Nunito, pillow corners, plush shadows, a hopping bead, spacious density |
| Student | Set like a book | Literata, folio corners, paper, small caps, a pen rule, page-turn motion |

## 2. Unit and static checks (`native/`)

| Check | Result |
| --- | --- |
| `npm run typecheck` (React Native/web and Electron programs) | Pass, 0 errors |
| `npm run lint` | Pass, 0 problems |
| `npm run test` | Pass: 57 tests in 7 files |
| Contrast guarantees | Hold for all 6 presets in both modes, at normal and More contrast, in all 3 presences; for every web swatch pairing (8 accents against 9 grounds); and for **4,000 random color pairs** |
| `check:boundaries`, `check:single-copy` | Pass, 0 violations |
| `build:web` | Pass |

The random-color test earned its place. It caught three real contrast failures during development (an accent wash that cost text its contrast, surface steps that shifted the ground's luminance, and a signal-tone wash on a pale ground), all fixed in the solver.

**Not run this phase:** the root web checks (`tsc`, `eslint`, root Vitest). No root file was edited, so the Phase 3 baseline stands unchanged.

## 3. Electron on macOS (Electron 45.1.0, Chromium 156)

Evidence: [`evidence/electron-self-test.json`](evidence/electron-self-test.json), [`evidence/electron/electron-design-check.json`](evidence/electron/electron-design-check.json), and 48 screenshots in [`evidence/electron/`](evidence/electron/).

| Check | Result |
| --- | --- |
| Security self-test (sandbox, isolation, CSP, no Node, no navigation) | **11/11.** Fonts, Reanimated and SVG all run under the strict CSP |
| Design check | **19/19** (list below) |

The design check drives the real window: every theme in light and dark (12 combinations) across Theme Studio, Controls and Overlays; fonts loading on demand; Tab reaching controls; Enter activating; focus moving into, trapped in and restored from a dialog; Escape closing; hover tooltip; right-click context menu; slider drag by mouse and by arrow key; no horizontal overflow at 1280, 820 and 480 px wide; system reduced-motion and More contrast honored; persistence across a reload; and no console errors.

| Measure | Value |
| --- | --- |
| Marker animation while switching tabs every 240 ms | 145 frames, **p50 16.7 ms, p95 16.8 ms, max 17.6 ms** (60 Hz) |
| Theme switch to first changed frame (8 switches) | **49.6 to 54.8 ms** |
| Launch to foundation report | 1.2 s |
| Working set | 387 MB at startup; 544 MB after exercising all themes and chapters (Phase 3: 367–439 MB) |

Screenshots: [Signature by day](evidence/electron/theme-signature-light-studio.png), [Signature controls at night](evidence/electron/theme-signature-dark-controls.png), [Voxel](evidence/electron/theme-voxel-dark-controls.png), [keyboard focus ring](evidence/electron/keyboard-focus-ring.png), [compact window](evidence/electron/window-compact-studio.png), [reduced motion in Cozy](evidence/electron/reduced-motion-more-contrast.png).

## 4. Android on Galaxy Tab S9 FE (SM-X510, Android 16, 1440×2304 at 280 dpi, system font scale 1.15)

Evidence: [`evidence/android-smoke.json`](evidence/android-smoke.json) and [`evidence/android/`](evidence/android/) (`android-design-check.json`, `android-interaction-check.json`, 28 screenshots including portrait).

| Check | Result |
| --- | --- |
| Smoke (native runtime, shared-code parity on Hermes, crypto) | **4/4** |
| Design sweep: 6 themes × 2 modes × 2 chapters | **24 renders, 0 crashes** |
| Real-input interaction check (adb taps, long press, swipes, Back) | **9/9**: touch opens dialog; hardware Back closes only the topmost overlay; dragging a sheet away dismisses it; long press opens the context menu; the slider is in the accessibility tree and a touch drag moved it 40% to 85%; a chosen theme survives a process kill (SharedPreferences); no crashes |
| Accessibility tree | 40 clickable elements, **0 unnamed** |
| Portrait | Captured. The 823 dp wide window is in the medium class: live preview stacks above the controls, theme tiles stay three across, nothing clips ([portrait Studio](evidence/android/portrait-studio.png)) |
| Safe areas | The Phase 3 issue (title under the status bar) is fixed |

| Measure | Value | Phase 3 |
| --- | --- | --- |
| Cold start (`am start -W`, release) | **263 ms median** (236, 263, 263) | 244–280 ms |
| Memory at launch (PSS) | **98 MB** | 98 MB |
| Memory after the 24-render sweep and scrolling | 245 MB | not measured |
| Frames while scrolling a heavy chapter (`gfxinfo`) | 713 frames, **1 janky (0.14%)**; frame time p50 8 ms, p99 10 ms | not measured |
| APK (arm64) | 30.2 MiB | 21.7 MiB |

Screenshots: [Cozy by day](evidence/android/theme-cozy-light-studio.png), [Arcane controls at night](evidence/android/theme-arcane-dark-controls.png), [portrait Studio](evidence/android/portrait-studio.png).

## 5. Defects that verification found, and what was done

| Where found | Defect | Resolution |
| --- | --- | --- |
| Tablet | **Crash** (`Cannot read property 'split' of null`): switching from a theme whose text sets `fontVariant: ["tabular-nums"]` to one that passes `undefined` makes the Android renderer pass `null` to React Native's `processFontVariant`. Web does not do this, so browser and Electron runs could not catch it. | Always an array (`tabularVariant()`), with a regression test. Re-sweep: 0 crashes |
| Tablet | **Sliders, progress bars, meters and avatars were missing from the accessibility tree**, so TalkBack users could not reach a slider. The audit of clickable elements had missed it. | `accessible` on those views; the interaction check now asserts the slider is present |
| Tablet audit | Toggles had a 54×38 touch area | Hit area is now at least 44 pt tall |
| Electron | Enter appeared not to activate a focused button | Not an app bug: confirmed with real key events in the browser. Electron's synthetic key input needs a character event for native buttons; the harness was fixed |
| Browser | Chip text dimmed after a tap; section tabs truncated their last label | Fixed |
| Unit fuzz | Three contrast failures in the palette solver (see §2) | Fixed in the solver |

## 6. Changes to earlier decisions and documents

- ADR 0001 lists Skia for custom drawing. Phase 4 used `react-native-svg` instead because nothing needed a canvas (ADR 0003 #17). Skia remains available for ink and World.
- The adapter set gained `preferences` (ADR 0002 #6).
- The Phase 3 diagnostics screen was replaced as the app's root, as the Stage 1 handoff allowed. Its `SYLF_FOUNDATION` and `SYLF_WINDOW` logs are kept because the automated checks read them.

## 7. Limitations and untested behavior

- **iOS and iPadOS: not built or run.** The Swift preferences functions are uncompiled, and Apple Pencil, Stage Manager and WKWebView are untested. The iOS gate before Phase 5 tablet work still stands.
- **Windows: not run.**
- **Screen reader:** TalkBack was not run. Only the accessibility tree was audited (names and roles), so spoken output, focus order and slider adjustment by gesture are unverified.
- **Stylus:** the S Pen was not exercised. Touch was tested with `adb`, and mouse and keyboard in Electron used synthetic events, not physical hardware. `useInputMode` never reports pen on native.
- **Orientation and windowing:** landscape and portrait only, with one portrait capture inspected. Split screen, freeform windows and a runtime window resize on the tablet were not tested. Only the tablet's existing 1.15 font scale was used.
- **Android More contrast** (system setting) was not toggled. Electron emulated it.
- **Frame rate:** the tablet ran at 60 Hz. 90 and 120 Hz were not measured.
- **Memory:** 245 MB after the full sweep versus 98 MB at launch. The cause is unprofiled and is not compared with the Hermes V1 and Reanimated memory regression Expo noted for SDK 56–57. Profile before Phase 16.
- **Touch target measurement:** `uiautomator` reports view bounds, not hit slop, so it still flags three controls (an IconButton and two Toggles) as under 44 pt. They are 44 pt or more by construction; this was not measured.
- **Visual coverage:** ~75 screenshots were captured, and not all were individually inspected. Inspected in detail: Signature by day and night, Voxel, Cozy and Arcane on the tablet, compact windows, the keyboard focus ring and reduced motion. The Color, Type, Icons, Fields, Feedback, Layout and Input chapters, the color picker's Fine tune panel, and custom colors were exercised by tests and scripts but not reviewed visually.
- **Known small issues:** the chapter tabs in the Showcase clip their last item with no scroll hint; the `Press` hint prop does not map on web.
- **Not connected:** account sync of theme choices (Phase 13) and Focus backdrops (they stay with the existing catalog).
- Performance figures are experimental single-device measurements, not guarantees.

## 8. Reproducing

From `native/`: `npm run verify`; `npm run desktop:self-test`; `SYLF_DESIGN_CHECK_OUT=<dir> npm run desktop:design-check`; `npm run android:build`, `npm run android:smoke`, `npm run android:design-check -- --out=<dir>` and `npm run android:interaction-check -- --out=<file>` with the tablet connected. The Android toolchain paths are in the [Stage 1 handoff](../../handoffs/stage-1.md#6-commands).

## 9. Handoff

See the [Phase 4 handoff](../../handoffs/phase-4.md). **Phase 4 stops here. Phase 5 needs the owner's approval.**
