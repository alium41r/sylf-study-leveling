# Sylf Native — Phase 7 report: Workspace Interface and Command Center

**31 October 2026. Status: complete, stable checkpoint. The owner authorized Phase 8 to follow without a stop.** This is the record of the Phase 7 checkpoint. Windows were then extended in Phase 8, so the current contract is the [Workspace guide](../../workspace/README.md), the decisions are in [ADR 0006](../../decisions/0006-workspace-canvas-and-windows.md), and the entry point for the next session is the [Phase 8 handoff](../../handoffs/phase-8.md).

## Summary

| Deliverable | Result at this checkpoint |
| --- | --- |
| Large, finite dotted canvas | Built. 5600 × 3640 pt, 200 × 130 cells, with a visible edge |
| Bounded zoom and pan | Built. 20% to 200%, any direction, stops at the edge. Drag, wheel, pinch and coasting |
| Stable world coordinates and camera | Built. Camera saved as a world point and a zoom, and restored after a reload |
| Command Center | Built. Ten tools, open state, the Marker on the focused tool, right-click and long-press menus, canvas controls |
| Fit Workspace, Reset View | Built, with a zoom menu |
| Ten tool shells | Built, each with a named backend owner and a sample badge from `provenance`. Calculator is real |
| Responsive desktop and tablet layouts | Verified at 1680, 1280, 820 and 900 × 480 on Electron. A compact window was not finished here: see §5 |
| All themes | All six in both modes, plus two hard custom color pairs |
| Web app, backend, database | Unchanged. Nothing is committed |

## 1. What was built

```
native/packages/spaces/src/workspace/
├── canvas.ts          world, camera, zoom, bounds, reveal and fit, dot grid plate (no React)
├── tools.ts           the tool contract: sizes, instance rules, capabilities, backend owner
├── windows.ts         state, parsing, every change to it (Phase 8 extended this)
├── lifecycle.ts       which content stays alive
└── model.ts           createWorkspaceModel(store), the only owner, writing the `workspace` snapshot
native/apps/sylf/src/spaces/workspace/
├── WorkspaceSpace.tsx, WorkspaceCanvas.tsx, DotGrid.tsx, useCamera.ts, canvas-input(.web).ts
├── CommandCenter.tsx, WorkspaceWindow.tsx, ToolHost.tsx, icons.ts
├── data/              contracts, sample and empty adapters, the one binding point
└── tools/             ten lazily loaded shells
native/apps/desktop/src/workspace-check.mjs   Electron check
```

**The camera is one transform on one view.** Windows sit in a world layer, so panning and zooming lay out nothing, however many windows are open. The grid is a second transform on one plate of about 35 tiles sharing one bitmap. Both are computed on the UI thread from three shared values, and nothing renders in React until a window crosses the edge of the view.

**Each tool is a separate chunk.** On the web build they are 1.3 to 3.5 KB each, and `WorkspaceSpace` is 28 KB.

## 2. Unit and static checks (`native/`)

| Check | Result |
| --- | --- |
| `npm run verify` | Pass: typecheck, lint, 169 tests in 12 files, boundaries, single-copy, web build (Phase 6: 110 in 10) |

## 3. Electron on macOS (Electron 45.1.0, Chromium 156, MacBook Air M1, 8 GB)

| Check | Result |
| --- | --- |
| Workspace check | **73/73** ([results](evidence/electron/electron-workspace-check.json)) |
| Spaces check (regression) | **52/52**, after the retention rule below |
| Home check (regression) | **71/71** |
| Security self-test | Pass |

| Measure | Value |
| --- | --- |
| Frames while panning with four tools open | p50 16.7 ms, p95 18.1 ms, max 18.6 ms (60 Hz) |
| Frames while zooming with four tools open | p50 16.7 ms, p95 17.9 ms, max 18.6 ms |
| Space switch (regression) | Median about 23 ms |
| Retention, 28 tool opens and closes after a forced GC | Nodes move between 546 and 718 with no growth, heap 11.1 to 11.5 MB and slowing |
| Retention, 12 Workspace re-entries with four tools open | Nodes flat at 1124, heap 13.2 to 14.1 MB and slowing |

**A retention rule changed.** `switchingRetainsNoNodes` compared the last sample with an early one. Now that Workspace has real content, the last Space left can stay referenced until the next change, so samples move between two levels: 303 and 508 in the Spaces check, and the run returned to 303. The rule now fails only if a higher level appears later on, which is what it was for.

## 4. Decisions

Recorded in [ADR 0006](../../decisions/0006-workspace-canvas-and-windows.md). W1, W2, W3 and most of W5 were settled here, as Proposed, because the owner's brief asked for reversible decisions to be made and documented.

## 5. Open at this checkpoint

- **Compact windows.** A window under 600 pt showed a tool wider than the screen. Phase 8 added a one-tool layout.
- **Windows could not be moved or resized,** and there were no presets. Phase 8.
- **Nothing here ran on the tablet.** The owner ruled that out for this run. Every Android statement stays unverified.

## 6. Reproducing

From `native/`: `npm run verify`, then `SYLF_WORKSPACE_CHECK_OUT=<dir> npm run desktop:workspace-check`.
