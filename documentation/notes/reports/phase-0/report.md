# Sylf Notes Phase 0 Research & Architecture Report

**Date:** 19 October 2026 (Asia/Karachi)
**Status:** Research and proposed architecture; not an approved implementation specification.
**Scope:** Competitive research, public source inspection, authorized static analysis, Sylf architecture inspection, UX planning, and a development roadmap. No Notes implementation, migrations, application dependency changes, or agent configuration changes are part of this phase.

## 1. Executive recommendation

Build Sylf Notes as a **local-first, cloud-backed study workspace**. A user must connect Google Drive or OneDrive and complete a verified storage round trip before creating or importing Notes content. After setup, cached documents remain editable through temporary loss of connectivity or cloud authorization, with clear recovery and reconnection states.

The preferred initial stack is **BlockNote core + stable Yjs 13 + Dexie/IndexedDB**, followed by **Perfect Freehand for ink** and **PDF.js for PDFs**. Keep a Sylf-owned, versioned document envelope and storage/sync protocol around those engines. Use Excalidraw later for optional diagrams. Do not fork AFFiNE wholesale or select tldraw as a default commercial dependency.

These choices are conditional on a short, separately approved qualification phase. BlockNote reduces the work needed for usable text editing, while its MPL core is commercially usable; its GPL/commercial XL exporters and AI packages must remain outside the default dependency graph. Its current source advertises both stable Yjs and a prerelease successor, so dependency selection must be deliberate. [BlockNote license boundaries][R6] [Core package][R7]

The core product decisions should be:

1. **User cloud storage owns the durable document library.** Supabase holds connection credentials, opaque library identifiers, Sylf relationships, and bounded operational metadata, rather than note bodies, PDFs, images, OCR corpora, or CRDT updates.
2. **Save locally before synchronizing.** A durable local journal and outbox own pending work; network availability never sits in the pen or typing path.
3. **Use immutable commits and assets.** Upload new data and a verifiable commit before updating discovery hints. Never make a single overwritten ZIP, remote filename, or mutable library index the only recoverable copy.
4. **Keep history independent from current state.** Undo, sync, retained checkpoints, Trash, and independent backup are distinct protections.
5. **Start with two coherent editing experiences.** A flowing typed document and a paged paper/PDF notebook share the library, storage, asset model, and recovery system. Do not attempt arbitrary ink over reflowing text in the first release.
6. **Make reliability part of the first usable release.** Basic export, recovery, conflict preservation, and verified cloud save are release gates before handwriting and PDF expansion.

**A necessary limit:** a web app cannot promise survival of edits that exist only in browser storage after the user clears that storage or the device is destroyed. IndexedDB and OPFS share an origin's storage lifecycle; putting a second copy in either is not an independent backup. Persistent-storage permission helps with automatic eviction, but does not prevent explicit deletion. If survival of unsynced work outside browser storage is an absolute launch requirement, native disk persistence or a supported external-file backup must move into the first release. [Browser storage behavior][W1] [OPFS][W2]

## 2. Method, evidence, and limitations

### 2.1 Evidence labels

- **Verified—documentation:** an official product or maintainer document explicitly states the behavior. This does not establish identical behavior on every device, plan, or app version.
- **Verified—source:** an inspected source file, package manifest, or license supports the finding.
- **Observed:** a public application interface was inspected in this research session.
- **Inference:** an architectural interpretation of available evidence, not a claim about proprietary internals.
- **Proposal:** a recommendation for Sylf, requiring subsequent validation and approval.
- **Unverified:** a question the available evidence or this environment did not resolve.

Public sources were retrieved on 19 October 2026. Some search/rendered pages are cached; their retrieval date is not their publication date. Repository default branches and documentation can change. Source package versions below are observations, not an instruction to install a moving latest release.

The [Sylf source snapshot](evidence/sylf-source-snapshot.json) records hashes of 44 inspected working-copy files and base commit 68f72f0de9b87a0a177a11efa5589b42f3b9874a. The checkout already contained substantial modified and untracked calendar, theme, AI, and other work. This report describes the inspected working copy, including those changes, and does not certify deployment. [Initial working-tree inventory](evidence/pre-existing-working-tree.txt)

### 2.2 What was and was not tested

Official documentation and public repository sources were reviewed for all seven requested repositories and the principal competitors. The public Excalidraw workspace was inspected at 1280 × 720. Its interface exposed a compact tool strip, keyboard shortcuts, pan/zoom, and an explicit browser-storage loss notice. That is interface evidence, not a measurement of drawing latency or storage durability. [Observed workspace screenshot](evidence/excalidraw-public-workspace.png)

REA 6.7.0 was downloaded and run with the user's explicit approval, without agent setup or project dependency changes. It statically analyzed three selected Excalidraw 0.18.1 files and three of four selected existing Sylf browser chunks; one Sylf source exceeded its worker memory limit. The final processes exited successfully, but both graphs retain explicit partial-coverage/semantic limits. See the [REA evidence record](evidence/rea-analysis.md) and [compact source-located results](evidence/rea-summary.json). No proprietary Samsung Notes, Notability, Goodnotes, OneNote, or Notion binaries were decompiled; no private accounts, notes, or provider storage were accessed. Their rendering algorithms, undocumented formats, synchronization protocols, and internal caches remain unknown unless a public source is explicitly cited.

No device stylus benchmark, OAuth round trip, provider fault-injection test, editor integration prototype, load benchmark, or application test suite was run as part of the research-only work. Performance budgets and acceptance criteria in this report are proposed targets.

## 3. Competitive analysis

### 3.1 Comparison and lessons

Weaknesses below describe limitations relative to Sylf's requirements or design tradeoffs. They are not unsupported claims that a competitor is generally slow or unreliable.

| Application | Evidence-backed behavior and strengths | Limitation or tradeoff for Sylf | Lesson |
| --- | --- | --- | --- |
| **Samsung Notes** | Folders/subfolders, colored organization, page templates, PDF import, text/drawing annotation, handwriting conversion/alignment, and PDF export. Official instructions describe importing a copy rather than editing the source PDF in place. [Organization/PDF guide][C1] | The documented flow depends on Samsung's application/device experience; it does not establish a portable Google Drive/OneDrive two-way document format. The reviewed guide also qualifies orientation compatibility. Internal ink and sync engines were not inspected. | Make capture immediate, keep pen tools close to paper, preserve the original PDF, and give students useful page templates. Avoid making export depend on one device vendor. |
| **Notability** | Library, note replay connecting audio to ink, detailed Zoom View, hand navigation, and study-oriented tape. Current Cloud documentation supports cross-device/app sync. [Getting started][C2] [Cloud sync][C3] | Historical descriptions using subjects/dividers are now version-specific: the official update history says version 16 moved to folders. Third-party Drive/OneDrive backup is a one-way feature, not the same system as Cloud/iCloud sync; availability differs by platform. [Updates][C4] [Backup][C5] | Use current navigation evidence, make recently used documents easy to resume, and expose backup and sync as separate states. Audio-linked ink is valuable later, after reliable capture. |
| **Goodnotes** | Its own current comparison describes folders/subfolders, favorites, bookmarks, page thumbnails, outlines, and search across handwriting, typed notes, PDFs and other material. Treat breadth as a vendor claim with platform/language qualification. [Organization description][C6] | Automatic backup to Drive/OneDrive is explicitly one-way: remote edits do not update the library, and app deletion does not delete the backup. The reviewed backup guide also states platform limitations. This is not evidence that a third-party drive is its live edit authority. [Backup contract][C7] | Pair a familiar document shelf with fast thumbnails/outlines. Design recovery separately from synchronization. Do not confuse export backup with a cloud-backed live document library. |
| **OneNote** | Notebooks → sections → pages/subpages, optional section groups, pages that can grow, and links to notebooks, sections, pages, and paragraphs. [Organization][C8] [Links][C9] | Multiple hierarchy levels are powerful but can add navigation cost; platform capabilities vary. Native OneNote document structures are not a ready-made format for Sylf's custom editor. No private protocol was established. | Preserve stable document/page links and a useful notebook metaphor; keep advanced grouping optional and maintain a quick route back to recent work. |
| **Notion** | A composable block model and nested pages support structured text and knowledge organization. [Blocks][C10] [Subpages][C11] | Official offline support is for desktop/mobile apps, not browsers; downloaded subpages are not automatically included. Its offline guide distinguishes text conflict handling from non-text property conflicts. It is not evidence of a premium paper/ink engine. [Offline contract][C12] | Reuse block editing for typed study material, hide advanced controls until needed, and make offline availability explicit. Do not infer that browser and native offline guarantees are interchangeable. |
| **Obsidian** | Local Markdown files and rebuildable application metadata illustrate portability and a separation between content and derived state. [Data storage][C13] | Plain Markdown alone does not represent pressure-sensitive ink, layered PDF annotation, or fixed-position notebook pages. Obsidian is a product reference here, not source code proposed for embedding. | Keep documents exportable, references stable, and indexes disposable/rebuildable. Use Markdown as a typed export, not the entire native format. |
| **AFFiNE** | Local-first document/canvas workspace; public source separates document, blob, synchronization, and index storage, selecting IndexedDB on web and SQLite on native platforms. [Local storage source][R2] | Bringing its complete app into Sylf would introduce a second workspace framework and substantial product/runtime coupling. Its actual licenses vary by path. | Borrow the separation of content, assets, local adapters, and indexes; integrate selected engines instead of embedding a second application. |
| **Saber** | Handwriting-first cross-platform app, nested organization, a recent-notes home, dark-mode document adaptation, and a privacy-oriented sync design. [Repository][C14] | Flutter/Dart is not a drop-in React editor, and GPL-3.0 requires a different distribution decision from a permissive component. | Study paper navigation and contrast choices; do not copy its implementation into Sylf's default closed-source distribution without a compatible licensing decision. |

### 3.2 What can be inferred about architecture

The interfaces imply distinct domain concepts—page order, notebook membership, stroke selection, original PDF pages, thumbnails, audio/ink timing—but do **not** reveal the implementations behind them. For Sylf it is reasonable to model vector ink separately from thumbnails and immutable source PDFs separately from annotations. That is a design inference supported by the workflow, not a reverse-engineered Samsung/Goodnotes storage specification.

Native stylus quality also includes hardware sampling, OS prediction, palm handling, and display latency. A smooth public demo or a pressure-ribbon function does not establish Apple Pencil or S Pen parity. A real-device comparison must measure pen-down behavior, slow diagonals, rapid writing, edge strokes, palm contact, erasing, interrupted gestures, and long-session memory.

### 3.3 Preferred experience to synthesize

Use Samsung/Goodnotes-style paper simplicity, Notability's fast return to current work, OneNote's stable notebook/page links, Notion's structured typed content, and Obsidian/AFFiNE's local-content principles. Sylf's differentiator should be **one calm study library connected to existing subjects and objectives**, with trustworthy storage status—not a larger permanent toolbar or a duplicate task manager.

## 4. Repository and technology analysis

