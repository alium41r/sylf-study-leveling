# Browser audit evidence

Collected 7 October 2026 from the actual local Sylf Next.js application in Chrome using an isolated authenticated QA account. No implementation changes. QA document names below identify diagnostic drawings, not proposed final character artwork.

## Primary screenshots

| File | What it shows |
| --- | --- |
| [desktop-dashboard.png](desktop-dashboard.png) | Current 110px secondary dashboard companion |
| [desktop-hub.png](desktop-hub.png) | Pixel and legacy Character Studio offered together |
| [desktop-customizer-pixel-size.png](desktop-customizer-pixel-size.png) | Current density options/copy and small preview |
| [desktop-customizer-own-drawing.png](desktop-customizer-own-drawing.png) | Equipped own drawing with no matching Character choice |
| [desktop-studio.png](desktop-studio.png) | Drawing versus stale/sparse preview and fragmented controls |
| [desktop-pattern-chunky.png](desktop-pattern-chunky.png), [balanced](desktop-pattern-balanced.png), [detailed](desktop-pattern-detailed.png), [finest](desktop-pattern-finest.png) | Same saved diagnostic drawing through all four densities |
| [mobile-studio-full.png](mobile-studio-full.png) | Portrait workspace and controls far below canvas |
| [mobile-customizer.png](mobile-customizer.png) | Portrait density options and wasted preview area; recaptured at scroll top |
| [mobile-empty-dashboard.png](mobile-empty-dashboard.png) | Structurally valid blank drawing successfully equipped |
| [legacy-studio-equipped-creation.png](legacy-studio-equipped-creation.png) | Missing legacy PNG character while Pixel drawing is equipped |
| [light-desktop-customizer.png](light-desktop-customizer.png) | Light mode, equipped drawing and false names |
| [light-desktop-studio.png](light-desktop-studio.png), [light-mobile-studio.png](light-mobile-studio.png) | Light-mode workspace composition and distorted portrait canvas |
| [custom-color-customizer.png](custom-color-customizer.png), [custom-color-mobile-customizer.png](custom-color-mobile-customizer.png) | Yellow accent; enabled Save uses white text |
| [custom-background-desktop-customizer.png](custom-background-desktop-customizer.png), [custom-background-mobile-customizer.png](custom-background-mobile-customizer.png) | Mint custom background and yellow accent |

Some full-page captures include fixed app shell elements at positions influenced by screenshot scroll stitching. Those positions are not treated as product bugs. Color-check captures can show the built-in loading fallback before a creation fetch completes; asset parity conclusions instead use awaited runtime/framebuffer probes. Screenshots are CSS-resolution documentation; the DPR 3 backing-store verification is in the touch JSON, not inferred from screenshot dimensions.

## Scripts and measurements

The saved Playwright functions are browser interaction probes. They use the real UI and the existing development runtime probe to read framebuffer data. They are evidence, not newly installed application tests. Re-running them requires a QA session and the same starting documents/view noted below; they intentionally do not embed credentials.

| Probe / result | Starting state and demonstrated behavior |
| --- | --- |
| [desktop-editor-probes.js](desktop-editor-probes.js) / [desktop-editor-results.json](desktop-editor-results.json) | Blank 48-grid Studio; mirror/erase asymmetry, skipped fast-stroke cells, Fill/Pick, Undo/Redo, zoom, frames/onion/reorder/timing/playback |
| [preview-and-save-probes.js](preview-and-save-probes.js) / [preview-and-save-results.json](preview-and-save-results.json) | Saved three-frame Audit Line open; same-ID edits/frame deletion ignored by preview, rename refreshes; diagnostic Audit Pattern saved/equipped |
| [density-flow-probes.js](density-flow-probes.js) / [density-flow-results.json](density-flow-results.json) | Audit Pattern (48-grid, 41 painted source cells) saved and equipped; all density options, persistence, awaited Dashboard/Customizer hashes and fake built-in selections |
| [mobile-touch-probes.js](mobile-touch-probes.js) / [mobile-touch-results.json](mobile-touch-results.json) | Studio open; real CDP touch at 390 × 844 DPR 3, drawing/erase/history/pick/fill/zoom/frames/save, density backing-store sizes, cursor alignment |
| [save-flow-results.json](save-flow-results.json) | Empty Audit saved/equipped; Ghost Audit equipped without artwork Save, then config committed through Hub; blank display versus valid fallback |
| [error-and-draft-probes.js](error-and-draft-probes.js) / [error-and-draft-results.json](error-and-draft-results.json) | Studio open; delayed POST/double click, leaving unsaved draft; injected GET/PATCH HTTP 500. All routes unregistered afterward. `errorCount=1` on PATCH is the global Next alert, not a product save-error message. |
| [responsive-results.json](responsive-results.json) | Hydrated blank 48-grid Studio at 8×; widths 1440/1024/820/390/320 and 844 × 390 landscape; actual canvas/workbench/rail/toolbar/document geometry |
| [reduced-motion-results.json](reduced-motion-results.json) | Three-frame Audit Line opened as a transient Repeat draft named Motion Audit; OS preference reduce, content flag true; changing framebuffer hashes prove autoplay continues. Transient draft not saved. |
| [cross-tab-cache-results.json](cross-tab-cache-results.json) | Mounted dashboard showing Audit Pattern; change one cyan pixel to white and Save in Studio, focus dashboard, then reload. Focus hash stays old; reload hash changes. Original source restored with Undo + Save afterwards. Observer tab closed. |
| [pointer-edge-results.json](pointer-edge-results.json) | Blank mirrored Studio; secondary mouse click paints; leaving/re-entering while captured still paints on return (capture not shown broken). |
| [auth-mutation-results.json](auth-mutation-results.json) | Mobile Customizer density save returns partial user keys; HUD becomes 0/100 while independent stats read reports 100/100. Density restored to Finest. |

The controlled Audit Pattern source was 20 white, 10 green, 10 purple and one cyan occupied cells. Exact color/output counts and hashes are in the density JSON. Counts across different logical sizes alone do not establish fidelity; compare matching native resolution and actual color/topology evidence.

All four presets also rendered at 180 CSS pixels / 540 backing pixels under DPR 3. Chrome screenshot operations may reset a CDP metrics override; the touch probe records DPR/backing sizes before screenshot capture. Desktop/viewport measurements use DPR 1 unless stated otherwise.

Final QA selection: Audit Pattern, Finest, dark mode. Audit Pattern's one-pixel cache-test edit was restored. The configured test account retains Audit Line, Audit Pattern, Mobile Audit and Empty Audit as test-only database records. No real person's artwork/preferences were edited. Temporary session credential files are not included in these artifacts.

## Verification baseline

`npx vitest run __tests__/pixel-display __tests__/dashboard`

Result: **20 files passed; 457 tests passed; zero failed**. Existing Vite/JSDOM canvas/local-storage warnings appeared. This run establishes the existing test baseline, not browser fidelity or native-device correctness. No app fix, new regression test, build, schema migration or deployment was performed in this audit.

Read the [report](../report.md) for priorities, root-cause source links, migration dependencies and acceptance gates.
