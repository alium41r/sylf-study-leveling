# Phase 14 — live progress (Advanced Native Workspace)

**5 November 2026. Unfinished: the session hit its usage limit.** Branch `phase-14` in worktree `~/Desktop/sylf-phase-14`, based on `expansion-part-3` (07f9ec2). Not pushed, not merged, nothing deployed.

## Built and seen working in the browser (Expo web dev server, `phase14-web` in `~/Desktop/sylf/.claude/launch.json`, port 8082)
- `native/packages/notes` (`@sylf/notes`): local-first Notes library in the web's own formats (envelope v1 descriptors, yjs13 streams, `blocknote/0.56.0`, `sylf-ink/1`, `sylf-pdf/1`). Notebooks, pin, trash, duplicate, device-to-account adoption, linking, auto-titles, ordered writes that fail loudly. Storage: IndexedDB (web), SQLite via expo-sqlite (native, **not yet run on a device**), memory (tests). `InkScene` wraps the web `InkModel`: erase (whole/precise), lasso select, move, scale, recolour, undo. 9 unit tests.
- `lib/notes/ink-outline.ts`: outline and paper geometry extracted from `ink-renderer.ts` (re-exported, web behaviour unchanged). **Root web tests not yet run** (`__tests__/notes/ink.test.ts`).
- Workspace tools `apps/sylf/src/spaces/workspace/notes/`: library browser with templates, typed notes (BlockNote DOM component, native format bar, slash menu), handwriting pages (paper templates, pages, zoom), whiteboard (pan/zoom camera), PDFs (pdf.js render, highlighter and pen), "Take notes beside this" with linked chips, drag and drop (PDF files and library cards onto the canvas, desktop), "Open in a new window", a live-editor budget (2 on Android, 6 on desktop).
- Workspace: named saved layouts (model + tests, Command Center menu). `spaces` tests 207 pass.

## Not done
1. Android native ink view (`InkView.native.tsx` + Kotlin `SylfInkView`; reuse `scratch/native-phase-2/spike-app/modules/.../NativeInkView.kt`), Android PDF renderer (`pdf-engine.native.ts`, `PdfPageImage.native.tsx` with `PdfRenderer` in `native-platform`), then `npm run android:build`. Until then Android shows blank ink/PDF stand-ins.
2. Tablet: connected but **adb reports "unauthorized"**: the USB-debugging prompt on the tablet needs the owner.
3. Resources tool still reads the old adapter: point it at the library. Remove notes/pdfs/boards/resources from `data/` adapters and their sample tests.
4. Verify in Electron/export (`npm run build:web`, `desktop:workspace-check`), run full `npm run verify`, root notes tests, light/dark/custom-colour screenshots, performance numbers.
5. Docs: Workspace guide §5 table, ADR for local-first Notes on Native, Phase 14 report with evidence, Phase 15 handoff.
