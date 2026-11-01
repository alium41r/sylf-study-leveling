# Sylf Native — Phase 4 handoff

**Written 30 October 2026 at the end of Phase 4. Phase 4 is complete and awaiting the owner's approval. Phase 5 must not start without that approval.** This file is self-contained: a fresh session needs only the repository. Source, tests and configuration win over any prose that disagrees. Read this, then the [design system guide](../design/README.md), then [`AGENTS.md`](../../../AGENTS.md). For the stack, project rules and this machine, the [Stage 1 handoff](stage-1.md) is still current.

## 1. How this project is run (unchanged)

The owner briefs one phase at a time, and each is completed, reported and approved before the next starts. Never build ahead of the current phase. Keep the [master plan](../master-plan.md) status log, [decision records](../decisions/) and phase reports current, and write a self-contained handoff at the end of each stage. Label planning statements Confirmed, Proposed or Open. Preserve the owner's many uncommitted edits, leave the web app, backend and database alone, and **ask before** installing substantial dependencies, deleting experimental files, or changing device or system settings. The owner connects and rotates the tablet when asked. A command that expands a shell variable inside `rm` is blocked by the harness: use literal paths.

## 2. Confirmed requirements for Phase 4 (all delivered)

1. An original, premium native design system for desktop and tablet: tokens, themes, reusable components, a Showcase, with verification on the Android tablet and Electron, and untested behavior called out. The web app is a reference for functionality, branding and preferences only.
2. Preserve and significantly improve the web's appearance customization, without copying its interface.
3. **Six themes** with genuinely distinct identities (Sylf Signature, Studio, Arcane, Voxel, Cozy, Student), a unified semantic-token engine, and customization of fonts, typography, colors, backgrounds, surface materials, corner shapes, density and animation intensity. Light and dark, live previews, saved custom themes, persistent local preferences, accessible contrast, consistent navigation. **Themes must never alter notes, handwriting, PDFs or document formatting.** Per-Space themes are a future consideration only.
4. No application pages, no backend connection, and a mandatory handoff.

## 3. What exists

Everything is described in the [design guide](../design/README.md) and [component reference](../design/components.md). In short:

- **Engine** (`native/packages/design-system/src/`): `color/` (OKLCH math, contrast solver), `theme/` (axes, fonts, presets, preference, store, resolve, context), `runtime/` (motion, input mode, dismiss stack, focus trap, system signals), `primitives/`, `components/`, `logic/geometry.ts`, `studio/` (ThemeStudio, ColorPicker), `icons.tsx` (61 icons, `SylfMark`).
- **Fonts:** 30 OFL TTFs, 13 families, in `assets/fonts/`. Native embeds them with the `expo-font` plugin (`apps/sylf/app.config.ts`). Web loads the faces in use.
- **Showcase:** `native/apps/sylf/src/App.tsx` and `showcase/`. Deep links: `?chapter=<id>&theme=<id>&mode=light|dark|system` on web, and `sylf-native://showcase?...` on Android. Chapter ids: identity, studio, color, type, shape, icons, personalities, controls, fields, overlays, feedback, layout, motion, input, documents, system.
- **Platform:** `adapters.preferences` in `@sylf/platform` (`SharedPreferences`, `UserDefaults`, `localStorage`), and `getPreference` and `setPreference` in the native module.
- **Tools:** `apps/desktop/src/design-check.mjs`, `tooling/checks/android-design-check.mjs`, `tooling/checks/android-interaction-check.mjs`.
- **Dependencies added** (Expo SDK 58 pins): `react-native-reanimated` 4.7.1, `react-native-worklets` 0.13.0, `react-native-gesture-handler` ~3.3.0, `react-native-svg` 15.16.0, `react-native-safe-area-context` ~5.10.1, `expo-system-ui` ~58.0.7, `expo-font` ~58.0.11. Skia was not added.
- **Outside `native/` and `documentation/native/`:** only `.claude/launch.json` (a `native-web` dev-preview entry). Nothing is committed.

## 4. Finalized decisions

All 19 are in [ADR 0003](../decisions/0003-design-system-and-theme-engine.md). The ones later phases will meet most:

- Components read **semantic tokens** from `useTheme()` and **never branch on a theme id**. Layout and navigation are not theme axes.
- Colors are **solved** against their surfaces, with guaranteed contrast, so a custom accent or background stays readable.
- Each theme has a **Day and a Night ground**. Mode is System, Day or Night.
- Changes **apply live with undo**, not draft-and-apply.
- **Preferences live outside React**, read synchronously before the first frame.
- `DocumentSurface` is the boundary for authored content and reads nothing from the theme.
- `ThemeScope` is the hook for per-Space themes.
- All motion goes through `move()` and `fade()`; all interactive surfaces are a `Press`.

## 5. Verification results

Full results, numbers and screenshots are in the [Phase 4 report](../reports/phase-4/report.md). Summary:

