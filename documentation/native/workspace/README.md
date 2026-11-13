# Sylf Workspace

**Phases 7, 8 and 10, 31 October 2026.** The current contract for the Workspace Space in Sylf Native. Source wins if anything here disagrees: [`native/packages/spaces/src/workspace`](../../../native/packages/spaces/src/workspace/) and [`native/apps/sylf/src/spaces/workspace`](../../../native/apps/sylf/src/spaces/workspace/). Decisions are in [ADR 0006](../decisions/0006-workspace-canvas-and-windows.md), and the evidence is in the [Phase 7](../reports/phase-7/report.md) and [Phase 8](../reports/phase-8/report.md) reports.

Labels: **Confirmed** came from the owner's brief or master plan. **Proposed** is a decision from these phases the owner can still change.

**Updated 4 November 2026 (Expansion Part 2).** Workspace has **eight tools**: Notes, PDFs, Whiteboard, Sylvie, Calculator, Timer, Audio and Resources. **Planner and Calendar moved to Home's Plan** once its parity list passed ([ADR 0014](../decisions/0014-home-hub-and-workspace-scope.md)), and Alt+1 to 9 and Alt+0 follow the new order. A saved layout that held them still opens, because unknown tools are dropped and the rest survives. The Timer tool offers **Enter focus**, and Audio is the one native engine, shared with the Focus environment. Text below that names Planner or Calendar describes Workspace as it was in Phase 13.

**Updated 5 November 2026 (Phase 14).** Notes, PDFs, Whiteboard and Resources are real, over one local-first Notes library in the web's own formats ([ADR 0018](../decisions/0018-local-first-notes-on-native.md), [§11](#11-notes-pdfs-whiteboard-and-resources-phase-14)). Workspace adds named saved layouts, drag and drop on desktop, "open beside", and a running-editor budget. Rows below that say Phase 14 owns these tools describe Workspace before Phase 14.

**Updated 10 November 2026.** See the [Workspace and Notes audit](../reports/2026-11-10-workspace-notes-polish/README.md) for the explorer, editing, and layout changes and their verification.

The [Notes gallery refinement](../reports/2026-11-10-notes-gallery/README.md) covers the library rail, page thumbnails, and visual paper picker.

The [Workspace visual audit](../reports/2026-11-11-workspace-visual-audit/README.md) covers the Canvas, layouts, all eight tools, and the Windows and Sounds overlays at desktop, portrait and compact sizes.

**Updated 12 November 2026.** The [Notes and Workspace quality pass](../reports/2026-11-12-notes-workspace-quality/README.md) covers the eraser and pen input fixes, the live zoom badge, the writing toolbar and the eraser's own settings. It is verified on the Mac and not yet on the tablet.

## 1. What exists

Workspace uses one persisted window model. Sylvie reads the signed-in account. Notes, PDFs, Whiteboard and Resources read that account's local library, and the Calculator and Timer operate on their existing engines. Saved Audio windows share the dock's playback engine.

| Layer | Location | Owns |
| --- | --- | --- |
| Canvas math | `packages/spaces/src/workspace/canvas.ts` | World, camera, zoom, bounds, reveal and fit, the grid. Worklets where the UI thread needs them |
| Tool contract | `.../workspace/tools.ts` | Eight tools: label, sizes, instance rule, capabilities, backend owner |
| Windows | `.../workspace/windows.ts` | `WorkspaceState`, parsing, every change to it, placement, presets. Pure functions |
| Lifecycle | `.../workspace/lifecycle.ts` | Which content stays alive |
| Model | `.../workspace/model.ts` | `createWorkspaceModel(store)`: the only owner, written through the `workspace` snapshot |
| Space | `apps/sylf/src/spaces/workspace/WorkspaceSpace.tsx` | What each window may do right now: what is in view, what stays alive, what chrome covers |
| Canvas | `WorkspaceCanvas.tsx`, `DotGrid.tsx`, `useCamera.ts`, `canvas-input(.web).ts` | Gestures, the grid, the world layer, the camera in motion |
| Windows | `WorkspaceWindow.tsx`, `ToolHost.tsx` | One window's frame, gestures and keyboard. Lazy tool content |
| Command Center | `CommandCenter.tsx`, `DockShelf.tsx`, `QuickSwitcher.tsx` | Tools, layouts, canvas controls, minimized windows, auto-hide, type to open |
| Keys | `workspace-keys(.web).ts` | Desktop shortcuts |
| Tools | `tools/` | Eight shells, each a separate chunk, plus `shared.tsx` |

