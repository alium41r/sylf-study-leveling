# Sylf Notes paper and handwriting contract

**Phase 4, 20 October 2026.** This extends the [document foundation](foundation.md) and [workspace/Drive contract](workspace.md). It does not replace their ownership, authentication, encryption or acknowledgement rules. Run results and remaining release gates belong to the [Phase 4 report](reports/phase-4/report.md).

## Authority and format

A paper notebook is an ordinary Sylf envelope v1 `notebook` with stable document/page/stream UUIDs. Each page has its own `yjs13-update-v1` stream, adapter **`sylf-ink/1`**, schema 1 and `{root:"ink",type:"map"}` readable projection. Required features include `ink-v1` and `paged-v1`. Older clients must upgrade; they must refuse unsupported ink rather than edit a JSON approximation. Existing flow documents and typed notebooks keep their BlockNote streams. Ordinary opening never reseeds either editor.

`lib/notes/ink.ts` owns the vector contract and page projection. Its `ink` Y.Map holds uniquely identified records:

- `part`: stroke UUID, sequential chunk number, creation Lamport clock, brush version, tool, authored RGB color/width, pointer category and up to 64 original samples.
- Sample tuple: **`[x, y, pressure, elapsedMs, tiltX, tiltY, twist, tangentialPressure]`**. Coordinates are logical page units; time is relative to pen-down. Pressure and available tilt/twist are retained without geometry simplification. Mouse/touch pressure is retained even though their outline uses simulated pressure.
- `end`: explicit complete/interrupted termination, including exact chunk boundaries. Missing termination after interruption does not discard captured parts.
- `edit`: target stroke IDs, optional erase state, authored style and/or page-space translation/uniform scale. Original samples are never replaced by transformed outlines.
- `paper`: authored template, paper/rule RGB colors and spacing. New pages persist the default once. Empty earlier v1 streams have the fixed v1 fallback (ruled, `#fffdf7` / `#d9dfea`, 28 units); changing application themes never changes it.

