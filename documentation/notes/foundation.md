# Sylf Notes durable foundation

**Current implementation: Phases 2–4, 20 October 2026.** This is the source contract for the infrastructure under [`lib/notes/`](../../lib/notes/). The [Phase 1 architecture](architecture-contract.md) remains the broader design input. The [current workspace/Drive contract](workspace.md) describes the implemented Phase 3 screen, encrypted local storage and Google broker. Live deployment/provider qualification remains a separate gate.

## Authority and integration

The shared repository owns immutable bytes, revision history, transactional acknowledgement, recovery and the outbox. Editors use `NotesStream`; transport adapters use `NotesSynchronizer`. Neither writes a second draft store. No note content, attachment, search index or preview is persisted in Supabase, Prisma or localStorage. Phase 3 transfers bounded provider-readable packs through authenticated Sylf relay memory, without server content storage. localStorage contains only a cross-tab session barrier.

Entry points:

| Module | Responsibility |
| --- | --- |
| [`contracts.ts`](../../lib/notes/contracts.ts), [`bytes.ts`](../../lib/notes/bytes.ts) | Versioned schemas, IDs, deterministic metadata bytes, SHA-256 and chunk verification. |
| [`repository.ts`](../../lib/notes/repository.ts) | IndexedDB implementation and structural `NotesRepository` interface for future native adapters. |
| [`engine.ts`](../../lib/notes/engine.ts) | Yjs lifecycle, batched saves, retry, remote replay and memory recovery. |
| [`session.ts`](../../lib/notes/session.ts) | Authenticated-owner capability, logout preparation and cross-tab fencing; lightweight enough for existing authentication imports. |
| [`blocknote-adapter.ts`](../../lib/notes/blocknote-adapter.ts) | Dynamically loaded browser editor binding and explicit one-time seeding. |
| [`portable.ts`](../../lib/notes/portable.ts), [`interchange.ts`](../../lib/notes/interchange.ts) | Portable archives, original bytes, native history and readable projections. |
| [`sync.ts`](../../lib/notes/sync.ts), [`graph.ts`](../../lib/notes/graph.ts) | Provider-neutral verified replication, branch/deletion semantics and folder projection. |

`AuthProvider` prepares explicit logout before its existing logout request, then invalidates Notes access. Existing `clearClientCache()` also invalidates access on revocation/account changes but never deletes the Notes database. New login fences previous-owner tabs even when the initiating tab was anonymous. No Notes editor dependency enters this authentication import graph.

## Identity and bytes

Library, document, page, stream, writer and operation IDs are UUIDs. Owner IDs come from Sylf authentication. Assets are identified by the original whole-file SHA-256. Every immutable metadata/update/chunk object has the SHA-256 of its exact logical bytes (before local vault encryption) as identity, plus length. Lookups and deduplication are scoped to owner and library.

The v1 envelope supports flow documents, paged notebooks and PDF documents. Pages name independent streams and optional original assets; the envelope does not itself implement editors. The [Phase 4 ink adapter](ink.md) implements paper handwriting; PDF editing remains future work. Descriptors preserve optional unknown fields/extensions. Unsupported required features/codecs cannot be opened for editing. Future manifest versions within the supported ZIP container return a read-only result with the original bytes; unsupported stored library headers block access instead of initializing an empty replacement. Phase 3 adds explicit scoped header repair after fresh verification against the original cloud descriptor, quarantines the damaged header and refuses newer reader versions. A read-only encrypted device snapshot can preserve raw rows when portable export is blocked. Never re-provision over a damaged or unavailable library.

Metadata encoding uses sorted JavaScript string keys, UTF-8, JSON string escaping and ECMAScript finite-number serialization. It rejects unsupported values, excessive depth and oversized output. This is **Sylf encoder v1**, not a claim of RFC 8785 conformance. A future non-JavaScript writer must reproduce these bytes with fixtures or preserve existing received bytes without reserialization. Checksums establish byte integrity, not authenticity or encryption.

Native `yjs13-update-v1` updates remain the merge authority. Stream descriptors record adapter/schema, epoch and optional readable projection. Ordinary opens never reseed from JSON. Epoch migration creates a new representation with predecessor identity and retains the original. Checkpoints must reproduce exactly the native state of their declared parent frontier; they accelerate replay and do not remove history. A default Yjs checkpoint is not the sole archive of past document versions: original update objects and their revision graph remain retained.

