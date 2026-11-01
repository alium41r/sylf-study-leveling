# Sylf Native design system

**Phase 4, 30 October 2026.** This is the current contract for Sylf Native's visual language and theme engine. Source wins if anything here disagrees: [`native/packages/design-system`](../../../native/packages/design-system/). Decisions and their reasons are in [ADR 0003](../decisions/0003-design-system-and-theme-engine.md). Verification is in the [Phase 4 report](../reports/phase-4/report.md).

Labels: **Confirmed** came from the owner's brief. **Proposed** is a Phase 4 decision the owner can still change.

## 1. Design philosophy: Aloft

Sylf comes from *sylph*, a spirit of air, and its lineage is pixel art. Aloft is what those two ideas become in an interface: **surfaces held in quiet air, and one point of light showing what is alive right now.**

The test for every screen: *does it feel like a calm instrument someone made for studying?* It should not feel like a website, a dashboard or a template.

### Rules that hold in every theme

| Rule | Meaning |
| --- | --- |
| **The Marker** | One small mark says "this one, now". It is the signature of the system. It flies between selections, sits at the leading edge of progress, and appears as the single filled pixel in most icons. Each theme gives it a different body and flight, but it always means the same thing. |
| **Accent is spent, not spread** | Color marks what is active. Everything else stays in ink and tone, so the thing that matters is easy to find. |
| **Three voices** | **Voice** is for what is authored and human: titles and quotations. **Interface** is for what you operate. **Instrument** is for what you measure. A face stays in its role. |
| **Air before ink** | Separate with space first, tone second, and a hairline only as a last resort. |
| **Surfaces remember** | Something that came from somewhere points home. A popover *tucks* the corner nearest its origin instead of using an arrow. Themes with very small or zero radii skip this. |
| **Motion has weight** | Everything moves through one system. Springs carry momentum, can be interrupted, and never move anything without a reason. |
| **Personality, not structure** | Themes change how Sylf feels, never where things are. Layout, hierarchy, navigation and behavior are not theme axes. |
| **Documents are not chrome** | Notes, handwriting, PDFs and document formatting never follow the theme (Confirmed). |

### What Aloft avoids

Cards as the default container, glass and blur, decorative gradients (the only gradients are the color tracks in the picker), pill-shaped everything, oversized shadows, spinners, and fixed palettes. Sylf Native does not borrow the web app's layouts, components or tokens.

## 2. Architecture

```
ThemeAxes (data)                 what a theme IS: 15 independent axes
   ↓  normalizeAxes()            anything from storage or sync is validated here
resolveDesign()                  axes + mode + accessibility → semantic tokens
   ├─ resolvePalette()           solves every color against its surfaces
   ├─ buildType()                roles + ramp + optical metrics → text styles
   └─ shape / material / marker / density / motion / icon tokens
DesignTheme (semantic tokens)    the ONLY thing components read
   ↓  useTheme() / useThemedStyles()
primitives → components → compositions (ThemeStudio)
```

**The rule that keeps this scalable:** no component may branch on a theme id. Components read semantic tokens such as `theme.surface("raised")`, `theme.marker` and `motion`. A new personality is one data entry in [`presets.ts`](../../../native/packages/design-system/src/theme/presets.ts), with no component changes.

| Layer | Location |
| --- | --- |
| Color math and palette solver | `src/color/oklch.ts`, `src/color/palette.ts` |
| Axes and their token tables | `src/theme/axes.ts` |
| Typeface catalog and role rules | `src/theme/fonts.ts`, `src/theme/font-loader(.web).ts` |
| Built-in themes, web swatches | `src/theme/presets.ts` |
| Preference model, web bridge | `src/theme/preference.ts` |
| Store: persistence, undo, previews, saved themes | `src/theme/store.ts` |
| Composition into tokens | `src/theme/resolve.ts` |
| Provider, `ThemeScope`, hooks | `src/theme/context.tsx` |
| Motion, input mode, dismiss stack, focus trap, system signals | `src/runtime/` |
| Primitives | `src/primitives/` (`Press`, `Text`, `Plane`, `Marker`, `Stack`, `Row`, `Divider`) |
| Components | `src/components/` |
| Pure layout math | `src/logic/geometry.ts` |
| Original icons, Sylf mark | `src/icons.tsx` |
| Theme Studio, color picker | `src/studio/` |