## 2. The canvas

**Confirmed:** a large, finite dotted grid with bounded zoom and pan, and stable world coordinates.

**Proposed details.** The world is 5600 × 3640 pt, 200 × 130 cells of 28 pt. Zoom runs from 20% to 200% and scales everything, tools included. The camera can look 120 pt past each edge, and past the edge the dots stop at a hairline, so the edge is seen rather than just hit. A camera is the world point at the middle of the view plus a zoom, so it means the same place after a resize or a rotation.

| Input | Pan | Zoom |
| --- | --- | --- |
| Touch, stylus | One finger or the pen on empty canvas. It coasts | Pinch. Two fingers on Notes, PDFs or Whiteboard are the tool's, and the canvas stays still. Anywhere else, including across a window's edge, the canvas zooms |
| Mouse | Left or middle button on empty canvas. Holding Space, from anywhere | Control and wheel, or the zoom menu |
| Trackpad | Two fingers | Pinch |
| Keyboard (desktop) | Arrow keys, when nothing is focused | `+`, `-` |

A wheel over a tool that can still scroll belongs to the tool. A document's pages keep the wheel even at their end, so scrolling past the last page never carries the canvas away. Reduced motion turns coasting off, and every animated move through `move()`.

**The dot grid shows the zoom.** Dots are one size at every zoom and their spacing is the grid's at that zoom, so zooming in spreads them and zooming out draws them together. Only when they would be closer than 8 pt does each dot stand for twice the distance (`gridSpacing` in `canvas.ts`).

Canvas controls are at the far end of the Command Center: **Fit Workspace** frames every open window, or the whole world if there are none. **Reset View** returns to the middle at 100%. The zoom button also offers Zoom in, Zoom out and Actual size.

## 3. Windows