### 4.1 Requested repositories

| Project | Actual capability and architecture | License/commercial boundary | Maintenance, performance, and Sylf fit | Recommendation |
| --- | --- | --- | --- | --- |
| **REA—Reverse Engineer Anything** | CLI/MCP investigation tooling for JavaScript/Electron, websites, native binaries and other artifacts. Its architecture separates adapters/providers, investigations, evidence records, and bounded analysis processes. It is research tooling, not a note editor. [README][R0] [Architecture][R1] | REA-authored code is MIT; third-party engines retain their terms. A REA license does not grant permission to inspect proprietary software or license Hopper/IDA. [License][R0L] | Current package metadata identifies 6.7.0 and Node requirements satisfied by this host. Cached commit pages showed older history and were not used to declare the latest version. [Package][R0P] No Sylf runtime dependency is needed. | Use for authorized artifact analysis and evidence, including this phase's scoped run. Keep out of production Notes bundles. |
| **AFFiNE** | Complete workspace application. Inspected local provider imports separate document/blob/index/sync adapters, uses Yjs updates, and selects IndexedDB or SQLite according to platform. [Storage implementation][R2] | Root license grants MIT outside exceptions, but backend/native paths are referred to a separate EE license; that license also has CE/client-side MPL provisions. “The whole repo is MIT” is not a safe description. [Root license][R3] [Backend license][R4] | Release history shows continuing development, but the application is much larger than an editor component. No AFFiNE-versus-Sylf benchmark was performed. Reusing its complete auth/cloud/shell would duplicate existing owners. [Releases][R5] | Architecture reference; selectively reuse only clearly licensed components after path-level review. Do not fork the full app. |
| **BlockSuite** | Framework and presets for rich-text pages and edgeless editing, web-component integration, Yjs store, block schemas, adapters, and transformers. Its store entry point exposes these boundaries and warns about duplicate imports. [README][R8] [Store source][R9] | Inspected standalone repository license is MPL-2.0. Commercial integration is possible subject to the license's covered-source obligations; inspect actual selected packages and inherited AFFiNE paths. [License][R10] | README warns of major changes and paused PRs. Maintainer announcement describes integration into AFFiNE and rebuilding reusable infrastructure, but also has an update saying the repo was synchronized back. This is an unresolved packaging/support signal, **not proof of abandonment**. [Announcement][R11] | Strong conceptual match for a unified text/canvas product, but too much lifecycle and integration uncertainty for the default launch dependency. Re-evaluate only after a pinned-version mobile prototype. |
| **Excalidraw** | Embeddable React canvas, shapes, arrows/bindings, free drawing, images, pan/zoom, undo, and an open JSON scene format. The hosted application's collaboration, encryption and local-save behavior are distinct from the npm editor's feature set. [README][R12] API exposes scene/app-state changes and initialization hooks. [Integration API][R13] | Editor package is MIT; preserve notices and separately review fonts/assets and any selected hosted services. [Manifest][R14] | Registry inspection selected published 0.18.1 as the static-analysis target; a retrieved master manifest still said 0.18.0, illustrating branch/package differences. Manifest includes React 19 support and Perfect Freehand dependency, but this does not prove mobile stylus quality. [Releases][R15] | Optional embedded diagram/whiteboard document type. Preserve its native scene behind an adapter. Do not make it the paged PDF/handwriting engine or assume built-in Drive sync. |
| **Perfect Freehand** | A small geometry library: input points/pressure → smoothed stroke outline. Source composes stroke-point and outline generation. Real pressure requires the corresponding option; output can be drawn with SVG or Canvas. [README][R16] [Function source][R17] | MIT. [License][R18] | Inspected package manifest says 1.2.3. A small algorithm has a different maintenance profile from an editor; sparse release entries alone do not prove neglect. Full-stroke recomputation and large point sets require profiling. [Manifest][R19] | Preferred ink geometry component, after comparison with Sylf's existing ribbons. It does not supply palm rejection, selection, erasing, OCR, persistence, or synchronization. |
| **BlockNote** | React block editor on Tiptap/ProseMirror, with extensible blocks, configurable UI, Yjs integration, and JSON/Yjs conversion helpers. [README][R6] [Collaboration][R20] [Structure][R21] | Core is MPL-2.0. XL packages—including exporters, multi-column and AI features—are GPL-3.0 or commercially licensed. A proprietary Sylf should exclude those unless separately approved. [Commercial boundaries][R22] | Retrieved release list/core manifest show 0.56.0; React peer range includes 19. It must be loaded client-side in Next.js. APIs and schema still evolve; manifests include stable and prerelease CRDT families. [Core][R7] [React manifest][R23] [Next.js guide][R24] [Releases][R25] | Preferred early typed editor using core packages, stable Yjs, and Sylf-themed controls. Qualify IME, mobile selection, large documents, and export before committing. |
| **tldraw** | Mature React canvas SDK with reactive record store, snapshots, schema migrations, assets, custom shapes, local IndexedDB persistence and separate multiplayer facilities. [Store][R26] [Persistence][R27] | Current SDK license permits development by default; commercial production requires an appropriate license/key. Do not treat historical permissive versions as the current licensing model. [License][R28] [Key requirements][R29] | Retrieved releases show 5.5.2 with continuing releases. Strong canvas capabilities do not supply Sylf's desired Drive-backed sync protocol automatically. Its record/sync model is not a Yjs document adapter by default. [Releases][R30] | Useful benchmark/reference; reject as the default under the constraint to avoid restrictive commercial dependencies. Reconsider only if its saved engineering effort justifies an approved contract. |

These are engineering license boundaries based on inspected license text and maintainer guidance, not a blanket legal clearance of every transitive dependency. Before development, record exact package versions, source commit/tag, license texts, notices, fonts/model assets, and a dependency inventory. MPL covered files must remain available as required when distributed; using MPL does not mean every separate Sylf file automatically becomes MPL. [MPL text][R10]

### 4.2 Preferred component combination

| Responsibility | Preferred technology | Why; fallback or gate |
| --- | --- | --- |
| Typed content | BlockNote core/React, narrowly configured UI | Fast path to good block editing. Use Tiptap core directly if MPL policy, mobile behavior, or package coupling fails qualification; Tiptap's core is MIT, with more UI work for Sylf. [Tiptap scope][A1] |
| Conflict-capable document state | Stable Yjs 13 and matching editor binding | Retain CRDT identities from document creation. Updates are commutative/idempotent when the complete update set is applied. This is a merge mechanism, not a backup or delivery guarantee. [Yjs updates][A2] [MIT license][A3] |
| Local journal/catalog/outbox | Dexie over IndexedDB | Transactions, owner-scoped indexes, and a small web adapter. Use the open-source Apache-2.0 library, not Dexie Cloud. Native adapter later uses SQLite plus files. [Dexie][A4] [License][A5] |
| Ink | Perfect Freehand + imperative Canvas 2D | Reuse geometry; keep Sylf's existing input lessons. Start with visible-page rendering and a separate active-stroke layer. SVG remains suitable for small previews/export. |
| PDF view/text extraction | PDF.js/pdfjs-dist in a worker | Apache-2.0, browser PDF platform with established rendering. Own the viewer shell and annotation document model; do not bind the native format to private viewer internals. [PDF.js][A6] [License][A7] |
| PDF export/page composition | Qualify pdf-lib, behind an exporter interface | MIT and useful PDF operations, but it is not an HTML layout engine and does not support encrypted inputs. Its published-release cadence needs review before adoption. Preserve originals and allow native-package export regardless. [Repository/limitations][A8] [Releases][A9] |
| Local search | MiniSearch in a worker, indexed per page/document | MIT; incremental full-text/prefix/fuzzy ranking without a hosted search service. It is in-memory, so shard and measure before indexing a very large corpus. [Repository][A10] |
| Optional diagrams | Excalidraw | Reuse a complete diagram interaction system instead of rebuilding arrows/shapes. Store the native scene separately under a Sylf document envelope. |
| Validation, API, UI | Existing Zod, cookie-authenticated Next.js handlers, Sylf shell/tokens | Already present. Avoid a second login, theme provider, state framework, or notes backend product. |

**Why not one giant editor framework?** Text flow, paper ink, and PDF coordinates have different layout rules. The storage/recovery layer can be shared without forcing every editor into one scene graph. BlockSuite might ultimately reduce that integration work, but its present ownership/package uncertainty makes a smaller, explicit composition preferable.

**Why not plain Markdown or PDF as the editable authority?** Markdown loses positioned ink and document layers. PDF is excellent for interchange and original source material, but an exported PDF does not preserve Sylf's complete typed structure, per-stroke editing, CRDT lineage, and study links. Both should be first-class exports.


### 4.3 What the actual REA run added

The authorized static run recovered Excalidraw pointer-handler/gesture and image-cache function candidates, source-located browser-storage accesses, and partially resolved network boundaries. In the copied Sylf client it identified calendar API, recognition-worker, service-worker registration and localStorage cleanup references. Those are concrete inspection results, with hashes and source locations retained in the [REA evidence](evidence/rea-analysis.md).

The result supports separating the editor interaction layer from document persistence, workers and hosting services. It does not prove which storage site owns complete drawings, that a candidate call executes, or that the npm package contains the hosted app's entire synchronization system. One Sylf file was skipped at the configured memory limit and both analyses have partial coverage. REA was useful here as an investigation instrument; no recommendation treats its output as proprietary implementation recovery or runtime performance proof.

## 5. Sylf integration findings

### 5.1 Reuse map