## 3. The theme axes

A theme is a point across these axes. Each is independent, so any combination is valid and users can mix freely.

| Axis | Options | Governs |
| --- | --- | --- |
| Accent | any color | Selection, marks, focus, main actions |
| Day ground, Night ground | any color each | The base of light and dark mode |
| Presence | quiet, balanced, vivid | How far the accent spreads |
| Voice, Interface, Instrument | catalog, filtered by role | Typography |
| Type scale (ramp) | Editorial, Tight, Ceremonial, Arcade, Friendly, Book | Sizes, line height, case and tracking |
| Corners (shape) | Soft, Precise, Sigil, Block, Pillow, Folio | Radii, tuck, ornament or pixel corners |
| Material | Aloft, Hairline, Inlay, Extruded, Plush, Paper | How height is expressed, and press depth |
| Selection mark | Mote, Bar, Rune, Voxel, Bead, Rule | Marker body and flight |
| Density | Compact, Comfortable, Spacious | Control height, row height, spacing |
| Motion character | Glide, Crisp, Mystic, Stepped, Bounce, Page turn | Springs, arrival, press response |
| Animation intensity | Still, Subtle, Standard, Expressive | How much of that motion plays |
| Icon drawing | Square, Exact, Fine, Chunky, Round, Pen | Stroke weight, caps and joins |

## 4. The six built-in themes

