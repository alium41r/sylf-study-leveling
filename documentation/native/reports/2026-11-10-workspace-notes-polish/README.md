# Sylf Native Workspace and Notes audit

10 November 2026 · `phase-14-pen-settings`

The audit used the current native worktree and a disposable account in the packaged Electron app. The [Workspace guide](../../workspace/README.md) describes the revised controls.

| Area | Finding and fix |
| --- | --- |
| Explorer | Folder location was easy to lose in narrow panes, and edited dates could reorder a list while it was in use. Breadcrumbs expose the parent and library root. **Arrange items** shows accessible row arrows and saves the order per folder. Folders, pinned documents, and other documents are arranged within their own sections. Search and Trash keep their independent ordering. |
| Appearance | Notes can use a cover image, colour, and icon. Folder colours and icons use the same Aloft picker and controls. The preview can be cancelled before saving. Existing titles and icons carry forward. Notes can still be renamed from the title bar or their row menu. Trash asks before permanent deletion. |
| Persistence | Folder changes used to calculate a replacement record before entering the write queue. Document metadata writes could also overwrite a concurrently edited descriptor. Mutations now read the latest state in the queue, and open editors write pending stream updates with their descriptor. Invalid destinations are rejected without failing the library. PDF and ink formats, the server API, and the SQLite and IndexedDB schemas are compatible with existing data. |
| Page navigation | A permanent pull area let ordinary scrolling continue below the final page. The editor now stops at the paper gutter and displays pull progress during an explicit add-page gesture. Notes and PDFs use the same 50–300% zoom bounds and preserve the point under the wheel, pinch, or zoom control as far as the scroll bounds allow. Wide note toolbars show the current zoom and offer a reset to fit. Resizing clamps the scroll offsets used for rendering ink and ruled paper. |
| Handwriting | Electron maps coalesced samples through one coordinate transform per event and records the final pen position without a false pressure drop on lift. Both Electron and Android keep palm input from taking over an active pen stroke. Android removes redundant per-sample path work and keeps the live stroke visible until its finished outline reaches the native canvas. |
| Workspace | Single window, Split screen and Assistant previously fitted scaled canvas rectangles into the available space. Their panes now use that space directly. Split joins at one seam in landscape and portrait. Tile windows retains its adjustable seams and page-only mode fills the safe area at compact widths. Short Calculator panes scroll so the keypad remains usable. Returning to Canvas restores the saved arrangement. |

Manual order is local to each folder and owner. Existing records without a manual order keep the default sort. Cover images use the existing owner-scoped, content-addressed attachment store. Replaced cover bytes remain attached until the last referencing document is permanently deleted, matching the library’s existing attachment retention.

## Verification

- Manually drove the packaged Electron UI at 1280 × 820, 744 × 870, and 390 × 720. Inspected Signature dark, Cozy light, and Voxel dark with a custom accent and ground and larger interface text. Created nested folders, picked an image through the chooser, renamed and reordered notes, and checked the results after reload. [Compact explorer](evidence/05-explorer-compact-light.png) · [Cover editor](evidence/02-cover-preview-dark.png) · [Explorer results](evidence/manual-explorer.json)
- Typed and wrote in a note, zoomed through the gutter to both limits, and measured the last page at maximum scroll. The scroll range ended at the 12-point paper gutter. Electron’s emulated pressure-sensitive pen left ink at the final sample. A two-finger gesture scaled the compact page by 1.95×. [Writing](evidence/07-pen-custom-dark.png) · [Editor and layout measurements](evidence/manual-editor.json)
- Inspected page-only mode, landscape split, portrait split, and tiled tools. The compact page used all 390 × 720 points. Both split panes met without a background gap, with all Calculator keys visible in the portrait split. Paper ruling and ink stayed visible when resizing after scrolling. [Compact page-only](evidence/09-fullscreen-compact-custom.png) · [Portrait split](evidence/11-split-portrait-dark.png) · [Tiled tools](evidence/12-tile-portrait-dark.png)
- Packaged Electron passed all 55 Notes and 57 Workspace assertions. The Notes run covered formatting, reload and library navigation, bounded scrolling, pen and eraser, PDF annotation, linked documents, and compact editing. Synthetic pen move handlers measured 0.6 ms at the 95th percentile in two runs. The corresponding frame intervals were 17.5 ms and 18 ms at the 95th percentile. [Notes checks](evidence/electron-notes.json) · [Workspace checks](evidence/electron-workspace.json)
- `npm run verify` passed typecheck, ESLint, import boundaries, dependency single-copy checks, and the packaged web export. Vitest passed 624 tests with one existing skip. The Android Hermes export and `:sylf-native-platform:compileReleaseKotlin` passed.

Run the packaged checks from `native/` with `SYLF_WORKSPACE_CHECK_ONLY=notes npm run desktop:workspace-check` or `SYLF_WORKSPACE_CHECK_ONLY=layouts,compact,restore,windows,pinch npm run desktop:workspace-check`. Set `SYLF_WORKSPACE_CHECK_OUT` to save captures and results.

## Remaining verification

No Android device was attached. The Android release module compiled and the renderer exported. The physical S Pen’s latency, pressure response, palm rejection, and native pull-to-add gesture still need device verification. The existing iOS read-only ink fallback remains a platform limitation.
