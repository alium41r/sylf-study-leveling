# Pen settings and pen pressure — Phase 14 follow-up report

**Status: built and verified on the Galaxy Tab S9 FE, awaiting the owner's review.** 7 November 2026, branch `phase-14-pen-settings`, based on `phase-14` at `a0a9003` (the pinch-zoom fix). Pushed, not merged, not deployed. Sylf World was not started.

The owner asked for a pen settings panel like their other notes app's, with a **pen pressure on/off switch**: with pressure off, every stroke has the same width however hard the S Pen presses. During the work they asked for the panel to be **small, with no unnecessary text**, and for the toolbar to drop its six colours and three widths in favour of **three colours of their own**.

## 1. What changed

| Area | Before | Now |
| --- | --- | --- |
| **Pen panel** | None: three widths and six colours on the toolbar | Tap the pen (or highlighter) in hand. A small panel with no headings or hints: pen kinds shown as strokes they write (fountain, ballpoint, fineliner, pencil, brush), a size slider with − and + and its value, solid, dashed and dotted lines drawn as lines, **Pen pressure** and **Straighten lines** switches, and a row of colours with page dots for further sets (Ink, Bright, Soft, and Yours once you mix one). The last swatch opens a colour spectrum. A highlighter's panel has only size and colours |
| **Pen pressure** | Always on | Off: the brush records `pressure: 0`, so perfect-freehand's thinning is 0 and the stroke is the brush's full width everywhere, live and finished, on Android and on the web and desktop. On: as before |
| **Toolbar colours** | Six inks (or four highlights) and three width buttons | Three colour slots, one set for pens and shapes and one for highlighters. Tap a slot to write with it; tap the slot in hand again to change it from the spectrum. Size lives in the panel |
| **Live stroke on Android** | Pressure, smoothing and the brush nib only | Also dashes and dots, straightening and the pencil's tilt, so the line drawn while the pen is down is the line that stays |
| **Kept** | The pen was kept for the run only | Pen kind, size, colour, pressure, line style and straightening per surface (pages, PDFs, boards), mixed colours and the toolbar's slots are kept with the device's preferences (SharedPreferences on Android, localStorage on desktop). Which tool is in hand still resets each run |

Where it lives: `PenPanel.tsx`, `ColourSpectrum.tsx`, `pen-palettes.ts`, `InkToolbar.tsx`, `ink-tool.ts` (store) and `ink-types.ts` (`brushOf`, the one brush rule both ink views use) in `native/apps/sylf/src/spaces/workspace/notes/`; `brushFor` and `liveOutline` in `native/packages/notes/src/ink-scene.ts`; and on Android `InkGeometry.kt` (new, a port of `lib/notes/ink-geometry.ts`'s `inkGeometry` and `inkSegments`), `FreehandOutline.kt` (pencil) and `SylfInkView.kt` (each stroke keeps the brush it started with). Nothing in the root `lib/` or the backend changed: pen kinds, `pressure`, `lineStyle` and `straighten` are fields `sylf-ink/1` already has, so strokes written with any setting open unchanged on the web.

## 2. Scope

| From the owner's screenshot | Done? |
| --- | --- |
| Pen kinds | Yes, the five nibs `sylf-ink/1` defines. **Calligraphy is left out**: the format has no calligraphy nib, and adding one is a change to the web's shared ink schema, for a separate decision |
| Size with − and + and its value | Yes |
| Line styles | Solid, dashed and dotted. **The "thin" style is left out**: the format has no such style |
| Straighten lines | Yes: a nearly straight stroke becomes a straight line (the web's existing rule), live and finished |
| Colours with a custom colour and paged sets | Yes |
| Pen pressure on/off (asked for in the brief) | Yes |

## 3. Verification

All on 7 November 2026, on the final code.

| Check | Where | Result |
| --- | --- | --- |
| Native unit tests (`npm test`) | Mac | **629 passed**, 1 skipped (50 files). New in `pen-settings.test.ts`: pressure off gives every nib zero thinning and the same outline at pressure 0.05 and 1, from pen, finger and mouse, and the finished stroke equals that outline; pressure on still widens; every combination is accepted by the web's ink model; dashed and dotted live outlines have exactly the finished stroke's pieces; straightening only when asked; shapes and highlighters keep their own rules; colour sets; pen settings, mixed colours and toolbar slots survive a restart; unreadable or out-of-range kept values are ignored |
| Typecheck (app and desktop), ESLint, boundary audit | Mac | Clean |
| Electron notes check (`npm run build:web`, `SYLF_WORKSPACE_CHECK_ONLY=notes … workspace-check`) | Mac | **40 of 40**. An earlier run failed 7 typed-note steps on both this branch and unmodified `phase-14` while the browser pane was in use at the same time; clean reruns pass |
| Web build in a browser | Mac | Panel opened from the pen; the same light-then-hard pen stroke widens with pressure on and keeps one width with it off; the setting survives a reload; dark and light (Cozy accent) |
| Android release build | Mac, Gradle | Builds; installed over USB with no security prompt |
| **Tablet pen check** (`npm run android:pen-check`, new) | **Galaxy Tab S9 FE**, portrait, Cozy | **8 of 8** ([evidence](evidence/pen-settings/android-pen-check.json)). A virtual stylus with real pressure, through Android's own `uinput` (which `adb input stylus` cannot do), writes a line lightly then hard on a full-screen whiteboard. Thickness read from the screen while the pen is still down and after it lifts: pressure on, 2 px light and 6 px hard, live and finished alike; **pressure off, 4 px and 4 px, live and finished alike**. A dotted line has a third of a solid line's ink, live 1514 and finished 1542 pixels; a line wavering by 14 px spans 32 px with Straighten lines off and 4 px with it on, live and finished. The panel shows the switch as set, and pressure off is still set after a force-stop |
| Toolbar colours | Tablet, by adb | Tapping the colour in hand opens the spectrum; a pick replaces that slot and the pen writes with it ([before](evidence/pen-settings/toolbar-colour-spectrum.png), [after](evidence/pen-settings/toolbar-colour-changed.png)). In full screen the note toolbar now fits a portrait tablet |

Evidence: [`evidence/pen-settings/`](evidence/pen-settings/) has the check's JSON, the panel with pressure on and off and after a restart, and each line live and finished.

## 4. What is left

- **The S Pen by hand.** The virtual stylus sends real pressure but not palm, hover or tilt. Whether strokes "feel right" with pressure off is the owner's call: [tablet checklist](../../handoffs/tablet-checklist.md) item 21.
- **A note in a window on a portrait tablet** still has more toolbar than width: at the default window size the shapes, colours and Insert are past the window's edge (the bar scrolls sideways). Full screen fits. The [Phase 14 report](report.md) §7 item stays open; options are a narrower default window or a toolbar that folds tools away.
- **Calligraphy pen and the "thin" line style** need `sylf-ink/1` changes (§2).

## 5. State left on the tablet

The new APK is installed. The checks made a note called "Pen toolbar" and some whiteboards. The first pen colour slot was set to green (`#00672c`) while testing: tap it twice to change it. The theme is Cozy, in dark mode (as the pinch session's restore leaves it).
