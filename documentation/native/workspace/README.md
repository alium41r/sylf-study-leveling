# Sylf Workspace

**Phases 7, 8 and 10, 31 October 2026.** The current contract for the Workspace Space in Sylf Native. Source wins if anything here disagrees: [`native/packages/spaces/src/workspace`](../../../native/packages/spaces/src/workspace/) and [`native/apps/sylf/src/spaces/workspace`](../../../native/apps/sylf/src/spaces/workspace/). Decisions are in [ADR 0006](../decisions/0006-workspace-canvas-and-windows.md), and the evidence is in the [Phase 7](../reports/phase-7/report.md) and [Phase 8](../reports/phase-8/report.md) reports.

Labels: **Confirmed** came from the owner's brief or master plan. **Proposed** is a decision from these phases the owner can still change.

**Updated 4 November 2026 (Expansion Part 2).** Workspace has **eight tools**: Notes, PDFs, Whiteboard, Sylvie, Calculator, Timer, Audio and Resources. **Planner and Calendar moved to Home's Plan** once its parity list passed ([ADR 0014](../decisions/0014-home-hub-and-workspace-scope.md)), and Alt+1 to 9 and Alt+0 follow the new order. A saved layout that held them still opens, because unknown tools are dropped and the rest survives. The Timer tool offers **Enter focus**, and Audio is the one native engine, shared with the Focus environment. Text below that names Planner or Calendar describes Workspace as it was in Phase 13.

**Updated 5 November 2026 (Phase 14).** Notes, PDFs, Whiteboard and Resources are real, over one local-first Notes library in the web's own formats ([ADR 0018](../decisions/0018-local-first-notes-on-native.md), [§11](#11-notes-pdfs-whiteboard-and-resources-phase-14)). Workspace adds named saved layouts, drag and drop on desktop, "open beside", and a running-editor budget. Rows below that say Phase 14 owns these tools describe Workspace before Phase 14.

## 1. What exists

Workspace is a real window manager. **With an account, Planner, Calendar, Sylvie and Audio's catalog are real, and Calculator and Timer always were. Notes, PDFs, Whiteboard and Resources say honestly that Phase 14 owns them.** The canvas, windows, presets, persistence and suspension all work. Without an account the tools are templates on sample data, except the Calculator, which is real.

