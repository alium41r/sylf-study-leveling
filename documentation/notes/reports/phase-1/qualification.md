# Phase 1 qualification record

**19 October 2026.** Reproducible source is in [prototype/](prototype/README.md); raw results and build logs are in [evidence/](evidence/README.md). All test data was synthetic. No private cloud content, production OAuth tokens or database mutation was used.

## Environment and exact scope

- Host: macOS arm64; Node **24.19.0**, TypeScript **5.9.3**; existing bundled Playwright **1.62.1**, headless Chromium **151.0.7922.34**. Viewports are layout simulations, not tablet/phone hardware.
- Isolated dependency project in `/private/tmp/sylf-notes-phase1`; root `package.json`, lockfile and application source untouched. Dependencies were installed with lifecycle scripts disabled. No global tool installation or agent configuration change.
- Framework pins matched inspected Sylf versions: Next **16.2.9**, React/React DOM **19.2.4**, Vite **8.3.0**, React Vite plugin **6.0.2**. Read installed Next client/server and lazy-loading guides before writing the fixture.
- Next fixture used a Client Component with `next/dynamic` and `ssr:false`. The raw BlockNote view avoided adding a second UI framework. This follows [BlockNote's Next integration requirement](https://www.blocknotejs.org/docs/getting-started/nextjs), then was actually built and loaded.
- Vite fixture inspected the emitted module graph against the forbidden server-module families in Sylf's current mobile guard: **144 emitted module IDs, zero violations**. This does not run Capacitor, navigation adapters, the full Sylf mobile build or native lifecycle.
- The real `lib/color-utils.ts` was copied into the temporary fixture at run time; the hash is recorded. Rendered body/editor colors, text contrast and overflow were checked, with visual review of all four screenshots. This does not validate every BlockNote menu, selected state or accessibility flow.

## Executed checks

| Evidence | Result | What it establishes / limit |
| --- | --- | --- |
| [Contract tests](evidence/contract-tests.log) | **19 passed, 0 failed** | Real Yjs, Dexie with fake-indexeddb, Perfect Freehand, fflate and pdf-lib. Exercises journal/outbox/revision atomicity, owner fencing, injected quota, duplicates/reordering, undo/checkpoint lineage, fake cloud verification, basic archive limits and transitive deletion ancestry. Fake IndexedDB/provider behavior is not a browser/cloud fidelity claim. |
| [Browser results](evidence/browser-results.json) | **18 passed, 0 page errors** | Real editor, IndexedDB, OPFS, PDF worker, formatting/Unicode, reload, two tab branches, injected transaction abort, offline shell, renderer crash and rendered themes. Does not test real OS IME, live tab broadcast, hardware input, power failure or native persistence. |
| [Archive portability](evidence/archive-portability.json) | **Passed, 0 page errors** | Actual BlockNote rich-text journal plus synthetic PDF archived, hash-checked and restored in a fresh browser profile with identical editor document JSON. Subsequent independent original/imported edits merged with the expected block count. Four updates / 3,849-byte archive; this tests native lineage, not a completed library-independent interchange adapter or production importer. |
| [Next production build](evidence/next-build.log) | Passed, including TypeScript | Selected browser libraries can be isolated from SSR on the pinned framework. Harness strict configuration uses `skipLibCheck`, matching Sylf; third-party declarations are not exhaustively audited. |
| [Vite build](evidence/vite-build.log), [client graph](evidence/client-graph.json) | Passed with large-chunk warning | Shared client imports compile against the selected mobile toolchain. Eager harness includes editor and PDF code; split before production. |
| [Root typecheck](evidence/root-typecheck.log) | Exit 0, no output | Existing Sylf working copy passed `tsc --noEmit --incremental false`; no root code changes were necessary. No full root production build/mobile build was run for this documentation/isolated-prototype phase. |
| [Fixture lint](evidence/fixture-lint.log) | Exit 0, no warnings/errors | Existing Sylf ESLint configuration applied to the retained experimental JS/JSX sources. |

The initial browser run had **11/15 passing checks**. PDF rendering succeeded but cleanup called an outdated method; changed to `PDFDocumentLoadingTask.destroy()`. Offline cold reload initially failed and later checks cascaded; the static worker was repaired and the final suite was rerun from a new browser profile. Custom-theme inspection also caught incorrect background-token usage in the fixture; rendered-color assertions were added. Initial and final records are retained. These fixes were confined to experimental files.

The final 18 browser checks include a negative control: deleting the browser database removes locally saved, unuploaded content. Passing that check demonstrates the durability boundary, not a successful recovery from clearing. A renderer crash was induced only in an isolated test browser; its acknowledged marker survived. It does not simulate loss of power or disk corruption.

## Performance evidence and targets

Measurements below are from one headless run, without CPU/network throttling. Quantiles use the nearest-rank method. No statistical or device-support claim follows from these sample sizes.

| Operation | Fixture and observation | Future acceptance gate |
| --- | --- | --- |
| Update → journal acknowledgement | Four updates after peer/keyboard edits; max **39.5 ms**. Includes queue/hash/transaction latency, excludes input/paint. | Ordinary edits/stroke completion p95 **≤250 ms**, ≥200 samples on a named baseline device, while checking exact recovered revision IDs. |
| Stroke outline calculation | 100 strokes, 256 points each; p50 **0.1 ms**, p95 **0.2 ms**, max **1.1 ms**. | This component fits a frame budget here. Full input-to-presented-frame p95 **<32 ms**, sustained 60 Hz target, dense pages on real pen hardware remain unmeasured. |
| Indexed library paging | 10,000 metadata entries, 50 reads of 30 items; p95 **1.7 ms**, max **2.5 ms**. | Warm metadata/search interaction p95 **<150 ms**. Real full-text indexing, language tokenization, UI virtualization and cold cloud reconstruction still need tests. |
| Boot | Initial `window.probe` marker **232.6 ms** after navigation. | Not a reliable first-editable/paint measurement. Cached ordinary-document open **≤500 ms** remains a target, not a verified support limit. |
| PDF | One generated 300×400 page; render/extraction check **~175 ms**, including automation/cleanup overhead. | Large/complex PDF page render, memory and range loading budgets require representative corpora; no page/MB support limit approved. |
| Bundles | Main JS **1,643 KB / 504 KB gzip**; additional native/module chunks and **41 KB CSS**. PDF worker served separately. | Lazy-load Notes/editor/PDF assets; set production route-transfer/memory budgets after real composition. Do not charge this eager harness bundle to all Sylf pages. |

The reported browser quota was about **2.0 GiB** and `navigator.storage.persisted()` returned **false**. These are profile observations, not guaranteed capacity. Private browsing, Safari eviction, user clearing, origin changes and WebView storage require separate coverage. OPFS read/write and Web Locks capability checks do not qualify their crash/fallback paths.

Phase 0's 300-page notebook, 20,000 strokes, long text, large PDF and multilingual full-text corpus are **not yet qualified**. Keep them as gates for the relevant feature phases. There is no evidence supporting a premium/native-performance claim today.

## Dependency and license qualification

The [lockfile](prototype/package-lock.json) pins the entire experiment; the [inventory](evidence/dependency-inventory.json) lists 111 installed metadata entries selected during inspection. The installed package license files and versions were checked, not just repository marketing.

| Package | Pinned version | License / disposition |
| --- | --- | --- |
| BlockNote core/react | 0.56.0 | MPL-2.0; selected. Notice/covered-source obligations apply. No XL packages in the experiment. |
| Yjs / y-prosemirror / y-protocols | 13.6.33 / 1.3.7 / 1.0.6 | MIT; selected. One installed Yjs 13 copy; no Yjs 14 / `@y` prerelease engine. |
| Dexie | 4.4.6 | Apache-2.0; selected. Cloud service not required. |
| Perfect Freehand | 1.2.3 | MIT; selected outline generator, not a complete handwriting/input system. |
| PDF.js | 6.4.299 | Apache-2.0 core; selected viewer engine. Retain notices for shipped CMaps/fonts/ICC and other auxiliary assets. Node requirement ≥22.13 or ≥24; use supported build runtime. |
| fflate | 0.8.2 | MIT; provisional archive primitive, not a validated hostile-import subsystem. |
| pdf-lib | 1.17.1 | MIT; experimental export only. Advanced fidelity/security/maintenance assessment remains open. |
| fake-indexeddb | 6.2.5 | Apache-2.0; test-only. |

`lib0 1.0.0-rc.36` is present as a utility in BlockNote's pinned graph, alongside stable lib0 used elsewhere. It requires Node ≥22. This is a transitive prerelease maintenance risk; do not describe the entire graph as prerelease-free. Pin and requalify upgrades rather than forcing incompatible overrides. Next's optional macOS sharp/libvips package includes LGPL-3.0-or-later metadata; its server/native distribution obligations are distinct from the browser editor. This was a dependency/terms review, **not a vulnerability scan or legal clearance**. No paid service is necessary for the chosen foundation.

## External qualification matrix

Only environment-variable **presence** was inspected; no values were printed or exported. Google client configuration exists, but no authorized Notes Drive grants were supplied. No usable Notes Microsoft configuration/grants were found. Consequently every live provider row below is **NOT RUN**.

| Required operation | Google Drive | OneDrive | Required evidence |
| --- | --- | --- | --- |
| Consent, PKCE/state, stable identity and scope boundary | Not run | Not run | Disposable test accounts, registered callbacks; reject account mismatch and scope expansion. |
| Root discovery/reinstall/reconnect | Not run | Not run | Same library after fresh install; selected-file/AppFolder visibility and app-client identity continuity. |
| Create/list/page/read/hash + uncertain acknowledgement | Not run | Not run | Synthetic immutable objects under minimum grant; duplicate-name behavior and readback verification. |
| Resumable upload/session expiry | Not run | Not run | Actual least-scope coverage; small-object fallback if sessions need broader grants. |
| Delta/cursor expiry/full scan | Not run | Not run | No skipped updates/deletions across pagination, interruption and cursor reset. |
| Refresh/revocation/quota/throttle/offline reconnect | Not run | Not run | Owner-fenced credentials, blocked-state accuracy, retained pending work and retry limits. |
| Browser CORS/CSP, large-file/range behavior | Not run | Not run | Real intended origin and provider upload hosts; current Sylf CSP does not allow direct transfer. |
| Fresh-device restore, root deletion/corruption | Not run | Not run | Reconstruct from immutable records without local index, preserve alternate valid branches. |
| Managed-school policy and personal accounts | Not run | Not run | Tenant consent/provisioning restrictions documented; no unsupported parity claims. |

The test sequence and responsibilities are carried into the [Phase 2 handoff](phase-2-handoff.md). Live provider readiness is a later release gate, not an experiment result hidden behind a fake adapter.
