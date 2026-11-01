# Sylf Notes PDF contract

**Current implementation: Phase 5, 21 October 2026.** Extends the [document foundation](foundation.md), [workspace/Drive contract](workspace.md) and [handwriting contract](ink.md). See the [implementation report](reports/phase-5/report.md) for measured qualification and open release gates.

## Ownership and format

PDFs are ordinary Notes documents (`kind: pdf`) using envelope v1, stable document/page/stream IDs, existing encrypted asset chunks, journal, revision graph, outbox and Google adapter. No PDF database, Supabase content, migration, alternate draft store or Workspace authority is introduced. Folder and optional existing-subject associations use the normal library; deleting a folder/subject reference never deletes source content.

Each page stream declares `sylf-pdf/1`; documents require `pdf-v1`. A page's optional `originalAssetId` and zero-based `sourcePage` identify its immutable source. Its width/height and `extensions.pdfTransform` describe the exact PDF.js scale-one viewport, including original CropBox, UserUnit and source rotation. `extensions.pdfSourceRotation` retains the original rotation; `extensions.pdfRotation` is an additional 0/90/180/270-degree study rotation. Blank writing pages have no original asset. These coordinates do not depend on zoom, display density, editor DOM or cloud-provider paths.

The native Yjs 13 root is `pdf`, a Y.Map containing nested `ink` and `markup` maps. The shared initial maps and blank paper operation are authored **once**, in the metadata revision introducing that page. Missing/malformed initialization fails closed; opening never seeds a replacement. Native ink uses the existing `sylf-ink/1` operation format, brush identity and controller. Markup records retain unique operation/target IDs, logical clocks, kind, rectangles, text, authored color/size and deletion state. Each edit appends a new version; deterministic logical-clock/ID ordering selects its visible projection. Origin-scoped undo leaves another producer's independent work intact. Native alternatives remain in history; this does not resolve all simultaneous editing intent.

Normalized interchange projects the complete nested `pdf` map through the existing generic map adapter. It is a readability/engine-exit projection, never the live merge authority. `.sylfnote` retains original asset bytes, source transforms, native updates/checkpoints and revision identities. Existing archive limits (256 MiB and 60,000 ZIP entries) still apply; no export path silently truncates history.

## Import and page lifecycle

PDF.js inspects every source page before staging or activating a document. Protected/password-requiring PDFs need an unlocked copy; there is no encryption bypass. The source is stored as its exact immutable bytes with the repository's whole-file digest/chunk verification. Invalid import cannot replace the active document. Interrupted activation retains staged originals for recovery.

Insert another PDF combines immutable source references, rather than rewriting either file. Blank pages, copies, order and removal are metadata operations. Copies get independent page/stream IDs while preserving source references and native editable content/lineage. Removed pages and assets remain retained and can be restored; the last active page cannot be removed. Existing conflict handling blocks unresolved metadata branches. Original download reconstructs verified source bytes. A combined document can retain several originals.

## Rendering, input and resumption

PDF.js **6.4.299**, Apache-2.0, loads lazily with a worker and matching same-origin CMaps, fonts, WASM and ICC resources. `scripts/build/build-notes-pdf-assets.mjs` generates those resources from the pinned package before web/mobile builds; generated copies are ignored. There is no CDN or arbitrary remote-PDF URL fetch. XFA is disabled. The reader does not execute document actions or provide interactive form/link annotation layers. This is not a general malicious-PDF sanitizer.

The document surface has cumulative page layout and a five-page visible/overscan window. Dirty, failed or active-input pages are additionally pinned until durable acknowledgement; they are never sacrificed to a rendering budget. Verified original-document leases have a two-idle-source LRU; active leases remain. Entire verified source files are loaded from local assets, rather than fetched by HTTP ranges. That cost and PDF.js internal caches are separate from the bounded display window.

Source canvases and selectable PDF.js text layers are disposable. Original viewport transforms, UserUnit and extra rotation apply to source, text, ink and markup together. The fixed-page handwriting controller maps input back into canonical page coordinates. Zoom/rotation update its geometry without replacing the native stream, undo stack or pending delta. Source and ink canvases use bounded backing resolution; zoom does not allocate a full resolution bitmap for every document page. Native input sampling stays imperative rather than updating React per sample.

Read mode supports real text selection/copy, text search and selection-based highlight/underline/strikeout. Annotation modes reuse pen/highlighter, whole-stroke eraser, lasso movement/resize/restyle and undo/redo. Text/comment boxes remain editable in Sylf. PDF original/ink colors remain independent of shell appearance. Page rail thumbnails are visible-only and serialized. Search yields between pages, supports cancellation, and discloses partial text coverage; scanned images have no text search without future OCR.