Brush identity is **`perfect-freehand/1.2.3:sylf-1`**. Geometry is derived using actual pen pressure (`simulatePressure:false`), moderate streamline/smoothing and constant-width translucent highlighter paths. Outlines and bitmaps are disposable, never merge authority. Predicted samples are not persisted or currently rendered. See the [Perfect Freehand source/API](https://github.com/steveruizok/perfect-freehand) and [coalesced Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents).

Stroke IDs are scoped to their page stream; page copies retain native stroke IDs in new page/stream identities. Records use deterministic Lamport-clock/UUID order. Concurrent strokes survive; transforms compose in that order and later explicit style/erase fields determine the projection. Concurrent erase/move operations both remain in native history; an erased stroke can be recovered through local undo or a retained-history copy. There is no separate per-stroke conflict dialog. Malformed, ambiguous or incomplete chunks block writing and preserve originals. No schema repair guesses an empty replacement page.

Canvas undo/redo uses an origin-scoped Yjs UndoManager: one stroke or explicit edit/paper change per undo group. A local undo cannot remove another producer's independent operations. Native update history also retains operations removed by undo. Page order/archive operations use normal document revisions, with recovery through Removed pages or history copies.

## Input and durability

`ink-controller.ts` samples native Pointer Events imperatively, includes coalesced events where available, captures pointers, and draws through animation frames. React is used for controls and boundary/status changes, not each pointer sample. A live stroke sends small chunks at 64 samples or a 32 ms timer; the existing NotesStream then batches durable writes for its normal 20 ms window. This is a scheduling budget, not a guarantee of a particular save latency.

`NotesStream.registerInputBoundary` captures already observed input before explicit flush, pause, navigation warning or stream closure/revocation. Interrupted/cancelled pointers retain observed ink. Already captured gestures may finish while a durability pause is being established; they cannot start new input then. Failed writes keep the source buffer/recovery capsule and disable writing. Saved states are published only after transaction acknowledgement. Emergency export includes native pending deltas. Unacknowledged data can still be lost if the process terminates; browser clearing/device loss can destroy unsynchronized local data.

A long live path continues into another stroke after approximately 4,096 samples, retaining the boundary sample and original elapsed time. Limits are explicit safety bounds: **500,000 samples, 10,000 stroke identities and 60,000 operation records per page**. These are not hardware performance promises or history-expiry rules. Starting another page preserves the previous one. Original update history is not pruned.

Touch navigates by default; finger writing is explicit. Two contacts pan/pinch. Recent pen events suppress touch for 800 ms; broad contacts are ignored. A pen takes priority over a touch gesture that arrived first, and ignored touch termination cannot cancel a pen gesture. Pen eraser/barrel button events are recognized where browsers expose them. Space temporarily pans; wheel pans, Ctrl/Command-wheel zooms about the pointer, and Fit width resets framing. Selection supports lasso/drag, style, uniform resize, arrows and recoverable erasing. Keyboard save flushes the canonical stream.

These are **browser heuristics**, not native OS palm rejection, guaranteed S Pen/Apple Pencil support or physical pen-to-display latency qualification. Hardware, browser sampling and operating-system gestures must be tested on the actual supported devices.

## Rendering and memory

`ink-renderer.ts` uses separate committed and active Canvas 2D layers. A page-local grid culls geometry. A disposable page raster accelerates ordinary pan/zoom and appends new strokes incrementally; high zoom uses vector culling. Paper settings, undo, reordered/concurrently inserted strokes and transforms invalidate the derived raster correctly.

Each viewport layer has a four-million-pixel budget and DPR cap 2. The page raster has a four-million-pixel budget; thumbnail rasters use a smaller scale. The path LRU retains at most 384 paths / 100,000 input points. All caches are page-local and released on closure. Nominal maximum pixel backing across the two layers and page raster is about 48 MB of RGBA data; this is **not measured total JavaScript/GPU/process memory**, which includes source documents and browser copies.

Visible thumbnails load serially, render from verified source and release their Y.Doc/geometry. Offscreen/unmounted thumbnails release their bitmap. Only the active editor page is hydrated as an editable stream. Library search remains title/typed-content search; no ink OCR or handwriting search is implied.

The repository's native validation cache now owns a private Y.Doc per exact committed frontier. It removes exclusive ownership before applying a proposed update, keeps all causal/pending checks, and only publishes the advanced cache after the transaction commits. Abort, conflict, invalid dependency or revocation destroys tentative state; another save must reconstruct its own frontier. Checkpoints retain exact full-state equality checks. The cache has eight entries and a conservative 16 MiB **encoded-byte estimate**, not a heap cap. Eviction only drops a cache, never source. This avoids decoding/re-encoding the entire dense page for each warm small save. Unchanged streams can advance through exact-parent metadata revisions without replay. Cold replay, eviction and very long histories still have material costs.

## Notebook integration and recovery

Handwritten notebook creation remains gated on the original verified cloud library. Add/duplicate page uses the existing repository; duplicate pages receive new page/stream IDs while preserving editable source samples. Page order uses normal conflict-preserving metadata revisions. Removed pages keep their IDs, streams and all content; the last active page cannot be removed. Archived pages require explicit restoration before editing. Adding pages to unresolved metadata branches is blocked for explicit review.

The responsive paper view reuses Sylf's semantic chrome and existing library drawer. Blank, ruled, grid and dotted paper, independent paper/rule colors, stroke tools and touch navigation are available. Progressive page thumbnails, earlier/later controls, duplicate, Removed pages and focus writing use the same notebook. There is no new whiteboard/scratchpad/Workspace store or timer authority.

The existing synchronized Notes catalog owns page/viewport resume state. `notesResumeSchema` adds optional bounded `inkViewport:{zoom,x,y}` to v1. Portable library exports include catalog resume state; individual document archives retain source/pages/history without a promise to include the latest separate catalog position. Viewport restoration never changes page units or authored ink.

`.sylfnote` export/import preserves native revisions, original samples, page identities, paper operations and readable operation projections. Ink history previews read the chosen retained revision; restore creates a separate notebook. History rows can progressively reveal earlier revisions. Encryption, immutable Drive packs, outbox/readback, account isolation and emergency recovery remain the existing owners. No handwriting, preview or attachment bodies are stored in Sylf's database. Foreground publishing can drain up to five 100-revision batches, yielding between batches and checking a five-second budget, so normal stroke journals are not limited to one small batch per polling interval. A slow provider can still leave pending work; it never becomes a false cloud-save claim. No Phase 4 database migration or new cloud grant is required.

## Release limits

The [Phase 3 deployment/live checklist](reports/phase-3/setup.md) still applies. Notes key/origin configuration and a real authorized Drive grant were unavailable during this phase; neither deployment nor hosted migration/live OAuth was performed. Cold offline reopening remains locked, provider/cloud exports remain readable v1 (not E2EE), and key backups remain essential. Physical stylus/mobile/WebView/IME/accessibility and long-history/device-memory qualification are separate release gates. PDF annotation, OneDrive, OCR, native services and the separate Study Workspace were not implemented.