| Existing owner inspected | Verified current behavior | Proposed integration boundary |
| --- | --- | --- |
| [Layout](../../../../app/layout.tsx), [shell](../../../../app/components/SylfAppShell.tsx), [sidebar](../../../../app/components/Sidebar.tsx), [mobile outlet](../../../../mobile/src/components/MobileRouteOutlet.tsx) | Shared web/mobile shell, safe areas, selective viewport locking, explicit lazy mobile screen mapping. Sidebar has Calendar but no Notes entry; no dedicated Notes route implementation was found. Proxy already lists /notes as protected. | Add one Notes destination and a shared screen later. Keep Next.js route plumbing separate from Vite/mobile imports. Decide immersive editor scroll behavior in the existing shell owner. |
| [Server session](../../../../lib/auth-server.ts), [proxy](../../../../proxy.ts), [OAuth](../../../../lib/oauth.ts) | Custom cookie session with database tokenVersion revocation; proxy is navigation protection. Google sign-in requests identity scopes, not Drive access. Microsoft appears in calendar integration rather than the general OAuth provider union. | Separate Sylf identity from storage authorization. Every Notes API uses getSession and owner checks. Connecting a cloud account must never silently relink Sylf login identity. |
| [Calendar security](../../../../lib/calendar/external/security.ts), [connections](../../../../lib/calendar/external/connections.ts), [HTTP](../../../../lib/calendar/external/http.ts) | OAuth state bound to user/session, PKCE, encrypted refresh credentials with purpose-bound AES-GCM, refresh serialization/revisions, provider allowlists and bounded requests. Current grants are calendar grants. | Reuse tested patterns; a small shared OAuth utility may be extracted during a later phase if justified. Keep Notes scopes, credentials, consent, revocation and keys independently scoped. Do not copy a second unmanaged credential engine or overload CalendarConnection with file content. |
| [Prisma](../../../../lib/prisma.ts), [schema](../../../../prisma/schema.prisma), [Realtime client](../../../../lib/supabase-browser.ts) | PostgreSQL through Prisma; current schema build version is 36. Realtime uses a minted in-memory token for Sylf's custom auth and has polling fallbacks. | Use metadata-only authenticated services. Do not assume Supabase Auth identities or auth.uid() ownership. Notes synchronization must work without Realtime/Redis. No database change is proposed as an executed step here. |
| [Calendar notes](../../../../lib/calendar/personal-service.ts), [ink model](../../../../lib/calendar/ink.ts), [input surface](../../../../app/calendar/components/InkSurface.tsx), [autosave](../../../../lib/calendar/note-autosave.ts) | CalendarNote stores full versioned text/vector ink JSON in PostgreSQL. Existing geometry is 1000 × 1400, max 2,000 strokes/50,000 points per page and 4,096 points per stroke. Autosave has owner-scoped recovery, serialized writes, revision conflicts and uncertain-ack handling. | Reuse input behavior, geometry conversion and failure scenarios. These deliberately bounded daily notes are not the cloud-backed storage owner for the new product. Preserve them and offer a copy/export bridge; do not silently migrate or resave existing notes. |
| [Recognition client](../../../../lib/calendar/recognition-client.ts), [worker](../../../../lib/calendar/recognition.worker.ts), [notebook service](../../../../lib/calendar/notebook-service.ts) | Selected handwriting is rasterized locally; worker uses pinned quantized TrOCR, one to six horizontal English lines. Reviewed derivatives are tied to source hashes/revisions. | Reuse non-destructive review and stale-result invalidation concepts. Do not describe this as multilingual, equation-aware or full-library OCR. Notes recognition content/indexes should live locally and in the user's cloud. |
| [AuthProvider](../../../../app/components/AuthProvider.tsx), [client cache](../../../../lib/client-data-cache.ts), [transport](../../../../lib/api-transport.ts) | Logout/account changes clear private caches/drafts and increment an epoch; transport handles web/mobile URLs. Existing cache is a response cache, not a durable document journal. | Integrate with epoch cancellation and owner cleanup, but resolve pending Notes work before destructive cache purge. Introduce a dedicated durable repository, not a second generic API cache. |
| [Appearance](../../../../lib/color-utils.ts), [global wrapper](../../../../app/components/GlobalSystemWrapper.tsx), [CSS](../../../../app/globals.css) | Surface polarity and contrast can differ from light/dark preference; tokens support custom backgrounds and accents. | Theme editor chrome with semantic tokens. Document paper/ink are authored content with their own stable colors and optional view transforms. |
| [Subjects](../../../../lib/subject-service.ts), Planner/Sylvie authorities in project instructions | Active-subject lifecycle and dependency handling are centralized; existing assistant has reviewed tools and bounded retrieval. | Link by stable IDs, respect archived subjects, and never cascade-delete notes when a subject disappears. Reuse Sylvie/AI routing later with explicit user-selected content and existing quotas/confirmations. |
| [Service worker](../../../../public/sw.js), [mobile composition](../../../../mobile/src/MobileApp.tsx) | Current service worker deliberately does not cache navigation or authenticated requests. Mobile shares screens and providers through adapters. | Offline editing in an already open tab is not offline cold launch. A dedicated, audited Notes app-shell cache and local unlock design are prerequisites for web offline reload. Native files/SQLite must replace critical WebView-only persistence before stronger durability claims. |

The source facts above supersede stale historical reports. In particular, calendar documentation mentioned an earlier schema version, while the inspected source is already at 36.

### 5.2 Avoid duplicate authorities

Notes should own rich documents and their cloud-backed library. Calendar continues to own daily CalendarNote records and semantic calendar overlays. Subjects remain Sylf subjects; folders are not a new subject catalog. Timer/reward engines remain unchanged: writing in a note must not independently settle study time or mint XP. Planner-linked actions continue through the existing guards.

A proposed subject link is metadata, not folder ownership. Unlinking or archiving a subject leaves the document intact. A calendar “open related note” link should resolve a stable Notes document/page ID, without copying its full body back into CalendarNote or Sylvie conversation history.

## 6. Feature recommendations

### 6.1 Essential for a useful Notes release

- Connect either supported cloud provider; show account/root identity and complete a verified create/read capability test.
- Recent, All notes, Favorites, Subjects, folders/subfolders, notebooks, Trash, and a clear New/Import action.
- Typed text, headings, emphasis, lists, checklists, links, images/attachments with bounded import, keyboard shortcuts, undo/redo, and document/page navigation.
- Durable local journal, explicit device/cloud save states, automatic retries, conflict preservation, and recovery after restart.
- Versioned native-package export/import, typed Markdown/HTML export, basic readable PDF/print export qualified for supported content, and retained history/Trash.
- Title/subject/folder search immediately; typed body search early, with explicit indexing/offline coverage.
- Responsive keyboard, touch and screen-reader access; existing themes/custom colors; stable deep links.
- Account isolation, safe logout/provider switching, and a repair/export route even when reconnection fails.

Handwriting is **essential to the intended product**, but should follow the storage foundation rather than delay a useful typed private alpha. The first public claim of premium notebook support should require pen/highlighter, stroke eraser, lasso/select, pan/pinch, paper templates, page reorder, undo/redo, and real stylus qualification.

### 6.2 Advanced, prioritized after the foundation

Editable PDF annotations and reliable export; bookmarks/outlines; improved point eraser and shape tools; typed/math blocks; reviewed handwriting/OCR search; offline notebook pinning; bulk organization; side-by-side documents; native persistence/input adapters; richer subject/quest/calendar linking; and selectable backup destinations with restore drills.

### 6.3 Optional, independent product decisions

Audio recording with ink replay, transcription, flashcards, AI summaries/Q&A, infinite whiteboards, real-time collaboration, shared class notebooks, public publishing, scanning, stickers, laser pointer/presentation mode, and end-to-end encryption.

These can be valuable, but none should require a default second AI interface, permanent recording control, server-hosted note corpus, or broad cloud permission. E2EE is optional as a launch scope decision, not an afterthought: its key hierarchy and format hooks must be settled before freezing the format if it is expected soon.

## 7. Proposed architecture

Everything in this section is a **proposal**, except explicitly cited provider/browser capabilities. It is not a claim that these mechanisms already exist in Sylf.

### 7.1 System boundaries and authority

~~~mermaid
flowchart LR
    UI["Notes library and editors"] --> Engine["Document engine and command layer"]
    Engine --> Local["Owner-scoped local journal, catalog and outbox"]
    Local --> Sync["Client sync coordinator"]
    Sync --> Cloud["User Google Drive or OneDrive: commits, assets and history"]
    Sync --> Broker["Sylf authenticated connection broker"]
    Broker --> DB["PostgreSQL: encrypted credentials, IDs and Sylf links"]
    Local --> Export["Portable exports and independent backups"]
    Local --> Search["Rebuildable local search and thumbnails"]
~~~

**Local authority for editing:** the durable journal plus materialized document state. **Cross-device durable authority:** the union of valid cloud commits and referenced assets. **Derived data:** library projections, previews, search indexes and download caches. **Sylf database authority:** login identity, cloud connection association and existing study entities.

Provider APIs are storage transports, not databases or transaction coordinators. A cloud connection's database row must never be the only place from which the user can reconstruct document organization. Recovery must work from the cloud library and native exports even if the Sylf metadata projection is rebuilt.

A small provider interface should cover capability discovery, listing/change cursors, fetch-by-ID, immutable creation, resumable upload, verification, trash/restore where supported, and connection errors. Joplin's mature offline-first/file-driver separation is a useful reference; its app-specific synchronizer is not a ready-made React/Yjs/Drive SDK. [Joplin sync architecture][A11] [OneDrive app-folder example][A12]

### 7.2 Document and organization model

Use stable random IDs independent of names or file paths.

| Entity | Meaning and important fields |
| --- | --- |
| Library | One cloud provider/account/root identity, library UUID, format version, device registrations and compatibility policy. One primary provider per library initially. |
| Folder | Stable ID, parent ID, title, order and soft-deletion state; prevents cycles. A UI grouping, not a cloud pathname dependency. |
| Notebook | A document of kind paper, containing ordered pages. A notebook is not an additional mandatory folder-like level above every document. |
| Document | Stable ID, kind flow/paper/pdf/diagram, title, folder ID, optional subject ID/tags, created time, logical change identity, schema/engine versions and current valid commit frontier. |
| Page | Stable ID, logical dimensions/template, ordered placement in a notebook, original PDF page reference where applicable, separate ink and positioned text/object layers. |
| Typed content | Editor-native schema and persistent Yjs lineage. A flow document has one text CRDT initially; each paper page can have its own CRDT when loaded. |
| Stroke/object | Stable object ID, tool/style, raw sample geometry, transform/layer/order and deletion/operation history. No viewport coordinates. |
| Asset | Content hash, byte length, MIME/type, original name, import provenance and provider object ID. Original PDFs/images stored once; previews reference them. |
| Recognition | Searchable derivative with source page/stroke hashes, engine/version, language and review state. Invalidated when source content changes. |
| Commit | Immutable ID/hash, document/library IDs, parents, schema/engine versions, writer identity/sequence, referenced updates/checkpoints and assets, integrity metadata. |
| Local job | Exact pending commit/upload identity, dependencies, resumable offset/session expiry, retries, verification state and owner/session epoch. |

Library/folder creation, renames, moves and tombstones use the same immutable operation/commit mechanism in a small library-metadata stream, partitioned when measurement requires it. Each reconstructible document manifest includes its folder/notebook IDs; retained metadata commits preserve folder titles/order and deletions. A catalog snapshot is a derived acceleration of those records, not an independent source of truth. Validate tree invariants after merge, preserve conflicting alternatives, and provide an Unfiled recovery placement when a referenced parent is unavailable.

The proposed server data budget is deliberately narrow: a connection record stores user/provider/account/root IDs, granted scopes, encrypted credentials, credential revision, status and last capability-check time; link records store user ID, opaque document/page IDs and canonical Sylf entity references. Operational receipts contain only bounded job IDs/status/timestamps/errors. Document titles, text, thumbnails, ink, update packs, attachment bytes and full-text indexes remain in the local/user-cloud data plane by default. Any metadata projection can be rebuilt from those sources; server receipts must not be required to restore a library.

A notebook can contain PDF-backed and blank paper pages. Typed flow documents remain responsive without simulating page layout. Later, paper pages can support bounded positioned rich-text boxes. Ink over a reflowing paragraph requires semantic anchoring and re-layout rules; defer it until those rules have a dedicated specification.