Bookmarks are page metadata. Notes-owned resume state extends resource resume v1 with `pdfViewport: {zoom, offset}` plus stable `pageId`. Zoom is absolute, not automatically re-fitted on a different device; Fit width fits the current page. Resource URLs and capability contracts remain `lib/resources.ts`. A future Workspace references the same library/document/page and Notes resume state; it owns no PDF, annotation, timer or session data. No Workspace UI is built.

## Persistence and recovery

Both ink and markup use the existing stream editor, confirmed IndexedDB transactions, encrypted vault, durable synchronization queue and account fences. Observed active ink is captured at flush/pause/closure boundaries. Pending/failed pages stay mounted through scrolling, zoom and rotation. Failure pauses new writing, exposes retry/emergency archive, and retains the identical pending delta. Saved-on-device status follows transaction acknowledgement; cloud status follows the existing verified upload/readback contract.

No annotation save rewrites its original PDF. No history, removed source or unsynchronized work is automatically pruned. Quota/storage errors, malformed source/markup and unresolved branches remain visible. History previews use retained page heads; restoration creates a separate document. Existing cross-tab owner barriers, access revocation, ciphertext retention and recovery restrictions apply to PDFs, including in-flight export cancellation and final ownership checks.

Already unlocked sessions can edit offline. Cold offline reopening stays locked under the existing online-unlock policy. Explicit browser clearing/eviction/device loss can destroy unsynchronized data; browser storage cannot guarantee survival. Process termination can lose unacknowledged memory samples. Back up server vault-key material and independent readable copies. Local encryption is **not E2EE**: cloud packs and portable exports are provider-readable v1, and server transit follows the existing broker contract.

## Export and safety limits

Annotated PDF export is a **new derived study copy**, using **pdf-lib 1.17.1**, MIT, in a dedicated worker. It flushes editors, captures one committed frontier, verifies/reassembles sources, and copies unique source pages in batches so fonts/images are shared. Each logical duplicate gets its own content array before adding annotations. Original CropBox/UserUnit/rotation are preserved; canonical annotation coordinates map through the inverse stored source viewport. Native pen outlines remain vectors, and PDF source text remains searchable. Unicode text/comments retain high-resolution bounded PNG appearances with an aligned invisible Unicode layer for search and selection. They remain flattened visual annotations rather than editable native PDF fields. Keep `.sylfnote` for editable native annotations and history.

The exporter removes copied page additional-actions and annotation action/file/rich-media fields. Forms, digital signatures, links and other interactive document behavior are not preservation guarantees; keep the exact original. The UI discloses this before export. Text that cannot fit its complete recorded box causes an explicit error instead of a clipped export. Worker failures/aborts never alter stored source.

| Boundary | Safety limit |
| --- | --- |
| One imported source | 50 MiB; 500 pages |
| Retained pages in one study document | 1,000, including removed pages |
| Combined source bytes / export source bytes | 128 MiB |
| PDF source page width/height | Positive, at most 100,000 canonical units; finite invertible transform |
| Native markup per page | 10,000 operation records, including retained versions; text 2,000 characters; 500 rectangles/record |
| Source text search | 8 million extracted characters per source; partial coverage disclosed |
| Derived PDF export annotations | 1 million ink samples, 50,000 visible marks, 32 million aggregate text-box pixels; 2 million pixels per box |

These are rejection/retention boundaries, **not performance promises at every limit**. Existing ink, document/archive and repository limits also apply. Native history and dense annotation exports can exceed practical budgets before source/page limits; export fails visibly and retains the editable originals. The 300-page benchmark does not qualify every large textbook, malformed PDF, font, device or long native history. Total process/GPU/worker memory and real-device pen latency remain release qualification work.

## Creative interface update

PDF annotation now reuses the shared Pen studio and saved pen favorites. Ink shapes, line styles, opacity and precision cuts use the same geometry for screen and vector export. The [current interface contract](interface.md) describes the separate composite notebook PDF/preview renderer and its visual-raster and Unicode-text layers; original PDF source preservation and the limits above remain unchanged.

## Phase 3 typed export text

Typed annotations and comments retain their browser-rendered visual appearance and gain an invisible Unicode search/selection layer generated from those same wrapped lines. The layer uses the existing source-page transform, preserves original source text/vector content and does not download fonts or modify the original. Notebook/flow print tiles share this Unicode mapping helper; see the [current interface contract](interface.md). These copies are not tagged accessible PDFs or native editable archives.