| Layer | Location | Owns |
| --- | --- | --- |
| Canvas math | `packages/spaces/src/workspace/canvas.ts` | World, camera, zoom, bounds, reveal and fit, the grid. Worklets where the UI thread needs them |
| Tool contract | `.../workspace/tools.ts` | Ten tools: label, sizes, instance rule, capabilities, backend owner |
| Windows | `.../workspace/windows.ts` | `WorkspaceState`, parsing, every change to it, placement, presets. Pure functions |
| Lifecycle | `.../workspace/lifecycle.ts` | Which content stays alive |
| Model | `.../workspace/model.ts` | `createWorkspaceModel(store)`: the only owner, written through the `workspace` snapshot |
| Space | `apps/sylf/src/spaces/workspace/WorkspaceSpace.tsx` | What each window may do right now: what is in view, what stays alive, what chrome covers |
| Canvas | `WorkspaceCanvas.tsx`, `DotGrid.tsx`, `useCamera.ts`, `canvas-input(.web).ts` | Gestures, the grid, the world layer, the camera in motion |
| Windows | `WorkspaceWindow.tsx`, `ToolHost.tsx` | One window's frame, gestures and keyboard. Lazy tool content |
| Command Center | `CommandCenter.tsx`, `DockShelf.tsx`, `QuickSwitcher.tsx` | Tools, layouts, canvas controls, minimized windows, auto-hide, type to open |
| Keys | `workspace-keys(.web).ts` | Desktop shortcuts |
| Tools | `tools/` | Ten shells, each a separate chunk, plus `shared.tsx` |
| Data | `data/` | Typed contracts, the sample and empty adapters, the one binding point |

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
| Second instance | Long press, New window | Right-click, New window | The command palette |
| Open several, close several, clear | The Windows button in the Command Center | Same | |
| Move | Drag the title bar | Same | Focus the title bar, arrow keys |
| Resize | Drag an edge or corner of the focused window (a grip marks it) | Same, with resize cursors | Shift and arrow keys on the title bar |
| Focus | Press anywhere in it | Same | Alt+] and Alt+[ |
| Minimize, restore | Minimize button, then the chip above the Command Center | Same | Alt+M, then the switcher |
| Close | Close button | Same | Alt+W |
| Fill the view | Double tap the title bar | Double click | Shift+2 |

A window lands on the grid when dropped or resized. It stays in the world, and within its tool's size limits. Only the focused window has resize handles, because eight gesture views on every window would cost more than they give. A press focuses, and the next drag resizes.

**Instances.** Notes, PDFs, Whiteboard, Sylvie, Calculator and Resources can open several windows, each with its own state. Timer opens once, and pressing it again brings the window forward. **Audio is not on the shelf** (`LAUNCHER_TOOLS`): sound plays from the timer dock, anywhere in the app. A saved Audio window from before still opens. With several open, pressing a tool asks which one. At most 16 windows can be open.

**From outside Workspace.** `model.summon(tool)` brings a tool forward and waits for the canvas, so it lands in the real view. The timer dock uses it.

**Placement.** A new window goes in the clear part of the view, then beside what is open, then anywhere free in view. Only when none of those fits does it land out of view, and the camera nudges just far enough to show it.

**Compact (under 600 pt, Proposed).** There is no canvas. One tool fills the window, and the Command Center switches between tools. Windows keep their world positions, and crossing the width does not remount them.

## 4. Layouts

| Layout | What it does |
| --- | --- |
| **Free** | The person's own arrangement |
| **Focus** | One tool fills the view at 100%. The rest are minimized. The Command Center slides away and leaves a handle. Escape goes back |
| **Split** | Two tools side by side. With only one open, it brings a sensible companion: Notes and PDFs pair up |
| **Assistant** | A main tool at two thirds, and Sylvie at one third |
| **Full screen** | The open tools tile the whole screen with no canvas, gaps or chrome. The Spaces icon, timer and Command Center hide; a "Tools" handle at the bottom brings them back for a moment. Drag a seam between tiles to resize, or drag a tile's title bar onto another tile's edge to dock it there (left, right, above or below), so any arrangement can be made, such as two notes side by side with the Calculator across the top right. The arrangement is a split tree (`FillNode` in `windows.ts`) kept in `state.fill` |

Presets are computed fresh around the view each time. They minimize what they do not use and close nothing. The arrangement they replaced is kept, and the Free entry reads **Back to my layout** while it is. Moving or resizing by hand makes the arrangement the person's own. A tool with a size limit leaves no hole: the group stays together and centered.

Alt+F, Alt+S and Alt+A choose a preset, and Alt+D returns to Free. Escape leaves Focus and Full screen.

**Saved layouts.** The Layout menu's "Save this layout" keeps the arrangement and the documents in its windows; choosing it later reopens the same documents. **The Windows sheet** opens several tools at once, and closes, minimizes or puts in full screen the windows chosen; "Close all and clear the canvas" asks first and keeps every document and saved layout.

## 5. Backend compatibility

**Confirmed (owner).** Every tool is a new frontend over something Sylf already has. **Phase 11 audited this table,** and Phase 13 connects it. Notes are local-first: the server stores no note and no `/api/notes` list exists, so Notes, PDFs, Whiteboard and Resources have no route to connect, keep their sample notices after Phase 13, and wait for Phase 14. Planner reads `Quest` and `Goal`, which have dates and no time of day. Calendar should read `/api/calendar/personal`, because `calendar/month` also reconciles HP penalties. Sylvie reads `/api/chats` and `/api/system-messages?sessionId=`, and streams over SSE, which is unproven on Hermes. Audio's `/api/acoustics` is public, and its URLs are relative to the web origin.

| Tool | Existing owner | What works today | What waits |
| --- | --- | --- | --- |
| Notes | `lib/notes` formats, local library (`@sylf/notes`) | **Phase 14:** typed notes (BlockNote) and handwriting, templates, notebooks, search | Sync with web Notes (ADR 0018) |
| PDFs | `lib/notes/pdf` (`sylf-pdf/1`), local library | **Phase 14:** import, pages, pen and highlighter, notes beside | Text search, PDF export, sync |
| Whiteboard | A Notes drawing document, `sylf-ink/1` | **Phase 14:** a 3200 × 2200 board, pan and zoom, full ink tools | Text boxes and images |
| Planner | `Quest`, `Goal`, `/api/calendar/personal` | Today's events, quests and goals. A tick completes a quest through the server, and Study this fills in the Timer | AI Planner V2's lifecycle and `ApplyService` stay on the web, unimitated, and the tool says so |
| Calendar | `CalendarEvent`, `/api/calendar` | A real month, month changes, day selection | Real events |
| Sylvie | `lib/ai`, `ChatSession`, `/api/system-messages/chat` | Real threads, and a real turn read as it arrives, on the route the web uses | Rich text, images, and confirming a proposal, which stays on the web |
| Timer | `lib/timer-engine`, `StudySession`, `/api/sessions` | A window on the one study session: the same session as the dock and Focus, with nothing of its own. Tracked on this device, and it says so | Delivery to the server (Phase 13) |
| Calculator | `lib/calculator/math-engine`, through `@sylf/shared` | **Everything. This tool is real** | Nothing |
| Audio | `AcousticTrack`, `/api/acoustics`, `lib/acoustics` | Choosing a sound, volume | Playback. Play is disabled and says why |
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

Tools never import sample data. They call `useToolResult()`, which reads the adapter from `data/index.ts`, and each result carries `provenance`, which puts **Sample** in the title bar.

| Build | Adapter |
| --- | --- |
| Someone signed in | Live, or `limited` for a tool Phase 14 owns |
| A backend, and nobody signed in | Empty |
| No backend, `DEV_TOOLS` on (a development build) | Sample, invented and marked |
| No backend, `DEV_TOOLS` off | Empty. **A store build cannot show sample content**, and a test covers this |
| App link `homeData=empty` | The empty state, for review |

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
| Notes | `NoteEditor.tsx`, `StaticText.tsx`, `PageSettings.tsx` | One kind: pages with a background, a text layer and an ink layer (ADR 0018 §8). A Type and Write switch changes the toolbar. Insert adds a picture, a PDF (after the last written page) or a blank page. Page settings change the layout (ruled, grid, dotted, Cornell, music and planners), spacing (narrow, medium, wide), paper colour or a picture, for this page or every page, and switch between separate pages and an **endless** page |
| Typed text | `RichTextDom.tsx` (Expo DOM component), `FormatBar.tsx` | BlockNote 0.56 on the page being typed on; every other page draws its text natively. "/" menu; templates inserted by BlockNote |
| Ink | `InkView.web.tsx` (Pointer Events), `InkView.native.tsx` + `SylfInkView.kt` (Android) | Pen, highlighter, eraser (whole strokes or precise), lasso move, scale, recolour, shapes, undo. One eraser sweep is one undo step, and gaps between fast eraser samples are filled. Tapping the pen or highlighter in hand opens its panel (`PenPanel.tsx`): pen kind (fountain, ballpoint, fineliner, pencil, brush), size, solid, dashed or dotted line, **Pen pressure** on or off, Straighten lines, and colours in sets with your own mixed colours (`ColourSpectrum.tsx`). The toolbar keeps three colours of your own, one set for pens and shapes and one for highlighters: tap one to write with it, tap it again to change it from the spectrum. Every surface writes with `brushOf` (`ink-types.ts`); with pressure off the brush records pressure 0, so live and finished strokes keep one width. Pen settings, mixed colours and the toolbar's colours are kept with the device's preferences (`ink-tool.ts`) |
| Pages | `NoteEditor.tsx`, `PagedInk.tsx` | Only pages near the view get surfaces, and each covers only its visible part. Paper is drawn under the text and pictures, ink over them |
| PDFs | `pdf-engine.web.ts` (pdf.js), `pdf-engine.native.ts` + `SylfPdf.kt` (PdfRenderer) | Originals kept byte for byte; rendered pages cached |
| Boards | `BoardCanvas.tsx` | Camera in the window's state (`bx`, `by`, `bz`) |
| Folders | `LibraryBrowser.tsx` | Folders and subfolders with a colour and icon, a breadcrumb, move, rename, and search across every folder |
| Resources | `tools/ResourcesTool.tsx` | Kind, subject and notebook filters; new documents take the session's subject |

Interactions:

| Action | Touch and pen | Desktop |
| --- | --- | --- |
| Write | The pen; a finger too until the first pen stroke ("Fingers write too" turns it back) | Mouse or pen |
| Scroll a page, move a board | One finger once the pen has been seen; two fingers always | Wheel; Control or Command and the wheel zoom |
| Select | Lasso, then drag inside the box | Same |
| Erase | Eraser tool, or the S Pen's side button or eraser tip | Eraser tool |
| Open in another window | Long press, "Open in a new window" | Drag a card onto the canvas |
| Import a PDF | PDFs, Import | Same, or drop a file anywhere on Workspace |
| Notes beside a PDF | The document menu, "Take notes beside this" | Same |
| Keep a layout | Layout menu, "Save this layout" | Same |
| Add a page at the end | At the end of the last page, pull up until the zone below is fully shown, and let go without flicking. A fling or a short pull adds nothing, and the zone springs back | Pause at the end, then keep scrolling |
| Endless note | New, "Note, endless", or Page settings, Endless: writing near the end extends the page | Same |
| Only the page and toolbar | The small **Full screen** pill at the toolbar's right end; Exit brings the bars back and leaves full screen | Same |
| Zoom a page | Two fingers (one finger scrolls) | Control or Command and the wheel, or a trackpad pinch |
| Shapes | Choose line, rectangle or ellipse, then draw roughly: the shape takes the bounds of what you drew (a line goes end to end) | Same, or drag corner to corner |
| New note or whiteboard | **New**, give it a name (or none for an automatic title); it opens in the note style | Same |
| Note style | The **gear** in the library: pages or endless, layout, spacing, paper, starting template, Type or Write, whiteboard background | Same |
| Rename | Tap the name in the window's title bar | Click it |
| Find or do anything | The search button at the top right of every Space | Command or Control + K |

Budgets: typed-note editors run for the most recently used two windows on Android and six on desktop. The rest show their text, and a touch brings the editor back.

**The command palette** (`shell/palette/`) searches every note, PDF and board by title and text, the tools, open windows, Spaces and Home pages, the study session, layouts and saved layouts, and offers New note, New endless note, New whiteboard, Import a PDF and Close all windows. It reads each owner's own state and keeps no index. It replaced Workspace's quick switcher.

**Sound in the timer dock** (`shell/audio/DockSound.tsx`). The dock's panel chooses, plays, pauses and sets the volume of a sound through the one audio engine, anywhere in the app. While a sound is chosen, a small plate beside the resting timer shows bars that move as it plays.
