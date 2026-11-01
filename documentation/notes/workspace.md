# Sylf Notes workspace and Drive contract

**Current implementation: Phases 3–7 and the 23 October 2026 seamless-startup and Drive-cleanup repairs.** Read this with the [durable foundation](foundation.md). Run evidence and release limits belong to the [Phase 3 report](reports/phase-3/report.md). This is implemented behavior; it does not certify a live deployment.

## Owners and entry points

### Progressive authenticated opening

The shared screen calls `POST /api/notes/unlock?bootstrap=1` once for connection metadata and device-key release instead of sequential connection/unlock requests. Cookie authentication, verified original binding and exact allowed request Origin still gate keys; metadata-only onboarding never includes a vault key. Responses remain private/no-store. The startup request has a 15-second deadline and a retryable error rather than two sequential 55-second waits. Keys remain nonextractable in memory, never persisted as plaintext or reused without the session/account barrier. Optional subject associations do not hold opening.

On an enrolled local device, the library decrypts at most 50 cached document projections for its first view. This derived metadata is validated against scope and heads, and source validation still occurs before editing. Catalog Yjs/history replay, full metadata paging, search and cloud reconciliation continue after the handle is exposed. Local document cards stay available while organization is loading; creation/import/folder controls remain gated until catalog readiness. Deep links outside the initial page show an opening state until paging completes. Catalog replay failure does not permanently poison explicit recovery. A fresh device exposes recovery controls while downloading its original library and never creates a replacement catalog before successful discovery. No background task can cross session closure or change ownership.

This removes local/cloud work from the opening dependency chain; it does not promise zero cold authentication, script loading or device-decryption latency. A completely reloaded encrypted vault still needs authenticated online unlock. See the [opening repair report](reports/2026-10-23-fast-opening/report.md).

### First download and deployment addresses

The subsequent [cold-restore repair](reports/2026-10-23-cold-restore/report.md) addresses a different origin with an empty local repository. Verified pages become visible after their existing atomic activation; they no longer wait for the entire pull or derived publishing. A restored original catalog enables organization; missing catalogs are never replaced before complete discovery. First-download errors stay visible even if some notes have arrived. A failed first download pauses with retry controls instead of an unexplained spinner. Optional view-position writes are skipped until the organization stream is available, preserving old positions and allowing saved document content to drain/navigate independently.

Verified pack caching is LRU with a 16 MiB payload and 128-file cap, replacing the four-file count cap that repeatedly evicted tiny history packs before a cold dependency walk could activate them. Identical concurrent reads share a promise; discovery performs at most four reads in its dependency-search batch and two concurrent enumeration reads. Provider hashes, pack validation, causal closure, transactions and full-discovery requirements before cleanup remain unchanged. Cache bounds do not claim a whole-browser heap limit; large closures beyond the cache can still incur rereads.

The permanent production URL is `https://sylf-alium41rs-projects.vercel.app/notes`. Immutable deployment URLs retain their original binaries and independent browser storage. Updated code can hand an authenticated fresh Vercel deployment to the server-advertised permanent URL in the same tab only after proving its current scope has no source, outbox, staged asset, quarantine or retained memory recovery data. Existing local work keeps its origin. Native/hash shells and local development are excluded. No cross-origin storage migration or deletion is implied, and an older immutable deployment cannot receive this later client repair.

`app/notes/page.tsx` composes the shared client screen under Sylf's existing shell, authentication and appearance systems. The mobile outlet reuses that screen. `lib/notes/library.ts` orchestrates the existing repository, streams and synchronizer; it does not introduce a second draft store. The editor and BlockNote dependencies load on demand. Library cards load in batches of 50; offscreen card rendering uses progressive CSS `content-visibility`. This is bounded initial rendering and progressive batching, not a complete variable-height windowing engine.

Notes owns document bodies, notebooks/pages, images, folders, favorites, Trash, history and document resume state. Optional `subjectId` is a reference: subject lifecycle never deletes note content. `lib/resources.ts` defines versioned library/document/page references, stable resource identity, URL opening, capabilities and resume contracts. Future Workspaces and Sessions store references and their own metadata. They do not store note bodies or own timers. See the user's complete [updated Workspace master plan](../workspaces/master-plan-october-2026.md). No Workspace database/UI or alternative Resource Shelf was built.