Subjects are optional facets into the canonical Sylf subject catalog. A document has one physical folder location, but appears in Recent/Favorites/Subjects through projections. Begin with a primary subject and optional tags; multi-subject assignment is an approval decision. Archiving a subject or deleting a study objective never deletes a note.

### 7.3 Format and interoperability

Use a documented, versioned **Sylf Notes container**. During editing/sync, store normalized small manifests, CRDT update packs/checkpoints, and separate content-addressed assets. For download/import, package those objects into a portable .sylfnote ZIP with a format manifest, native payloads, asset table, portable content projection and checksums.

The ZIP is an interchange artifact, **not** rewritten and uploaded after every pen stroke. A whole-library ZIP should likewise be generated as a consistent snapshot, not act as a mutable sync database.

The manifest should declare formatVersion, minimumReaderVersion, editor schema version, engine/version, document kind, dimensions, stable IDs, asset hashes and checkpoint/update dependencies. Preserve unknown fields and original bytes when possible. A client encountering a newer incompatible format opens read-only with export/reconnect guidance; it must not downgrade and resave it.

The native Yjs payload retains collaboration identities. Portable JSON/Markdown/HTML is a derivative for export/migration and independent recovery. Do not recreate a fresh Yjs document from JSON on each load: independent reconstruction can lose shared identities and invalidate merge assumptions. Use BlockNote's conversion APIs for explicit imports/exports with versioned tests. [Yjs API][A2] [BlockNote utilities][R31]

Migrations write a new copy/checkpoint, retain the pre-migration state, validate content/asset counts and rendering, and only then advertise the new version. Restoring an old version also creates a new commit; it does not destroy the intervening history.

### 7.4 Local persistence and offline operation

Use IndexedDB transactions through Dexie for document updates, library metadata, acknowledged local revision, outbox and sync cursors. A materialized state and its outbox record must either commit together or remain recoverable from one authoritative journal.

For large binaries, use OPFS where qualified, with IndexedDB Blob fallback. Write a temporary asset, flush/close and verify it, then atomically reference its finalized identity in IndexedDB. There is no cross-API transaction between OPFS and IndexedDB: startup repair must detect dangling references and orphaned temporary files. Do not claim an atomic filesystem rename on browsers where it is untested.

Persist typed changes in small bounded batches; persist completed strokes immediately and checkpoint a long active stroke periodically. Proposed initial goal: local acknowledgement within 250 ms of an edit or stroke completion on the agreed baseline device. The UI may show an in-progress stroke before durability, but must not claim it is saved. Abrupt power loss before acknowledgement remains outside that acknowledgement guarantee.

Request persistent storage and inspect quota estimates. Evict only rebuildable thumbnails, fetched assets with a verified remote copy, and explicitly unpinned clean caches. Never evict unacknowledged work or its only referenced asset. On quota/write failure, retain in-memory work, show a blocking save warning, and offer export; do not silently continue with a green save indicator. [Storage policies][W1]

Use one local sync coordinator per owner/library when possible, via Web Locks with a durable lease/fencing fallback and cross-tab notifications. Local leadership reduces redundant requests; it is not a cross-device correctness guarantee. Multiple writers must remain safe if a tab crashes, its lease expires, or a storage event is missed.

**Offline cold launch is separate work.** Sylf's current service worker is pass-through. Add an explicitly versioned Notes shell cache later, limited to static assets and a generic offline entry; never cache authenticated API responses or user-specific server-rendered pages. Coordinate editor chunk/worker/schema versions and preserve recovery access across upgrades. Test reopening after browser/OS restart, not just toggling network in an open tab.

Use a device-bound library association/offline access policy independent from a currently valid server cookie. Remote API access always requires current authentication. Offline access cannot instantly honor a revocation that has not reached the device; disclose that boundary and define local unlock/trusted-device rules before launch.

### 7.5 Mandatory connection, lifecycle and account changes

| State | Allowed behavior |
| --- | --- |
| Never provisioned | Connection explanation and Google/OneDrive choices; creating/importing Notes content is gated. |
| Initial authorization granted | Verify account identity/scopes, resolve/create the library root, upload and read a small probe, then record provisioning. Do not treat a consent redirect alone as success. |
| Provisioned and online | Local editing and automatic sync. Show last verified cloud save. |
| Temporarily offline | Cached/pinned documents remain editable; creation into the already provisioned library can continue under the approved offline policy. Downloads not present locally are clearly unavailable. |
| Token expired/revoked or school policy changed | Retain existing local work; pause remote jobs, show reconnect for the exact account. Export/recovery stays available. No silent fallback to Supabase or a different cloud account. |
| Explicitly disconnected | Pause uploads; preserve/export pending work and make creation/import gating explicit. Existing recovery must not depend on reconnecting successfully. |
| Provider/account switch | Create or select a distinct library; copy only through a reviewed migration with verified target counts/hashes. Never reinterpret old provider IDs in the new account. |
| Logout/account change | Cancel writers using the shared epoch, remove cross-account memory visibility, and apply the approved durable-cache policy. Pending work needs sync/export or an explicitly encrypted recovery path before purge. |

**Logout is a launch-blocking design choice.** Sylf currently clears private scratch drafts. That cannot simply be extended to a durable Notes outbox. The preferred policy is sync/export pending work before normal logout, with an explicit recoverable lock option on trusted devices only after its encryption/unlock design is qualified. An involuntary session expiry must pause networking rather than silently delete the journal. Never retain readable notes for the next user on a shared device.

### 7.6 Google Drive and OneDrive

| Concern | Google Drive | OneDrive |
| --- | --- | --- |
| Minimum practical permission | Request drive.file for files Sylf creates or the user explicitly selects. Avoid broad drive/drive.readonly scopes. Google marks drive.file as non-sensitive; app verification/branding requirements still apply. [Scope guide][G1] | Prefer delegated Files.ReadWrite.AppFolder with appropriate identity/offline scopes, limited to Apps/Sylf's app root. Official guidance describes home and work/school support; tenant consent/policies still require testing. [App folder][M1] |
| Root layout | Visible app-created Sylf Notes folder, IDs retained across renames; new files created by Sylf. A picked folder does not imply blanket access to every arbitrary descendant under drive.file. Qualify recovery/reinstall/regrant discovery. | Use special/approot and retain drive/item IDs; users still control and may replace/delete files there. Do not require tenant-wide application permissions. |
| Hidden app data | drive.appdata is narrower, but its hidden space cannot share or trash files, and users can delete it or remove app data. Poor default for recoverable user documents; at most optional noncritical configuration. [App-data constraints][G2] | App folder is user-visible and counts against their quota. Imported external files can be copied via system file selection rather than asking for all-drive access. [App folder][M1] |
| Upload | Resumable uploads for large/interruption-prone transfers; simple/multipart for suitably small immutable packs. [Uploads][G3] | Upload sessions with supported fragment sizing/order and expiry handling; use item IDs and explicit conflict behavior. Session URLs are sensitive bearer capabilities. [Upload sessions][M2] |
| Change discovery | Changes API with persisted cursors plus paginated reconciliation. Save a new cursor only after locally applying its batch. Recover invalid cursors by a safe rescan. [Changes][G4] | Delta links/page links with persisted cursors, deleted facets and safe reconciliation. Qualify scope support; if delta requires broader access in a target scenario, prefer a bounded app-folder scan instead of silently broadening permission. [Delta][M3] |
| Conditional mutations | Do not assume generic If-Match works identically on every Drive endpoint. Immutable commit correctness must not depend on an unqualified global compare-and-swap. | Upload-session APIs document If-Match/412 behavior. Use it where qualified for mutable hints; it does not create a multi-file transaction. [Upload sessions][M2] |
| Version history | Blob revisions can be purgeable; Google documents usual 30-day/100-revision behavior and limited keep-forever handling. Not a complete application backup policy. [Revisions][G5] | Version enumeration exists, but permissions and retention depend on service/account policy. Treat it as an additional recovery aid, not an invariant of Sylf history. [Versions][M4] |

Prefer **Google first for the private typed alpha**, then qualify OneDrive to the same standard before calling the product generally available with both choices. Implement one shared test contract so provider parity is behaviorally measurable.

Use a server-side connection broker to exchange OAuth codes and protect refresh tokens. Reuse state/session binding, PKCE, encrypted credential storage and serialized refresh patterns. Rotate keys with versioned ciphertext and purpose-bound authentication; do not expose provider refresh tokens to the browser.

For file bytes, prefer direct client-to-provider transfer using short-lived access tokens held only in memory, or scoped upload-session capabilities where supported. Tokens are still powerful within their granted scope; this is a conscious XSS/security tradeoff, not “upload-only credentials.” Validate CORS, download authorization, range requests, and session handling in qualification. A bounded streaming server proxy is a fallback if needed; it may incur bandwidth/runtime cost and must not persist payloads or log bodies.

All broker APIs need owner checks, CSRF/origin protections, rate limits, exact redirect allowlists and no-store responses. Provider links, next-page URLs and upload URLs must be validated according to endpoint capability rules without an arbitrary URL proxy. No service credentials or Prisma imports enter mobile/shared client modules.

Provider production configuration is a real dependency. Google's external OAuth testing mode can issue refresh tokens that expire after seven days for these scopes; don't mistake an intentionally short test grant for a synchronization bug. School Microsoft accounts may deny third-party consent or lack a provisioned drive. [Google OAuth lifecycle][G6]

### 7.7 Synchronization protocol and conflict handling

Use a **recoverable append-only commit protocol** around existing Yjs merge logic. This is custom storage orchestration because the evaluated editors do not provide the required two-provider protocol. Keep it small and qualify it before general editing features.

1. Apply the edit to the local engine. Write its update and dependency list to the local journal/outbox in a transaction. Return a local-save acknowledgement only after commit.
2. Coalesce small updates into bounded immutable packs, rather than one remote file per input sample. Use deterministic commit identity, parent frontier, writer sequence and content hashes.
3. Upload missing immutable assets/update packs. Query/reconcile an uncertain upload by stable identity before retrying. Google filenames are not unique; store provider IDs and app metadata, and tolerate duplicate physical objects representing the same logical hash.
4. Verify the uploaded object's size/hash using a supported checksum or a readback. Write an immutable commit manifest only after its required objects exist. Verify that manifest and dependency closure before declaring cloud success.
5. Update optional per-writer heads and library summary projections. These are performance hints. Missing or overwritten hints must be repairable by discovering valid commits; a commit is not lost because a final index write failed.
6. Pull all pages of relevant changes and fetch unseen commits. Validate IDs, schema versions, hashes, sizes and dependency closure in a bounded worker. Apply complete update sets idempotently, then commit local state/cursor together.
7. Keep unresolved/corrupt/missing-dependency branches quarantined and reviewable. Do not replace a healthy local document with a truncated remote response or an empty rescan.
8. Retry with bounded exponential backoff and jitter; honor Retry-After. React to online, foreground and manual retry. Change notifications can reduce latency later but never replace reconciliation. [Graph throttling][M5] [Drive errors][G7]

