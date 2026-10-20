# Sylf Notes technical contracts — Phase 1 baseline

**19 October 2026. Phase 1 design baseline.** Phase 2 subsequently implemented the [current foundation contract](foundation.md); consult it for actual behavior, supported limits and deviations. Phase 3 subsequently implemented the [workspace, local vault and Drive contract](workspace.md); consult that current contract and its report for actual provider/UX behavior. Unimplemented native sections below remain design inputs. Product decisions and external gates are in the [Phase 1 report](reports/phase-1/report.md), updated by the [Phase 2 report](reports/phase-2/report.md).

## 1. Authorities and storage boundaries

The shared Notes engine owns document state, durable mutations, outbox, version graph and recovery. Editor, cloud and native adapters must use it; they cannot create competing persistence authorities. Do not reuse the calendar draft/scratchpad cache as a Notes repository.

| Boundary | Contents |
| --- | --- |
| Browser IndexedDB | Owner-scoped journal, outbox, committed revisions, materialized metadata, checkpoints, pending assets and recoverable migration state. |
| Browser OPFS | Optional large-file cache or staged file bytes. A pending file may be acknowledged only when its bytes and durable repository reference have passed the recoverable staging protocol. IndexedDB Blob storage is the initial safe fallback. |
| User cloud | Library identity, immutable commits, update/checkpoint packs, asset chunks, originals and optional rebuildable catalogs. A commit is authoritative only after validating its dependency closure. |
| Sylf database | Opaque library/provider binding, connection status, encrypted refresh credential, scopes, credential revision/lease and bounded operational metadata. Subject links can refer to existing subject IDs. No document content or content-derived search/preview data. |
| Memory | Active editors, decoded visible-page assets, access tokens, derived geometry and bounded search shards. Never the sole copy of an acknowledged save. |

Cloud operations use a server credential broker authenticated through existing `getSession`/revocation and ownership rules. Keep provider secrets and Prisma out of shared/mobile imports. Prefer direct byte transfer with short-lived memory-held access tokens after CORS/CSP qualification; refresh credentials stay server-only. A future relay, if required, must be bounded and streaming without content retention. Do not promise either transfer path is qualified yet.

## 2. Identity, ownership and provisioning

Every operation carries `{ownerId, libraryId, providerBindingGeneration, sessionEpoch}` captured when scheduled. Owner IDs come from Sylf authentication; provider account IDs use stable provider identifiers, never email alone. A cloud adapter is permanently scoped to one validated account/root for that operation. Check the captured scope before storage/network work and again after asynchronous boundaries before acknowledging or exposing results. Abort stale workers; retain their correctly scoped pending bytes.

Initial provisioning requires online consent, validated identity and minimum scopes, root discovery/creation, a synthetic create/read/hash check, and a durable library descriptor. Notes cannot offer a user-facing local-only onboarding mode. After provisioning, a temporary network/token outage may leave local editing available with an accurate pending/reconnect status. Offline access is limited to an already enrolled trusted device and the approved local-unlock policy; it must not bypass an explicit logout or revocation.

Only one primary provider/account binds a library. Reconnect must match that binding. A provider/account change is a reviewed copy-and-verify operation, followed by an atomic local binding switch; preserve the old library. A deleted/inaccessible root must not silently become a new empty library.

## 3. Sylf envelope v1 and portable export

The format belongs to Sylf. It is not a saved BlockNote component state or an arbitrary ZIP of provider paths. Separate envelope, content adapter, brush and exporter versions. IDs are stable opaque UUIDs; titles, paths and clock timestamps are not identities.

| Record | Required fields / semantics |
| --- | --- |
| Library descriptor | `format: "sylf-notes"`, `formatVersion: 1`, `minimumReaderVersion`, `libraryId`, opaque `ownerRef`, `bindingGeneration`, supported feature identifiers. Provider locators remain adapter metadata. |
| Document | `documentId`, `kind: flow | notebook | pdf`, title/organization references, stable page IDs, stream descriptors, required assets and content-schema version. |
| Stream descriptor | `streamId`, `epoch`, `codec: yjs13-update-v1`, adapter/schema version, checkpoint reference and subsequent update references. Epoch changes require an explicit migration/recovery relationship. |
| Immutable object | SHA-256 of the **exact stored bytes**, byte length, media/codec version. Decode only after verifying size and digest. Hash identity is library-scoped for lookup/deduplication. |
| Commit | Envelope version, library/document or metadata-stream ID, stream epoch, random writer ID, monotonic safe-integer sequence, parent commit IDs, required object IDs/lengths/codecs, operation ID and advisory creation time. Commit ID is SHA-256 of its exact UTF-8 bytes; the ID itself is external to those bytes. |
| Asset descriptor | Original whole-file digest/length/media type plus ordered chunk references and lengths. PDF originals are immutable. Reassembly verifies the original digest. |

