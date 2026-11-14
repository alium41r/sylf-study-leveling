# Sylf Native components

**Phase 4.** The component reference for [`@sylf/design-system`](../../../native/packages/design-system/). The philosophy and the theme engine are in the [design guide](README.md). Source and the in-app **Design System Showcase** (`native/apps/sylf/src/showcase/`) win over this page. Open the Showcase to see every item below in all six themes.

All components render on React Native and on react-native-web inside Electron. Every one reads the theme through `useTheme()` and never hardcodes a color, font, radius or duration.

## Provider setup

```tsx
const store = createAppearanceStore(adapters.preferences);   // outside React

<GestureHandlerRootView style={{ flex: 1 }}>
  <SafeAreaProvider>
    <AppearanceProvider store={store} inputFormat="touch" | "pointer">
      <NoticeHost><OverlayHost>{app}</OverlayHost></NoticeHost>
    </AppearanceProvider>
  </SafeAreaProvider>
</GestureHandlerRootView>
```

`inputFormat` sets control size from the device's main input, not the window. `apps/sylf/src/App.tsx` is the reference.

## Hooks

| Hook | Returns |
| --- | --- |
| `useTheme()` | The resolved `DesignTheme`: `color`, `space`, `shape`, `material`, `marker`, `density`, `motion`, `icon`, `type`, `fonts`, `surface(level, radius)` |
| `useThemedStyles(factory)` | Memoized `StyleSheet` rebuilt only when the theme changes. Keep the factory at module level |
| `useAppearance()` / `useAppearanceStore()` | The persisted preference snapshot, and the store with `selectTheme`, `tweak`, `preview`, `undo`, `saveAs`, and so on |
| `useWindowClass()` | `{ size: "compact" \| "medium" \| "expanded", width, height, landscape }` |
| `useInputFormat()` / `useControlHeight()` | Touch or pointer sizing, and the current control height |
| `useInputMode()` | Last input used: touch, pen, mouse or keyboard |
| `useNotice()` | `notice(message, { tone, action, duration })` |
| `useNoticeClearance(bottom)` | While mounted, notices rest above something along the bottom edge, such as the Command Center |
| `useDismiss(active, onDismiss)` | Joins the Back and Escape stack: only the topmost overlay closes |
| `useFocusTrap(ref, active)` | Keeps Tab inside a surface on desktop, and hands focus back afterwards. Does nothing on native, where the accessibility tree does this |
| `move()`, `fade()`, `svgId()` | The motion functions, and a safe id for SVG references. Anything built from a label must pass through `svgId()` |

## Primitives

| Component | Purpose |
| --- | --- |
| `Press` | The base of every interactive surface. Owns hover, press, keyboard focus, disabled and busy for all inputs, and the two-layer focus ring. Extends the hit area to 44 pt on touch. |
| `Text` | `variant` (`hero` … `micro`) and `tone` (`ink`, `soft`, `faint`, `accent`, `positive`, …). Applies the theme's font, size, tracking and maximum scale. |
| `Plane` | A surface at `level` plane, raised or float, with the theme's material, corners and ornaments. |
| `Marker`, `TravellingMarker` | The signature mark, and one that flies between measured positions and can be interrupted. `axis="y"` flies it along a vertical rail. |
| `Stack`, `Row`, `Divider` | Layout with `gap` from the spacing scale. |
| `Icon`, `SylfMark` | 66 original icons with an optional active mark, and the Sylf logo mark. |

## Controls