| Action | Touch or stylus | Mouse | Keyboard (desktop) |
| --- | --- | --- | --- |
| Open | Tap a tool. Long press for a menu | Click. Right-click for a menu | Alt+1 to 9, or the command palette (Command or Control + K) |
| Place a tool | Drag its icon up onto the canvas | Drag its icon up onto the canvas | Open it, then move the title bar with arrow keys |
| Second instance | Long press, New window | Right-click, New window | The command palette |
| Open several, close several, clear | The Windows button in the Command Center | Same | |
| Move | Drag the title bar | Same | Focus the title bar, arrow keys |
| Resize | Drag an edge or corner of the focused window (a grip marks it) | Same, with resize cursors | Shift and arrow keys on the title bar |
| Focus | Press anywhere in it | Same | Alt+] and Alt+[ |
| Minimize, restore | Minimize button, then the chip above the Command Center | Same | Alt+M, then the switcher |
| Close | Close button | Same | Alt+W |
| Expand one window | Expand in the title bar | Expand in the title bar | Alt+F |
| Frame the current tool | Double tap the title bar | Double click the title bar | Shift+2 |

A window lands on the grid when dropped or resized. It stays in the world, and within its tool's size limits. Only the focused window has resize handles, because eight gesture views on every window would cost more than they give. A press focuses, and the next drag resizes.

**Instances.** Notes, PDFs, Whiteboard, Sylvie, Calculator and Resources can open several windows, each with its own state. Timer opens once, and pressing it again brings the window forward. **Audio is not on the shelf** (`LAUNCHER_TOOLS`): sound plays from the timer dock, anywhere in the app. A saved Audio window from before still opens. With several open, pressing a tool asks which one. At most 16 windows can be open.

**From outside Workspace.** `model.summon(tool)` brings a tool forward and waits for the canvas, so it lands in the real view. The timer dock uses it.

**Placement.** A new window goes in the clear part of the view, then beside what is open, then anywhere free in view. Only when none of those fits does it land out of view, and the camera nudges just far enough to show it. In Canvas mode a drag opens the tool at the release point, snapped to the grid inside the clear area. Dragging an existing singleton moves it. Releases over the dock or outside the clear area cancel.

**Compact (under 600 pt, Proposed).** There is no canvas. One tool fills the window, and the Command Center switches between tools. The tool strip scrolls to show the active tool. Windows keep their world positions, and crossing the width does not remount them.

## 4. Layouts

| Layout | What it does |
| --- | --- |
| **Canvas** | Move and resize tools freely on the dotted canvas |
| **Single window** | Gives the focused tool the view and minimizes the rest. The Command Center tucks behind Tools |
| **Split screen** | Two tools side by side in landscape or stacked in portrait. With one window it brings a companion, such as Notes and PDFs |
| **Assistant** | A main tool at two thirds, and Sylvie at one third |
| **Tile windows** | The open tools tile the whole screen with no canvas, gaps or chrome. The Spaces icon, timer and Command Center hide; a "Tools" handle at the bottom brings them back for a moment. Drag a seam between tiles to resize, or drag a tile's title bar onto another tile's edge to dock it there (left, right, above or below), so any arrangement can be made, such as two notes side by side with the Calculator across the top right. The arrangement is a split tree (`FillNode` in `windows.ts`) kept in `state.fill` |

Presets minimize tools outside the arrangement. Single window uses the area below the top controls and tucks the Command Center. Single and tiled tools along the bottom leave room inside the pane for the tucked Tools handle. Page-only editors use the full pane. Split screen and Assistant meet at a seam and fill the area between the top controls and the dock. Rotating or resizing reflows the same tools and preserves focus. Canvas or the collapse control restores the earlier canvas arrangement. Dragging a split pane by its title bar returns to a movable canvas.

Alt+F, Alt+S and Alt+A choose a preset, and Alt+D returns to Canvas. Escape returns any preset to Canvas.

**Saved layouts.** The Layout menu's "Save this layout" keeps the arrangement and the documents in its windows; choosing it later reopens the same documents. **The Windows sheet** opens several tools at once and closes, minimizes or expands selected windows. Scroll through the list to reach **Clear workspace**, which asks before closing windows and keeps every document and saved layout.

## 5. Backend compatibility

Every tool uses its existing backend or local owner. Calendar and Plan are in Home. Sylvie streams over the existing chat route, and Notes documents are stored in the local library. Audio uses `/api/acoustics` and files explicitly chosen from the device.

| Tool | Existing owner | What works today | What waits |
| --- | --- | --- | --- |
| Notes | `lib/notes` formats, local library (`@sylf/notes`) | **Phase 14:** typed notes (BlockNote) and handwriting, templates, notebooks, search | Sync with web Notes (ADR 0018) |
| PDFs | `lib/notes/pdf` (`sylf-pdf/1`), local library | **Phase 14:** import, pages, pen and highlighter, notes beside | Text search, PDF export, sync |
| Whiteboard | A Notes drawing document, `sylf-ink/1` | **Phase 14:** a 3200 × 2200 board, pan and zoom, full ink tools | Text boxes and images |
| Sylvie | `lib/ai`, `ChatSession`, `/api/system-messages/chat` | Real threads, and a real turn read as it arrives, on the route the web uses | Rich text, images, and confirming a proposal, which stays on the web |
| Timer | `lib/timer-engine`, `StudySession`, `/api/sessions` | A window on the one study session: the same session as the dock and Focus, with nothing of its own. Tracked on this device, and it says so | Delivery to the server (Phase 13) |
| Calculator | `lib/calculator/math-engine`, through `@sylf/shared` | **Everything. This tool is real** | Nothing |
| Audio | `/api/acoustics`, shell audio player | Catalog and local-file playback, pause, retry and volume | Codec support depends on the runtime |
| Resources | The Resource Shelf: a catalogue over the Notes library | **Phase 14:** every document, by kind, subject and notebook, the studied subject first, opens in its own window | Shared shelves (needs a backend) |

**Deferred future possibilities, needing backend work.** Saved Study Workspaces and named layouts that sync across devices. Contextual AI that reads a tool's selection. Neither is built or implied.

## 6. State and restoration

| State | Where | Survives |
| --- | --- | --- |
| Windows, positions, sizes, order, minimized | The `workspace` snapshot | Space changes, remounts, process kill, restart |
| Camera at rest | Same, written when a gesture ends | Same |
| Layout and the saved arrangement | Same | Same |
| Each tool's small state | Same, on the window, 2 KB at most | Same |
| Camera in motion, a window mid-drag | Shared values | Nothing, on purpose |
| Quick switcher, open menus, Focus reveal | Component state | Nothing |

Snapshots are written after 240 ms, on backgrounding and when Workspace leaves, through the one Spaces path. A window that cannot be read is dropped and the rest survive. A corrupt record opens an empty canvas. `SYLF_SPACES` logs a window count, not the whole layout.

## 7. Performance rules

**Keep to these. Each was measured or came from the tablet.**

1. **The camera is one transform on one view.** Never position a window from the camera. The cost of a camera move must not grow with windows.
2. **The grid is one view repeating a gradient.** A dot keeps its size at every zoom. Keep spacing in its own animated style, so a pan never redraws it, and never put a grid in a full-window SVG or bitmap.
3. **Nothing renders in React while something moves.** Visibility is checked in steps, and a state change happens only when a window crosses the edge of the view.
4. **A tool runs only when seen.** Check `isSeen(lifecycle)`, and pass it as `live` to anything on the session's clock. Derive time from epochs, so a tool loses nothing by being stopped.
5. **A hidden tool is present for memory's sake only:** opacity 0, no touches, out of the accessibility tree, and `visibility: hidden` on web. Not `display: none`, because Fabric drops the views.
6. **The budget is 8 seen and 3 warm.** Above that, content unmounts and its state stays in the snapshot. Frames stay.
7. **No shadow on anything that changes size.** The shadow layer is sized by the model and steps aside during a resize.
8. **Off-screen and far-away windows cost almost nothing.** They render a frame and a name.

Each tool is its own chunk, 1 to 4 KB on the web build. Restored windows fill in order, most recently used first, 48 ms apart, so entering a busy Workspace shows the frames at once.

## 8. Data

Workspace mounts after sign-in. Server-backed tools use authenticated resources and show their loading or error states. Notes and Resources keep using the per-account local library. The layout snapshot keeps pointers to documents, with the documents stored by the library.

## 9. Development and diagnostics

| Link | Effect |
| --- | --- |
| `?space=workspace&wsClear=1` | Empties the canvas |
| `&wsOpen=notes,pdfs,calculator` | Opens tools, in order |
| `&wsZoom=0.5` | Sets the zoom first |
| `&wsLayout=split` | Applies a preset last |
| `?r15=views` (also `text`, `pressable`, `idle`) | Replaces everything with the bare memory probe |

Android uses the same parameters on `sylf-native://spaces?...`.

## 10. Extending Workspace

1. Name the existing backend owner first, and add it to §5. No owner means defer it and write it down.
2. Add the tool to `TOOLS` in `tools.ts`, with sizes on the 28 pt grid, its icon to `icons.ts`, and its component to `ToolHost.tsx`.
3. A tool receives its window's state, lifecycle and `patch`, and nothing else. Keep `state` small: a pointer to a document, never the document.
4. Put documents on `DocumentSurface`, and keep text at `soft` or stronger.
5. Do not add a second store, a second toolbar, or per-theme layout.
6. Run `npm run desktop:workspace-check`. The tablet checks in the [Phase 8 handoff](../handoffs/phase-8.md) wait until after Phase 10.

## 11. Notes, PDFs, Whiteboard and Resources (Phase 14)

Source: [`native/packages/notes`](../../../native/packages/notes/src/) (the library, storage, templates, `InkScene`) and [`apps/sylf/src/spaces/workspace/notes`](../../../native/apps/sylf/src/spaces/workspace/notes/) (the surfaces). Decision: [ADR 0018](../decisions/0018-local-first-notes-on-native.md).

| Piece | Where | Notes |
| --- | --- | --- |
| Library | `packages/notes/src/library.ts`, `shell/notes/library.ts` | One per owner (`user:<id>` or `device`). Ordered writes, shared replicas between windows, a failure stops writing and says why |
| Storage | `idb-storage.ts` (web, desktop), `shell/notes/storage.native.ts` (SQLite, WAL) | Descriptor, Yjs updates per stream (merged after 48), assets by SHA-256 per owner |
| Notes | `NoteEditor.tsx`, `StaticText.tsx`, `PageSettings.tsx` | One kind: pages with a background, a text layer and an ink layer (ADR 0018 §8). A single editor row holds the library return, Type and Write, the current mode’s tools, and page and document actions. Insert adds a picture, a PDF after the last written page, or a blank page. Page settings change the layout (ruled, grid, dotted, Cornell, music and planners), spacing (narrow, medium, wide), paper colour or a picture, for this page or every page, and switch between separate pages and an **endless** page |
| Typed text | `RichTextDom.tsx` (Expo DOM component), `FormatBar.tsx` | BlockNote 0.56 edits the active text layer. Other pages draw their text natively. Formatting opens headings, lists, marks and other block styles. The slash menu and BlockNote templates also remain available |
| Ink | `InkView.web.tsx` (Pointer Events), `InkView.native.tsx` + `SylfInkView.kt` (Android) | Pen, highlighter, eraser (whole strokes or precise), lasso move, scale, recolour, shapes, undo. One sweep of either eraser is one undo step, and gaps between fast eraser samples are filled. An edit projects only the strokes it names, so erasing, moving or undoing costs what it touches and not the page. The editor around the ink renders only when its undo state, paper or extent changes (`scene-face.ts`). Tapping the eraser in hand opens its panel (`EraserPanel.tsx`): strokes or precise, its own size, **Pen button erases**, and **Clear this page**. On Android a pen stroke owns its events by its own pointer, so a palm resting first neither blocks the pen nor scrolls the page. Tapping the pen or highlighter in hand opens its panel (`PenPanel.tsx`): pen kind (fountain, ballpoint, fineliner, pencil, brush), size, solid, dashed or dotted line, **Pen pressure** on or off, Straighten lines, and colours in sets with your own mixed colours (`ColourSpectrum.tsx`). The tools sit on one plate at the leading edge and keep their place whatever is in hand; the tool in hand carries its ink colour, and Undo and Redo stay pinned beside the part that scrolls. The toolbar keeps three quick colours for pens and shapes and another three for highlighters, and three quick sizes for the line or the eraser. Tap a colour to use it, then tap it again to change it. Narrow editors put the full pen case, quick colours and history in **Writing tools**. Every surface writes with `brushOf` (`ink-types.ts`); with pressure off the brush records pressure 0, so live and finished strokes keep one width. Pen settings, mixed colours and the toolbar's colours are kept with the device's preferences (`ink-tool.ts`) |
| Pages | `NoteEditor.tsx`, `PagedInk.tsx` | Only pages near the view get surfaces. Paper sits under text and pictures, with ink above. The page count in Notes opens a page picker with an add-page action. Returning to an open note restores its current page |
| PDFs | `pdf-engine.web.ts` (pdf.js), `pdf-engine.native.ts` + `SylfPdf.kt` (PdfRenderer) | Originals kept byte for byte; rendered pages cached |
| Boards | `BoardCanvas.tsx` | Camera in the window's state (`bx`, `by`, `bz`) |
| Explorer | `LibraryBrowser.tsx`, `LibraryNavigation.tsx`, `LibraryGallery.tsx` | **All notes** shows typed and handwritten notes and imported PDFs from every folder. **Folders** shows the current folder’s children and documents. **Imported PDFs** and **Trash** are separate destinations. Wide panes have a folder rail. Narrow panes use **Browse library**. Expand a branch with its chevron and open a folder by its name or card. Search reaches across folders and returning from a document restores the current folder or search. |
| Views and order | `LibraryBrowser.tsx`, `packages/notes/src/library.ts` | Use the grid or list and sort by folder order, recency or name. **Arrange items** reveals arrows for reordering siblings within Folders, Pinned or the document section. Order saves per owner and folder in SQLite and IndexedDB. New items follow items that have saved positions. |
| Previews and covers | `LibraryPreview.tsx`, `packages/notes/src/library.ts` | Cards show an authored cover, a first-page excerpt with paper and ink, or the actual PDF page. Scrollable rows load previews as they enter view. Card options rename, pin, move and customize. Notes can use a PNG or JPEG, colour and icon. Folders have a colour and icon. Attachments use the owner’s existing local store. |
| Paper picker | `PaperStudio.tsx`, `PaperArt.tsx`, `NoteStyleSheet.tsx`, `PageSettings.tsx` | **Page** shows illustrated page flows and twelve paper swatches. **Template** groups actual paper previews under Basic, Academic, Planners and Journals. Basic has blank and narrow, standard and wide variants for ruled, grid and dotted paper. Default note style applies to future notes. Page settings retain the selected scope for existing notes. Paper colour is saved with the document and stays fixed when the interface theme changes. |
| Resources | `tools/ResourcesTool.tsx` | Kind, subject and notebook filters; new documents take the session's subject |

Interactions:

| Action | Touch and pen | Desktop |
| --- | --- | --- |
| Write | The pen; a finger too until the first pen stroke ("Fingers write too" turns it back) | Mouse or pen |
| Scroll a page, move a board | One finger once the pen has been seen; two fingers always | Wheel; Control or Command and the wheel zoom |
| Select | Lasso, then drag inside the box | Same |
| Erase | Eraser tool, or the S Pen's side button or eraser tip | Eraser tool |
| Open in another window | Choose **Open in a new window** from card options or long press | Use card options or drag a document onto the canvas |
| Import a PDF | **Imported PDFs** in Notes, **Import PDF** in the library menu, or **Import** in PDFs | Same, or drop a file anywhere on Workspace |
| Notes beside a PDF | The document menu, "Take notes beside this" | Same |
| Keep a layout | Layout menu, "Save this layout" | Same |
| Add a page at the end | Pull from the end of a scrollable note and release when the progress indicator is full. The page picker and Insert menu also add pages | Pause at the end and keep scrolling until the progress indicator fills. Ordinary scrolling stops at the paper edge |
| Endless note | New, "Note, endless", or Page settings, Endless: writing near the end extends the page | Same |
| Only the page and toolbar | **Full screen** in the editor row or **Document options** on narrow windows. This uses the full safe area, including on compact screens. **Exit full screen** returns to the Workspace desk | Same |
| Jump to a page | Tap the page count and choose a page | Same |
| Zoom a page | Two fingers, or the zoom actions in **Document options**. Notes and PDFs zoom from 50% to 300% of the fitted page width | Control or Command and the wheel over the document or its margins, a trackpad pinch, or **Document options**. The percentage in a wide note toolbar opens a zoom menu. While the zoom changes, by any input, it shows live at the top right of the document (`ZoomBadge.tsx`) |
| Shapes | Choose line, rectangle or ellipse, then draw roughly: the shape takes the bounds of what you drew (a line goes end to end) | Same, or drag corner to corner |
| New note or whiteboard | **New note** or **New whiteboard** opens a name prompt. Leave it blank for an automatic title | Same |
| Note style | Open **Note style** in the library for Page and Template. Use **Whiteboard style** in Whiteboards for its background | Same |
| Rename | Tap the name in the window's title bar | Click it |
| Find or do anything | The search button at the top right of every Space | Command or Control + K |

Budgets: typed-note editors run for the most recently used two windows on Android and six on desktop. The rest show their text, and a touch brings the editor back.

**The command palette** (`shell/palette/`) searches every note, PDF and board by title and text, the tools, open windows, Spaces and Home pages, the study session, layouts and saved layouts, and offers New note, New endless note, New whiteboard, Import a PDF and Close all windows. It reads each owner's own state and keeps no index. It replaced Workspace's quick switcher.

**Sound in the timer dock** (`shell/audio/DockSound.tsx`). The dock's panel chooses, plays, pauses and sets the volume of a sound through the one audio engine, anywhere in the app. While a sound is chosen, a small plate beside the resting timer shows bars that move as it plays.