Writers use a versioned deterministic JSON encoder with sorted object keys and bounded finite values. Readers verify original bytes; they never reserialize JSON to establish the received object's identity. The prototype's small `canonical()` function is not a qualified cross-language canonicalization standard. No signature/authenticity guarantee follows from a checksum; possession of write access to an unencrypted library permits deliberate replacement. Hostile import requires strict validation.

Native export is `.sylfnote`: ZIP containing `manifest.json`, content streams/checkpoints, normalized interchange data, originals and referenced assets. Export one document or a self-contained library selection. Manifest declares all required bytes, versions, digests and relationships; include no OAuth token, credential, provider upload URL or local database key. Normalized text covers paragraphs, spans/styles, lists, tables, links and asset references supported by the selected schema. Unknown extension payloads remain opaque and preserved. A downgraded reader must not overwrite content it cannot represent.

Import validates duplicate entry names, traversal/absolute paths, Unicode/path ambiguities, entry count, actual expanded bytes, compression ratio, nesting, MIME/codec and dependency references before activation. Parse/decode in bounded workers; quarantine malformed items. Enforce implementation limits without deleting originals. ZIP limits in the probe are tiny test limits, not product support limits or a hardened parser. Future format/version loads read-only with original export available; it must not masquerade as a newly empty note.

## 4. Editor state and page semantics

Use one Y.Doc for an ordinary flow document, with a named BlockNote XML fragment (`body`) and a versioned adapter. Page-based notebooks/PDFs use independent page streams so opening a page does not hydrate a semester of ink. Library organization is a small metadata operation stream, projected into indexes. Establish shared initial state exactly once; do not seed independent default text on every device.