Folders use a deterministic internal Notes document with an immutable Yjs operation map, stable folder IDs and deterministic cycle recovery. Its separate `resume` Y.Map holds Notes-owned per-document reading positions. Concurrent positions merge through Yjs without changing document descriptors or causing text/metadata conflicts. Legacy `extensions.resume` remains a read fallback; copies discard that transient legacy position. Whole-library archives include catalog resume state; individual-document archives preserve source content/history but do not include the latest separate catalog position. Every device derives the same catalog document/stream IDs. It is created only after complete initial cloud discovery. A catalog projection cache is encrypted, version-checked, disposable and rebuilt from source. Folder removal never deletes its documents. Notebook/PDF pages own separate stable streams; typed, handwriting and PDF adapters share this authority. See the [handwriting](ink.md) and [PDF](pdf.md) contracts.

The library supports Recent, All, Favorites, Subjects, nested folders, Unfiled and Trash; title/content search, sorting, grid/list, rename/move, duplicate, portable import/export and retained history. Search and previews exist only in authenticated memory. Content indexing yields between documents and has a 16-million-character library budget; the UI discloses incomplete coverage. Titles remain searchable. Folder navigation reveals further batches beyond 200. Notes has no hard-delete or native-history expiry. Verified derived Drive copies and byte-identical physical duplicates have the bounded maintenance policy below.

The raw BlockNote view uses Sylf controls and semantic appearance tokens. Formatting includes three heading levels, basic styles, numbered/bullet/check lists, links, images, shortcuts and undo/redo. Title edits are debounced for 300 ms and are flushed before ordinary navigation/logout. Routine pending/saved labels are developer diagnostics; actual persistence failures remain visible. Stream updates retain the original 20 ms persistence batching. The adapter uses BlockNote’s independent read-only feature lock; the React view stays mounted through pauses/saves so editability props cannot override durability locks or reset selection. Metadata mutations preserve a pre-existing editor pause so logout cannot accidentally re-enable input. Authored colors are not rewritten when appearance changes.

## Local privacy and offline access

Production opens **only** `sylf-notes-vault-v1:<ownerId>:<libraryId>`. It supplies an AES-256-GCM cipher to the existing Dexie repository. Logical content hashes still identify the original bytes. Physical local objects use fresh random 96-bit IVs and associated data binding vault version, owner/library scope and object/cache/stage identity. Titles, bodies, original image bytes, filenames and catalog projections are encrypted. Identifiers, revision relationships, sizes, timestamps and provider binding metadata remain visible. The generic unciphered repository remains available for earlier conformance fixtures; it is not a production onboarding path. Old Phase 2 fixture databases are neither silently adopted nor erased.

The local vault key is generated once per server connection, encrypted under the separate server `NOTES_ENCRYPTION_KEY`, and released only to the authenticated original owner by a no-store, same-origin POST. It is imported as a non-extractable browser key and retained in memory. Logout/account replacement clears access, object URLs and plaintext caches; it retains the encrypted database. Cross-tab barriers and polling remain. All account logout entry points drain Notes before revoking the current session; failed preparation resumes safely drained editors. A failed logout HTTP request locks Notes access and visibly reports that sign-out was not confirmed, instead of pretending the cookie was cleared offline. A broker **401** closes key capabilities immediately; revoked Drive consent is a distinct **409** and retains local editing/recovery.

This protects retained data from ordinary subsequent Sylf users of the browser profile. It is not protection from active same-origin script compromise, an already unlocked compromised device, browser developer access to a live page, or server compromise. It is **not end-to-end encryption**. Cloud packs and portable exports remain provider-readable as provisionally approved.

An already unlocked tab can edit through temporary outages. **Cold reopening requires an authenticated online Sylf unlock.** There is no offline session bypass, persistent plaintext key, offline PIN or passphrase recovery. The service worker caches only the public `notes-offline.html` locked fallback, never authenticated route/API responses, note data or tokens. The fallback does not open content. Future offline cold unlock requires a separately qualified platform/key design.

