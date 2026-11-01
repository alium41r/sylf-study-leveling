# ADR 0003 — Design system and theme engine

**Status: Accepted with Phase 4 (30 October 2026), subject to the owner's Phase 4 review.** This builds on [ADR 0001](0001-technology-stack.md) and [ADR 0002](0002-native-workspace-foundation.md). The current contract is the [design system guide](../design/README.md), and the evidence is in the [Phase 4 report](../reports/phase-4/report.md).

Labels follow the master plan: **Confirmed** came from the owner's briefs, **Proposed** is a Phase 4 decision the owner can still change.

## Decisions

| # | Decision | Status | Why |
| --- | --- | --- | --- |
| 1 | The design philosophy is **Aloft**: surfaces held in quiet air, with one point of light (the **Marker**) showing what is alive now. | Proposed | The brief asked for an original identity that is not a port of the web app. Sylf means *sylph* (air), and its pixel-art lineage becomes the Marker and the discrete meters. |
| 2 | A theme is **data across 15 independent axes**, not a palette. Components read semantic tokens from `useTheme()` and **never branch on a theme id**. A new personality is one entry in `presets.ts`. | Proposed | The brief required themes that differ in more than color, and an engine that scales. Independent axes let users mix them (Voxel's corners with Student's type). |
| 3 | **Layout, hierarchy and navigation are not theme axes.** | Confirmed (consistent navigation) | Personality must not change where things are. |
| 4 | **Six built-in themes**: Sylf Signature (default), Studio, Arcane, Voxel, Cozy, Student. They differ on type, shape, material, marker, motion and icon style, and a unit test enforces it. | Confirmed list, Proposed definitions | Owner brief. |
| 5 | Colors are **solved against the surfaces they sit on**, in OKLCH, instead of being picked from a table. Guarantees: ink, soft ink, accent text and signal text reach 4.5:1; faint ink, focus, marks and strong lines reach 3:1; labels on fills reach 4.5:1, on all five surfaces. Tests cover 4,000 random color pairs. | Proposed | Custom accent and background colors are a user preference that must stay accessible. `lib/color-utils.ts` supplies only WCAG math, legacy tables and validation, as the master plan §7.2 requires. |
| 6 | The user's **exact accent is kept** when it is visible on the ground. If not, only its lightness moves, and the Studio says so. On mid-tone grounds, surface steps and washes compress before text loses contrast. | Proposed | Respect the user's choice without ever shipping unreadable text. |
| 7 | Each theme carries a **Day ground and a Night ground**; mode is System, Day or Night. | Proposed | The web stores one background for both modes, which makes following the system appearance impossible. |
| 8 | Changes **apply immediately with undo and redo**, plus Revert and Save as. Drags update only preview scopes and commit once on release. | Proposed | Replaces the web's draft-then-apply with something faster to explore and safe to try. |
| 9 | **Three type roles**, each with a rule: Voice (titles, quotations), Interface (must stay legible at 12 pt), Instrument (must have equal-width digits). Rules were measured from the font tables and are enforced in the catalog and in `normalizeAxes()`. | Proposed | A running timer must not jitter, and display-only faces must not run small controls. |
| 10 | Fonts are **vendored SIL OFL static TTFs** (13 families, 30 files, 4.4 MB) in `packages/design-system/assets/fonts/`, named by PostScript name. Native embeds all of them at build time through the `expo-font` config plugin. Web and desktop load only the faces in use. | Proposed | No network at runtime, no flash of fallback text, one family string on every platform. Costs part of the APK growth (21.7 to 30.2 MiB, which also includes the motion, gesture and SVG libraries). |
| 11 | **Motion goes through one function** (`move()` / `fade()`). Character (six springs), intensity (Still to Expressive) and reduced motion all apply there. System reduced motion always wins. Stepped themes quantize to 12 fps. | Proposed | One place to make motion consistent and accessible. |
| 12 | **Preferences live outside React**, read synchronously before the first frame, through a new `adapters.preferences` (`SharedPreferences`, `UserDefaults`, `localStorage`). Corrupt records fall back to defaults and every value is validated on load. | Proposed | Phase 2 saw Android recreate the React root, and the first frame must wear the right theme. |
| 13 | The **web account bridge** (`fromWebAccount`, `toWebAccount`) maps losslessly to `activeTheme` and `activeBackground`. Schema defaults (`default`, `none`) and the server's `simple` mean no choice and import as Signature. Nothing is connected: backend sync is Phase 13. | Proposed | Existing users keep their choices without being frozen on the old default look. |
| 14 | **Themes never touch authored content.** `DocumentSurface` reads nothing from the theme, and the palette has no paper or ink tokens by design. | Confirmed | Owner brief. |
| 15 | **`ThemeScope` re-themes any subtree** and is how previews work. Per-Space themes later means adding a `spaces` map to the preference and wrapping each Space. No component needs to change. | Proposed | Meets the brief's "consider per-Space themes as a future capability" without building it. |
| 16 | **Icons are original** (61, on a 20-unit grid, drawn with `react-native-svg`). Most are one line drawing plus one filled mark that takes the theme's marker shape. | Proposed | No icon library imposes another identity, and the Marker is repeated in miniature. |
| 17 | **Dependencies added at Expo's SDK 58 pins:** `react-native-reanimated` 4.7.1, `react-native-worklets` 0.13.0, `react-native-gesture-handler` ~3.3.0, `react-native-svg` 15.16.0, `react-native-safe-area-context` ~5.10.1, `expo-system-ui` ~58.0.7, `expo-font` ~58.0.11. Skia was **not** added. | Proposed | Phase 2 named the first three, plus Skia for custom drawing. Nothing in Phase 4 needs a canvas, and SVG covers icons and color tracks without 7–8 MB of WebAssembly on desktop. The single-copy audit now covers them. |
| 18 | The Phase 3 **foundation report stays** (`SYLF_FOUNDATION`, `SYLF_WINDOW`) and a System chapter in the showcase keeps the diagnostics. | Proposed | Automated checks read those logs on every runtime. |
| 19 | **Verification tools** were added: `desktop:design-check` (real Electron window: every theme in both modes, keyboard, pointer, adaptive sizes, frame pacing) and `android:design-check`. | Proposed | The brief required evidence on Electron and the tablet, and prior phases established repeatable harnesses. |