**Confirmed list; Proposed definitions.** Each differs on every structural axis, and a unit test enforces that. **Naming:** the sixth theme is `student` / "Student" in code and in the Phase 4 brief. The owner has also called it Scholar. Nothing was renamed, and the difference is recorded in [ADR 0004](../decisions/0004-global-spaces-shell.md#student-and-scholar).

| Theme | Character | Voice / Interface / Instrument | Shape, material | Marker, motion | Density |
| --- | --- | --- | --- | --- | --- |
| **Sylf Signature** (default) | Quiet, held in air | Newsreader / Instrument Sans / Spline Sans Mono | Soft, Aloft | Mote with an arcing flight, Glide | Comfortable |
| **Studio** | Exact, dense, nothing decorative | IBM Plex Sans / IBM Plex Sans / IBM Plex Mono | Precise, Hairline | Bar that snaps, Crisp | Compact |
| **Arcane** | Inlaid gold and old light | Cinzel / Alegreya Sans / Alegreya Sans | Sigil, Inlay | Glowing rune that drifts, Mystic | Comfortable |
| **Voxel** | Everything is a block you can press | Pixelify Sans / Space Grotesk / Jersey 10 | Block, Extruded | Voxel moving in steps, Stepped (12 fps) | Comfortable |
| **Cozy** | Warm, soft, in no hurry | Fraunces / Nunito / Nunito | Pillow, Plush | Bead that hops, Bounce | Spacious |
| **Student** | Set like a well-kept book | Literata / Literata / IBM Plex Mono | Folio, Paper | Pen rule, Page turn | Comfortable |

Signature received the most refinement, as the brief asked. Its palette is **Pearl** (`#F3F2F8`) by day and **Night** (`#100E17`) after dark, with an iris accent (`#6E5BE6`), drawn from the companion's pearl-lilac tones instead of the warm cream common in AI-generated interfaces.

## 5. Color: solved, not picked

`resolvePalette()` calculates each readable role against the surfaces it sits on, in OKLCH, so lightness steps look even across hues. It stops at the target contrast rather than jumping to pure black or white, which is what keeps the ink soft.

**Guarantees, enforced by tests across 4,000 random color pairs:**

| Role | Minimum across all five surfaces |
| --- | --- |
| Ink, soft ink, accent text, signal text | 4.5:1 |
| Faint ink, focus ring, accent mark, strong line, signal mark | 3:1 |
| Label on any filled control | 4.5:1 |

- **The user's exact accent is kept** whenever it is visible on the ground. If it would disappear, only its lightness moves, and the report tells the Studio to say so.
- **A custom ground decides polarity**, as on the web. A pale ground in the Night slot still gets dark ink.
- **Mid-tone grounds** leave little contrast to spare, so surface steps compress (down to flat) and washes yield, rather than text losing contrast. The Studio explains this when it happens.
- **More contrast** raises the targets (ink 15:1, soft 7:1, faint 4.5:1, hairlines 3:1).

Other surfaces are never asked to contrast with a hairline: `line` is decorative. Control boundaries use `lineStrong`.

## 6. Typography

**Role rules, enforced by the catalog and by `normalizeAxes()`:**

- **Instrument** only accepts faces with equal-width digits, natively or through the `tnum` feature, so a running timer never jitters. This was measured from the font tables. Cinzel, Pixelify, Fraunces and Quicksand have proportional digits and are excluded.
- **Interface** only accepts faces that stay legible at 12 pt, which excludes display-only pixel and inscriptional faces.

Each family carries optical metrics (`size`, `tracking`, `line`), so swapping a family keeps the same apparent size. Text variants: `hero`, `display`, `title`, `quote` (Voice); `heading`, `subheading`, `body`, `small`, `label`, `caption` (Interface); `readoutXL`, `readout`, `value`, `micro` (Instrument). Each has a maximum font-scale multiplier, so large system text grows body copy fully without breaking display type.

**Font files.** 13 SIL OFL families, 30 static TTF files, about 4.4 MB in the repository, with licenses beside them in `assets/fonts/`. Files are named by PostScript name, so one family string works on Android, iOS and web. Native embeds all of them through the `expo-font` config plugin. Web and desktop load only the faces in use.

## 7. Appearance preferences

**Preserved from the web (Confirmed).** Light and dark mode; any custom accent and background color; all eight accent presets, all nine background presets, and all legacy preset ids; six recent colors per kind; hex entry; reset; keyboard adjustment; adaptive text and surfaces; live preview; a way back from any change.

**Improved.**

| Web | Native |
| --- | --- |
| One background shared by both modes | Each theme has a **Day ground and a Night ground**, which is what makes System mode work |
| Light or Dark | **System**, Day or Night |
| Draft, preview tile, then Apply | **Changes apply immediately**, with Undo and Redo, and Revert to the theme as built |
| Colors only | Fifteen axes, plus six themes and **saved themes** |
| HSV board, hard to use with touch and screen readers | **Hue, Vibrance, Depth** perceptual sliders that work with every input |
| Contrast handled silently | The Studio shows live ratios and explains any adjustment |
| Separate draft and preview logic | `ThemeScope`: previews are real components in the real engine |

**Account compatibility.** The account stores only `activeTheme` and `activeBackground`, and mode stays per device. `fromWebAccount()` and `toWebAccount()` convert losslessly, using the shared `lib/color-utils.ts` tables. Schema defaults (`default`, `none`) and the normalized `simple` mean the user never chose, so those accounts get Signature instead of being frozen on the old look. Nothing is connected yet: backend sync belongs to Phase 13. Theme details beyond those two fields stay local until then.

**Persistence.** The store is created outside React and reads synchronously before the first frame, through `adapters.preferences`: `SharedPreferences` on Android, `UserDefaults` on iOS, `localStorage` on desktop. A corrupt record falls back to defaults, and every value is validated on load.

**Accessibility preferences are not part of a theme.** Text size, more contrast and reduced motion stay when the theme changes. System reduced motion always beats a theme's animation intensity.

**Out of scope here.** Focus backdrops stay with the existing focus-background catalog and move to native with Focus (Phase 6 or later). Frames, name colors and auras stay with cosmetics.

### Per-Space themes (future, not built)

`ThemeScope` already re-themes any subtree at the cost of one resolution, and the Studio's tiles and preview depend on it. It honors the system's accessibility settings as well as the app's own. Adding per-Space themes later means adding a `spaces` map to the preference and wrapping each Space in a `ThemeScope`. No component needs to change. **Open:** whether users want this at all.

**World already uses a `ThemeScope` (Phase 9):** the person's own axes, with the sky's color as the ground ([World guide](../world/README.md#3-appearance)). World's art is authored, like a document, and does not follow a theme.

## 8. Space, shape and elevation

Spacing is one scale, multiplied by density: 2, 4, 8, 12, 16, 24, 32, 48, 72.

Elevation has three levels (`plane`, `raised`, `float`), and `theme.surface(level, radius)` is the only way to draw one. Each material expresses height its own way: tone and soft shadow (Aloft), hairlines (Hairline), double rules and an aura (Inlay), a hard offset (Extruded), deep soft shadow (Plush), or flat rules (Paper).

**Control sizes** follow density and the device's main input, never the window. Touch targets never fall below 44 pt: shorter controls extend their hit area.

## 9. Iconography

66 original icons on a 20-unit grid. Most are one line drawing plus one filled mark, which takes the theme's marker shape and lights up in the accent when active. This is the Marker in miniature. Stroke, caps and joins come from the icon axis.

Phase 5 added `home`, `workspace` and `world`, plus `spacesHome` and `spacesWorld`: the Spaces grid with the mark in a different cell, which shows the current Space while the switcher is closed. The icon set covers the planned Spaces and tools (Today, Focus, Circle, Progress, Notes, PDFs, Whiteboard, Planner, Calendar, Timer, Sylvie, Calculator, Audio, Resources), so later phases should not need a new icon language. `SylfMark` is a sprout holding one point of light, reduced from the companion's leaf. The app icon itself is unchanged.

## 10. Motion

Everything moves through `move()` and `fade()` in `src/runtime/motion.ts`. Nothing calls `withSpring` directly, which is why a theme's character, the user's intensity and reduced motion apply everywhere with no extra work.

| Token | Use |
| --- | --- |
| `settle` | Controls: fast, with no visible overshoot |
| `lift` | Surfaces arriving, carrying some weight |
| `glide` | Panels and layout: long and smooth |

Stepped themes quantize to 12 fps, which turns the same animation into a pixel-art gesture. **Still** and reduced motion turn all movement into short fades while keeping state changes clear. Animations run on the UI thread and can be interrupted: a marker retargets from wherever it is.

## 11. Interaction

Every interactive surface is a `Press`, which owns hover, press, keyboard focus, disabled and busy states for all inputs.

| Input | Behavior |
| --- | --- |
| Touch | 44 pt minimum target, press feedback, long press for context menus and tooltips |
| Stylus | Goes through the same paths. Writing tools arrive in Phase 14 |
| Mouse, trackpad | Hover states, right-click context menus, resize cursors, wheel scrolling |
| Keyboard | Tab order, a visible two-color focus ring for keyboards only, Enter and Space, arrow keys on sliders, menus and splitters, Escape |
| Back button | Closes the topmost overlay first |

Overlays render through one `OverlayHost`, keep the theme they were opened from, and share one dismiss stack. Modal surfaces trap focus and restore it on close.

## 12. Adaptive layout

Layout follows `useWindowClass()`: compact under 600 pt, medium up to 1000 pt, expanded above that. Never branch on device type. `SafeArea` handles insets. `Columns` follows the window class. `Sheet` is a bottom sheet in compact windows and an edge panel otherwise. `Splitter` keeps both panes usable and snaps to thirds and halves. `clampRect()` keeps movable panels reachable after a rotation or resize, which answers the Phase 2 panel-reflow risk at the primitive level.

## 13. Documents

**Confirmed.** Themes must not alter notes, handwriting, PDFs or document formatting. `DocumentSurface` is the boundary: it reads nothing from the theme, takes the document's own paper color, and passes its content through unchanged. Use it to host any authored content. The palette has no paper or ink tokens by design, so a document component cannot accidentally pick up the theme.

## 14. Using the system

```tsx
import { Button, Plane, Stack, Text, useTheme } from "@sylf/design-system";

function Example() {
  const { space } = useTheme();
  return (
    <Plane level="raised" pad="lg">
      <Stack gap="sm">
        <Text variant="title">Complex numbers</Text>
        <Text tone="soft">Two sessions remain.</Text>
        <Button title="Begin" variant="emphasis" icon="play" />
      </Stack>
    </Plane>
  );
}
```

**Rules for new code.**

1. Never hardcode a color, font, radius or duration. If a token is missing, add it to the engine.
2. Never branch on a theme id.
3. Use `Press` for anything interactive and `move()` for anything that moves.
4. Use `role` and `aria-*` props, which work on both React Native and react-native-web. The `accessibility*` props do not map on web.
5. Use relative imports for `.web.ts` and `.native.ts` files (Metro does not apply platform extensions to package `exports`).
6. Read the [component reference](components.md) before adding a component.