A successful upload response is not automatically a verified document save. “All changes synced” means the **current local revision's dependencies and commit** are verified remotely. It does not mean another device has received them or an independent backup has completed.

No single global lock or last-write-wins document replacement should decide correctness. Multiple offline devices may publish different commit branches. Yjs merges compatible text updates and disjoint stroke additions once all required updates arrive; the commit graph preserves provenance and repair options. A bounded notebook/page partition avoids loading every page into one huge CRDT.

CRDT convergence is not semantic correctness. Define application rules explicitly:

| Concurrent action | Proposed behavior |
| --- | --- |
| Text insertion or disjoint strokes | Merge through persistent CRDT identities; preserve ordering deterministically. |
| Rename/style/property edits | Deterministic current projection plus retained alternative values/history when materially conflicting. Do not rely on wall-clock “latest” across skewed devices. |
| Same stroke moved/edited twice | Preserve both operation branches for review or apply a specified deterministic transform rule; do not claim Perfect Freehand solves this. |
| Page reorder or folder move | Stable IDs and deterministic order keys; detect duplicate placements/cycles and retain a recoverable alternative. Do not infer a valid tree from arbitrary concurrent array moves. |
| Deletion concurrent with editing | Retain the deletion tombstone and the edited branch; show a recovered copy in Recovery instead of discarding edits or resurrecting the document silently. |
| Incompatible schema/engine versions | Stop destructive merge, preserve both payloads, offer read-only/export/update. |
| History restore concurrent with edits | Create a new restore branch/copy and preserve current work; review before replacing the active projection. |

Initial cloud packs can contain a complete small-document Yjs checkpoint plus bounded subsequent packs; do not optimize with fragile delta chains before recovery works. Checkpoints must preserve the CRDT identity/state needed by supported offline clients. Aggressive garbage collection or “resetting” a document into a new lineage needs an explicit epoch/migration protocol.

**Compaction and deletion are a later reliability gate.** A new verified checkpoint covering the selected frontier must exist before pruning its inputs. Retain tombstones and history for the approved window. A device offline beyond that window must rebase into a recovery branch, not submit an old state as a replacement. Unrecognized devices or missing acknowledgements must not cause automatic loss. Start conservatively with no aggressive remote pruning.

### 7.8 Backup, history, Trash and disaster recovery

Recommended protections form a hierarchy:

- **Undo/redo:** local-origin command history for current editing; not a disaster backup.
- **Local recovery:** journal/checkpoints for crashes, refreshes and partial local saves.
- **Cloud commits:** verified remote content for restoring a clean local installation.
- **Retained history:** intentional restore points independent of the current head.
- **Trash:** recoverable deletion of documents/pages/folders with their relationships.
- **Independent backup:** a native package/export on another device, external disk, or a second separately authorized provider.

History in the same cloud account cannot survive permanent loss of that account or deletion of the entire app root if no other copy exists. A second folder in that same account is useful against accidental in-app deletion, but is not independent against account compromise. Do not label it immutable/WORM protection.

Proposed starting retention policy for approval: 30 days in Trash; hourly checkpoints for 24 hours, daily checkpoints for 30 days, then weekly checkpoints for 12 weeks, with user-pinned milestones retained subject to clear storage limits. These are product proposals, not provider guarantees. Retention must include referenced assets; retaining a manifest while deleting its PDF is not a backup.

| Failure | Detection and protection | Recovery |
| --- | --- | --- |
| Tab/process crash | Transactional journal/outbox; periodic active-input checkpoints | Replay committed updates, offer unfinished stroke recovery, reconcile uncertain uploads. |
| Network interruption/server timeout | Durable jobs, stable identities, resumable offsets | Inspect session/object state, resume/retry without duplicating logical edits. |
| Token revoked/account full | Classified authorization/quota state, keep local work | Reconnect same account, free space, export, or reviewed provider migration. |
| Accidental app deletion | Tombstones, Trash, retained commit frontier/assets | Restore original IDs/relationships through a new commit. |
| Remote file/root deleted externally | Unexpected mass disappearance guard; no cascade based on missing list entries | Pause destructive reconciliation, compare local manifests/history/provider Trash, offer copy to a new root. |
| Corrupt/partial update or asset | Content hashes, schema/size validation, dependency checks | Quarantine, fetch another verified checkpoint/asset or restore an older version. |
| Browser storage cleared | Re-provision same cloud library and rebuild derived state | Restore the last verified cloud commit; unsynced local-only changes require an independent copy. |
| Device theft/failure | Verified cloud plus separate backup | Recover on a fresh device; keys/account recovery are separate prerequisites. |
| Bad migration/app release | Pre-upgrade checkpoint, format version gating, read-only older client | Restore/copy using a compatible reader; never auto-downgrade. |
| Search/index corruption | Derived state tagged by document revision and engine | Rebuild from native content; never delete notes to repair search. |
| Logout/user switch | Owner partitioning, epoch cancellation, approved cache/unlock policy | Reopen only for the correct owner; sync/export pending work before purge. |
| Entire provider lost | Independent backup | Import into a new verified library. Without a separate copy this cannot be guaranteed. |

Include an integrity/repair screen with last successful check, missing assets, pending jobs, quarantined versions, export actions, and account identity. It should repair a projection from source objects without rewriting document content automatically.

Restore drills must cover a genuinely fresh local database, not only opening an older version in an already cached editor. Test library-level counts, page ordering, attachment byte hashes, subject-link preservation and rendered sample comparison.

### 7.9 Ink, PDFs, assets and performance

**Ink:** preserve raw normalized samples with x/y, pressure, time offset and available tilt/twist; record renderer/style version. Keep rendering caches disposable. Detect capabilities; do not fabricate pressure or require unsupported APIs. Use Pointer Events/coalesced samples where available, pointer capture, explicit gesture cancellation, pen writes/finger pan by default, configurable finger drawing and hardware eraser fallback. Predicted samples are visual-only until confirmed. [Coalesced events][W3]

Use imperative active-stroke drawing and bounded visible-page redraws rather than React state updates for every point. Store stroke chunks with spatial bounds; cache finalized geometry, and cull offscreen ink. Perfect Freehand is the geometry tool; Sylf must still own tool interactions, gesture arbitration, lasso hit-testing, erasure semantics and durability. Reuse calendar input behavior where suitable without changing its renderer/schema wholesale.

**PDFs:** retain the original bytes as an immutable asset. Page annotations reference stable page identity plus PDF coordinates/crop box/rotation; do not save CSS-pixel positions. Virtualize page canvases/text layers and thumbnails, cancel offscreen rendering, and bound device-pixel-ratio/resolution caches. Range loading is an optimization requiring actual provider authorization/CORS support; full-file fallback needs an import size/memory limit.

Write annotations to the Sylf layer; exported annotated PDFs are separate derivatives. State whether an export is flattened or contains standard editable annotations. Do not promise reliable cross-reader editing before testing it. Keep native export available if a PDF exporter cannot handle a source file. PDF.js viewing and pdf-lib writing have different capabilities; never bypass unsupported encrypted-document handling or silently rewrite a signed original. [PDF tooling limits][A8]

**Assets:** hash/deduplicate within a library, not across unrelated users. Keep original PDFs/images; optionally generate downscaled display variants with separate hashes. Avoid base64 embedding large attachments into JSON. Strip optional image metadata from derived sharing copies according to a defined policy, retaining the original under the user's control.

**Scale:** catalog enumeration must not download document bodies. Use paginated provider metadata discovery, incremental catalog manifests, visible-row/card virtualization and on-demand content. Pack small update objects to avoid a file-count/API explosion. Remote reclamation uses reachability from retained commits, not just the current document head.

### 7.10 Search and thousands of documents

Maintain a worker-owned local catalog and MiniSearch index keyed by stable document/page IDs and content revision. Index titles, folders, subject labels and typed text first; add PDF text and reviewed OCR later. Return matching page/snippet and highlight location where supported.

Search indexes are derived and rebuildable, but cold-starting thousands of notes by downloading all bodies is poor UX. Store versioned, sharded catalog/search derivatives in the **user's cloud**, with content hashes and coverage markers. A fresh device can hydrate the catalog quickly and then fetch index shards or rebuild lazily. These derivatives contain sensitive text even though they are not native notes; keep them out of Supabase by default.

Offer explicit coverage: “Titles available; 240 of 1,000 documents indexed on this device.” Offline search covers downloaded content/index shards; it must not present an incomplete empty result as proof no note exists. Pin whole notebooks for offline study, showing required space and missing assets.

MiniSearch assumes a corpus fitting in process memory. Start with per-notebook or bounded shard indexes; measure Unicode, Urdu/Arabic/CJK tokenization, stemming and exact-phrase requirements rather than assuming English fuzzy search is universal. Consider SQLite FTS in native clients or a separately qualified on-disk engine only when measurements justify it.

### 7.11 Security and privacy

Treat imported documents as untrusted. Enforce compressed/uncompressed size, asset count, path traversal, decompression ratio, page count and CPU/memory limits. Sanitize rich-text/HTML imports and link protocols; disallow executable content and remote embeds by default. Isolate PDF processing, track security updates and avoid exposing script/action behaviors in PDFs.

No note bodies, OCR text, attachment bytes, cloud access tokens or capability URLs in logs/analytics. Telemetry should be bounded status/error/latency/count data with opaque IDs and consent-compatible retention. An AI action sends only the user-selected excerpt through existing Sylf providers after the appropriate disclosure/confirmation; it must not silently mirror the whole library into chat history or a vector database.

Default TLS/provider storage protections are **not** end-to-end encryption against the provider or Sylf. If E2EE is chosen, add a client-side library key hierarchy, authenticated encryption, nonce discipline, encrypted manifests/derived indexes, device enrollment, recovery key UX and a reviewed crypto design. OAuth reconnection cannot recover a lost encryption key. Account recovery, backup portability and AI/search implications must be resolved before promising E2EE.

### 7.12 Native future and operational costs

Continue with the existing Capacitor/Vite shared-screen boundary. Introduce storage, file import/export, credential, and pen-input adapters so core document/sync logic can be shared without importing server-only code. Native documents need SQLite transactions plus app-owned files and secure credential storage; keeping everything in a WebView's IndexedDB is not the stronger native durability plan.

If web handwriting misses the agreed device targets, evaluate an Apple PencilKit surface and Android Jetpack Ink behind an interchange layer. These are native SDKs, not drop-in web packages; their editable models/brush semantics must map to portable strokes and a visual fallback without trapping the only editable copy in an opaque OS archive. [PencilKit][N1] [Android Ink][N2]

No recurring paid editor/sync hosting is required by the preferred stack, but user cloud capacity, API quotas, server OAuth brokerage, engineering maintenance and optional proxy bandwidth still have costs. Track average document/asset size, history amplification, objects per editing session, cold-sync calls and device index size. Do not promise “unlimited” storage because Supabase is small.