## Alternatives considered

| Option | Why not |
| --- | --- |
| Themes as palettes only | The brief asked for distinct identities, not recolored copies. |
| Per-theme component variants (`if theme === "voxel"`) | Does not scale and breaks custom mixes. Token axes give the same result with no branching. |
| HSL or HSV color math | Lightness steps differ by hue, so a yellow and a blue accent would not share a visual hierarchy. |
| A fixed table of ink and surface colors per mode | Cannot honor custom backgrounds with guaranteed contrast. |
| Draft and Apply, as on the web | Slower to explore. Undo makes immediate application safe. |
| An existing UI kit | Would impose another product's identity and fight the theme axes. |
| React Native Skia for icons and tracks | A heavy dependency (and a 7–8 MB WebAssembly build on desktop) for drawings SVG already covers. |
| Loading fonts over the network | Fails offline and flashes fallback text. |

## Consequences

- Every later phase builds on `@sylf/design-system`. Hardcoded colors, fonts, radii or durations in feature code are bugs, and a missing token is added to the engine.
- Adding a theme, a font or an axis option means adding data, then running the engine tests. The role rules and the contrast guarantees apply automatically.
- The APK grew by about 8.5 MiB over Phase 3 and the Electron working set by up to about 100 MB (see the report). Fonts and the motion libraries are the main costs. Android memory at launch is unchanged (98 MB).
- Per-device preferences are not yet synced. Until Phase 13, a user's accent and ground import from the web account, but their theme choice and tweaks stay on the device.
- iOS is still unverified. The Swift preferences functions have not been compiled.