Back up the server encryption key **and** database rows containing wrapped vault keys. Losing both access to that key material and an independent content copy can make unsynchronized local ciphertext unrecoverable. Key rotation must rewrap existing rows; replacing the environment value is not rotation. A cold locked browser cannot promise recovery from an unavailable server. Browser clearing/eviction, origin changes, device loss and physical power failure remain outside browser durability guarantees.

## Google connection and cloud bytes

`lib/notes/server/` owns Google credentials and fixed Google endpoints. Protected handlers use real `getSession`, session revocation and resource ownership. Mutating/unlock/relay requests require an exact server-allowed HTTPS origin matching the request URL: the configured canonical origin or, on Vercel, exact server-provided deployment/production host identities. Cross-origin, null, wildcard and native-origin requests remain denied. The canonical storage realm and OAuth callback do not change when a deployment alias is allowed. OAuth has expiring, single-use, owner/cookie-session-bound state, PKCE and distinct Notes consent. Requested scopes are `openid email drive.file`; Notes never borrows Calendar grants. Account identity is Google's stable `sub`, not an email address. Secrets never enter client/mobile imports.

Authenticated connection reads advertise the canonical `notesUrl` plus `localAccess` for an exact trusted request origin. An existing verified connection unlocks automatically on that same Sylf site; it does not require another Google consent or an Open Notes button. First-time/revoked-consent OAuth still uses the registered canonical callback, with a drained same-tab handoff. Legacy/untrusted origins retain a validated same-tab fallback rather than opening another tab. Only stable UUID resource references are carried over; OAuth/query state is not. Malformed destinations fail closed. No arbitrary hosting-domain wildcard or CORS expansion was added.

Use the permanent Sylf address for normal visits. Historical immutable deployment URLs retain their original code. Browser storage remains origin-scoped: permitting a new authenticated deployment does not transfer another origin's unsynchronized browser data or remove its retained copy. No unlocked editor is automatically redirected across origins. See the [seamless-startup repair](reports/2026-10-23-seamless-notes/report.md) for qualification and deployment status.

The additive Prisma models contain connection/binding metadata, purpose-bound encrypted credentials/vault key, refresh revisions/leases, provisioning proof and temporary OAuth state. They contain no note content, document previews, search text or attachments. The metadata migration enables RLS and revokes direct anonymous/authenticated-role access. Deployed APIs use the authenticated server broker. Phase qualification did not run a hosted migration. The [22 October database audit](../infrastructure/reports/2026-10-22-database-migrations/report.md) subsequently applied it and verified RLS/browser denial. Live provider and deployment acceptance remain separate gates.

Provisioning uses a user-visible **Sylf Notes** folder, a stable library descriptor and a fresh create/read/hash probe before activation. Root identity is retained before subsequent network work. Root discovery/validation also binds a SHA-256 realm of the exact canonical origin, so staging and production cannot accidentally share discovery just because numeric user IDs and OAuth clients match. Unscoped legacy roots require explicit review rather than automatic enrolment. Retry discovery refuses ambiguous roots, another Google account, changed library identity or a missing established/discovered old descriptor. It never substitutes a newly empty root for an unavailable enrolled library. Header repair separately re-verifies the current original cloud descriptor, quarantines the damaged local header and refuses a newer reader version.

