# Sylf Workspace

**Phases 7, 8 and 10, 31 October 2026.** The current contract for the Workspace Space in Sylf Native. Source wins if anything here disagrees: [`native/packages/spaces/src/workspace`](../../../native/packages/spaces/src/workspace/) and [`native/apps/sylf/src/spaces/workspace`](../../../native/apps/sylf/src/spaces/workspace/). Decisions are in [ADR 0006](../decisions/0006-workspace-canvas-and-windows.md), and the evidence is in the [Phase 7](../reports/phase-7/report.md) and [Phase 8](../reports/phase-8/report.md) reports.

Labels: **Confirmed** came from the owner's brief or master plan. **Proposed** is a decision from these phases the owner can still change.

**What is planned (1 November 2026, not built).** **Confirmed, and approved by the owner:** Workspace is a dedicated multitasking study environment. Calendar, AI Planner, quests and objectives belong in Home. Planner and Calendar leave as tools once Home's parity is verified, in one change, and nothing is lost. **Today gains a tick first,** because today only Workspace's Planner has one. The list and the files are in [Part 2 slice C](../expansion/part-2-study-progression-personalization.md#removing-workspaces-planner-and-calendar), and the decisions in [ADR 0014](../decisions/0014-home-hub-and-workspace-scope.md). **Everything below describes what is built today, including ten tools.**

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

A wheel over a tool that can still scroll belongs to the tool. Reduced motion turns coasting off, and every animated move through `move()`.

Canvas controls are at the far end of the Command Center: **Fit Workspace** frames every open window, or the whole world if there are none. **Reset View** returns to the middle at 100%. The zoom button also offers Zoom in, Zoom out and Actual size.

## 3. Windows

| Action | Touch or stylus | Mouse | Keyboard (desktop) |
| --- | --- | --- | --- |
| Open | Tap a tool. Long press for a menu | Click. Right-click for a menu | Alt+1 to 9, Alt+0, or Command or Control + K |
| Second instance | Long press, New window | Right-click, New window | Command or Control + K |
| Move | Drag the title bar | Same | Focus the title bar, arrow keys |
| Resize | Drag an edge or corner of the focused window (a grip marks it) | Same, with resize cursors | Shift and arrow keys on the title bar |
| Focus | Press anywhere in it | Same | Alt+] and Alt+[ |
| Minimize, restore | Minimize button, then the chip above the Command Center | Same | Alt+M, then the switcher |
| Close | Close button | Same | Alt+W |
| Fill the view | Double tap the title bar | Double click | Shift+2 |

A window lands on the grid when dropped or resized. It stays in the world, and within its tool's size limits. Only the focused window has resize handles, because eight gesture views on every window would cost more than they give. A press focuses, and the next drag resizes.

**Instances.** Notes, PDFs, Whiteboard, Sylvie, Calculator and Resources can open several windows, each with its own state. Planner, Calendar, Timer and Audio open once, and pressing them again brings the window forward. With several open, pressing a tool asks which one. At most 16 windows can be open.

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

Presets are computed fresh around the view each time. They minimize what they do not use and close nothing. The arrangement they replaced is kept, and the Free entry reads **Back to my layout** while it is. Moving or resizing by hand makes the arrangement the person's own. A tool with a size limit leaves no hole: the group stays together and centered.

Alt+F, Alt+S and Alt+A choose a preset, and Alt+D returns to Free.

## 5. Backend compatibility

**Confirmed (owner).** Every tool is a new frontend over something Sylf already has. **Phase 11 audited this table,** and Phase 13 connects it. Notes are local-first: the server stores no note and no `/api/notes` list exists, so Notes, PDFs, Whiteboard and Resources have no route to connect, keep their sample notices after Phase 13, and wait for Phase 14. Planner reads `Quest` and `Goal`, which have dates and no time of day. Calendar should read `/api/calendar/personal`, because `calendar/month` also reconciles HP penalties. Sylvie reads `/api/chats` and `/api/system-messages?sessionId=`, and streams over SSE, which is unproven on Hermes. Audio's `/api/acoustics` is public, and its URLs are relative to the web origin.

| Tool | Existing owner | What works today | What waits |
| --- | --- | --- | --- |
| Notes | `lib/notes`, envelope v1, `/api/notes` | Choosing a sample note, per window | The editor (Phase 14, R3) |
| PDFs | `lib/notes/pdf`, PDF sources in Notes | Choosing a document, paging, per window | A real renderer (R4) |
| Whiteboard | A Notes drawing document, `sylf-ink/1` | Choosing a drawing | Native ink (R2). Pen and eraser are disabled and say so |
| Planner | `Quest`, `Goal`, `/api/calendar/personal` | Today's events, quests and goals. A tick completes a quest through the server, and Study this fills in the Timer | AI Planner V2's lifecycle and `ApplyService` stay on the web, unimitated, and the tool says so |
| Calendar | `CalendarEvent`, `/api/calendar` | A real month, month changes, day selection | Real events |
| Sylvie | `lib/ai`, `ChatSession`, `/api/system-messages/chat` | Real threads, and a real turn read as it arrives, on the route the web uses | Rich text, images, and confirming a proposal, which stays on the web |
| Timer | `lib/timer-engine`, `StudySession`, `/api/sessions` | A window on the one study session: the same session as the dock and Focus, with nothing of its own. Tracked on this device, and it says so | Delivery to the server (Phase 13) |
| Calculator | `lib/calculator/math-engine`, through `@sylf/shared` | **Everything. This tool is real** | Nothing |
| Audio | `AcousticTrack`, `/api/acoustics`, `lib/acoustics` | Choosing a sound, volume | Playback. Play is disabled and says why |
| Resources | The Resource Shelf: a catalogue over Notes | Filtering, and opening an entry in the right tool | Real entries |

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