| Component | Notes |
| --- | --- |
| `Button` | Variants `emphasis`, `solid`, `quiet`, `ghost`, `critical`; sizes regular and small; leading and trailing icon; `busy` shows a breathing Marker. |
| `IconButton` | Needs a `label`. `active` shows the icon's mark in the accent. |
| `Toggle`, `Checkbox`, `RadioGroup` | Switch, checkbox, and radio list with optional detail lines. |
| `Segmented` | Tabs with the Marker travelling beneath. Scrolls instead of wrapping, and centers the chosen tab. `fit` makes equal widths. |
| `Chip` | Selectable, with optional icon and remove action. Pass `radio` inside a `radiogroup`, so it is announced as one. |
| `Slider` | Needle on a rule. Touch, pen and mouse drag, tap to set, arrow keys, Home and End, and screen-reader increment and decrement. Gesture tracking runs on the UI thread. `track` replaces the rule (used by the color picker). |
| `TextField` | Tray with a rule that grows on focus. `error`, `helper`, `icon`, `multiline`, `monospace`. |
| `Select` | Opens a `Menu` matched to its width. Options can preview their own font. |
| `DateField`, `MiniCalendar` | The one way the app asks for a date. A tray showing the day in words ("Tue, 1 December 2026") opens the mini calendar in a `Popover`: Monday-first weeks, always six rows so it never changes height, the chosen day filled in the accent, today carrying the Marker, days outside `min` and `max` faded and inert. Arrows move by day and week, Page Up and Page Down by month (Shift for a year), Home and End to the week's ends, Enter chooses. `optional` adds Clear to the field and the calendar. Values are `YYYY-MM-DD` civil days; the date math is pure in `logic/calendar.ts`. |

## Overlays

All render through `OverlayHost`, keep the theme they were opened from, and close with Back, Escape or an outside tap.

| Component | Notes |
| --- | --- |
| `Popover` | Placed by `placeFloating()`: flips when there is no room, stays inside the safe area, and tucks the corner nearest its anchor when the theme allows. |
| `Menu` | Items with icon, shortcut, detail, selected and destructive states. Arrow-key navigation on desktop. |
| `ContextArea` | Right-click on desktop and long press on touch open the same menu. |
| `Tooltip` | Hover or keyboard focus after 420 ms, long press on touch. Never carries essential information. |
| `Sheet` | Bottom sheet when compact, edge panel otherwise. Drag away, safe-area aware, rises above the keyboard. |
| `Dialog` | Focus is trapped while open and restored on close. |
| `NoticeHost` | Transient notices with an optional action. Announced to screen readers and swipeable. |

## Feedback and structure

| Component | Notes |
| --- | --- |
| `Progress`, `Meter`, `Readout` | A rule with the Marker at its leading edge; discrete cells (pixel lineage); instrument-face numbers. |
| `Activity`, `Placeholder` | A breathing Marker, and a pulse that stops with reduced motion. Nothing spins. |
| `Badge`, `Avatar`, `Keycap`, `Callout`, `EmptyState` | Status, people with presence, keyboard shortcuts, messages, and empty views. |
| `SafeArea`, `Columns`, `ListRow`, `Disclosure` | Insets, window-class columns, rows sized by density, and an expandable section. |
| `Splitter` | Two panes you can drag, snap to thirds and halves, and resize with arrow keys. Both panes keep a minimum width. |
| `Lift` | Picks up, follows any pointer, and is clamped inside its container, including after rotation (`clampRect`). |
| `DocumentSurface` | Hosts authored content. Reads nothing from the theme. |
| `ThemeStudio`, `ColorPicker` | The full customization surface, and the Hue, Vibrance and Depth picker. A composition, not a route. |

## Accessibility contract

- Use `role` and `aria-*` props, which work on both runtimes. The `accessibility*` props do not map on web.
- Every interactive component needs a name. `IconButton` requires `label`, and `Press` takes `label`.
- Never convey state by color alone: selection also uses the Marker, errors also use text, and toggles also change position.
- Text respects the system font scale up to each variant's maximum multiplier, plus the user's own text size.
- Motion respects the system reduced-motion setting first, then the theme's intensity.

## Adding a component

1. Build it from `Press`, `Text`, `Plane` and the semantic tokens. Do not use a theme id, and do not hardcode values.
2. Animate only through `move()` and `fade()`.
3. Give every state a visible, non-color-only treatment, and test with More contrast.
4. Add it to a Showcase chapter, and check it in all six themes, in both modes, at compact and expanded widths.
5. Run `npm run verify` in `native/`.
