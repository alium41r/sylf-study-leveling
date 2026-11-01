# Sylf Notes Phase 5 implementation report

**21 October 2026.** PDF reading, editable annotations and page management are implemented locally using the existing Notes foundation. Automated qualification passed within the scopes below. **Public rollout remains gated** by live Google/deployment acceptance, physical-device testing and sustained-history qualification. Phase 6 and the separate Study Workspace have not begun.

The current [PDF contract](../../pdf.md) defines the format, limits, ownership and export behavior. The Phase 0–4 reports/contracts and complete [Workspace master plan](../../../workspaces/master-plan-october-2026.md) were reviewed. This user-authorized PDF phase supersedes the original Phase 0 sequence, which placed OneDrive before PDFs. OneDrive remains unimplemented.

## Delivered

- Import PDFs into the existing folders/subject library, with real previews and mandatory existing cloud provisioning. Read with virtualized pages, zoom/Fit width, keyboard/page navigation, real text selection/copy, text search, bookmarks and retained reading positions.
- Reuse the handwriting engine for pen/highlighter, whole-stroke eraser, lasso move/resize/restyle and undo/redo. Add editable Unicode text/comments and selected-text highlights, underlines and strikeouts. Original PDF and authored ink colors remain independent of the shell theme.
- Insert other PDFs or blank writing pages; duplicate, reorder, rotate, retain removed pages and restore them. Source files stay immutable. Download an original, export a derived annotated PDF, or preserve the native editable document/history through `.sylfnote`.
- Shared recovery/autosave/outbox, history previews and restore-as-copy, account boundaries and cloud reconstruction. Pending pages remain mounted across scroll/zoom/rotation; failed storage pauses writing and exposes retry/emergency export. No source rewrite, alternate database, migration or Supabase content storage.
- Responsive Sylf controls, progressive page rail, contextual markup, focus writing, accessible labels/keyboard actions and coarse-pointer tool targets. Notes resource IDs, page links, bookmarks and Notes-owned resume state prepare future Workspace consumers without building that system.

## Decisions

