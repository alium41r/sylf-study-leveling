# Sylf Native — Phase 2 report: Technology Decision

**30 October 2026. Status: complete and approved.** This phase was research, evaluation and isolated, disposable experiments only. Nothing in the Sylf web app, backend, database, production configuration or dependencies changed. The decision itself is recorded in [ADR 0001](../../decisions/0001-technology-stack.md). This report holds the evidence. Inputs were the [master plan](../../master-plan.md), the [Phase 1 report](../phase-1/report.md), the Notes, timer and Sylvie contracts, and [`AGENTS.md`](../../../../AGENTS.md).

**Reading conventions.** "Measured" values come from the runs described here, with raw data in [`evidence/`](evidence/). "Documented" values come from vendor documentation checked on 30 October 2026 (sources in §12). Estimates are labelled as estimates. Nothing measured on one device is presented as a result for another.

## Summary

| Question | Answer |
| --- | --- |
| Recommended architecture | **One React Native (Expo) codebase with two runtimes.** Native React Native runs on iPad, Android tablets and phones. On macOS and Windows, an **Electron** shell hosts the **web build of the same app**. Platform-specific behavior lives in adapters (native modules on tablets, Sylf's existing web owners on desktop). |
| Confidence | **High (about 80%)** for React Native + Expo on tablets and for TypeScript reuse. **Medium-high (about 70%)** for Electron on desktop; Tauri is the fallback if memory becomes decisive. **Medium** for iPad-specific items, which are unverified here. The game engine choice is deliberately deferred. |
| Biggest validated facts | Native S Pen capture on the Tab S9 FE reached about 419 samples/s with about 4 ms dispatch latency and 0.84% janky frames. The JS gesture path reached about 47/s, so production ink must be native. Unmodified Sylf modules gave byte-identical results on V8, desktop Chromium and the tablet's Hermes engine. The SQLite journal and outbox design survived 105 crash kills (80 on Mac, 25 on the tablet) with zero lost acknowledged writes. PDF page geometry matched pdf.js within 0.5 px on PDFKit and Android PdfRenderer, after a deterministic UserUnit correction. BlockNote runs on the tablet in a WebView bridged to a Hermes-owned Y.Doc. Desktop Chromium kept p95 frame times around 17.5 ms during panel drags, panel animation and pen ink. |
| Biggest new risks found | y-prosemirror **deletes** Yjs content that fails schema validation. React Native and web need **different React versions** (19.3.0 vs 19.2.4). Hermes lacks `crypto`, so Yjs needs a shim for its `lib0/webcrypto` dependency. Native PDF engines ignore UserUnit. Native ink inside a React Native view needs explicit integration work. |
| Not verified | Everything iPad-specific (no iPad, no Xcode). Physical pen-to-photon latency (no high-speed camera). Electron itself (Chrome app mode used as proxy). Windows. 90 Hz on the tablet (Motion smoothness was set to Standard). Any game engine. Battery and thermals. |

## 1. Candidate frameworks and architectures

Weights reflect Sylf's requirements in the master plan. Scores run from 1 (poor) to 5 (excellent).

| Criterion (weight) | RN + Expo, Electron desktop | RN + Expo, RN macOS/Windows desktop | Flutter everywhere | Compose Multiplatform | Fully native ×3 | Capacitor/WebView |
| --- | --- | --- | --- | --- | --- | --- |
| Reuse of Sylf TypeScript domain, Notes engine, Yjs, BlockNote (×3) | **5**: measured unmodified reuse | 4 | 1 | 1 | 1 | 5 |
| Tablet pen, gestures and native feel (×3) | 4: native modules where needed | 4 | 4 | 3 | **5** | 2 |
| Desktop credibility (×2) | **4**: Chromium on both OSes, existing web owners | 2: lagging releases, no Expo | 3: no stable multi-window | 3 | 4 (third UI codebase) | 3 |
| Rich-text compatibility (×2) | **5**: BlockNote itself | 4 | 2: WebView anyway | 2 | 2 | 5 |
| Performance and memory (×2) | 4 tablets; 3 desktop | 4 | **5** | 4 | **5** | 2 |
| Delivery cost and maintainability (×2) | **5**: one TS codebase | 3 | 3 | 3 | 1 | 4 |
| Ecosystem maturity and long-term risk (×1) | 4 | 2 | 4 | 3 | 5 | 3 |
| **Weighted total (max 75)** | **67** | 52 | 44 | 38 | 47 | 52 |

**One framework or platform-specific frontends?** A single React Native component tree serves tablets, phones and desktop through react-native-web. Desktop quality comes from Chromium plus Sylf's existing web implementations, not from a separate desktop UI. Platform-specific *frontends* exist only where the product itself differs: the phone companion's navigation and Space set. Desktop-only chrome (menus, multi-window) belongs to the Electron shell.

## 2. Recommended technology stack

The full table and justifications are in [ADR 0001](../../decisions/0001-technology-stack.md#decision). The versions verified by building and running the spike were:

| Component | Version verified | Notes |
| --- | --- | --- |
| Expo SDK | 58.0.21 | Released 15 October 2026. Requires Node 22.13+, 24.3+ or 26. |
| React Native | 0.88.1 | New Architecture only; Hermes V1 (Static Hermes bytecode 99, concurrent Hades GC). |
| React | **19.3.0** | The web app pins 19.2.4, so they cannot share one hoisted copy. |
| Reanimated / Worklets | 4.7.1 / 0.13.0 | Expo noted a Hermes V1 memory regression with Reanimated in SDK 56–57, fixed in 57.0.9. Re-check in Phase 3. |
| Gesture Handler | 3.3.0 | `stylusData` (pressure and tilt) present on Android and web. |
| React Native Skia | 2.14.0 (Ganesh renderer) | Expo pins 2.x. The 3.x Graphite renderer is not yet the Expo default. 2.x paths are built with `Skia.PathBuilder`. |
| expo-sqlite / expo-crypto | 58.0.14 / 58.0.7 | WAL; `getRandomValues`, `randomUUID`, `digest`, AES. |
| androidx.ink | 1.0.0 (stable) | 1.1.0-alpha10 is current alpha. |
| BlockNote / Yjs / y-prosemirror | 0.56.0 / 13.6.33 / 1.3.7 | Identical to the web app's pins. |
| Electron (proposed) | 45 (Chromium M156) | The measured proxy was Chrome 156 in app mode. |
| Android toolchain | JDK 17 (Zulu), Gradle 9.4.1, build-tools 36.0.0, NDK 28.2, CMake 3.22.1 | Clean arm64 release build took 11 min 53 s on the M1 8 GB; incremental builds took about 78 s. |

## 3. Desktop, tablet and phone strategies

**Tablet (primary native target).** One Expo app with development builds and Continuous Native Generation. Tablet-quality interactions use UI-thread animation (Reanimated) and native gesture recognition. Pen, PDF, storage, background session, audio and World host are Expo modules in Swift and Kotlin. Layout responds to **window size class**, which the spike confirmed reports correctly on device (1316×823 dp at 1.75×). Phases 4 and 10 must validate Samsung split-screen, pop-up view and DeX resizing (§5.3).

**Desktop (macOS and Windows).** An Electron main process (window management, menus, global shortcuts, file associations, auto-update) loads the Expo web build. Platform adapters use web implementations, so desktop Notes runs the *already qualified* IndexedDB repository, BlockNote, pdf.js and Pointer Events ink controller, with `navigator.ink` low-latency trails in Chromium. Sylf's Workspace can additionally open tools in separate OS windows on desktop, a desktop-only enhancement. A macOS-native path is also available at no extra cost later: the iPad app on Apple silicon ("Designed for iPad"). It is not the primary desktop product.

**Phone (later).** Same app and same store listings: a universal iOS app, and on Android the same application. A separate `phone` frontend package (its own navigation, Home/Focus/Circle/Progress essentials) is selected when the window is compact *and* the device class is a phone. A compact window on a tablet keeps the tablet app in compact layouts. This avoids two store identities and duplicated sign-in while keeping the phone UI separate in code.

## 4. Proposed repository structure and package boundaries

**Constraints discovered.**

- React versions differ: Expo 58 uses 19.3.0, the web uses 19.2.4.
- The root `package.json` is the Next.js app and has no workspaces.
- About 148 route handlers and the tests import `lib/` through `@/`.
- Stateful libraries (Yjs, zod) must resolve to a single copy per bundle. The spike reproduced Yjs's *"already imported"* warning when Node resolved `lib/` imports from the web tree.

**Proposal for Phase 3** (nothing created yet):

```
sylf/                         ← existing root, unchanged (Next.js web, lib/, prisma/, mobile/ Capacitor client)
└── native/                   ← new npm workspace root with its OWN package.json + package-lock.json
    ├── apps/
    │   ├── sylf/             ← Expo app: iOS + Android (tablet and phone targets), web build for desktop
    │   └── desktop/          ← Electron shell (main/preload), loads apps/sylf web build
    ├── packages/
    │   ├── design-system/    ← tokens (generated from lib/color-utils.ts), primitives, motion
    │   ├── spaces/           ← Spaces shell, Home/Workspace/World boundaries, window manager
    │   ├── phone/            ← phone companion frontend (Phase 10+)
    │   ├── shared/           ← typed re-export surface over approved portable lib/ modules
    │   ├── platform/         ← adapter interfaces + .native.ts / .web.ts implementations
    │   └── modules/          ← Expo native modules (ink, pdf, session, world-host, …)
    └── tooling/              ← Metro resolver, lint rules, conformance-suite runners
```

**Shared-code rules (validated by the spike's Metro configuration).**

1. Approved `lib/` modules are consumed **in place**. Metro watches `lib/`, and every *bare* import that originates in `lib/` resolves from `native/node_modules`, so there is exactly one Yjs, zod and React. Nothing moves out of `lib/` in Phase 3, so web imports are untouched.
2. Only modules on an allow-list may be imported (the audit in §6 is the starting list). A lint rule and a Metro guard reject server-only paths (Prisma, `auth-server`, `*/server/*`), mirroring [`mobile/vite.config.ts`](../../../../mobile/vite.config.ts).
3. Platform-bound modules (Dexie repository, WebCrypto vault, DOM ink controller) are *not* imported on native. Native implementations satisfy the same TypeScript types. The Notes `NotesRepository` type is already the seam: `engine.ts` and `sync.ts` import only the type.
4. Later extraction into real packages is optional and needs its own approval. It must leave `@/lib/...` imports working through re-export shims.

## 5. Feasibility experiments: results and limitations

Development hardware: Apple M1 MacBook Air with 8 GB RAM, macOS 27.2, 60 Hz Retina display. No Xcode was installed (by owner decision), only Command Line Tools. The test device was a **Samsung Galaxy Tab S9 FE (SM-X510)**: Exynos 1380 (s5e8835), 8 GB RAM, Android 16, One UI 8.5, 1440×2304 display, S Pen. Motion smoothness was set to Standard, so only 60 Hz and 30 Hz modes were available. The disposable spike sources live in the git-ignored `scratch/native-phase-2/`, with key scripts copied into [`evidence/`](evidence/).

### 5.1 Shared TypeScript on three engines (measured)

The same test module imported **unmodified** Sylf sources: `game-engine`, `color-utils`, `calculator/math-engine`, `timezone-service`, `timer-engine`, `notes/ink`, `notes/ink-geometry`, `notes/graph`, plus `perfect-freehand` and Yjs. It hashed their outputs.

| Check | V8 (Node 26, M1) | Chromium 156 (react-native-web build) | Hermes V1 (Tab S9 FE) |
| --- | --- | --- | --- |
| Progression rewards / levels | `78157743` | `78157743` | `78157743` |
| Appearance tokens | `8b870931` | `8b870931` | `8b870931` |
| Calculator | `7384805d` | `7384805d` | `7384805d` |
| Timezone service | `true\|2026-10-31\|Friday` | same | same |
| Timer engine snapshot | `4379c662` | `4379c662` | `4379c662` |
| Ink geometry (`sylf-1` brush input) | `a127da69` | `a127da69` | `a127da69` |
| perfect-freehand outline | `466:aabf8074` | same | same |
| Yjs: apply 135 KB, 400-block document | 4–5 ms | 4 ms | **29–30 ms** |
| Yjs: 1,000 single-character inserts | 11 ms | 8 ms | **74–79 ms** |

**Runtime surface on Hermes before polyfills (measured).**

- Present: `TextEncoder`, `TextDecoder`, `structuredClone`, `ReadableStream`, `atob`, and full `Intl` time zones.
- Absent: `crypto` (no `getRandomValues`, `randomUUID` or `subtle`), `BroadcastChannel`, `navigator.locks` and `indexedDB`.

Yjs's `lib0/webcrypto` resolves on React Native to an entry that imports the unmaintained `isomorphic-webcrypto`. The spike replaced it with a two-line `expo-crypto` shim. Yjs is roughly 6–7× slower on the tablet than on the M1, which is acceptable for page-level streams. The Notes engine's per-page stream design already bounds hydration size.

### 5.2 Rich text and Yjs compatibility (measured)

- **Owning the document outside the editor works.** A DOM-free process (standing in for Hermes) edited BlockNote's `body` fragment. BlockNote read the edits back, a collaborating BlockNote editor kept editing, and all replicas converged regardless of update order.
- **Schema violations destroy data.** With an incorrect node name (`blockcontainer` instead of `blockContainer`), mark encoding (`true` instead of `{}`) or attribute type (string instead of boolean), y-prosemirror **deleted the element from the shared document** (`createNodeFromYElement`'s catch branch in `sync-plugin.js`). Note that `Y.XmlElement.toString()` lower-cases node names, which makes this easy to get wrong. This is the main reason a native editor is rejected. A future host-side writer must use BlockNote's own schema and conversion functions (`blocksToYXmlFragment`) and be tested against a live editor.
- **Bridge cost is small.** A keystroke produces a 20-byte Yjs update (median and p95), and 300 keystrokes total 5.7 KB.
- **On the tablet, BlockNote runs in an Expo DOM component** (Android System WebView, Chrome 156). It mounted in **88 ms**, scripted typing cost **1.6 ms per character** inside the WebView, and 200 updates crossed into Hermes and applied in **31 ms total**. That screen used 163 MB PSS. On desktop Chromium the same component mounted in 21 ms at 0.28 ms per character.
- Not measured: IME/handwriting-to-text input, accessibility (TalkBack), long documents in the WebView, and perceived typing latency.

### 5.3 Workspace panel management (measured)

The prototype had three floating panels (drag by header, resize by grip, tap to focus) plus a draggable split divider, using Reanimated shared values and Gesture Handler. The same source ran on desktop and tablet.

| Scenario | Desktop Chromium 156 (60 Hz) | Tab S9 FE (60 Hz mode) |
| --- | --- | --- |
| Drag a panel (120 pointer steps) | Moved 464×232 px. Median frame 16.7 ms, p95 17.5 ms, 0–2 frames over 1.5× vsync. | Owner dragged and resized panels by finger and judged them smooth. Combined with ink-js: 1.06% janky, p95 14 ms. `adb input swipe` proved unreliable for repeatable statistics. |
| Resize by grip | 360×280 → 508×391 | Not separately measured |
| Three panels animating continuously (5–10 s) | Median 16.7 ms, p95 17.7 ms, 0 long frames, JS heap 16–17 MB | 604–608 frames in 10 s, **0.49–0.99% janky frames**, 0–1 missed vsync, 139–144 MB PSS |

During the desktop runs I found and fixed three harness and spike bugs. They are recorded so the numbers can be trusted: Gesture Handler 3 wraps web detectors in zero-size elements, my code used Skia's pre-2.x `Path.moveTo` API, and grip coordinates went stale after a move. A hidden browser pane was found unusable for interaction measurements (0×0 layout, throttled frames) and was not used for any figure.

### 5.4 Handwriting (S Pen measured; iPad not tested)

The owner wrote by hand on the Tab S9 FE in two implementations of the same page, with the display in 60 Hz mode.

| Measure | Native Kotlin view (raw `MotionEvent` + Canvas renderer) | JS path (Gesture Handler `stylusData` → Reanimated → Skia; finish in JS) |
| --- | --- | --- |
| Pen samples received | **≈419/s median (max 422)**. 76% arrive as `MotionEvent` historical samples. | **≈47/s median (max 60)**, one per frame. History is not exposed. |
| Input dispatch latency (event time → view) | p50 ≈ 4 ms, p95 ≈ 4 ms (3–8 ms across sessions) | Not measurable from JS payloads |
| Pressure / tilt | 0–0.56 / up to 34° | 0–0.71 / up to 48° |
| Frame pacing while writing | 1,436 frames, **0.84% janky**, p95 13 ms, 0 missed vsync | Combined with panel dragging: 2,262 frames, 1.06% janky, p95 14 ms, 1 missed vsync |
| Non-stylus rejection | Finger touches ignored by tool type (up to 197 finger events, 0 marks). The OS reported no `FLAG_CANCELED` palm events. | 92 non-stylus events ignored |
| Finished stroke processing | Canvas segments drawn per sample | `perfect-freehand` outline in ≤ 1 ms per stroke (33 strokes, 10–83 samples) |
| Owner's assessment | "Native feels a lot better" | Visible flicker as the live path is replaced by the finished path at pen-up |

Findings:

1. **Production ink needs native capture.** The JS gesture path discards about 85–90% of the digitizer's samples, which the `sylf-ink/1` contract requires retaining.
2. **Pen-to-photon latency was not measured.** Dispatch latency is not display latency, and no high-speed camera was available.
3. **androidx.ink did not integrate on the first attempt.** Its `InProgressStrokesView` received correct DOWN/MOVE/UP events, threw no exceptions and was correctly sized (2304×1315 px), but neither displayed nor finished strokes inside the React Native host. The likely cause, unconfirmed, is that its low-latency surface is covered by React Native's opaque hierarchy. A plain Canvas renderer in the same view worked immediately. This is an **open item** for the native ink module (§9.2).
4. **Palm rejection by tool type works.** The system's palm handling on this tablet surfaced palms as ignored non-stylus contacts, not as cancellations.
5. **The ink-js flicker** is partly a spike shortcut (the live path is cleared before the finished path renders) and partly a structural cost of finishing on the JS thread.

### 5.5 PDF annotation geometry (measured)

Seven pages tested crop offsets, rotations of 90°, 180° and 270°, a negative MediaBox origin and UserUnit 2. Each page carried a red marker at a known PDF user-space point. pdf.js scale-1 viewport coordinates (Sylf's canonical page units) were compared with native rendering at 1 px/pt.

| Renderer | Crop, rotation and negative-origin pages | UserUnit page |
| --- | --- | --- |
| macOS PDFKit (Swift, macOS 27.2) | 0–0.27 px error | 300×400 instead of 600×800; marker exactly ×0.5 |
| Android PdfRenderer (Tab S9 FE, Android 16) | 0–0.5 px error (integer-pixel centroids) | 300×400 instead of 600×800; marker exactly ×0.5 |

**Conclusion.** Both native engines reproduce pdf.js page units except for UserUnit, which they ignore. Sylf must compute page units from the PDF dictionaries (CropBox, Rotate, UserUnit) and use native engines only to rasterize. My first PDFKit harness double-applied the crop transform (`transform(_:for:)` followed by `draw(with:to:)`, which already applies it). That was corrected and is recorded in the evidence. iOS PDFKit was not tested (macOS PDFKit shares the API, but that's not proof).

### 5.6 SQLite durability (measured)

The schema followed the Notes local mutation contract. One transaction stores the journal entry with a 1–64 KB blob, its outbox row and the stream head. "Saved" is acknowledged only after COMMIT returns. The process was then killed abruptly at random times.

| Platform | Engine | Kills | Acknowledged commits | Lost acks | Partial rows | Gaps / digest / integrity failures | Commit latency |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 Mac | Node `node:sqlite`, WAL, NORMAL | 40 SIGKILL | 53,035 | 0 | 0 | 0 / 0 / 0 | p50 0.10 ms, p95 0.25 ms |
| M1 Mac | Node `node:sqlite`, WAL, FULL | 40 SIGKILL | 48,026 | 0 | 0 | 0 / 0 / 0 | p50 0.15 ms, p95 0.31 ms |
| Tab S9 FE | **expo-sqlite 58**, WAL, NORMAL | 25 `am force-stop` | 8,937 committed | 0 | 0 | 0 / 0 / 0 | **p50 ≈ 4.2 ms, p95 ≈ 7.7 ms** |

Limitations:

- These are process crashes, not power loss. WAL with NORMAL is not power-loss durable, and macOS needs `PRAGMA fullfsync` for true durability.
- The tablet verifier hashed only the newest 100 rows per round, after my first verifier timed out hashing everything. Row-level atomicity, contiguity and integrity were checked for all rows.
- The production adapter must be qualified with the real Notes conformance suite (Phase 14).

### 5.7 Desktop runtime (measured, proxy)

An isolated Chrome 156 profile in app mode (same Chromium as Electron 45) ran in a visible 1366×900 window on the M1 and loaded the react-native-web build from localhost:

- Reload to app-ready: 192–234 ms. First contentful paint: about 230 ms. CanvasKit initialized in 44–82 ms.
- Shared Sylf code gave the same hashes as §5.1.
- Pen input via DevTools `pointerType: "pen"` events delivered pressure and tilt to Gesture Handler at 60 events/s. Finished strokes kept all 91 samples, with outlines in about 1 ms and p95 frames of 17.2 ms.
- **Memory (physical footprint, all 10 Chrome processes): 405 MB on the engine screen, 518 MB with three animated panels.** RSS (1,063 MB) double-counts shared pages and is not used.
- The web build is 4.4 MB of JS plus 7.9 MB CanvasKit WASM. The Android Hermes bytecode bundle is 4.6 MB, and the arm64 release APK is 50.5 MB.

Not measured: Electron itself, Windows (no hardware), Wacom or other desktop pens, multi-window, and packaging and auto-update.

### 5.8 Tablet session details (measured)

- **Cold start** (`am start -W`, release build, 5 runs): median **217 ms** to first frame (202–273 ms). JS reached first effect 11–13 ms after bundle start.
- **Memory (PSS):** 129 MB on the engine screen, 139–144 MB with panels, 163 MB with BlockNote WebView.
- **Window:** the app sees 1316×823 dp at 1.75× scale with font scale 1.15 (the user's system setting).
- **Native ink screen memory:** 243 MB PSS, including a full-screen ARGB cache bitmap and the androidx.ink surfaces.
- **Multitasking:** one process (same pid) throughout portrait (823×1317 dp), landscape, Samsung split screen (654×808 dp) and pop-up view (395×593 dp). Window size changes were reported to JS each time.
  - **Entering pop-up view recreated the React root** in the same process, so in-memory UI state was lost.
  - Spike panels kept absolute positions and did not reflow on rotation, which the owner observed.
  - **Requirements for Phases 5 and 8:** persist Workspace layout outside React state and restore it on remount; store panel geometry relative to the window and clamp or reflow it per size class.
- **Not tested:** DeX, external keyboard and trackpad, 90 Hz mode, thermals and battery over long sessions.

Evidence: [`evidence/tablet/`](evidence/tablet/) (results JSON, raw logcat sessions, `gfxinfo` dumps, harness). The executed spike sources (React Native app, Metro configuration, Kotlin module) are in [`evidence/executed-sources/spike-app/`](evidence/executed-sources/spike-app/). Evidence scripts are snapshots of what ran. They are excluded from the root TypeScript program and, like existing feature evidence, are not lint-clean production code.

## 6. Existing backend compatibility and integration requirements

The static audit ([`evidence/lib-portability-audit.json`](evidence/lib-portability-audit.json), produced by [`lib-portability-audit.mjs`](evidence/lib-portability-audit.mjs)) classified 481 `lib/` modules by transitive imports: **174 portable, 119 adapter, 172 server-only, 16 framework-bound**. It is heuristic: it follows type-only imports and matches the word "window" in comments. For example, it flags `notes/engine.ts` because of the type-only repository import. Each module must be confirmed before it joins the allow-list.

| System | Native treatment |
| --- | --- |
| Progression engines, timezone, calculator, color tokens, catalogs, planner/v2 contracts, Notes formats (ink, graph, interchange, pdf, contracts) | **Share directly**: measured identical on Hermes. |
| Timer engine | Share. Replace the `timer-sync` localStorage and Web Locks journal with a SQLite journal plus native background session, keeping idempotent replay and server receipts. |
| Notes engine, sync, pack, vault, repository | Share engine, sync logic and formats. Implement `NotesRepository` on SQLite, and the vault and `bytes` crypto (SHA-256, AES-GCM) via expo-crypto. Run one conformance suite on IndexedDB and SQLite. |
| BlockNote adapter, ink controller and renderer, pdf.js reader | Desktop: reuse unchanged. Tablets: DOM component (BlockNote) and native modules (ink, PDF). |
| Acoustics (Web Audio), client data cache, realtime client | Native audio module; SQLite-backed cache with the same invalidation and logout semantics; `@supabase/supabase-js` with polling fallback (not tested). |
| All `/api` routes (about 148), settlement RPCs, ledgers, RLS, AI routing and quotas, Notes credential broker | **Server-only, unchanged.** |
| Authentication | Required backend addition (Phase 11–12). Sessions are cookie-only and the bearer path was deliberately removed. Native needs a reviewed token mode: secure storage, `tokenVersion` revocation, rotation, and CSRF and origin rules for non-browser clients. |
| AI streaming | `expo/fetch` (default since SDK 56) supports streamed bodies and `TextDecoder`. Sylvie's SSE over it was not tested against the real route. |

## 7. Performance, memory and platform-specific risks

| Risk | Evidence | Mitigation / owner phase |
| --- | --- | --- |
| Native ink integration inside React Native views | Samples, pressure and tilt reached the native view, but the first androidx.ink integration rendered nothing. A Canvas renderer worked (§5.4). | Dedicated ink-module spike with layout and rendering tests: Phase 3 foundation, then Phase 14 |
| React root recreated by OS window-mode changes | Pop-up view remounted the app (§5.8) | Persist shell and Workspace state outside React; Phases 5 and 8 |
| JS-thread ink sampling | Gesture Handler on Android delivers about one event per frame and ignores MotionEvent history, while the native view saw 120–183 samples/s | Native capture module for production ink. JS ink is acceptable for previews only |
| Yjs speed on Hermes (6–7× slower than M1 V8) | §5.1 | Keep per-page streams; profile large notebooks on the low-end reference device |
| Desktop memory (Chromium shell) | 405–518 MB footprint (proxy) | Budget in Phase 16; Tauri fallback |
| React version split | Expo 19.3.0 vs web 19.2.4 | Separate `native/` lockfile; never hoist |
| Duplicate stateful dependencies across `lib/` | Yjs duplicate-import warning reproduced | Metro resolver rule plus a CI check |
| Schema-incompatible Yjs writes | y-prosemirror deletion reproduced | Only BlockNote writes rich text; a host-side guard test |
| UserUnit and native PDF bounds | §5.5 | Sylf computes page units itself |
| Hermes missing crypto | §5.1 | expo-crypto adapter |
| Reanimated memory regression with Hermes V1 (documented SDK 56–57) | Expo changelog | Re-verify on the pinned SDK in Phase 3 |
| iOS entirely unverified | No Xcode or iPad | Gate before Phase 5 (§9) |
| 8 GB development Mac | Clean Android build took 11.9 min; Xcode not installed | Use EAS cloud builds or a higher-memory Mac for iOS |
| Store and background policy (Android foreground service types, iOS Live Activities) | Documented only | Phase 13 and 17 |

## 8. Rejected alternatives

See [ADR 0001 — Rejected alternatives](../../decisions/0001-technology-stack.md#rejected-alternatives). In short:

- Flutter, Compose Multiplatform and fully native stacks lose measured TypeScript reuse and still need a WebView editor.
- React Native for macOS/Windows lags core and lacks Expo support.
- Tauri splits rendering engines; it is the fallback.
- Capacitor fails the pen and native-feel requirement.
- A native rich-text editor risks silent data loss.
- PencilKit storage breaks format parity.

## 9. Remaining uncertainties and decisions needing validation

1. **iPad (blocking before Phase 5 tablet work, not before Phase 3).** The following have not been run: Xcode builds, Apple Pencil capture and latency, iPadOS Stage Manager and Split View, PDFKit on iOS, BlockNote in WKWebView, and Hermes and expo-sqlite on iOS. These need an iPad plus Xcode 26.4 or later (or EAS cloud builds plus a device).
2. **Native ink module design.** Choose between androidx.ink authoring and a custom front-buffered renderer on Android, and between UIKit with Metal and PencilKit capture with conversion on iOS. Both must render `sylf-1` geometry identically to web.
3. **Electron vs Tauri on real desktop hardware**, including Windows and pen tablets.
4. **Game engine** (Phase 15): Godot (LibGodot) vs Unity as a Library vs WebGPU. Unity's documented constraints are 80–180 MB retained after unload and no restart after quit on iOS.
5. **Native authentication design** (Phase 11–12).
6. **90 Hz and high-refresh behavior** on the tablet (Motion smoothness → Adaptive) and 120 Hz on iPad.
7. **App identity and the Capacitor client** (`app.sylf.study`), and whether Sylf Native replaces it (question C1).
8. **SQLite encryption at rest** (SQLCipher via op-sqlite vs file-level OS protection), tied to the Notes offline-unlock policy.

## 10. Handoff to Phase 3 — Project Foundation

Phase 3 should, after approval:

1. Create `native/` exactly as proposed in §4, with its own `package.json`, lockfile, TypeScript config and lint config. Pin Expo SDK 58 (or the current patch) and record versions in a `native/README.md`.
2. Port the spike's validated Metro rules: single-copy resolution for bare imports from `lib/`, the `lib0/webcrypto` shim, and `wasm` assets. Add a **server-only import guard** and an **allow-list** of shared `lib/` modules, starting from §6.
3. Scaffold `apps/sylf` (iOS and Android configuration, development builds, web output) and `apps/desktop` (an Electron shell that loads the web build; no feature UI).
4. Scaffold `packages/platform` with adapter *interfaces* only: storage, crypto, ink, PDF, session, audio, secure storage and file. Provide `.web.ts` implementations that wrap existing Sylf owners, and `.native.ts` stubs.
5. Add CI checks: typecheck and lint for `native/`, a Hermes-and-web engine-parity test (the §5.1 hash suite), the Android release build, and the web build. Root web CI stays unchanged.
6. Do **not** build feature UI, migrate `lib/`, change the backend or touch `mobile/`.
7. **Pre-Phase-5 gate:** complete the iPad verification list in §9.1, and rerun the S Pen session with the corrected native ink module.
8. Phase 3 ends Stage 1. Write the **Stage 1 handoff** in [`../../handoffs/`](../../handoffs/) covering Phases 1–3 and the Phase 4 requirements.

## 11. Recommendation, confidence and rationale

**Recommended architecture.** One TypeScript and React Native (Expo SDK 58, React Native 0.88, New Architecture, Hermes V1) application:

- **Tablets and phones** run it natively, with Swift and Kotlin Expo modules for ink capture, PDF rasterization, SQLite storage, secure sessions, background timers, audio and the World host.
- **macOS and Windows** run its react-native-web build inside **Electron**, using Sylf's existing web owners for Notes, BlockNote, pdf.js and the ink controller.
- Rich text is BlockNote everywhere, in a DOM component on native. Domain logic comes from `lib/` in place. Native lives in a separate `native/` workspace, and the web app stays untouched.

**Confidence: high for the core and medium-high overall.**

- High (≈80%) that React Native + Expo is the right tablet and phone foundation. The decisive risks (shared code on Hermes, native pen sampling, SQLite crash durability, PDF geometry, rich-text interoperability, panel performance) were measured on the target Android tablet with positive results.
- Medium-high (≈70%) for Electron as the desktop runtime. The Chromium behavior was measured, but Electron, Windows and desktop pens were not.
- Medium for iPad until the §9.1 gate is run.

**Why it is the best fit for Sylf.** Sylf's most valuable and most heavily qualified assets are TypeScript and web-platform code: the Notes engine and formats, BlockNote/Yjs, progression, planner contracts and appearance. This architecture runs that code unmodified on every target, which the spike verified hash-for-hash. Native engineering goes only where measurements show it matters: pen capture (≈419 vs ≈47 samples/s), PDF rasterization, durable storage and background execution. One component tree and one design system can then deliver Home, Workspace, World entry and the phone companion. Every alternative either discards that reuse (Flutter, Compose Multiplatform, fully native) or lags the platform (React Native desktop forks). Neither is the "simplest architecture without avoidable limitations".

**Phase 2 was approved on 30 October 2026; Phase 3 followed.**

## 12. Sources (documented facts)

- React Native release blog (0.84 Hermes V1 default; 0.88 on 19 October 2026): <https://reactnative.dev/blog>
- React Native environment setup, 0.88 (JDK 17, Build-Tools 36.0.0): <https://reactnative.dev/docs/set-up-your-environment>
- Expo SDK 56, 57 and 58 changelogs (RN versions, Hermes V1 regression, expo/fetch default, "macOS is not supported in SDK 58"): <https://expo.dev/changelog/sdk-56>, <https://expo.dev/changelog/sdk-57>, <https://expo.dev/changelog/sdk-58>
- Expo DOM components: <https://docs.expo.dev/guides/dom-components/>
- expo/fetch streaming: <https://docs.expo.dev/versions/latest/sdk/expo/>
- react-native-macos releases (0.83 latest): <https://github.com/microsoft/react-native-macos/releases>
- React Native Windows 0.82–0.84 (Fabric-only): <https://devblogs.microsoft.com/react-native/>
- React Native Skia platforms (v3 Graphite; no Windows): <https://github.com/Shopify/react-native-skia>
- androidx.ink releases (1.0.0 stable 17 December 2025): <https://developer.android.com/jetpack/androidx/releases/ink>
- Flutter 3.47 release notes: <https://docs.flutter.dev/release/whats-new>
- Compose Multiplatform 1.10: <https://blog.jetbrains.com/kotlin/2026/01/compose-multiplatform-1-10-0/>
- Electron release schedule (45 on 20 October 2026, M156): <https://releases.electronjs.org/schedule>
- Tauri webview versions: <https://v2.tauri.app/reference/webview-versions/>
- Unity as a Library and `Application.Unload` (80–180 MB retained): <https://docs.unity3d.com/Manual/UnityasaLibrary.html>
- React Native Godot (LibGodot): <https://github.com/borndotcom/react-native-godot>
- Galaxy Tab S9 FE specifications: <https://mynexttablet.com/tablets/samsung-galaxy-tab-s9-fe/>
