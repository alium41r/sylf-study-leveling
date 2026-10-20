# Sylf Notes — Phase 2 implementation report

**Completed 20 October 2026. Phase 3 has not started.** The durable document foundation is implemented under [`lib/notes/`](../../../../lib/notes/) and integrated with Sylf's authentication lifecycle. There is no Notes workspace, live OAuth/provider integration, handwriting editor, PDF editor or database migration in this change.

## Implementation and decisions

- **Sylf envelope v1:** stable document/page/stream identities, flow/notebook/PDF descriptors, immutable original assets, unknown optional extensions and explicit stream epochs. Original Yjs updates and revision ancestry remain authoritative; opening never rebuilds collaboration state from JSON.
- **Transactional Dexie repository:** one local transaction commits content, journal, operation receipt, heads and persistent outbox. Saved acknowledgement follows commit. Operation fingerprints support safe duplicate requests and uncertain acknowledgements; checkpoints validate their exact native ancestry. Immutable bytes are stored once, with 4 MiB chunks for assets and large updates.
- **Recovery:** portable `.sylfnote` export/import preserves native history, branches, identities and referenced originals, alongside readable interchange. The bounded STORE-only ZIP parser validates paths, duplicate declarations, headers, CRCs, lengths and hashes. Recovery can rebuild derived catalogs and lost journal indexes, identify surviving ancestors, and repair original bytes while quarantining damaged copies. No automatic deletion, garbage collection or history expiry exists.
- **Owner lifecycle:** explicit logout pauses editing and flushes pending work first; storage failure aborts logout. Account replacement/revocation fences tabs and asynchronous work while retaining correctly scoped durable pending data. Unacknowledged memory capsules can be retried by the original owner in the same process; they are not durable backups.
- **Provider-neutral replication:** immutable dependency-first upload, readback verification, lost-response reconciliation, durable leases/retries/blocked states, atomic download-page/cursor installation and concurrent-head preservation. Real Google/OneDrive transports remain later work. Revision jobs replace a premature provider-specific pack implementation; physical packing/API costs must be qualified before alpha.
- **Shared integration:** lightweight session fencing extends the existing AuthProvider/cache cleanup. The editor adapter loads dynamically in a browser; the engine has no Next/server dependency. Native SQLite/files adapters can implement the structural repository contract, but are not implemented or certified here.

Pinned production dependencies follow Phase 1: BlockNote core/react 0.56.0, Yjs 13.6.33, y-prosemirror 1.3.7, y-protocols 1.0.6, Dexie 4.4.6 and fflate 0.8.2. fake-indexeddb 6.2.5 is test-only. Perfect Freehand/PDF.js are deferred to their respective phases. Installed license metadata and the resolved dependency graph were recorded; MPL notices/source obligations for shipped BlockNote remain a distribution responsibility. The pinned graph includes the previously identified `lib0 1.0.0-rc.36` utility maintenance risk. No XL package or paid service was introduced. See the [inventory](evidence/dependency-inventory.json).

## Qualification results

| Check | Result |
| --- | --- |
| Production-module and relevant existing regression tests | **86 passed across six files.** Fault boundaries, uncertain acknowledgements, quota rollback, corrupt data/repair, concurrent tabs/connections, owner changes, archive fidelity, checkpoint/epoch integrity, 300-page/20,000-object synthetic notebook, incremental storage and fake-provider failures. |
| Real Chromium production harness | **12/12 passed:** offline editing in a loaded shell, real IndexedDB rollback under injected quota, tab convergence, logout fencing/draining, deliberate renderer and full browser-process crashes, disk-backed profile recovery, chunked originals, BlockNote archive restore in a fresh profile, local undo preserving remote edits, repeated editor mounting and save measurements. |
| React development StrictMode | **1/1 passed:** five actual mount/teardown cycles, followed by one edit producing one revision. |
| TypeScript and targeted ESLint | **Passed.** |
| Next.js production build | **Passed**, including type validation and prerendering. |
| Mobile build and production bundle audit | **Passed**; audit found no server-only symbols/secrets. The separate editor harness also audited its 171-module client graph with zero forbidden imports. |

On this macOS arm64 host with Node 24.19.0 and Chromium 151.0.7922.34, 200 explicitly flushed saves over a 256,000-character seed had **5.6 ms p95** versus the provisional 250 ms target. Document-object bytes grew **176,039 bytes** across those saves, rather than rewriting the seed each time. Warm stream reopen after checkpoint took **6.3 ms** with the same repository's metadata cache. These are desktop synthetic measurements, not cold-load, input-latency or mobile guarantees. Exact samples, commands, logs and limitations are in [evidence](evidence/README.md).

The initial large-asset assertion exhausted the test runner's memory while deeply comparing typed arrays; it was replaced with original-byte hash comparison and the suite passed. That failed run is retained. A later browser-protocol crash command stalled the diagnostic driver; a bounded wait fixed the harness, and the complete final browser suite passed. Final build logs contain existing Vite config/chunk-size warnings; no verification failure remains.

## Limits, approval gates and Phase 3 readiness

Provider-readable v1 follows the user's provisional instruction. **There is no end-to-end encryption or cryptographic local vault.** Owner isolation is enforced by application sessions and repository scope, while retained IndexedDB remains plaintext to same-origin code/browser-profile access. Trusted-device/offline unlock and logout-retention privacy require a product/security decision before exposing Notes.

Explicit storage deletion, eviction, origin change, device loss or power failure can destroy unsynchronized local data. Browser persistence requests cannot eliminate this. The verified renderer and browser-process crash results are narrower. Real disk-full/quota exhaustion, live Google/OneDrive grants, physical mobile devices/WebViews, offline cold launch, independent cloud backup scheduling and native durability were **not tested**. The product durability promise must acknowledge these limits or move native protection earlier.

Archive operations are currently in memory and capped at 256 MiB; larger selections fail explicitly. The first importer requires the original owner/library. Deep recovery scans can revisit ancestry quadratically, and long histories retain all revisions; provider packing, memory/worker budgets and larger-history benchmarks are alpha gates. There is no automatic backup scheduler or production Notes UI yet.

The foundation and its conformance harness are ready for the next authorized phase. The [current contract and recovery runbook](../../foundation.md) and [Phase 3 handoff](phase-3-handoff.md) identify concrete broker/provisioning, UI, offline and release work. Repository reorganization and unrelated pre-existing changes were preserved. Phase 2 stops here.