Persist native Yjs updates/checkpoints with their identity and lineage. Never reconstruct an ongoing stream from normalized JSON during normal open, sync or compaction. Explicit engine migration may create a new stream/epoch while retaining the original and recording the relationship. [BlockNote's Yjs utilities](https://www.blocknotejs.org/docs/reference/editor/yjs-utilities) warn that repeated JSON conversion loses collaboration history. [Yjs updates](https://docs.yjs.dev/api/document-updates) permit duplicate and reordered delivery; they do not decide product semantics for deletion or asset replacement.

Normalized interchange is the engine-exit/readability path, not the live merge authority. Pin Yjs 13 and all editor-binding versions; reject unsupported codecs without mutation. Retain snapshots for version history separately from active CRDT garbage collection. Ordinary “restore version” creates a new revision/copy preserving the current branch; it does not rewind cloud history or replace live lineage invisibly.

Fixed pages store authored width/height and page-unit coordinates. PDF annotations bind to original asset digest, stable source-page reference, crop/rotation transform and page units. Store ink as stroke ID, tool/brush version, authored color, width, ordered x/y/pressure/relative-time samples, and explicit erase/transform operations. Derived outlines are disposable. UI theme changes must not recolor authored paper/ink/PDF content. Ink over flow text requires an anchored-object design; arbitrary coordinates over reflowing paragraphs are excluded from the baseline.

## 5. Durable local mutation contract

1. Assign operation ID, scoped writer ID and sequence. Validate codec, size, ownership and input. A repeated operation ID with identical bytes is idempotent; different bytes under the same ID are corruption.
2. In **one IndexedDB transaction**, store the journal entry, required pending bytes/references, outbox membership, and the local revision/materialized-state pointer. Avoid unrelated asynchronous work inside the transaction. [Dexie transaction guidance](https://dexie.org/docs/Dexie/Dexie.transaction()).
3. Return `localAcknowledgedRevision` only after successful commit. Visible optimistic editing may precede this, but must say saving/unsaved. Exceptions, quota exhaustion or closing interruption must not produce a saved indicator. Preserve in-memory recovery/export where possible and stop accepting further edits if durability cannot be restored.
4. Serialize a stream's journal handling; use an IndexedDB-backed allocation/lease and Web Locks where available for efficiency, with crash-safe fallback. BroadcastChannel can notify tabs of committed revisions; listeners reload missing durable updates. Broadcast delivery is not the save authority.
5. Replay checkpoint plus complete journal on restart, validating digests and scoping. A renderer crash test is necessary; browser commit acknowledgment is not proof of physical-disk survival after power loss.

Model local mutation state separately from cloud replication state. Suggested states: `saving`, `local-durable/pending-cloud`, `uploading`, `cloud-verified`, `blocked-auth`, `blocked-quota`, `conflict`, `corrupt/quarantined`. A cloud acknowledgement names the exact included revision set; later local edits remain pending. Never show a single green “all saved” indicator for memory-only changes.

OPFS and IndexedDB do not form a distributed transaction. If OPFS is used for authoritative pending bytes, stage and close the file, verify it, record a durable reference, then acknowledge; recover interrupted staging and retain referenced files. Until this protocol is qualified, keep pending assets in the IndexedDB transaction. Derived caches and cloud-verified replicas can be evicted; pending work cannot.

## 6. Provider-neutral synchronization contract

Adapters expose scoped capabilities for enumerate/page, read bytes/ranges where supported, immutable create, unknown-result reconciliation and optional conditional hint updates. No adapter may overwrite existing content merely because a filename matches. Provider file IDs/ETags/cursors are locators and transport hints, not document identities or content digests.

**Upload:** collect a bounded immutable pack from already durable journal entries; persist the pack/outbox transition first. Upload and verify dependencies before the commit. Verify uploaded bytes against Sylf SHA-256, including readback when the provider cannot establish equivalent integrity. On a lost response, reconcile by immutable identity and read/hash candidates before retrying. Google duplicate names must be tolerated/deduplicated by verified bytes and ID, not assumed unique. If any dependency is missing/corrupt, no cloud acknowledgement is allowed. In one local transaction, mark only the verified included revisions and retain enough evidence to retry/reconcile.

Start with a **1 MiB target / 4 MiB maximum object** experiment budget; split larger originals into ordered chunks. This bounds retry memory and avoids assuming resumable-upload permission. It is a technical tuning default, not a supported maximum PDF size. Batch updates; never create a cloud file per pointer sample/keystroke. Qualify API cost, file count, packing and throughput before large-library support. PDF range streaming and complete-object reassembly need separate performance tests.

**Download:** enumerate commit candidates, page to completion, validate identity/versions/limits, fetch and verify required objects and ancestor closure, then atomically journal/apply and advance the cursor. Persist incomplete progress separately. A page failure must not advance the durable cursor past unapplied work. Missing dependencies leave a recoverable incomplete branch. Future/invalid commits are quarantined without damaging prior valid state. An expired cursor triggers reconciliation/full scoped scan, not inferred deletions.

**Concurrency:** commit parents form a DAG. Discover and retain all maximal valid heads; a later merge revision names all consumed parents. A mutable “latest” pointer or catalog is only an accelerator. Fresh-device recovery must reconstruct from immutable records if every hint/index is lost. Same-lineage content merges through Yjs; asset replacement and incompatible epochs preserve alternatives for review. Deterministic metadata projection uses Lamport counter then ASCII writer/operation ID ordering, never wall-clock or locale collation. Concurrent folder cycles project to Recovered/Unfiled without deleting objects; retain losing move operations in history.

**Deletion:** represent document/page removal with tombstones referencing observed causal heads. Concurrent deletion versus edit is determined through **transitive ancestry**, not timestamps or direct parents alone. Preserve concurrent/late returning edits as recoverable branches; editing a known-deleted item requires explicit restoration. Provider-list absence, permission failure or an empty folder is not a user deletion command. External bulk loss blocks destructive reconciliation and offers recovery from surviving local/cloud/export copies.

**Retries:** bounded exponential backoff with jitter, provider Retry-After, cancellation, per-account concurrency and foreground catch-up. Authentication, quota and unsupported-scope failures are actionable blocked states. No guaranteed background sync or upload deadline while the OS suspends a browser/app.

## 7. Cloud authentication and least privilege

Choose Google `drive.file` in an app-created visible folder; use explicit selected-file grants for imports/reconnection. Reinstallation/recovery and client-ID continuity require tests. Choose delegated Microsoft `Files.ReadWrite.AppFolder` plus required identity/offline consent for the registered flow. Avoid application-wide permissions and automatic all-drive escalation. [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Microsoft app folder](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder).

Microsoft's app-folder guide and generic upload-session permission table differ in specificity. Qualify small-object upload first, then resumable sessions on personal and school accounts; do not claim AppFolder supports every Graph endpoint from documentation alone. [Upload sessions](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0).

Reuse the security **patterns** in `lib/calendar/external/security.ts` and `connections.ts`: single-use expiring state, PKCE, purpose/owner-bound encrypted credentials, redirect allowlisting, credential revision and refresh leasing. Keep Notes grants separate from calendar authorization; do not repurpose calendar models/scopes or change their behavior. Any shared extraction requires regression coverage. API handlers use `lib/auth-server.ts`, ownership checks, CSRF/origin controls and `lib/api-transport.ts`. `proxy.ts` route redirects are not authorization.

Current `next.config.ts` needs narrowly scoped cloud `connect-src` origins before direct transfer can work; session-upload hosts can vary. Treat upload URLs as credentials, validate destinations against provider contracts and never log them or add broad wildcard policies without qualification. Authenticated responses/tokens must not enter service-worker caches, previews, telemetry or native exports.

## 8. Recovery, history and lifecycle

Keep immutable cloud history and independent native exports. Provider trash/version history is an additional recovery aid, not Sylf's only backup. History within the same cloud account is not independent protection against account/root deletion. A fresh-device restore must verify every referenced object and reproduce document/asset identities.

Phase 2 enables **no destructive cloud garbage collection or automatic history expiry**. Later retention needs an approved budget, restore tests, offline-device epoch policy and a reversible dry run. Compaction may add lineage-preserving checkpoints; it cannot delete the last pending copy or make a valid old device silently lose edits. Obsolete epochs import late edits into a recovery branch; never reset the remote library to match an old device.

Upgrade/migration: validate source, stage a new representation, verify round trip and atomically switch the local active pointer. Keep originals and an interrupted-migration marker; never destructive in-place conversion. Derivative indexes/thumbnails rebuild from validated source and cannot rewrite it.

Account switch/logout: stop writers and credential access immediately, fence asynchronous callbacks, close visible editors and clear memory. Durable pending data remains owner-scoped and unavailable to the next owner. **An IndexedDB namespace is not encryption.** Do not ship offline unlock/logout retention before selecting and testing a trusted-device key/unlock/recovery design. Existing `clearClientCache()` purges scratch drafts; it must not purge a future Notes outbox. Explicit device removal requires verified cloud backup or an explicit export/discard decision.

Browser quota/persistence requests are advisory. Explain offline coverage, pending count and last verified cloud revision. Warn early on storage pressure; evict only rebuildable data. Browser clearing, device loss or origin changes can destroy unsynchronized browser-only edits; neither OPFS nor another database on the same origin is an independent backup. This limit needs product approval. [Storage eviction and quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

Native adapters use SQLite/files and OS credential storage with atomic manifests/staging and the same IDs, bytes and conformance suite. Capacitor/WebView reuse alone provides no stronger durability guarantee. Platform backup, app uninstall and native pen bridges remain separately qualified.

## 9. Library, UX and Sylf integration contract

Notes opens into **Recent / All / Favorites / Subjects / Trash**, with optional folders and notebooks. A notebook is a document containing ordered pages; it is not a second folder hierarchy. A note has one canonical organization parent and optional subject facets. Subject archival/removal must not delete notes. Search indexes are local/rebuildable with explicit coverage; the 10,000-entry paging test does not qualify full-text search.

Desktop: persistent Sylf navigation, compact library pane and editor. Tablet: collapsible library and contextual tools. Phone: library and editor as separate navigable views, with page thumbnails in a sheet. Always show title/breadcrumb/back, one primary creation action, search and a clear save state. Typed documents start with a restrained formatting surface; paper/PDF documents expose pen, highlighter, eraser, undo and page tools. Advanced styles, recognition and bulk actions use menus/sheets. Tools need 44 px touch targets and keyboard/accessibility equivalents.

Use existing semantic appearance tokens generated by `lib/color-utils.ts` and applied by `GlobalSystemWrapper`; infer surface polarity from the actual background, not nominal light/dark preference. Preserve authored paper and document colors independently. Reuse the shared shell, subject service, transport and theme persistence. Calendar notes remain separate; integration uses explicit links/copy adapters. Notes mutations must not affect study settlement/reward authorities.

The shared engine imports no Next/server/database modules. Web routing and mobile navigation/file/credential adapters stay outside it. Initial scope is personal libraries; Yjs is the merge engine, not authorization or a promise of live shared notebooks. AI, OCR, audio and collaboration remain later separately reviewed features.