Proposed test fixture for capacity planning: 1,000 ordinary 100 KB content documents plus 100 PDFs averaging 10 MB already approach roughly 1.1 GB before history/previews. This is an illustrative budget, not a measured student corpus. Keeping assets out of repeated checkpoints is a larger saving than compressing short titles.

## 8. UX architecture and design direction

### 8.1 Information architecture

Use a single sidebar destination named **Notes**, matching Sylf's existing short page-heading convention. Inside that workspace:

~~~text
Notes
  Recent
  All notes
  Favorites
  Subjects              (views of existing Sylf subjects)
  Folders
    Semester
      Course materials
  Available offline
  Trash
  Storage and recovery
~~~

A folder can contain typed documents, paper notebooks, PDFs and diagrams. A notebook contains pages; it is itself a document. This avoids forcing every student through subject → folder → notebook → section → note → page before writing. A quick note can start in All notes/Unfiled and be organized later.

Present **New note**, **New notebook**, and **Import PDF/file** in one creation menu. Remember the last paper/tool preferences per device where appropriate, but do not turn every preference into an account setting.

Subject views show related documents across folders, including archived subjects behind a disclosure. The subject color is a small orientation aid, not the whole document background. Deleting a folder should offer move contents to its parent or recoverable deletion with a preview count.

### 8.2 Workspace and editor structure

**Library:** calm title/search/action row; compact folder navigation; document list/grid toggle; previews, title, subject, modified time, and meaningful offline/sync indicators. Prefer Recent on entry and preserve the user's last folder. Use real page previews rather than an ornamental cover requirement.

**Editor:** back/breadcrumb and title; one context-appropriate tool strip; document surface; optional page thumbnails/outline pane; one overflow menu for export, history, paper setup and storage details.

For paper, primary tools are pen, highlighter, eraser, select and hand plus undo/redo. Tool selection reveals width/color presets without displaying a full settings panel permanently. For typed notes, keep inline formatting and a small insertion menu; slash commands are an optional accelerator with a visible alternative. For PDFs, prioritize annotation, find, page navigation and bookmarks.

Keep the global Sylf navigation collapsible during writing. Avoid simultaneous global sidebar + folder sidebar + page sidebar + assistant drawer on a tablet. A distraction-free view hides chrome while retaining an obvious way back, save status, and accessible tool recovery.

### 8.3 Device behavior

| Surface | Proposed composition |
| --- | --- |
| Wide desktop | Folder navigation + library or editor; optional thumbnail/outline pane. Keyboard shortcuts, visible focus and contextual formatting. |
| Tablet landscape | Collapsible library navigation; large writing area and compact edge/top tool strip. Pen writes, fingers navigate. |
| Tablet portrait/split screen | Single primary document pane, drawers for library/pages, no permanently squeezed multi-column layout. |
| Phone | Library → full-screen document with back navigation; compact bottom/context toolbar above safe areas and keyboard. Basic ink review/capture must remain usable, while deep editing can use disclosures. |
| Native client | Same concepts and stable IDs, with platform file picker, share sheet, disk persistence, credential vault and qualified native pen surface where required. |

Base breakpoints on actual content/container width because the shared shell consumes space. Test portrait, landscape, split view, virtual keyboard, safe areas and zoom. Do not disable browser zoom globally to solve a canvas gesture problem.

### 8.4 Save and recovery communication

Use plain language tied to real state:

- **Saving on this device…** until the local journal commits.
- **Saved on this device · Waiting for internet** when local work is durable but not uploaded.
- **Saved to Google Drive/OneDrive at [time]** for a verified current revision.
- **Reconnect [provider]** when authorization fails, retaining local status separately.
- **Could not save on this device** on local storage failure, with immediate export/retry.
- **Changes need review** for preserved conflicting branches.
- **Backup last completed [time]** separately from synchronization.

The main editor needs a discreet, persistent status target, not a modal for every retry. Escalate only actionable conditions: local save failure, prolonged unuploaded work, storage full, account mismatch or unresolved conflict. A details panel can explain pending uploads and account identity.

Setup should explain that files live in the connected account, offline work uploads later, and clearing unsynced device data can remove pending changes. Keep this concise and relevant to setup, rather than burdening everyday writing with technical terminology.

### 8.5 Appearance, accessibility and content color

Use Sylf's surface/text/border/accent tokens for chrome and existing contrast helpers for actual surfaces, including custom colors with opposite polarity to the nominal mode. Do not import an editor's fixed dark background or default theme wholesale.

Paper is authored content. Store its base color/template and ink colors independently of the UI theme. Optional “adapt paper for dark viewing” is a reversible display transform, with original appearance preserved in export by default. Never change the underlying pen color simply because the user switches Sylf theme. PDFs should not be color-inverted by default.

Provide keyboard equivalents for page movement, selection, organization and tool actions; drag is not the only path. Target comfortable approximately 44 CSS-pixel touch controls where space permits; use tooltips/accessible names, visible focus, reduced motion and high-contrast selection. Typed content remains semantic DOM. Provide page titles, text transcripts/recognition where available, and a sensible reading order around a canvas.

## 9. Development roadmap

Each phase below is a **future development proposal**. Implementation must be authorized phase by phase after this report is reviewed. Gates are cumulative: later quality work does not excuse unsafe earlier releases. No calendar migration is implied.

### Phase 1 — Approve contracts and qualify the uncertain components

- **Objective:** Resolve the decisions that would otherwise force format or product rework.
- **Features/work:** Small throwaway qualification prototypes for BlockNote versus Tiptap, pressure ink, browser storage, Google/OneDrive permission/upload/readback, and PDF export; device/browser matrix; privacy/offline/logout rules.
- **Technology:** Pinned editor/Yjs versions, existing Next.js 16/React 19 and Vite environments; provider sandbox accounts and real stylus devices.
- **Dependencies:** Decisions in section 10 and separate permission for provider accounts/tools as needed.
- **Deliverables:** Architecture decision records, dependency/license inventory, native-format draft, failure matrix, UX wireframes and measured baseline results.
- **Acceptance:** React/Next/mobile boundaries work; English and at least one relevant non-Latin IME are tested; least-permission provider probes work; local persistence/restart capability is demonstrated; PDF limitations documented; a selected stack passes agreed quality thresholds.
- **Risks:** Mobile editor selection/IME behavior, prerelease dependency leakage, tenant consent, unsupported browser storage, format overreach. Choose the fallback now if a gate fails.

### Phase 2 — Build the durable document foundation

- **Objective:** Make local saves and recovery trustworthy before exposing an editor widely.
- **Features/work:** Versioned IDs/schema/container, journal/outbox, owner separation, asset storage, atomic reference protocol, multi-tab coordination, save states, native-package import/export and local repair.
- **Technology:** Stable Yjs, Dexie/IndexedDB, qualified OPFS/Blob adapter, Zod, workers.
- **Dependencies:** Phase 1 format, local-unlock/logout and library identity decisions.
- **Deliverables:** Platform-neutral document repository/commands, fixtures and crash-recovery test harness.
- **Acceptance:** Inject interruption before/after every persistence boundary; acknowledged changes survive restart; incomplete asset references are repaired; quota failure never reports saved; switching users cannot expose or upload another owner's content; newer schemas never downgrade.
- **Risks:** Cross-store atomicity, unbounded journals, stale writers and cleanup of unsynced work. Internal validation only; no local-only public Notes mode.

### Phase 3 — Ship a useful Google Drive-backed typed private alpha

- **Objective:** Let students reliably create, organize, edit and recover useful typed notes early.
- **Features/work:** Mandatory Drive setup/verified probe, basic folders/notebooks/library, BlockNote typing, small images, title/body search, favorites, subject links, automatic sync, conservative branch preservation, history/Trash, portable exports and generic offline shell.
- **Technology:** BlockNote core, Yjs, Drive drive.file adapter, existing authenticated OAuth broker/API conventions.
- **Dependencies:** Phase 2 durability; configured Google consent/credentials; basic recovery protocol and offline access rules.
- **Deliverables:** Shared Notes screen and route, working typed workflow on web/mobile, cloud reconstruction and user-facing recovery/status.
- **Acceptance:** Create/edit offline after provisioning, reload offline, reconnect, and open the same final content on another device. Clear the local database and restore the verified library. Test lost responses, duplicate retries, conflicting text edits and delete-versus-edit. Export/import preserves content and assets. Confirm no note bodies/assets are stored in Supabase. Complete required web/mobile checks and theme/accessibility verification.
- **Risks:** OAuth testing token expiry, folder/file grants, service-worker/auth interaction, inaccurate success indicators. Keep alpha scope explicit until provider and durability gates pass.

### Phase 4 — Add paged handwriting with real stylus qualification

- **Objective:** Deliver a genuinely useful paper notebook on the proven storage system.
- **Features/work:** Pen/highlighter, pressure, stroke eraser, basic lasso/move, undo/redo, finger pan/pinch, templates, page thumbnails/reorder and long-stroke recovery.
- **Technology:** Perfect Freehand/Canvas, Pointer Events, spatial indexes and visible-page caching; reuse calendar input lessons and explicit conversion adapters.
- **Dependencies:** Phase 3 sync/history and page model; native-input decision may pull native work forward.
- **Deliverables:** Handwriting-capable notebooks, renderer/version fixture corpus, tested hardware behavior and export consistency.
- **Acceptance:** Real Apple Pencil/S Pen/Windows pen tests where supported, with palm contact, slow/fast strokes, pen lifts, edge gestures, hardware eraser, interruption and long sessions. No React update per sample in the critical path; measured latency meets agreed baseline. Two offline devices adding/erasing ink retain all non-conflicting work and surface semantic conflicts.
- **Risks:** Web input latency, memory pressure, brush mismatch across devices, erasure semantics and selection complexity. Do not market native parity without evidence.

### Phase 5 — Qualify OneDrive and provider portability

- **Objective:** Fulfil the alternative-cloud requirement without creating a second sync implementation.
- **Features/work:** Delegated app-folder authorization, upload sessions, delta or bounded scan, school/personal account handling, provider-specific errors and reviewed library copy/migration.
- **Technology:** Microsoft Graph adapter to the same sync contract, existing credential-broker patterns.
- **Dependencies:** Phases 2–3 provider-independent contracts; handwriting fixtures if enabled.
- **Deliverables:** OneDrive onboarding and the same recovery/failure conformance suite as Drive.
- **Acceptance:** Both providers pass the same fresh-device, conflict, interrupted-upload, quota and revocation scenarios. Scope/tenant limitations are shown accurately. Changing provider verifies every required content object before switching and preserves the original library.
- **Risks:** School tenant restrictions, app-folder/endpoint permission differences, upload-session expiry and account identity mismatch. Do not silently escalate to all-drive access.

### Phase 6 — Add PDFs and practical document management