Current bounds are 4 MiB per immutable object, 64 MiB per individual native update and 256 MiB per logical asset/content reference. Content is split into ordered 4 MiB chunks; reassembly verifies each chunk and the original whole-file hash. These are rejection/memory bounds, not mobile performance promises.

## Local durability

The generic `sylf-notes-v1` fixture database and production per-owner `sylf-notes-vault-v1:<owner>:<library>` database use Dexie with strict transaction durability where the browser supports it. All rows carry a scope derived from `[ownerId, libraryId]`; each operation verifies the enrolled binding generation and active session. Tables hold libraries, objects, journal indexes, derived document heads, operation receipts, staged assets, outbox leases, cursors and quarantined bytes.

A save prepares and validates bytes before opening a write transaction. One transaction writes objects, journal, operation fingerprint/receipt, document heads, referenced stage state and outbox membership. Acknowledgement names the exact revision only after transaction completion and a final session check. Pre-commit failure rolls everything back. A lost acknowledgement is retried with the same operation ID and byte fingerprint; conflicting reuse is rejected. Original bytes are stored once, rather than copied into both journal and outbox.

`NotesStream` batches updates for at most the normal 20 ms scheduling window and serializes saves. Its states are `ready`, `saving`, `pausing`, `local-durable`, `failed` and `closed`. `local-durable` means the captured updates committed locally; it says nothing about cloud verification. `status().pending` and persistent outbox jobs are separate measures. On failure the buffer remains recoverable, the BlockNote adapter disables editing, and `retry()` reuses operation IDs. Consumers must display the error and pending work; they must not convert an exception into a saved indicator.

Explicit logout pauses editor input and drains edits captured during the asynchronous save. Failure rejects logout before its HTTP request. Same-owner memory recovery capsules also block logout until recovered. Revocation/account replacement closes access immediately; any unacknowledged buffer is retained in an owner/library/generation-scoped memory capsule. Reopening the original scope retries it idempotently. **Memory capsules cannot survive process termination.** Browser navigation warnings are advisory and cannot make unacknowledged edits durable.

Concurrent connections use transactional document versions and retries; there is no volatile single-tab writer authority. BroadcastChannel notifications and a two-second active-stream polling fallback trigger durable replay, with remote origins excluded from local journaling. An asynchronous replay is applied only while its local activity epoch remains unchanged, so a late read cannot roll back the frontier of a newer local save. A save names the heads the editor actually observed. This preserves edits made concurrently with a deletion or metadata change rather than assigning them a false causal order.

Staged original assets and their chunks commit atomically. Unreferenced stages remain discoverable through `pendingAssets()` and readable through `readContent()`; cleanup never deletes them automatically. There is no destructive garbage collection, hard-delete API, history expiry or pending-data eviction in this phase.

## Replication contract

`NotesTransport` is permanently scoped to one owner/library/provider/account/root/generation. It provides immutable candidates, immutable creation and paged revision enumeration. It must obey its candidate/page bounds and cancellation signal. Logical hashes may correspond to multiple physical provider files; names and ETags never establish Sylf identity.

The persistent unit of replication is a revision outbox job, with expiring leases that another worker can reclaim, attempt count, retry time, blocked state and verified timestamp. Upload traverses dependencies before commits, verifies exact readback, and reconciles a lost create response by hash before retrying. Duplicate requests are safe. Authentication/quota errors block; transient errors back off with jitter. An expired claim cannot acknowledge a newer lease.

Download validates an entire page and dependency closure, causal Yjs completeness, descriptor/stream scope and checkpoint coverage before atomically installing revisions, outbox state and cursor. Expired cursors trigger a bounded rescan. Missing, corrupt or unsupported bytes reject the page without advancing the cursor; listing absence is never deletion. Valid concurrent heads remain preserved. Tombstones are explicit revisions; known-deleted edits require explicit restoration, and concurrent deletion/edit branches remain visible as conflicts. Deterministic folder projection retains cyclic/orphaned items in recovery results.

The coordinator remains provider-neutral. Phase 3 implements bounded Google Drive packs, discovery and an authenticated broker, qualified with synthetic provider responses as recorded in the [workspace contract](workspace.md). It does not create a physical file per input sample. Live Google/deployment acceptance and closed-tab background upload are not established.

