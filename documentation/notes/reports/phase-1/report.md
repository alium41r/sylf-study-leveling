# Sylf Notes — Phase 1 qualification report

**Date:** 19 October 2026. **Status:** technical baseline established; external qualification gates remain. Phase 2 has not started.

The Phase 0 stack is feasible on Sylf's current framework versions. Keep **BlockNote + Yjs 13, Dexie, Perfect Freehand and PDF.js**, behind Sylf-owned adapters and a versioned portable format. The experiments establish compatibility and selected failure-handling properties; they do not establish production cloud reliability or native-quality handwriting.

Reviewed the complete [Phase 0 report](../phase-0/report.md), its [REA findings](../phase-0/evidence/rea-analysis.md), and the current shell, authentication, calendar OAuth, appearance, cache, service-worker and mobile boundaries. REA was actually used in Phase 0; it was not rerun here because source-level integration and failure probes were more useful for these questions.

## Decisions made

| Area | Final technical choice for the next phase |
| --- | --- |
| Rich text | BlockNote core/react **0.56.0**, Yjs **13.6.33**, y-prosemirror **1.3.7**, y-protocols **1.0.6**. Use client-only dynamic loading and Sylf-styled raw React components. No XL packages or hosted collaboration service. |
| Persistence | Dexie **4.4.6** over IndexedDB. One transaction commits the update journal, outbox and local revision. Large binaries use an adapter; OPFS is an optional cache, never the only pending copy. |
| Ink | Perfect Freehand **1.2.3** for stroke outlines, Canvas for rendering, original pressure/time samples retained. Input quality remains a hardware gate. |
| PDFs | PDF.js **6.4.299**, matching self-hosted worker. pdf-lib **1.17.1** proved a small export experiment only; it is not yet selected as the production exporter. |
| Format | Sylf envelope v1, preserved Yjs binary lineage plus a normalized interchange representation, separate immutable assets and original PDFs. Flow documents and fixed pages use distinct coordinate models. |
| Sync | Provider-neutral immutable objects and commits, complete dependency verification, multiple concurrent heads and explicit tombstones. Never replace a whole library with a last-writer-wins JSON upload. |
| Server storage | Connection credentials and small ownership/binding metadata only. No note bodies, strokes, previews, search indexes, PDFs or attachments in Supabase/PostgreSQL. |
| Boundaries | One primary cloud account per library. Cloud provisioning is mandatory before first use; temporary outages retain editing for already provisioned libraries. Native persistence will implement the same repository contracts. |

The exact [document, persistence, synchronization and recovery contracts](../../architecture-contract.md) govern future work. The prototype is deliberately smaller than those contracts and must not be copied into production as a complete implementation.

## Qualification results

**19/19 contract experiments, 18/18 browser-suite checks and an additional real-editor archive portability check passed.** The isolated Next.js **16.2.9 / React 19.2.4** production build, strict TypeScript check and Vite **8.3.0** build passed. The Vite client graph contained no modules forbidden by the inspected mobile server boundary. Sylf's existing root TypeScript check also passed. These are isolated integration results, not a full Sylf mobile build or a production Notes route.

| Tested | Result and scope |
| --- | --- |
| Editing | Real BlockNote disconnected-peer merge, formatting and Unicode insertion; checkpoint/reload and two-tab branch recovery. Unicode insertion is not an OS IME test. Live tab broadcasting was not implemented. |
| Portability | Actual rich-text journal archived with a synthetic PDF, hashes verified, document restored in a fresh browser profile, then original/imported offline branches merged without duplicate content. This tests preserved binary lineage, not a completed Sylf interchange adapter. |
| Reliability | Transaction aborts leave no partial save; injected quota failure yields no saved revision; duplicate/reordered Yjs updates converge; owner changes fence acknowledgements; simulated lost upload responses, corrupt bytes and missing dependencies are handled. Cloud cases used an in-memory fake provider. |
| Browser lifecycle | Acknowledged text survived a deliberate renderer crash. Offline editing and cold reload passed in a separate static shell. Power loss and the production Sylf offline shell were not tested. |
| Appearance | Rendered light, dark, custom-light and custom-dark surfaces at 1440, 820 and 390 px passed contrast/layout checks and visual inspection. The harness used Sylf's actual color utility; full shell integration remains future work. |
| PDFs/ink | One-page PDF rendered/extracted text through a real worker; simple export retained source bytes, size and rotation. Pressure changed finite stroke geometry. No physical stylus, large PDF or multi-reader export qualification. |
| Storage | Real IndexedDB and OPFS read/write worked. The headless profile reported persistence **false**. Explicit database clearing destroyed local-only data, as expected. |