Drive stores the original library descriptor, connection probes and immutable `.sylfpack` files. Pack v1 is `SYLFPAK1`, a little-endian four-byte JSON-header length, bounded deterministic header and concatenated original objects. Header fields: version, library ID, object hash/length pairs and advertised revision hashes. Maximum: **4,400,000 bytes**, 128 KiB header, 500 objects/revisions; each original object is at most 4 MiB. Every pack and object is SHA-256 verified and length/scope checked. The bound fits a complete 4 MiB object and remains below the documented deployment payload ceiling. See [Vercel limits](https://vercel.com/docs/functions/limitations) and [Google multipart upload guidance](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

A same-origin authenticated relay transfers bounded pack bytes through server memory. It does **not** persist those bytes to Sylf's database/storage and does not expose access tokens, arbitrary URLs, root IDs or provider file-selection authority to the client. This is an explicit content-transit boundary, not a claim that Sylf's server cannot see content. Pack creation is immutable; candidate/read operations verify root parentage, library metadata, Drive version and checksum. No broad cloud CSP exception is required for browser data transfers.

OAuth client identity must remain stable after provisioning. Choose the dedicated Notes client before first deployment if using one; changing clients later can change `drive.file`/private app-property visibility and needs a copy-and-verify migration. See [Google's file scope](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) and [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server).

## Sync, status and recovery

Foreground sync runs on open. Automatic cloud work waits for **30 seconds without local edits**, checked by a five-second scheduler; an unchanged, quiet library polls at most every **two minutes**. Returning to the library or changing notes requests cloud work after the local leave/flush completes. Hiding the tab attempts a local drain and cloud pass, but is best effort. Ongoing typing/inking continues to commit locally; it does not trigger an upload for each change. There is no maximum-age upload forced through continuous writing. Leaving the whole route/tab can stop cloud work; the durable outbox resumes on the next authorized open. Local acknowledgement and the original 20 ms journal batching are unchanged. Preview/search rebuilding is deferred while an editor is open. Outbox work uses existing durable leases, idempotent operation identities, dependency closure, verified readback and lost-response reconciliation. Each upload batch claims up to 100 revisions. Phase 4 drains up to five batches per foreground pass, yielding between them and stopping after a completed batch reaches a five-second budget; a single provider operation still has its own timeout. This permits more pending work per pass without changing local acknowledgement or outbox leases; Phase 6 qualifies a 1,000-revision Chromium catch-up fixture and a paced writing session, while live throughput and academic-year histories remain unqualified. Throttling honors provider cooldown and queue backoff; authorization failures pause automatic retries until explicit retry/reconnection. Browser suspension/closure is not background upload coverage.

Discovery lists metadata in provider pages of 100 and adopts two packs per bounded repository page. Cursors name the current volatile scan; a restart expires them and safely rescans. Delivery is acknowledged in memory only **after** repository/cursor activation, so failed activation cannot hide an undelivered page. Restart replay is idempotent; unchanged acknowledged packs do not repeatedly rewrite document heads. Download work is capped at 100 pages per foreground pass; an incomplete initial scan does not enable a newly empty library or claim complete cloud verification. The next pass continues it. Listing has a 25,000-file safety bound; it is not a qualified scale promise.

A fresh process or changed listing revalidates previously acknowledged cloud closure before reporting a current verified status. Old outbox receipts alone do not prove files still exist. Missing/corrupt cloud bytes preserve local originals and produce a visible recovery error. Listing absence never becomes deletion. Existing valid copy candidates can be reused; duplicates and interrupted uploads do not replace originals. Restoring externally removed files from Drive Trash may require user action. Corrupt provider originals are not silently deleted or overwritten.

UI states distinguish saving, local durable/pending cloud, sync in progress, verified cloud, blocked/corrupt and memory-only recovery. Recovery displays pending/blocked revision counts, last full verification, error codes and advisory browser storage estimates. A verified timestamp records observed readback, not a continuous availability guarantee. Concurrent text retains Yjs lineage; metadata/deletion alternatives remain explicit. Conflict resolution retains all streams/pages/assets and creates a causally explicit restore. History restoration creates a copy rather than rewinding source.

Portable `.sylfnote` archives retain exact native revision IDs, objects, streams/pages, assets and readable derived trees. XML attributes removed by formatting can contain `undefined`; only the readable projection applies JSON's absent-property convention. Original native bytes remain unchanged. Importing older history does not replace newer heads. Emergency export combines unacknowledged native deltas with durable originals without requiring a successful local write. Same-owner recovery capsules remain exportable after editor/controller teardown and block explicit logout. The catalog can defer failed memory replay to expose Recovery on a full device; conflicting pending catalog operations stay blocked until recovered. An optional proof-cache refresh failure cannot prevent opening the unchanged previously enrolled scope for recovery. Active failed catalog/body streams also participate in emergency export/retry. They remain memory-only until persisted or exported; process death can lose unacknowledged changes.

Recovery can export an entire library, inspect source integrity, rebuild derived indexes and save retained orphan upload originals. If a corrupt header prevents portable export, **Preserve encrypted device copy** captures existing raw rows read-only after a fresh owner check. `.sylfdevice.json` is forensic preservation, not an interchangeable note archive, a key backup or an automated restore feature. It has a 256 MiB serialization bound. Keep it and the server key backups for explicit recovery; no repair action erases original source rows.

The current importer/exporter and integrity/audit scans are bounded, foreground operations. Per-page pull/closure and portable export retain their 256 MiB budgets. Phase 6 removes repeated ancestor expansion from the integrity scan and repeated remote proof within a bounded pull. Very long histories still have retained graph/replay costs, full closure work per publication batch, and cold-scan/API costs. No history pruning, automatic independent backup schedule or arbitrary-size-library promise is introduced. Physical-device/IME/WebView and large-history/provider-cost qualification remain release gates, detailed in the report.

## Phase 4 paper editor

The [current paper/handwriting contract](ink.md) extends the same notebook, stream, vault and replication owners. Handwritten notebooks coexist with typed notes; their tools, paper, page management, input boundaries, native validation cache and measured limits are documented there. Phase 3 reports retain their original run/source scope.

## Phase 5 PDFs

The [PDF contract](pdf.md) adds immutable originals, virtualized reading, editable ink/markup, retained page management and derived study-copy exports to the same Notes owners. Stable page references and catalog resume state are shared with future consumers. It adds no Workspace implementation or live-provider claim; qualification is recorded in the [Phase 5 report](reports/phase-5/report.md).

## Phase 6 resource lifecycle and recovery controls

Rich-text image resolution belongs to a mounted editor. `imageResolver(documentId)` deduplicates concurrent resolutions within that view and returns an explicit `close`. Leaving the editor releases its Blob URLs; another editor's lease stays valid. Failed/closed asynchronous opens release streams, and a late image read cannot create a URL after owner/view closure. Original encrypted assets, native references and history are unchanged. This bounds closed-view Blob retention; it does not cap the size or decoded bitmap cost of images in an open note.

Recovery shows scan progress, allows cancellation, and cancels on dialog closure/unmount. A cancelled check does not claim success or change originals. Success describes the retained revisions included in the check. Independent portable copies remain an explicit user action; there is no automatic independent backup service. See [Phase 6 report](reports/phase-6/report.md) for the actual backup restore drill and remaining release gates.


## Phase 7 cloud pacing and Drive organization

The [Phase 7 report](reports/phase-7/report.md) distinguishes local implementation,
existing deployed behavior and live acceptance gates. These changes do not deploy
themselves or authorize production infrastructure updates.

Fresh, blank default-titled notes/notebooks remain **local drafts**. Their durable
outbox jobs are excluded before claiming a lease; they are not deleted, falsely
acknowledged or cleaned up. Custom titles, explicit title edits, supported content,
attachments/PDFs and nonempty notebooks make a document eligible. Unknown content
is treated conservatively as eligible. A previously published document continues
replicating its history even if later emptied; its only cloud history is never
removed to satisfy draft filtering. Currently blank untitled documents do not
create new readable PDF copies. Status distinguishes **Drafts on this device**,
**Saved locally · cloud pending**, errors and verified cloud work.

New technical packs, descriptors and connection probes go under
**_Sylf system — do not edit**, inside the enrolled **Sylf Notes** root. Legacy
root files remain readable. A protected `organize` command moves a bounded batch
of verified, app-tagged legacy technical files into that folder, preserving their
IDs and bytes. Corruption or scope mismatch stops the operation with originals
intact; retries continue discovery. Root/descriptor verification accepts both
layouts. This is a deployment layout change with an explicit rollout/rollback
procedure; an older server that understands only root-level packs is not a safe
rollback after organization.

The Drive owner can still rename, move, trash or delete that folder. No ACL makes
user-owned files untouchable. Google’s hidden app-data space needs another scope
and a separate migration, and can itself be removed by the owner. No scope or
permission expansion was introduced.

A server-advertised `driveLayoutVersion: 1` enables named **PDF study copies**.
They mirror projected Sylf folder IDs/names under the Drive root. Editable native
content, attachments and revision history remain in immutable system-folder packs;
PDFs are derived views, never an import/recovery authority. Manual `.sylfnote`
export remains available; the automatic publisher does not repeatedly archive the
entire retained history. Any legacy archive publication is kept in the system folder.
Rich text is currently rasterized with browser fonts to retain Unicode and local
images; its PDF text is not searchable/selectable. Handwriting and PDF study copies
reuse the existing vector/PDF export core. Its inherited dotted-paper background
currently exports as horizontal rules; native templates/ink remain intact. Rich-text
print layout is not pixel-identical to the editor. Unknown blocks, excessive budgets and
unavailable assets fail visibly without replacing a prior valid copy. No external
image URLs are fetched by this renderer. Control characters and path separators
are normalized in Drive names. Duplicate titles remain independent documents;
concurrent copies may coexist rather than overwrite a branch. The original
immutable packs/catalog remain replication authority. Editing/deleting a PDF copy
in Drive does not directly edit/delete its Sylf document.

Publication uses immutable staged candidates in the system folder, a connection-
and generation-bound encrypted one-hour upload capability, and **4 MiB** relay
chunks (256 KiB alignment except the last chunk). Provider URLs/tokens are never
returned in plaintext. Destinations stay fixed to Google’s validated resumable
endpoint, including Google's file-specific update-session path bound to its file
identity. PDF MIME type and the first chunk's PDF signature are checked. The final
provider SHA-256 and size must match before the file is named
and moved into the user-facing folder. Complete lost responses are reconciled by
checksum; partial failures leave previous copies and native originals intact.
Interrupted zero-length staging candidates can be reused. New clients keep large
folder/cleanup metadata in a final JSON reconciliation, with a compact upload
capability, so it does not inflate HTTP headers. Older upload capabilities still
complete through their original promotion path. Durable scoped hash receipts
retain a predecessor across reopening; they never acknowledge native outbox jobs.
A cold open still reconciles provider presence.

### Verified Drive copy cleanup

After complete native discovery, durable publication and availability verification,
the library may attest that native recovery is verified for the publication
snapshot. This is an authenticated client contract, not an independent server
proof of document-to-PDF semantic equivalence. The server never uses this claim
to delete unique native content. The current PDF must independently pass provider
SHA-256, size, MIME, identity and folder checks before older derived copies retire.

New PDFs record up to 16 source heads (document plus catalog context) in private
Drive properties. The publisher walks the durable DAG and supplies strictly
covered prior snapshots, binding each claim to a hash of its inspected source
heads. Reused renderings advance their source stamp conditionally only with a
covering claim; a stale claim cannot retire a file whose source stamp advanced.
Equal or unrelated frontiers remain intact. Legacy complete PDFs already moved
to the system folder, or an explicit legacy predecessor, may retire after the
same verified-recovery gate. Legacy native archives remain protected; PDFs never
substitute for their source bytes/history. Unsupported or ambiguous states are
retained rather than guessed obsolete.

Retirement moves eligible copies to recoverable Drive Trash, with at most eight
PDF retirements per reconciliation. Pending maintenance keeps the unchanged
publication eligible for another background pass. Inspection scans at most 1,000
copies per document. Current content/location and each candidate's exact version
are rechecked. Live qualification found v3 did not enforce a stale `If-Match`;
the adapter therefore reads the supported v2 ETag/version, conditionally patches
v2 metadata, then verifies through v3. Missing ETags, version changes or failed
preconditions preserve candidates. Public and private properties are preserved.
No empty-Trash or permanent-delete call exists. Drive normally permanently
removes trashed items after 30 days; space is not reclaimed immediately by this
application. [Google Trash policy](https://developers.google.com/workspace/drive/api/guides/delete).

Native pack upload retries first locate and read/hash an existing exact pack.
The complete sync listing supplies duplicate-hash hints, avoiding an extra
per-pack maintenance scan. At most four byte-identical physical duplicates retire
per pass, only after a deterministic survivor is read/hash/manifest verified and
rechecked. Unique packs, revision IDs, ancestor objects, assets, descriptors and
probes are retained. A download racing duplicate retirement can refresh and retry
an exact-hash surviving pack; missing unique data still fails verification.
There is no native history pruning, epoch retirement or compaction migration.
See the [cleanup qualification report](reports/2026-10-23-drive-cleanup/report.md).

The portable archive and publication transfer limit is 256 MiB in memory. Rich-text
PDF rendering is additionally bounded to 200,000 characters, 200 pages and 64 MiB
of compressed page images; unsupported merged table cells fail visibly. Existing
paged-PDF source/annotation limits still apply. PDF materialization and protected concurrent/ambiguous copies add storage and rendering costs to incremental packs. Large-history
cost/latency remain release gates. Unchanged successful copies are skipped within that unlocked library;
a cold open reconstructs publication work from durable source and remote checks.
A missing named copy may require reopening or another edit to regenerate it;
canonical pack availability remains independently verified. Folder-only deletion
and Notes Trash do not erase provider copies or documents. Empty organizational
folders are materialized when an eligible document needs their path.


## Quiet startup, saving and navigation

A verified returning owner is unlocked automatically through Sylf authentication and the existing server-wrapped vault key. The encrypted local catalog is shown before background cloud discovery finishes. Cold offline unlock remains unavailable; automatic startup does not bypass authentication or store a plaintext key.

Normal Notes hides routine cloud buttons, sidebar pending labels and local save labels across text, handwriting and PDF editors. Admins can opt into those diagnostics at `/notes?dev=true`; local document selection preserves this flag. Actual local persistence/recovery errors, revoked consent, missing/corrupt data and quota failures remain visible. A transient network error is quiet; an ongoing network backup failure with non-draft pending changes produces a static actionable warning after five minutes. Manual retry clears a network backoff while retaining a provider's throttle deadline.

Web document/page selection uses Next's supported native History API integration to update search parameters without a server-component navigation request. The hash-based mobile/Capacitor adapter remains authoritative on native shells. Latest-intent checks prevent an older navigation from dispatching after a delayed editor drain; identity-scoped leave cleanup cannot erase a newer editor's callback. Navigation still refuses to discard edits whose local save failed.

Cursor-only scans, duplicate remote adoption and outbox receipts no longer broadcast themselves as document edits. Missing derived document indexes can still be reconstructed from verified history. Native object/revision identities and transactional acknowledgement rules are unchanged. After a physical pack/version has been fully downloaded and verified in the current unlocked session, the adapter may reuse matching locally hashed bytes after its small decoded-pack cache evicts that pack. Cold sessions and changed/removed physical versions revalidate provider presence; a persisted receipt alone is never sufficient proof.

Google refresh credentials remain sealed server-side across visits. Actual `invalid_grant` can require consent; client-configuration errors, transient outages, missing files and another worker's newer refresh are not all classified as revoked consent. A refreshed credential is reused only for the same owner/account/library/root/generation. A broker 401 still fences local keys and revalidates Sylf authentication rather than requesting unrelated Google consent.

## Interface redesign

The [current interface contract](interface.md) adds shared text/ink page layers, full-workspace editing and the redesigned library. It extends the existing adapters and durable storage; original streams and history remain intact. See that contract for layer references, copy behavior, viewport ownership and creative-tools boundaries.

## Creative tools interface update

The [current interface contract](interface.md) describes Phase 2 brushes, immutable precision cuts, page templates/defaults and independent text/image boxes. The existing native adapters, encrypted catalog/repository, synchronization and recovery remain their owners. See the [Phase 2 report](reports/2026-10-23-creative-phase-2/report.md) for the exact local qualification.