| Decision | Reason / consequence |
| --- | --- |
| **PDF.js 6.4.299**, Apache-2.0, same-origin resources | Qualified actual worker rendering, selectable text, crop/rotation/UserUnit handling and search. Worker, CMaps, fonts, WASM and ICC resources are generated from the exact package before web/mobile builds. No CDN or weakened CSP. See [Mozilla API](https://mozilla.github.io/pdf.js/api/draft/api.js.html). |
| **pdf-lib 1.17.1**, MIT, worker-based derived export | Its [page-copy and document APIs](https://pdf-lib.js.org/docs/api/classes/pdfdocument) fit source-preserving study copies. Unique source pages are copied in batches to share images/fonts; duplicate logical pages have independent content arrays. Pinned version and license are verified locally. Its [limitations](https://github.com/Hopding/pdf-lib#limitations), including protected PDFs, remain explicit. |
| Alternatives considered, not benchmarked | [jsPDF](https://github.com/parallax/jsPDF) remains an MIT generation alternative; it did not justify a second export engine for the validated source-copy workflow. [MuPDF](https://mupdf.readthedocs.io/en/latest/license.html) offers AGPL/commercial licensing; that additional licensing contract was unnecessary here. Only the selected implementation was technically qualified. |
| `sylf-pdf/1` inside envelope v1 | One native `pdf` map contains existing ink plus append-only markup. Seed once with page creation; fail closed on missing initialization. Generic interchange preserves both. Annotation geometry uses the exact original viewport and an explicit additional rotation. |
| Shared storage and recoverability | Original verified chunks, metadata and page deltas use existing encrypted transactions and synchronization. No new credentials, schema, content service or provider grant. Removed pages, native alternatives and originals stay retained. |
| Explicit export tradeoff | Source text and ink geometry remain searchable/vector respectively. Unicode comment/text boxes become bounded PNGs in the derived PDF, so those boxes are neither searchable nor editable PDF text. Native archives preserve editable text, original vectors and revision lineage. Forms/signatures/links are not interactivity-preservation guarantees. |

Notices cover **63 dependencies**. All **202 generated PDF.js resource files** match installed source bytes, with resource licenses retained. The existing 690-file BlockNote covered-source ZIP remains byte-exact. [License/resource proof](evidence/license-source-verification.json). Vendor source was not modified.

## Qualification

All accounts, grants and cloud HTTP responses below are synthetic. IndexedDB, encryption, browser workers, offline contexts and renderer crashes are real local operations. These are production modules and the actual shared screen, not a replacement prototype.

| Check | Result and scope |
| --- | --- |
| Automated regression | **201 tests / 12 files passed**, including 14 new PDF tests: transformed coordinates, native concurrent edits/undo, source deduplication, independent page copies, page lifecycle, portable source/history fidelity, interrupted activation, quota/retry, missing initialization, export sharing/action removal, bounded text-raster assembly and over-limit remote markup retention. Existing authentication, logout, appearance, formats and recovery tests remain green. [Log](evidence/regression.log). |
| PDF browser acceptance | **14 scenario groups, zero page errors**: protected/corrupt rejection; actual import/render/text; pressure/tilt ink; selected-text markup; Unicode comments; real export worker; cropped/UserUnit/extra-rotation accuracy; page management; search/bookmarks; offline/fresh-profile reconstruction/concurrent comments; quota/recovery/retry/undo; renderer crash; appearance matrix; coarse touch pan/pinch/focus. [Results](evidence/pdf-browser-results.json). |
| Existing editors | **10 handwriting + 15 rich-text/library browser groups passed**, zero page errors, including account switching and encrypted-vault isolation. [Handwriting](evidence/ink-browser-results.json), [rich text](evidence/browser-results.json). |
| Independent export fidelity | pypdf structure/text checks and Poppler rendering passed. Untouched source page pixels match; rotated ink meets the expected source marker; crop/units and source text survive. The 300-page export has one shared image object; pages 1, 200 and 300 are pixel-exact against the source. Original fixture hashes remain unchanged. Unicode comment wrap/appearance and rotated alignment were also visually inspected. [Results](evidence/export-fidelity-results.json). |
| Responsive/accessibility | Visually inspected desktop 1440×960, tablet 1024×900, phones 390×844 and 320×800, light/dark and opposite custom surface polarities, plus touch/coarse mode. Fit width corrected for mixed page sizes. Primary coarse PDF tools are at least 44×44 px; keyboard/search/save and focus exit pass. This is not a full screen-reader audit. [PDF accessibility](evidence/pdf-accessibility-results.json), [screenshots](evidence/README.md). |
| Offline and builds | Public locked offline fallback caches no authenticated responses. Production Next build, shared mobile build, mobile secret/server-boundary audit, root TypeScript and targeted ESLint passed. Actual compiled Turbopack export chunks also executed under the existing production CSP on an isolated static host. This does not establish deployed OAuth/route behavior. [Checks](evidence/final-checks.json), [compiled worker](evidence/next-worker-results.json). |

The final otherwise quiet Chromium run used a **300-page, 4,248,490-byte** synthetic document with vector worksheets, varied page sizes and one six-megapixel JPEG reused on 15 pages:

| Measurement | Observed |
| --- | ---: |
| Source inspection / durable initial import | 173 / 250 ms |
| First visible page | 562 ms |
| Six page navigations, median / maximum | 125 / 168 ms |
| Full text search | 2.36 s |
| Study-copy export | 2.33 s; 4,291,990 bytes |
| Quiescent mounted page views / attached canvas backing | 2 / 4,926,660 pixels |
| Main-window JS heap sample | 72.2 MB decimal |

Working desktop targets were first page below 1 s, sampled warm navigation below 250 ms, search/export below 5 s, and at most five quiescent ready page views. This fixture meets them. Pending/failed pages may exceed that view count to protect work. Heap sampling excludes PDF/export workers, offscreen rasters, GPU and process memory; it is not a total-memory ceiling. The earlier run's navigation maximum was 186 ms. Main-window heap observations across runs varied from 56.8 to 97.4 MB with workload/garbage-collection timing. Neither run qualifies physical pen latency, maximum safety limits, densely annotated textbooks or hours of history. [Performance evidence](evidence/pdf-performance-results.json).

## Remaining release gates and limits

1. **Live Google/deployment remains unperformed.** Presence-only inspection found general Google OAuth credentials, but no Notes origin, encryption key, dedicated Notes client or authorized Notes test grant. No hosted database was read, migration applied, deployed app changed or consent performed. Complete the existing [setup/live checklist](../phase-3/setup.md) using authorized staging accounts, including PDFs, failed uploads and fresh-device verified reconstruction.
2. **Physical tablet/native and corpus testing remain.** No S Pen, Apple Pencil, Safari/iPad or Android WebView was available. Synthetic pointer events do not establish natural writing, OS palm rejection, thermal behavior or process memory. Test real complex fonts, textbooks/scans, large images, long annotations and interrupted sessions. Search has no OCR. Password/protected files require an unlocked copy; forms/signatures/links are retained safely as originals, not guaranteed interactive in study exports.
3. **Browser/key durability remains bounded.** Loaded unlocked sessions edit offline; cold offline opening stays locked. Explicit clearing, eviction or device loss can remove unsynchronized local work; unacknowledged memory can be lost on process death. Preserve key backups and independent content copies. Provider-readable cloud/export v1 is **not E2EE**.
4. **Scale is bounded, with retained-history costs.** See [safety limits](../../pdf.md). Full source reassembly, native history, archive size and export annotation budgets remain finite. No history is silently pruned. The existing long-history/provider throughput gate remains open; the 300-page reading fixture does not resolve it. Text/comment PDF exports are flattened images; retain `.sylfnote` for editability.

## Handoff and approval boundary

No new paid dependency, broader provider scope or security-policy relaxation is needed for this local implementation. Release should await the gates above. Changes to offline cold unlock, encryption, retention/compaction or account/provider migration require an explicit reviewed contract.

Recommended separately authorized **Phase 6**: release qualification and hardening—real tablets, live Google PDF workflows, diverse source/export corpus, long sessions/offline catch-up and total-memory profiling. Use those findings to prioritize native storage/input adapters if needed. Revisit OneDrive and any richer searchable annotation export as separate scoped choices. Future Workspaces should open the same stable Notes document/page and reuse its resume/annotations, as defined in the master plan. **Stop here: no Phase 6, OneDrive or Workspace implementation.**
