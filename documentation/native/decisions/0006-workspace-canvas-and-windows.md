# ADR 0006 — Workspace canvas and windows

**Status: Accepted with Phases 7 and 8 (31 October 2026), subject to the owner's review.** This builds on [ADR 0004](0004-global-spaces-shell.md) and [ADR 0005](0005-home-interface-template.md). The current contract is the [Workspace guide](../workspace/README.md), and the evidence is in the [Phase 7](../reports/phase-7/report.md) and [Phase 8](../reports/phase-8/report.md) reports.

The owner's brief asked for reversible decisions to be made and documented overnight, so nothing here waited for an answer. **Confirmed** came from the owner's briefs. **Proposed** is a decision from these phases that the owner can still change.

**Planned change, 1 November 2026.** [ADR 0014](0014-home-hub-and-workspace-scope.md) moves Planner and Calendar to Home. The two tools leave Workspace once Home has parity, leaving eight. This record still describes what is built.

## Decisions

| # | Decision | Status | Why |
| --- | --- | --- | --- |
| 1 | **W1.** "Workspace" is the Space: the canvas and its windows. A Study Workspace, when it arrives, is a saved context opened inside it. | Proposed | The master plan's proposed answer. Nothing built here prevents it, because a saved context can be a stored `WorkspaceState`. |
| 2 | **W2.** One Workspace per person for now. | Proposed | Several saved contexts need the Study Workspaces backend. |
| 3 | **W3.** The Command Center is bottom center. In Focus it slides away and leaves a small handle. | Proposed | The master plan's proposed answer. Home indicator and gesture bar placement still need the tablet. |
| 4 | **W4.** Under 600 pt there is no canvas: one tool fills the window and the Command Center switches between tools. | Proposed | A 340 pt canvas holds nothing useful. Windows keep their world positions, and crossing the width does not remount them. |
| 5 | **W5, extent.** The world is finite: 5600 × 3640 pt, 200 × 130 cells of 28 pt. The camera can look 120 pt past each edge, so the edge is seen. | Confirmed direction (finite), Proposed (size) | About four full tablet screens each way: room to spread out, and small enough to come back from. |
| 6 | **W5, zoom.** 20% to 200%, and zoom scales everything, tools included. There is no separate tool zoom. | Proposed | One rule is easier to hold in mind, and it makes the camera one transform. Tools read best at 100%, which is where presets put them. |
| 7 | **W5, snapping.** A window lands on the 28 pt grid when it is dropped or resized. It moves freely until then. | Proposed | The dots mean something, and tidy arrangements come for free. |
| 8 | Positions and sizes are world coordinates. The camera is the world point at the middle of the view, plus a zoom. | Confirmed direction | A saved camera means the same place after a resize or rotation, and a camera move touches no window. |
| 9 | Windows live in one world layer, and the camera is one transform on it. Nothing is laid out while it moves. | Proposed | The frame cost of a camera move does not grow with the number of windows. Measured: a full Workspace of 16 windows holds the same frames as four. |
| 10 | The grid is one view that repeats a small radial gradient. A dot stays one size at every zoom, and only the spacing follows the camera. A pan moves the view and redraws nothing, and a zoom redraws the dots. As the view pulls back, a dot stands for twice as much of the world, so spacing stays within one octave. **Changed on 31 October 2026 at the owner's request:** the first version scaled a plate of bitmap tiles, and the dots grew with it. | Confirmed (owner) | Constant dots cannot come from scaling a bitmap. No new dependency, no full-window image, and web and Android share one renderer. |
| 11 | `createWorkspaceModel(store)` is the only owner, outside React, writing through the `workspace` snapshot. There is no second copy. | Confirmed (handoff: one persistence path) | State survives a Space change, a recreated root and a process kill. Pure logic is tested without a renderer. |
| 12 | While something moves, shared values on the UI thread are the truth. At rest, the model is. A gesture commits when it ends, and any other model change animates the shared values to match. | Proposed | Dragging renders nothing in React, and the two cannot disagree for long. |
| 13 | Notes, PDFs, Whiteboard, Sylvie, Calculator and Resources allow several windows. Planner, Calendar, Timer and Audio allow one, and a second press brings it forward. | Proposed | One timer authority and one audio engine cannot be doubled (master plan O8). Planner and Calendar are each one view of one account. |
| 14 | At most 16 windows. | Proposed | A cap keeps the worst case measurable. Going over it opens nothing, and says so. |
| 15 | A new window goes in the clear part of the view, then beside what is open, then anywhere free in view. Only then does it land out of view, and the camera nudges just far enough to show it. | Proposed | Tools arrange themselves side by side, and the camera moves only as far as it must. |
| 16 | A window's frame is always mounted. Its content is `active`, `visible`, `background` or `suspended`, with a budget of 8 seen and 3 warm. | Proposed (master plan lifecycle) | Risk R15: remounting costs native memory, so a few stay warm. A budget keeps the rest from running or holding memory. |
| 17 | Below 45% a window shows its name in large type, not its content, and pressing it goes there. | Proposed | Nobody reads a tool at that size, and it releases what would be rendered for nothing. |
| 18 | The shadow is a still layer at the size the model agreed. It steps aside during a resize and returns at the end. | Confirmed by Phase 5 rule 1 | A blurred shadow on a surface that changes size is redrawn at every size, and the GPU keeps each one. |
| 19 | Resize handles exist only on the focused window. | Proposed | Eight gesture views on 16 windows would cost more than the convenience. A press focuses, and the next drag resizes. |
| 20 | A preset is computed fresh around the view at 100%. It minimizes what it does not use and closes nothing. The arrangement it replaced is kept, and "Back to my layout" returns it. | Confirmed (plan: a preset is a starting point) | No adjustment can change what a preset means, and a preset can never cost someone their arrangement. |
| 21 | Moving or resizing by hand makes the arrangement the person's own, and drops the saved one. | Proposed | At that point it is theirs. |
| 22 | A group stays together and centered when a tool's size limit stops it filling its share. | Proposed | A Calculator in Split would otherwise leave a hole beside it. |
| 23 | Drag on empty canvas pans, with a finger, a mouse or a pen. A pinch zooms the canvas, with the exception in decision 31. Two-finger scroll pans and a trackpad pinch or Control-wheel zooms. A wheel over a tool that can still scroll belongs to the tool. Holding Space pans from anywhere on desktop. | Proposed | Tools own their content, and the canvas stays reachable. The pen question returns with ink in Phase 14. |
| 24 | Every action has a key on desktop. Tools are Alt+digit, because Command or Control with a digit is kept for Spaces (master plan §3.1). Keys are matched physically, because Option changes letters on a Mac. | Proposed | Master plan §3.3. Android needs a native key module for global keys, so it has focus navigation only. |
| 25 | A quick switcher opens with Command or Control + K. | Proposed | Master plan §3.3 called it a strong candidate. It searches only what Workspace knows, so it needs no backend. |
| 26 | Tool data follows Home: typed view models, a `provenance` on every result, an empty adapter without `DEV_TOOLS`. | Confirmed (master plan §5.4) | Phase 13 swaps an adapter and no tool changes. |
| 27 | The Calculator is real, through `@sylf/shared`. The Timer is a clearly labelled practice countdown on the real timer engine that records nothing. | Proposed | Real where it can be. A practice timer is the one honest way to show epoch-based time surviving suspension, and it cannot be mistaken for a session. |
| 28 | Documents sit on `DocumentSurface`, and a new window starts on a document no other window of that tool has open. | Confirmed (documents) and Proposed (choice) | Themes never touch documents. Two Notes windows should be two notes. |
| 29 | A window's `state` is small and bounded (2 KB). A document never goes in it, only a pointer. | Proposed | Snapshots stay small, and owners stay owners. |
| 30 | `Segmented` idle labels and `TextField` helpers moved from `faint` to `soft`. | Proposed | The same fix as ADR 0005 decision 19. Workspace's audit measured 3.61:1. |
| 31 | Two fingers on Notes, PDFs or Whiteboard belong to the tool, and the canvas does not move. Those tools carry `ownsPinch`, and their own zoom arrives with their real content. Two fingers on any other tool zoom the canvas. One finger on a window and one on the canvas also zoom the canvas. | Confirmed (owner) for the rule, Proposed for the straddle and for which tools | Zooming a document is what a person means on a document, and a Calculator has nothing to zoom. The canvas keeps its own `ceded` flag as well as failing the gesture, because the web delivers the second finger before the gesture has begun, too early to fail it. Electron's touch check found this. |
| 32 | The second finger takes over at once. Pan, window drag and resize stand down, the pinch runs alongside them, and a finger left down carries on panning from where the pinch put the camera. | Proposed | The first version let a one-finger pan win when each finger landed on something different, which read as the view snapping. |
| 33 | The update as a finger lifts is ignored. It reports the remaining finger as the focal point, half the fingers' spread away. | Confirmed by measurement | Every pinch on Android snapped by exactly that distance. |
| 34 | Workspace enters without a scale, and the Command Center's shadow is a still layer that fades in once the entrance has ended. | Proposed | The GPU kept a copy of the blurred shadow for every frame of the entrance: about 66 MB per entrance, now about 15 MB. |

