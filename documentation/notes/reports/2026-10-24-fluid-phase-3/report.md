# Notes fluid editing — Phase 3

Implemented locally on 24 October 2026. Work stops after Phase 3. No deployment was performed.

## Delivered

- A continuous, virtualized notebook surface with nearby native page editors, viewport-sized canvas slices, bounded zoom, touch navigation, fit controls, active-page URLs, page jumps and scroll resume. The active writing context owns the shared compact toolbar, including at page boundaries; other pages show writing without duplicated chrome. Caret navigation respects the actual visible workspace and floating controls. Existing page copy/order/removal/restoration remains available.
- Cross-page object selection and atomic mixed-content moves/copies through Arrange content. Text/image/ink groups move together; numeric positioning, page centering, stacking, snapping and alignment guides are functional. Alt bypasses snapping. Native ink transfers retain all original chunks, pressure/tilt samples, transforms and precision cuts, rather than flattening them into replacement strokes. Text moves retain editable rich text in unique destination roots, while original revisions remain recoverable.
- Reusable named custom paper styles in My templates, saved in the existing encrypted/synchronized catalog. Pen favorites stay current across preloaded pages. Pencil shading responds to tilt and brush pressure is smoother. Stable canvas backing stores are reused during scrolling, and long paper patterns generate only visible geometry without shifting their spacing.
- Searchable/selectable Unicode text in notebook/flow PDFs and typed PDF annotations/comments. Browser-shaped raster visuals retain their appearance; aligned ToUnicode text supplies selection/search, including Greek, CJK and emoji. Original PDF text/vector content remains intact. Long notebook pages print in bounded full-sized sheets with cached text projection/line measurement and explicit image/text/page budgets. A4/Letter/A5 use physical PDF point dimensions from the existing paper catalog; custom notebook dimensions convert from CSS units.
- Safer editor lifecycle coordination: document opens serialize with metadata writes, independent pause holds survive overlapping UI leave/resume, releases wait for adoption, and rich-text initialization waits for metadata readiness. Navigation drains queued document operations. Natural text height is stored without treating measurement as an arrangement undo step, so long offscreen transfers grow their destination before export.

## Integrity and scope

The existing BlockNote/Yjs documents, ink renderer/controller, encrypted repository, immutable revisions, journals, archives, recovery capsules and Google Drive infrastructure remain the authorities. No database/native format version, provider or paid dependency was added. Group metadata and paper preferences extend their existing native/catalog documents. Cross-page changes publish affected stream deltas together in one document revision; a failed commit leaves both originals unchanged. Original source assets remain immutable. Unrelated working-tree changes were preserved.

See the [interface contract](../../interface.md), [foundation](../../foundation.md) and [PDF contract](../../pdf.md) for exact ownership and persistence boundaries.

## Verification

| Check | Result |
| --- | --- |
| Notes regression suite | **241 passed; 1 existing opt-in scale test skipped** |
| TypeScript and scoped ESLint | Passed |
| Standard Next.js production build | Passed with supported Node 24 and 6 GiB heap |
| Mobile production build and bundle audit | Passed; no server-only symbols/secrets in the client output |
| Shared UI browser suite | Passed; [results](evidence/browser-results.json) |
| Dense native performance profile | Passed observed budgets; [measurements](evidence/ink-performance-results.json) |

Regression coverage includes failed atomic moves, native multi-chunk/cut and concurrent stroke-order fidelity, mounted-stream adoption, overlapping pause/release/open, independent copies, native archive recovery, legacy readers, saved style compatibility, Unicode maps, snapping and tilt. Existing encryption, Drive, offline/recovery and PDF suites remain included.

The browser suite uses actual shared production UI/native persistence with synthetic authentication and Drive HTTP. It verifies prior library, folder, grid/list, image/PDF import, pen/preset/precision-erasing, mixed text/image box, toolbar, appearance and sustained-typing workflows; adds cross-page grouping/positioning/copy, text moves, custom paper recovery after reload, Unicode PDF extraction, offline local editing/reconnect, and cloud queue draining. Non-draft synthetic cloud work reached zero pending; intentionally local blank drafts remain excluded under the existing policy.

Visual review covers 1440×960 desktop, 834×1112 tablet, 390×844 and 320×844 phones, light/dark modes and custom accents/backgrounds. Examples: [continuous notebook](evidence/continuous-desktop.png), [mixed tablet page](evidence/mixed-content-tablet-dark.png), [cross-page selection](evidence/mixed-cross-page-selection.png), [phone](evidence/continuous-phone.png), [paper styles](evidence/saved-paper-template.png), [printed appearance](evidence/exported-typography-desktop.png) and [searchable PDF](evidence/searchable-copy.pdf).

The 300-page browser fixture kept **two page editors / six canvases** mounted at sampled jumps, with at most **5.90 million canvas pixels** and a stable **834 DOM nodes**. Its 89 measured steady-scroll intervals had **17.3 ms P95**, with no interval over 33.5 ms. Jump settlement includes a 100 ms test settling allowance and browser automation; it is not a physical input-latency measurement. A 50,000-unit logical page exported as **46 sheets**, with **3.57 million maximum canvas pixels**, and its final Unicode marker extracted exactly once. The observed export took approximately **7.9 seconds**.

Separately, the isolated 5,000-stroke / 320,000-sample native profile measured **2.1 ms P95 pan**, **0.6–1.3 ms P95** for five 4,096-sample nib paths, **14.8 ms P95 warm encrypted saves**, **60.8 ms** for a 40-stroke precision cut, and **1.12 seconds** for a cold dense preview. Canvas/path/raster budgets remained bounded. These measurements do not establish total process/GPU memory, 300 dense mixed pages, long-history replay or physical pen-to-display latency.

Reproduce with the [Phase 3 harness](../../../../scripts/qa/notes-fluid/README.md). Logs and the source snapshot are retained beside this report. Existing generated third-party notices contain CRLF whitespace flagged by a repository-wide diff check; scoped Notes source/documentation diff checks pass, and license text was preserved.

## Remaining limits and release readiness

- The Arrange panel targets unified notebook pages; PDF annotation controls remain page-local. Cross-page selection/transfer uses the contextual panel; freehand lasso gestures stay page-local. Group and cross-page operations use retained document history rather than a global cross-page Ctrl/⌘ Z stack.
- Saved custom templates reuse the supported paper patterns, colors, spacing, dimensions/layout and dark adaptation. Document-owned background images are not portable saved template assets.
- Readable PDF copies retain raster visual layers with Unicode selection/search; they are not fully vector rich-text or tagged accessible PDFs. Text extraction whitespace/reading order can depend on the PDF reader. Existing page/text/byte/geometry limits remain enforced and fail without altering originals.
- A physical tablet/stylus and a live Google-account acceptance session were not provisioned for this qualification. Hardware tilt/palm rejection/latency, real cross-device Drive recovery, deployed app-shell offline reload, academic-year history and broad device throughput remain unqualified. The skipped opt-in profile does not count as a pass.

**Release assessment: ready for a controlled pilot of the implemented Phase 3 software, with physical-device and live-cloud qualification required before a broad production release.** All reported browser accounts and cloud grants were synthetic; no live-account or deployment certification is implied.