- **Objective:** Make lecture slides, worksheets and readings first-class study documents.
- **Features/work:** PDF import, page virtualization, text selection/find, ink/highlights, bookmarks/outlines, inserted blank pages, page organization, images/attachment management and annotated export.
- **Technology:** PDF.js worker, stable page coordinates, qualified pdf-lib/export adapter, existing ink layer.
- **Dependencies:** Phase 4 page/ink semantics and Phase 3/5 asset uploads/recovery.
- **Deliverables:** Original-plus-annotation document type, source provenance, export compatibility corpus.
- **Acceptance:** Rotation/crop/zoom preserve annotation position. Test large/malformed/encrypted/signed files with explicit supported behavior. Reopen exports in multiple PDF readers; validate appearance, text/searchability where promised, and original-byte retention. Memory stays bounded while navigating long documents.
- **Risks:** PDF fidelity, reader differences, fonts, large-file memory, range/CORS support and exporter maintenance. Unsupported operations keep native export/recovery available.

### Phase 7 — Scale library, search and storage health

- **Objective:** Keep thousands of documents fast and discoverable.
- **Features/work:** Virtualized library, worker search shards, cloud catalog/index derivatives, incremental PDF text indexing, offline notebook pinning, bulk moves, coverage states, integrity scan and storage-budget controls.
- **Technology:** MiniSearch/Dexie/workers, provider cursors and sharded derived manifests.
- **Dependencies:** Stable formats and document types from Phases 3–6.
- **Deliverables:** Large fixture corpus, cold/warm profiles, catalog rebuild and storage-health UI.
- **Acceptance:** 10,000 metadata documents do not require downloading all bodies to browse. Search coverage is accurate; index corruption rebuilds without changing notes. Measure cold sync and API count on both providers; retries stay bounded under throttling.
- **Risks:** In-memory index limits, non-Latin tokenization, API/file-count growth and over-eager cache eviction.

### Phase 8 — Expand handwriting and recognition

- **Objective:** Add premium writing and retrieval tools without sacrificing editable originals.
- **Features/work:** Point eraser, shape recognition, improved lasso/transform, zoom writing, reviewed OCR/handwriting search, optional equation handling and accessible transcripts.
- **Technology:** Existing local recognition adapter where suitable, qualified models/native SDKs, versioned source-hash derivatives.
- **Dependencies:** Phase 4 stable stroke semantics, Phase 7 search, and model/language/privacy decisions.
- **Deliverables:** Language/accuracy/device benchmarks, progressive recognition UI, model notices/license inventory.
- **Acceptance:** Recognition never replaces ink automatically; stale results are invalidated; user corrections survive sync. Models work within agreed download/memory limits and disclose supported languages. No hidden paid recognition dependency.
- **Risks:** Accuracy, model size, multilingual/math scope, battery use and licensing. Treat advanced recognition as separately qualified rather than assumed from TrOCR.

### Phase 9 — Strengthen native durability and native pen input

- **Objective:** Achieve stronger device-file persistence and input quality where the web cannot meet targets.
- **Features/work:** SQLite/files adapters, credential vault, native backup/share sheet, background-task best effort, file recovery and optional native pen bridge.
- **Technology:** Existing Capacitor shell; platform SQLite/file APIs and, if chosen, PencilKit/Android Ink.
- **Dependencies:** Shared contracts from Phase 1 onward; platform build/signing and selected device support.
- **Deliverables:** Native adapter conformance tests and portable round-trip notebook fixtures.
- **Acceptance:** Critical notes are recoverable independently of WebView storage clearing; native/web round trips preserve IDs/strokes/assets; app updates and kill/restart pass recovery tests; OS background limits are documented.
- **Risks:** Platform divergence, native brush portability, lifecycle/backup behavior and additional maintenance.
- **Sequencing rule:** Pull this phase into Phases 2–4 if browser-only durability or input quality cannot satisfy the approved launch promise. It is not inherently a late requirement.

### Phase 10 — Deepen Sylf study integration

- **Objective:** Make Notes support the student's existing study workflow.
- **Features/work:** Calendar/date links, objective/source references, focus-session “open related note,” optional copying calendar notes into Notes, bounded Sylvie retrieval and user-requested flashcard/summary flows.
- **Technology:** Existing subject, calendar, Planner guards, assistant routing, quota and confirmation systems.
- **Dependencies:** Stable document/page links, approved privacy boundaries and lifecycle handling.
- **Deliverables:** Integration contracts with ownership, archived-entity and permission behavior.
- **Acceptance:** Subject/objective removal cannot delete notes; note edits never mint timer XP; AI sees only selected/authorized content; provider disconnect does not break local export; calendar source notes remain unchanged unless an explicit later migration is approved.
- **Risks:** Duplicated content authorities, broad AI context ingestion, stale links and accidental reward coupling.

### Phase 11 — Optional diagrams, audio and collaboration

- **Objective:** Add selected premium differentiators after core study writing is dependable.
- **Features/work:** Excalidraw diagrams, audio/ink replay, transcription, side-by-side presentation, or shared notebooks—each separately scoped.
- **Technology:** Excalidraw adapter; audio assets/time-stamped commands; existing AI providers for explicit transcription; a separately designed collaboration transport if approved.
- **Dependencies:** Product choice, asset/history budgets and privacy/consent. Collaboration needs a new multi-user authorization/key/distribution specification.
- **Deliverables:** Independent feature modules and retention/permission contracts.
- **Acceptance:** Sharing never exposes unrelated private notes or a whole cloud account. Audio stays associated with its document and recoverable after export/import. Diagram native scene remains editable and is not mislabeled as a Yjs merge engine.
- **Risks:** Recording storage, consent, live transport costs, ownership transfer and mismatched provider permissions. Personal Drive sync is not automatically real-time collaboration.

### Phase 12 — Reliability qualification and general availability

- **Objective:** Make the selected feature set safe to rely on for a semester.
- **Features/work:** Long-run editing/sync, restore drills, production OAuth readiness, dependency/security updates, accessibility, device coverage, operational metrics, support/repair workflows and conservative compaction.
- **Technology:** Fault-injection/conformance harness, real browsers/devices, provider test accounts and production-safe observability.
- **Dependencies:** Only the feature phases approved for launch; baseline safety is already required in each earlier phase.
- **Deliverables:** Release evidence, published limitations, recovery runbook and format compatibility policy.
- **Acceptance:** No known reproducible loss of an acknowledged local edit or verified cloud commit; every supported provider/device passes the release matrix. Restore a fresh installation from both cloud and exported backup. Demonstrate expired cursor, revoked token, full disk/account, malformed commit, interrupted upgrade, simultaneous edits, external mass deletion and clock skew. Measure history/GC behavior with an old offline device before enabling pruning.
- **Risks:** Rare race conditions, stale clients, backup false confidence and production permission differences. A green build is not sufficient evidence.

### 9.1 Initial measurable budgets

These are proposed starting gates, to be approved and measured in Phase 1:

| Area | Proposed target and measurement |
| --- | --- |
| Local save | p95 acknowledgement within 250 ms after ordinary text edits/stroke completion on the selected baseline device; crash tests compare acknowledged revision IDs. |
| Typing | p95 interaction-to-visible-update below 50 ms on the baseline fixture, including IME/composition and mobile keyboard behavior. |
| Ink | 60 Hz interaction target; p95 JavaScript input-to-next-presented-frame below 32 ms under the agreed dense-page fixture. Use real-device/high-speed observation for physical input-to-photon claims. |
| Warm document open | First editable cached page within 500 ms for ordinary documents; large-document loading is progressive. |
| Warm library/search | 10,000 metadata entries browsable with virtualization; p95 query below 150 ms for the approved indexed shard size. Record coverage and memory. |
| Sync | Aim to enqueue/upload ordinary changes within seconds while foreground/online, then verify them; never imply an SLA under provider throttling, OS suspension or network loss. |
| Stress fixtures | At least a 300-page notebook, 20,000 strokes across pages, a long text document, 10,000 library entries and a representative large PDF; agree actual byte/page limits after profiling. |
| Isolation/recovery | Zero cross-owner reads/uploads in tests; all acknowledged revisions restored after injected process crashes; fresh-device reconstruction matches canonical content/asset hashes. |

Repository-required implementation verification includes relevant regression tests, TypeScript, changed-file ESLint, web build for routing/boundaries and mobile build/verification for shared clients. UI checks must include desktop/tablet/phone, both modes and custom accent/background combinations. This Phase 0 documentation task does not claim those implementation checks passed.

## 10. Decisions requiring approval before development

| Decision | Preferred recommendation | Why it matters / alternative |
| --- | --- | --- |
| First release scope | Typed private alpha with mandatory cloud/recovery first; handwriting becomes a public notebook gate, then PDFs. | Prevents storage/recovery being postponed behind visually impressive tools. If handwriting must be first, retain the same durability gates and move input work earlier. |
| Editor licensing | BlockNote MPL core only; exclude XL packages and paid editor services. | Approve covered-source/notice obligations. Choose MIT Tiptap core if policy or quality makes that preferable. |
| Native-format model | Flow documents plus paged notebooks/PDFs in one versioned envelope; preserved Yjs lineage and portable native exports. | Arbitrary ink over reflowing text is a larger product/format commitment. |
| Cloud root and permissions | Drive drive.file in a visible app-created folder; delegated OneDrive AppFolder. | Approve user visibility and import/recovery workflow; do not request all-drive access to simplify implementation. |
| Provider rollout | Google alpha, OneDrive parity before general availability of both options; one primary provider per library. | Simultaneous multi-master replication across two clouds increases conflict, deletion and identity complexity. A second provider can initially be a one-way backup destination. |
| Durability promise | Browser acknowledged saves plus verified cloud and optional independent export; no claim of surviving destruction of unsynced browser-only data. | If that limit is unacceptable, require native/external-file persistence at launch. |
| Logout/offline privacy | Explicit trusted-device/local-unlock policy; never automatically purge the only pending copy. | Must reconcile Sylf's current logout cleanup with multi-user privacy and durable recovery before implementation. |
| Retention and storage budgets | Starting policy in section 7.8; conservative garbage collection and clear quota UI. | Longer history consumes the user's cloud space; shorter retention limits recovery and old-device support. |
| E2EE | Decide before format freeze; defer launch implementation only if provider-readable storage is acceptable. | Changes keys, recovery, search/indexes, multi-device enrollment, previews, AI and support promises. |
| Subjects/calendar relationship | Optional canonical subject facets; calendar notes remain separate with an explicit copy/link bridge. | A migration would change existing storage/privacy behavior and needs its own review and rollback plan. |
| Mobile launch level | Shared web/Capacitor experience with separately qualified native durability/input; pull native work forward when required by the promise. | Native-quality marketing cannot be inferred from a web renderer. |
| AI/OCR/audio scope | Opt-in, separate phases, existing Sylvie/provider infrastructure and reviewed content boundaries. | Avoid unnecessary model downloads, provider costs, recording storage and private-library ingestion. |
| Collaboration | Personal ownership first; live shared notebooks require a separate design. | Provider file grants and Sylf membership cannot be conflated. |
| File limits and language support | Set supported document/PDF/import sizes, browser/device matrix and languages after Phase 1 measurement. | “Thousands of notes” and “excellent stylus support” need concrete testable limits. |
| Tooling beyond this run | This phase's temporary REA download/execution was specifically approved; future setup/agent registration remains a separate choice. | No approval was given to change agent configuration, install commercial decompilers, or inspect proprietary targets. |

