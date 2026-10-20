# Phase 2 handoff — durable Notes foundation

**Prepared 19 October 2026; not started.** Follow Phase 0's sequence: Phase 2 builds the durable foundation; Phase 3 adds the useful typed cloud alpha; Phase 4 qualifies handwriting; Phase 5 reaches OneDrive parity; Phase 6 adds PDFs. Reliability remains a gate throughout. Move native durability earlier if the approved product promise requires it.

## Inputs and scope

Use the [Phase 1 contracts](../../architecture-contract.md), [qualification record](qualification.md), pinned [experimental lockfile](prototype/package-lock.json), and [Phase 0 roadmap](../phase-0/report.md). Adopt the tested library versions deliberately in a later authorized implementation; do not import this prototype as production code. Resolve the three product choices in the [report](report.md) before shipping provisioning/offline retention or freezing the production encrypted/unencrypted format.

Phase 2 should deliver a shared engine and internal diagnostic harness, not the complete Notes workspace, handwriting toolbar, PDF editor, AI or database migrations by default. Fake cloud adapters are development-only. Mandatory cloud onboarding remains a production invariant; a foundation test harness is not permission to release a local-only product.

## Work packages and dependencies

| Order | Work and owner boundary | Deliverable / acceptance |
| --- | --- | --- |
| 1 | Freeze envelope schemas and adapter versions under a single `lib/notes/` authority. | Strict schemas, byte fixtures, document/stream/asset IDs, migration policy, unknown-version read-only behavior. Portable export/import preserves content and asset digests. Reject duplicate/traversal/oversized ZIP entries before activation. |
| 2 | Implement repository abstraction and Dexie adapter. | Journal/outbox/revision transaction, scoped operation idempotency, collision detection, staged-asset recovery and exact acknowledged revision IDs. Inject abort at every boundary; no partial acknowledgement. |
| 3 | Add engine lifecycle and ownership fencing. | Account/library/epoch checks before and after asynchronous work; tab coordination with fallback; remote-update origin handling and local undo boundaries. Independent tabs and stale callbacks cannot write/upload into the next owner's library. |
| 4 | Add client-only BlockNote adapter in an internal harness. | Reload and renderer-crash restore; no JSON re-seeding; normalized interchange plus preserved native lineage. StrictMode mount/unmount and callback cleanup do not leak writers. No server-only import in Next or mobile client. |
| 5 | Implement provider-neutral immutable commit engine using fault-injectable fake transport. | Durable upload pack transitions, read/hash verification, unknown response reconciliation, cursor atomicity and fresh-device recovery with missing index. Merge all valid heads; distinguish incomplete/corrupt objects from deletions. |
| 6 | Establish recovery UX and local upgrade/export paths. | Accurate saving/pending/verified/error states; non-destructive migration, export of recoverable data, tombstone-versus-edit handling, deterministic folder-cycle recovery. No cloud GC. |
| 7 | Prepare scoped production integration contracts for Phase 3. | Credential-broker API design, OAuth setup checklist, CSP/CORS plan, offline-shell design and trusted-device threat model. Separate schema/migration proposal if server bindings require it; do not silently repurpose calendar tables. |

Keep the first production schema deliberately small: paragraphs, basic styles, headings, lists, links and asset references. Tables/complex blocks require fixtures before inclusion. Preserve opaque unsupported extensions. Flow and page document envelope types exist, but a handwriting/PDF editor is not a Phase 2 deliverable.

## Required Phase 2 verification

- Real IndexedDB failures, quota exhaustion and interrupted staging: acknowledged revisions restore; unacknowledged edits are labelled accurately and recoverable where possible.
- Same-lineage disconnected edits, duplicate/reordered delivery, local undo, reload, two live tabs, tab leader death and cancellation during owner change.
- Lost upload response after remote success; corrupt/truncated bytes; missing dependency; interrupted download page; expired cursor; throttling; duplicate provider locators; unavailable root. These initially use conformance fakes and must not be described as live provider tests.
- Fresh profile reconstructs both concurrent heads without mutable hints/catalogs; deletion/edit transitive ancestry and old-epoch return preserve alternatives; index corruption rebuilds without changing source.
- Export/import and interrupted upgrade preserve originals, hashes, IDs and unknown fields. Unsupported newer formats never become empty writable notes.
- Next production build, relevant tests, strict TypeScript and changed-file ESLint. Run existing mobile build and verification once shared client source changes. Visually verify actual Sylf shell in light/dark/custom modes and desktop/tablet/phone sizes.
- Provisional performance gates from [qualification](qualification.md): ordinary-save p95 ≤250 ms and cached open ≤500 ms on an explicitly selected baseline device. Collect enough samples and compare exact acknowledged revisions; four fast probe saves are insufficient release evidence.

## Cloud setup and later gates

Before Phase 3 alpha, register development/production redirect URIs and Notes consent purpose; obtain disposable Google `drive.file` test accounts/grants. Before claiming OneDrive support, obtain delegated AppFolder grants for both personal and work/school accounts. Test create/list/read/hash, restart discovery, pagination/delta, refresh/revocation, account mismatch, quota, uncertain upload and browser CORS/CSP in the real origin. Test resumable endpoints separately; keep small-object fallback within least privilege if necessary. No broader scopes without review.

Before enabling offline cold launch, design a versioned static shell cache, explicit local unlock and update/rollback policy. Exclude authenticated API responses and credentials; test offline boot, expired session, explicit logout, owner switch and an interrupted service-worker update. The existing pass-through worker must not be treated as already sufficient.

Before handwriting/PDF launch, use real Apple Pencil/S Pen/Windows pen, mobile IME/composition, and representative malformed/rotated/cropped/encrypted/signed/large PDF corpora. The 300-page/20,000-stroke stress fixtures and physical input latency gates remain outstanding.

## Exit evidence

Phase 2 ends with engine contracts implemented and tested, fixture corpus, failure/recovery runbook, bounded performance evidence, integration diff and an explicit list of unmet external gates. It does not end with an unsupported claim that Notes cannot lose data. Launch remains blocked on the approved durability/privacy policy and the applicable provider/device evidence.
