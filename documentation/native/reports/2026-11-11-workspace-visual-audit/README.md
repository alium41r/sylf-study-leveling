# Sylf Native Workspace visual audit

11 November 2026 · `phase-14-pen-settings`

The packaged Electron app was inspected one surface at a time before and after the changes. The sweep used a disposable profile and the local fixture backend, with an imported two-page test PDF. The final renderer was inspected at 1280 × 752, 744 × 752, 900 × 480 and 320 × 650 CSS pixels in Signature dark, Cozy light and Voxel dark with a custom accent, background and 125% text size.

| Surface | Findings and changes | Screenshots |
| --- | --- | --- |
| Canvas and Command Center | The layout menu copy now describes each arrangement in one line. The compact tool strip scrolls the active tool into view. Restored Audio windows omit the launcher selection marker because Audio has no launcher button. Compact window frames no longer draw the free-canvas shadow behind the dock. | [Canvas](evidence/01-canvas.png) · [Free windows](evidence/02-free-windows.png) · [Layouts menu](evidence/03-layout-menu.png) |
| Windows sheet | The desktop slide is clipped to the viewport during the transition. Tool tiles and the list have consistent padding. A scrollable body keeps the full list and **Clear workspace** reachable. Selected actions stay in the footer. | [Desktop sheet](evidence/04-windows-sheet.png) · [Twelve windows at 320 px](evidence/19-compact-windows-scrolled.png) |
| Single, split, tiled and Assistant layouts | Single and tiled modes reserve 44 pt for the tucked **Tools** handle inside the bottom panes, keeping the composer, keypad and Timer copy reachable. Pane frames still meet at the seams. Page-only editors use the full pane. Inactive document names now use Aloft's soft text colour. | [Portrait split](evidence/12-portrait-split.png) · [Landscape tiles](evidence/08-tiles.png) · [Portrait tiles](evidence/13-portrait-tiles.png) · [Assistant](evidence/07-assistant.png) · [Page only](evidence/notes-03d-page-only.png) · [Populated landscape split](../2026-11-10-notes-gallery/evidence/gallery-split-custom.png) |
| Notes, PDFs and Whiteboard | Narrow library headings and icon-only create or import actions fit in one row. Empty states use more compact typography and padding. The PDF page counter follows Aloft's surface and text colours. Typed Notes, handwriting, PDF annotation and board editing were exercised in the Notes regression run. | [Compact Notes](evidence/compact-notes.png) · [Custom colours and text](evidence/18-compact-custom.png) · [Imported PDF](evidence/11-pdf-open.png) · [Compact Whiteboard](evidence/compact-whiteboard.png) · [Whiteboard editor](evidence/notes-06-whiteboard.png) |
| Sylvie | The chat and composer share a centred maximum width in wide panes. Aloft's empty state introduces the composer. | [Single window](evidence/wide-sylvie.png) · [Short Assistant](evidence/14-short-assistant.png) |
| Calculator | The keypad and expression stay together in a centred column. History takes space once a result exists. The keypad scrolls inside short panes. | [Single window](evidence/wide-calculator.png) · [Compact](evidence/compact-calculator.png) · [Scrolled portrait pane](evidence/12b-portrait-calculator-scrolled.png) · [Scrolled short pane](evidence/14b-short-calculator-scrolled.png) |
| Timer | The clock, durations, subject and actions stay together. Short panes use a smaller readout. The narrowest tiles use shorter action copy and stack multiple actions. | [Compact](evidence/compact-timer.png) · [Short with custom colours](evidence/15-short-timer.png) |
| Resources | Kind filters wrap when the pane is narrow. The document count uses the same text tone as other supporting labels. | [Compact shelf and active tool](evidence/compact-resources.png) |
| Audio and Sounds | A restored Audio window centres the shared sound library on wide screens. The compact Sounds dock uses text tabs and tighter padding. | [Restored Audio window](evidence/wide-audio.png) · [Compact Sounds dock](evidence/17-compact-sounds-dock.png) |

The changes use the existing Aloft components, spacing, type, icons and appearance tokens. The Workspace snapshot, local library and backend contracts were preserved. The earlier [Notes gallery report](../2026-11-10-notes-gallery/README.md) documents the populated gallery, folder navigation, paper picker, covers and library persistence.

## Verification

- Inspected 35 screenshots from the rebuilt Electron app. The visual suite passed all nine assertions, including viewport width, the Windows entrance, **Tools** clearance, the focused compact dock item, Resources filters and the scrollable Windows list. [Visual checks and viewport measurements](evidence/visual-check.json)
- In portrait Split and the 480-pixel-tall Assistant layout, mouse-wheel input brought the bottom Calculator row into reach and clicks calculated `5 + 3 = 8`. All four focused assertions passed. [Short-pane results](evidence/calculator-scroll-check.json)
- All 90 Notes, gallery and accessibility checks and all 57 layout, compact, restoration, window and pinch checks passed. [Notes results](evidence/notes-check.json) · [Layout results](evidence/layouts-check.json)
- Native verification passed TypeScript, ESLint, import and dependency audits, the web renderer export and 625 tests with one existing skip. Android and iOS renderer exports passed. Desktop TypeScript, ESLint and the syntax and diff checks passed after the fixture changes.

Run `SYLF_WORKSPACE_CHECK_ONLY=visual npm run desktop:workspace-check` from `native/`. Use `SYLF_WORKSPACE_CHECK_ONLY=visual-scroll` for the short-pane Calculator checks. Set `SYLF_WORKSPACE_CHECK_OUT` to keep the images and check report.

## Remaining verification

The separate session sync fixture timed out twice at `dock-pause` after attempting the Workspace-to-World transition. Its screenshot showed the outgoing Workspace mid-transition. The obsolete Audio shortcut step was updated to open Sounds, and the paused-World assertion still needs a complete session run. The Workspace Sounds dock was captured and inspected at desktop and compact widths.

A repeat of the visual sweep timed out waiting for the legacy Audio catalogue with no console errors and a splash frame. The visual fixture now keeps Electron's compositor active and retries one view load. The 35-capture sweep and the separate four-assertion short-pane run provide the evidence above.

Mobile breakpoints were checked in Electron. Touch, pen hardware and runtime safe areas still need an Android or iOS device. The local fixtures exercised workspace behavior and appearance. Live Sylvie streaming and live audio catalog access were outside this run.