## Recovery and portable format

`.sylfnote` v1 is a classic **STORE-only ZIP** containing `manifest.json` and `objects/<sha256>`. The manifest declares library identity, selected documents, revision IDs, byte lengths/hashes and readable projections with source heads. It contains no OAuth credentials or provider upload URLs. All native history, checkpoints, branch identities and referenced original assets accompany the selection. Current export/import retains the original owner and library; cross-account copying/remapping is a separate future operation.

The parser rejects compression, ZIP64, encryption, duplicate/undeclared entries, unsupported paths, header disagreement, overlaps, CRC errors and incorrect hashes. Limits: 256 MiB total archive, 60,000 entries, 50,000 revisions and a 4 MiB metadata manifest. Export is currently in memory. A native-only recovery export can omit readable projections if a projection exceeds its supported structure. Unsupported native schema/required features still fail explicitly; native-only does not bypass integrity checks.

Recovery procedure for a future consumer:

1. On a failed save, keep the current stream/tab alive, show the specific failure, offer `unsavedUpdates()` as emergency bytes, resolve storage pressure, then call `retry()`. Do not purge the database or redirect to a new empty document.
2. On corrupted source, run explicit `inspectIntegrity()` to find damaged revisions and surviving ancestor frontiers. Export a healthy selection where possible. `repairObject(hash, originalBytes)` accepts only the expected original hash and quarantines replaced damaged bytes transactionally. Do not silently restore an older version over a corrupt branch.
3. Use `rebuildCatalog()` for derived head/outbox loss. Use `recoverLostJournal()` when journal rows are missing but trusted revision-marked source objects survive. It verifies closure before rebuilding indexes/operation receipts and conservatively queues missing outbox work again. Asset JSON is never guessed to be a commit. Corrupt/incomplete source blocks recovery; originals remain untouched.
4. Use `exportNotes()` and verified `importNotes()` into the original owner's enrolled library for independent recovery. Imports validate fully before activation; preserve the input file if validation fails. Orphan staged assets require separate original-byte export through the asset API.

## Security, storage limits and release gates

Provider-readable cloud v1 remains provisional. Phase 3 production adds an authenticated, memory-key AES-GCM local vault with encrypted retained content and online cold unlock; see the [current privacy/key contract](workspace.md#local-privacy-and-offline-access). Active same-origin compromise and unlocked-device compromise remain outside that protection. Server key material must be backed up; this is not E2EE. `registerLibrary()` trusts the authenticated provisioning adapter; its descriptor/probe fields are not server-signed evidence. The diagnostic harness uses explicitly synthetic bindings and cannot be a production local-only onboarding path.

Browser quota/persistence decisions are outside the repository's control. Explicit browser storage deletion, eviction, origin changes, device loss and power loss can destroy local work; no claim of survival is made. Real quota exhaustion, physical power loss, Safari/iOS/Android WebViews, native SQLite/files, offline cold content unlock and live cloud operations are not qualified. Phase 3 verifies only a public locked offline fallback and loaded-tab editing. Quota exceptions were injected into real and emulated IndexedDB transactions.

Recovery scans/imports/exports are explicit foreground operations with bounded inputs; worker offloading and cancellable progress remain future UI work. Integrity scanning currently revisits ancestor closures and can be quadratic in revision count. Metadata history grows with retained revisions; full-library export/pull also has memory and API-cost limits. The measured 200-save workload is not evidence for indefinite history scale. Benchmark long histories and provider packing before alpha; any future pruning needs a separately approved retention/recovery policy.

See the [Phase 3 report](reports/phase-3/report.md), [workspace/Drive contract](workspace.md), [setup/live gates](reports/phase-3/setup.md), and historical [Phase 2 report](reports/phase-2/report.md), [verification evidence](reports/phase-2/evidence/README.md) and [Phase 3 handoff](reports/phase-2/phase-3-handoff.md).

Phase 4 adds the [paper/ink contract](ink.md), input capture boundaries and an exclusively owned native verification cache. The cache advances only after commit, destroys tentative states on failure and preserves checkpoint equivalence/causal checks. This changes neither stored bytes nor the transactional acknowledgement contract.