## 11. Remaining uncertainties and review checklist

The architecture is sufficiently grounded for product/technical review, but these items require qualification rather than confidence by assertion:

- Real handwriting quality across iPad/Safari, Galaxy/Chrome and Windows pen hardware, especially sustained writing, palm rejection and partial erasing.
- Chosen BlockNote release behavior with Sylf's exact React/Next/Vite stack, mobile IME, Yjs binding, theming and large documents.
- Provider least-scope coverage for fresh installation, app-folder discovery, upload verification, delta/range access and managed-school policies.
- Offline cold launch and local-unlock behavior through auth expiry, logout, cache clearing and service-worker upgrades.
- PDF export compatibility, encrypted/signed source handling, and whether pdf-lib meets maintenance/security requirements.
- Commit-pack size, file-count growth, catalog hydration, compaction and an old offline device's safe return.
- Recognition model size/accuracy/languages and whether future native input can preserve editable portable stroke semantics.

Before Phase 1, approve the decisions above and choose representative devices/accounts. At the end of Phase 1, replace proposed budgets with measured support limits and a pinned dependency/format contract. Keep this Phase 0 report as dated research evidence.

**Research-only stopping point:** no Notes implementation should begin automatically from this report. Review findings, choose features and architecture, then authorize individual implementation phases.

## 12. Source register

All references below were consulted on **19 October 2026**. Maintainer/product documentation is evidence of documented behavior; source files/licenses support the specifically described code and terms. Mutable branches and cached pages require rechecking when choosing production versions. No quoted or paraphrased source establishes an untested performance guarantee.

### Competitive product references

- **C1:** [Samsung: organization, templates and PDF workflows][C1]
- **C2–C5:** [Notability getting started][C2], [Cloud sync][C3], [current/older update history][C4], [third-party backup][C5]
- **C6–C7:** [Goodnotes organization description—vendor comparison, not an independent benchmark][C6], [official automatic-backup contract][C7]
- **C8–C9:** [Microsoft OneNote organization][C8], [stable links][C9]
- **C10–C12:** [Notion blocks][C10], [subpages][C11], [current offline behavior and limitations][C12]
- **C13–C14:** [Obsidian data storage][C13], [Saber project/features/license][C14]

### Repository evidence

- **REA:** [README][R0], [architecture map][R1], [MIT license][R0L], [package metadata][R0P]. Actual run evidence: [REA analysis record](evidence/rea-analysis.md).
- **AFFiNE:** [local provider implementation][R2], [root license][R3], [backend/EE license][R4], [releases][R5].
- **BlockSuite:** [README][R8], [store entry point][R9], [MPL license][R10], [maintainer transition announcement with later update][R11].
- **Excalidraw:** [README][R12], [embedding API][R13], [package manifest][R14], [releases][R15]. Public package 0.18.1 analyzed with REA; master-manifest version differs.
- **Perfect Freehand:** [README][R16], [getStroke source][R17], [MIT license][R18], [package manifest][R19].
- **BlockNote:** [README and package licensing][R6], [core manifest][R7], [collaboration][R20], [document structure][R21], [XL terms][R22], [React manifest][R23], [Next.js integration][R24], [releases][R25], [Yjs conversions][R31].
- **tldraw:** [store][R26], [persistence][R27], [license][R28], [production keys][R29], [releases][R30].

### Supporting technologies and platform contracts

- [Tiptap open-source versus platform scope][A1]; [Yjs update semantics][A2] and [license][A3].
- [Dexie][A4] and [Apache-2.0 license][A5]; [PDF.js][A6] and [license][A7].
- [pdf-lib limitations/license][A8] and [published releases][A9]; [MiniSearch capabilities/license][A10].
- [Joplin file-driver/synchronization architecture][A11] and [OneDrive example][A12].
- [Browser quota/eviction][W1], [OPFS][W2], [coalesced pointer samples][W3].
- [Google Drive scopes][G1], [hidden app-data constraints][G2], [uploads][G3], [change tracking][G4], [revision retention][G5], [OAuth token lifecycle][G6], [errors/retries][G7].
- [OneDrive app folder][M1], [upload sessions/conditional headers][M2], [delta][M3], [versions][M4], [Graph throttling][M5].
- [Apple PencilKit][N1], [Android Ink][N2].

### Local authorities and research evidence

The inspected source list/hashes are in [sylf-source-snapshot.json](evidence/sylf-source-snapshot.json). Current source entry points are linked in section 5. Relevant local Next.js 16.2.9 guides reviewed: node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md and node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md. They confirm browser editor/worker boundaries and client-owned SSR disabling; no application code was written.

Project guidance consulted: [documentation index](../../../README.md), [design index](../../../design/README.md), [calendar contract](../../../calendar/README.md), [authentication index](../../../authentication/README.md), and relevant current Sylvie integration documentation. Historical reports were not treated as proof of deployment or current runtime behavior.

[C1]: https://www.samsung.com/us/support/answer/ANS10004548/
[C2]: https://support.gingerlabs.com/en-us/articles/16300108-getting-started-with-notability
[C3]: https://support.gingerlabs.com/en-us/articles/16300145-syncing-notes-across-devices-with-notability-cloud
[C4]: https://support.gingerlabs.com/en-us/articles/16300220-app-update-history
[C5]: https://support.gingerlabs.com/en-us/articles/16300117-auto-backup-third-party-backup-guide
[C6]: https://www.goodnotes.com/blog/goodnotes-vs-freenotes
[C7]: https://go.goodnotes.com/support/how-to-use-auto-backup-to-automatically-create-a-copy-of-your-documents-in-a-supported-cloud-storage
[C8]: https://support.microsoft.com/en-us/onenote/organize-your-notes
[C9]: https://support.microsoft.com/en-us/onenote/create-links-to-notebooks-sections-pages-and-paragraphs
[C10]: https://www.notion.com/help/what-is-a-block
[C11]: https://www.notion.com/help/create-a-subpage
[C12]: https://www.notion.com/en-gb/help/use-pages-offline
[C13]: https://obsidian.md/help/data-storage
[C14]: https://github.com/saber-notes/saber
[R0]: https://github.com/morluto/rea
[R0L]: https://raw.githubusercontent.com/morluto/rea/main/LICENSE
[R0P]: https://raw.githubusercontent.com/morluto/rea/main/package.json
[R1]: https://raw.githubusercontent.com/morluto/rea/main/docs/architecture.mermaid
[R2]: https://raw.githubusercontent.com/toeverything/AFFiNE/canary/packages/frontend/core/src/modules/workspace-engine/impls/local.ts
[R3]: https://raw.githubusercontent.com/toeverything/AFFiNE/canary/LICENSE
[R4]: https://raw.githubusercontent.com/toeverything/AFFiNE/canary/packages/backend/server/LICENSE
[R5]: https://github.com/toeverything/AFFiNE/releases
[R6]: https://github.com/TypeCellOS/BlockNote
[R7]: https://raw.githubusercontent.com/TypeCellOS/BlockNote/main/packages/core/package.json
[R8]: https://raw.githubusercontent.com/toeverything/blocksuite/master/README.md
[R9]: https://raw.githubusercontent.com/toeverything/blocksuite/master/packages/framework/store/src/index.ts
[R10]: https://raw.githubusercontent.com/toeverything/blocksuite/master/LICENSE
[R11]: https://github.com/toeverything/blocksuite/issues/9045
[R12]: https://github.com/excalidraw/excalidraw
[R13]: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/
[R14]: https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/excalidraw/package.json
[R15]: https://github.com/excalidraw/excalidraw/releases
[R16]: https://github.com/steveruizok/perfect-freehand
[R17]: https://raw.githubusercontent.com/steveruizok/perfect-freehand/main/packages/perfect-freehand/src/getStroke.ts
[R18]: https://raw.githubusercontent.com/steveruizok/perfect-freehand/main/LICENSE
[R19]: https://raw.githubusercontent.com/steveruizok/perfect-freehand/main/packages/perfect-freehand/package.json
[R20]: https://www.blocknotejs.org/docs/features/collaboration
[R21]: https://www.blocknotejs.org/docs/foundations/document-structure
[R22]: https://www.blocknotejs.org/legal/blocknote-xl-commercial-license
[R23]: https://raw.githubusercontent.com/TypeCellOS/BlockNote/main/packages/react/package.json
[R24]: https://www.blocknotejs.org/docs/getting-started/nextjs
[R25]: https://github.com/TypeCellOS/BlockNote/releases
[R26]: https://tldraw.dev/sdk-features/store
[R27]: https://tldraw.dev/docs/persistence
[R28]: https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md
[R29]: https://tldraw.dev/sdk-features/license-key
[R30]: https://github.com/tldraw/tldraw/releases
[R31]: https://www.blocknotejs.org/docs/reference/editor/yjs-utilities
[A1]: https://tiptap.dev/open-source-to-platform
[A2]: https://docs.yjs.dev/api/document-updates
[A3]: https://raw.githubusercontent.com/yjs/yjs/main/LICENSE
[A4]: https://dexie.org/
[A5]: https://raw.githubusercontent.com/dexie/Dexie.js/master/LICENSE
[A6]: https://mozilla.github.io/pdf.js/
[A7]: https://raw.githubusercontent.com/mozilla/pdf.js/master/LICENSE
[A8]: https://github.com/Hopding/pdf-lib
[A9]: https://github.com/Hopding/pdf-lib/releases
[A10]: https://github.com/lucaong/minisearch
[A11]: https://joplinapp.org/help/dev/spec/sync/
[A12]: https://joplinapp.org/help/apps/sync/onedrive/
[W1]: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
[W2]: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
[W3]: https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents
[G1]: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
[G2]: https://developers.google.com/workspace/drive/api/guides/appdata
[G3]: https://developers.google.com/workspace/drive/api/guides/manage-uploads
[G4]: https://developers.google.com/workspace/drive/api/guides/manage-changes
[G5]: https://developers.google.com/workspace/drive/api/guides/manage-revisions
[G6]: https://developers.google.com/identity/protocols/oauth2?hl=en
[G7]: https://developers.google.com/workspace/drive/api/guides/handle-errors
[M1]: https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder
[M2]: https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0
[M3]: https://learn.microsoft.com/en-us/graph/api/driveitem-delta?view=graph-rest-1.0
[M4]: https://learn.microsoft.com/en-us/graph/api/driveitem-list-versions?view=graph-rest-1.0
[M5]: https://learn.microsoft.com/en-us/graph/throttling
[N1]: https://developer.apple.com/documentation/pencilkit
[N2]: https://developer.android.com/develop/ui/compose/touch-input/stylus-input/about-ink-api