## Deferred future possibilities

None is built or implied. **Needs backend work:** saved Study Workspaces and named layouts that sync across devices, contextual AI that reads a tool's selection. **Frontend, later:** dragging a window to the edge of the view to pan the camera with it, the session indicator (nothing can start a session until Phase 13), snapping windows to each other, Android global shortcuts, and pen-specific canvas behavior (Phase 14).

## Alternatives considered

| Option | Why not |
| --- | --- |
| An endless canvas | The brief asks for a large but finite one, and it is easy to get lost on an endless one |
| Windows transformed individually | Every window would do work on every camera frame |
| Tool content that keeps its size while the world zooms | Windows would stop lining up with the grid, and a pen would need two mappings |
| A fixed preset grid instead of free windows | The brief asks for free movement, and a preset already gives a tidy start |
| Ghost outline during resize | Works, but it hides what the tool does at the new size. A still shadow layer costs little more |
| Mounting every open tool | Hidden tools would run and hold memory, which the brief rules out |
| Unmounting everything hidden | Phase 6 measured remounting as worse for native memory, so a few stay warm |
| A second store for Workspace | ADR 0004 and the Spaces guide forbid a second persistence path |
| A grid as CSS on desktop and tiles on the tablet | Two renderers for one thing |
| A view for every dot, or a canvas library | About 1,400 views moved every frame, or a substantial new dependency, for what a repeating gradient does |

## Consequences

- `@sylf/spaces` now owns most of Workspace, and all of it is tested without a renderer.
- Phase 11 audits the tool table in the Workspace guide, and Phase 13 replaces `workspaceDataFor`.
- Phase 14 decides how a pen behaves on the canvas, and how `suspended` releases decoded PDF pages and ink rasters.
- `npm run desktop:workspace-check` and the Workspace memory sweeps are regression checks.