Preliminary headless Chromium measurements: four update-to-journal acknowledgements ranged up to **39.5 ms**; 100 stroke-outline calculations of 256 points had **0.2 ms p95**; 50 indexed catalog reads over 10,000 entries had **1.7 ms p95**. These measure small synthetic operations, not typing latency, screen presentation, full-text search or tablet performance. The fixture's main JS chunk is **1.64 MB / 504 KB gzip**: route/editor/PDF splitting is required. See [qualification detail and targets](qualification.md) and [raw evidence](evidence/README.md).

## Licensing and compatibility

BlockNote core/react are MPL-2.0; preserve notices, provide covered source as required, and publish modifications to covered files. Keep custom integration outside upstream files. XL exporters/AI/layout packages are excluded because their GPL/commercial terms differ. [BlockNote licensing](https://www.blocknotejs.org/pricing).

Yjs/Perfect Freehand/fflate are MIT; Dexie/PDF.js are Apache-2.0. The pinned dependency graph contains a **lib0 1.0.0-rc.36** utility despite stable Yjs 13: preserve the lockfile and retest upgrades. Next's optional macOS libvips package has LGPL terms; it is not part of the browser editor graph. PDF auxiliary assets require their own notice inventory. No paid dependency is required for the selected foundation. Installed metadata and license files were inspected; this is not a legal opinion or a vulnerability audit.

## Remaining risks and external setup

Live Drive/OneDrive OAuth, upload, download, refresh, revocation and recovery tests were **not run**: no Notes-scoped test grants were available. Existing Google client configuration is not a granted Drive connection. Start with Google `drive.file` and delegated OneDrive `Files.ReadWrite.AppFolder`; do not silently broaden permissions. Microsoft documents app-folder access but lists broader permission on the upload-session endpoint, so that combination needs an actual account test. [Google scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Microsoft app folder](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder), [upload-session permissions](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0).

Current Sylf CSP blocks direct cloud endpoints, and its pass-through service worker does not supply an offline shell. Both require scoped future work. Safari/iPad, Android pen, Windows pen, real IME, storage pressure, 300-page notebooks, 20,000-stroke documents, large PDFs, compaction and cloud file-count growth remain unqualified. [Browser storage limits](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) explain why persistent-storage requests cannot create an unconditional durability guarantee.

## Product decisions requiring approval

1. **Durability promise:** accept the explicit limit that unsynchronized browser-only data cannot survive user clearing/device loss, with verified cloud history and independent export; otherwise bring native/external-file persistence forward before launch.
2. **Privacy:** permit provider-readable v1 storage, or require end-to-end encryption before production format freeze. Default recommendation: provider-readable private alpha; no E2EE claim.
3. **Device retention:** approve trusted-device/local-unlock and logout recovery behavior. Pending copies must never be silently purged; implementation must also prevent the next signed-in user seeing them. Exact encryption/unlock UX requires a separate, tested security design.

The existing Phase 0 roadmap stands. [Phase 2 handoff](phase-2-handoff.md) specifies the next authorized-by-review work, UX baseline and acceptance gates. No production source, root dependency, database migration or agent configuration was changed by this phase.
