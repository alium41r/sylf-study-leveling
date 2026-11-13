# Sylf Native Notes gallery and paper picker

10–11 November 2026 · `phase-14-pen-settings`

| Area | Change |
| --- | --- |
| Library | **All notes** brings typed notes, handwritten notes and imported PDFs into the same gallery. **Imported PDFs** and **Trash** have their own destinations. Folder cards, breadcrumbs and an expandable, counted tree make nested folders browsable. The tree stays in the rail on wide panes and opens in a sheet on compact screens. |
| Layout and actions | Cards fit the measured Notes pane, including inside a split. The list view, search, sorting, folder creation and item menus work in both layouts. Item menus retain cover and folder customisation, pinning, moving and duplication. **Arrange items** uses a list with explicit reorder arrows. |
| Thumbnails | Notes show a first-page excerpt, paper and saved ink. PDFs show a raster of the first page. Authored covers and paper images use the existing attachment store. Visible rows request previews through a bounded cache and read document streams without opening an editor or recording an open event. Old notes with missing excerpt metadata can read their saved first-page text. |
| Paper style | **Default note style** and **Page settings** share the **Page** and **Template** panels. The page panel illustrates separate pages and endless flow and offers twelve paper colours. Basic shows blank paper plus the three spacings for lined, grid and dot paper. Academic, Planners and Journals expose the other existing layouts. Page settings retain the current-page and every-page scopes. |
| Theme and storage | Aloft themes style the interface. Paper colours are authored, including Graphite and Midnight. Default typed text chooses a legible foreground from the paper colour. IndexedDB now restores the folder order it already saved. The editor publishes its pending text excerpt when it loses focus or closes, so a quick return can populate thumbnails and search. Existing document and backend formats are compatible. |

The [Workspace guide](../../workspace/README.md#11-notes-pdfs-whiteboard-and-resources-phase-14) describes the current controls. The [earlier Workspace audit](../2026-11-10-workspace-notes-polish/README.md) records the handwriting, zoom and layout fixes.

## Verification

- Inspected the packaged Electron renderer at 1280 × 755, 820 × 755, 390 × 720 and 320 × 640 CSS pixels. The 1280 × 755 split used a 639-pixel Notes pane. Checked Signature dark, Cozy light and Voxel dark with a custom ground, custom accent and larger text. [Desktop gallery](evidence/gallery-all-notes-desktop.png) · [Folders and tree](evidence/gallery-folders-desktop.png) · [Light tablet](evidence/gallery-tablet-light.png) · [Custom split](evidence/gallery-split-custom.png)
- Inspected the compact folder sheet and both paper panels. Template tiles preview their actual pattern and density. The bottom tabs stay reachable while the content scrolls. Opening a sheet keeps the library in place behind it. [Folder navigation](evidence/gallery-phone-navigation.png) · [Page](evidence/gallery-phone-page.png) · [Template](evidence/gallery-phone-templates.png)
- All 90 packaged Electron checks passed, covering creation and rename, the folder tree, sort and order after reload, list and grid, PDF and ink thumbnails, excerpts after quick return, dark paper text, and bounded page scrolling and zoom, and Workspace accessibility. [Interaction results](evidence/electron-workspace-check.json)
- Native verification passed TypeScript, ESLint, import and dependency audits, the packaged web export and 625 Vitest tests with one existing skip. Android and iOS renderer exports passed.

Run the interaction checks from `native/` with `SYLF_WORKSPACE_CHECK_ONLY=notes,gallery,a11y npm run desktop:workspace-check`. Set `SYLF_WORKSPACE_CHECK_OUT` to collect screenshots and results. The run creates its data in a disposable profile.

## Remaining verification

Phone and tablet sizes were checked in Electron and the mobile renderers were exported. Native touch and stylus behaviour still need device verification.