| Area | Result |
| --- | --- |
| `npm run verify` in `native/` | Pass: typecheck, lint, 57 tests (including 4,000 random color pairs), boundaries, single copy, web build |
| Electron 45.1.0, macOS | Self-test 11/11; design check 19/19; marker p95 16.8 ms; theme switch about 50 ms; no console errors |
| Galaxy Tab S9 FE | Smoke 4/4, cold start 263 ms, 98 MB at launch; 24-render sweep with 0 crashes; real-input check 9/9; accessibility tree 0 unnamed; portrait captured |
| Defects found by verification | A device-only Android crash, sliders absent from the accessibility tree, a toggle touch area, and three contrast edge cases. All fixed, and regression-tested where possible |

## 6. Known limits and unfinished work

Listed in full in [report §7](../reports/phase-4/report.md#7-limitations-and-untested-behavior). The ones that matter for planning:

- **iOS and iPadOS never built or run.** The Swift preferences functions are uncompiled. This is still a **gate before Phase 5 tablet work** (needs Xcode 26.4 or later, or EAS Build, plus an iPad).
- **Windows not run.**
- **TalkBack not run** (tree audit only), **S Pen not exercised**, no split-screen, freeform or runtime-resize test on the tablet, only font scale 1.15, 60 Hz only.
- **Memory:** 245 MB on Android after the full sweep (98 MB at launch) is unprofiled. Check it against the Hermes V1 and Reanimated regression before Phase 16.
- **Not visually reviewed:** the Color, Type, Icons, Fields, Feedback, Layout and Input chapters, the color picker's Fine tune panel, and custom colors, although they ran without errors and the contrast logic is tested.
- Small issues: Showcase chapter tabs clip the last item with no scroll hint; `Press`'s `hint` does not map on web.
- **Not connected:** theme sync to the account (Phase 13). The two account fields round-trip through `fromWebAccount` and `toWebAccount`; the rest of a theme stays on the device until then.
- **Open (owner):** whether users want per-Space themes at all; Focus backdrops stay with the existing catalog and arrive with Focus.

## 7. Using the system in Phase 5 and later

1. Wrap the app as `App.tsx` does (appearance store outside React, then `AppearanceProvider`, `NoticeHost`, `OverlayHost`).
2. Build from `Press`, `Text`, `Plane` and the components. Never hardcode a color, font, radius or duration. If a token is missing, add it to the engine.
3. Use `useWindowClass()` for layout and never the device type. Use `SafeArea` for insets.
4. Use `role` and `aria-*` (they work on both runtimes) and **give every non-button control `accessible`**, or Android will not expose it. Give every control a name.
5. Run on the tablet early. Two of the worst defects this phase only appeared on the device.
6. Keep the **Showcase** current when adding a component, and check it in all six themes.

## 8. Phase 5 — Global Sylf Spaces System (only after approval)

**Prerequisites:** the owner approves Phase 4, and the owner resolves or explicitly waives the iOS gate.

- Build the global switcher from master plan §3.1: one persistent Spaces icon at the top left that expands a short horizontal Home / Workspace / World bar, and closes on selection, an outside tap or Escape. The bar is a labelled tab list with keyboard and reduced-motion variants. World's own exit flow takes priority while playing.
- Use the existing parts: `Press`, `TravellingMarker` for the current Space, `move()`, `useDismiss`, `useWindowClass`, `SafeArea`, the `spaces` icon, and the `@sylf/spaces` package (`SpaceId`, `availableSpaces`, `SpacesRestorationState`).
- **Persist `SpacesRestorationState` outside React**, like the appearance store: Phase 2 saw Android recreate the React root.
- Do **not** build Home, Workspace, World, the Command Center or any feature page. Those are Phases 6 to 9. Use empty placeholders only.
- `App.tsx` currently mounts the Showcase. Keep it reachable as a development tool, and keep the `SYLF_FOUNDATION` and `SYLF_WINDOW` logs that automated checks read.
- Read the open questions first: W1, H1 to H3, G1 and C1 in master plan §8.2. Keyboard shortcuts for switching need checking against iPadOS and Android system shortcuts (Phase 10).
- Verify as this phase did: `npm run verify`, the Electron checks, and the Android smoke, design and interaction checks on the tablet, with new interaction cases added to the harness.

## 9. Commands (run from `native/`)

```bash
npm run verify
npm run web                       # Expo web dev server (deep links: ?chapter=studio&theme=voxel&mode=light)
npm run desktop:self-test
SYLF_DESIGN_CHECK_OUT=<dir> npm run desktop:design-check
npm run android:build             # needs JAVA_HOME (JDK 17) and ANDROID_HOME (see the Stage 1 handoff)
npm run android:smoke
npm run android:design-check -- --out=<dir>
npm run android:interaction-check -- --out=<file>
```

Root web checks are unchanged (`npx tsc --noEmit`, `npx eslint <files>`, `npm run test -- --run` from the repository root; use `NODE_OPTIONS=--max-old-space-size=4096` for `tsc` on this 8 GB Mac). The known baseline of 35 to 36 failing root tests is unchanged.
