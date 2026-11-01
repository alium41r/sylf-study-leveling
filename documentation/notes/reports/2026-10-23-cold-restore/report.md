# Cold library download repair

**23 October 2026. Local repair qualified. Deployment intentionally deferred at the user's request; Vercel unchanged.**

## Diagnosis

The user confirmed the stalled page was `sylf-nmeze1hvi-alium41rs-projects.vercel.app/notes`, the preceding immutable deployment, and that it eventually loaded after approximately three or four minutes. Each deployment hostname is a separate browser-storage origin, so the canonical site's local vault cannot appear there automatically. Immutable URLs also retain old code after subsequent releases.

The transport's four-pack cache discarded tiny history packs before a genuinely empty device finished resolving their causal dependencies. The prior seven-pack test already held source objects locally and did not expose this failure. The new twelve-pack, newest-first history regression starts with an empty encrypted destination: the prior deployed transport performs **34 reads for 12 packs**, while the repair performs **12 reads**, preserving the exact final text. This is a deterministic synthetic read-count result, not a live provider throughput measurement.

The actual Google metadata-only check succeeded: ACTIVE connection, verified enrolled root, **51 packs totaling 1,355,803 bytes**, one listing page. No private note bodies were downloaded, reconstructed or output by that check. Provider connectivity is presently working; this does not retrospectively prove the user's browser network was healthy throughout the reported delay.

## Repair

- Bound cached verified payload by bytes (16 MiB) and files (128), with LRU eviction and shared in-flight reads. Read two enumeration packs concurrently and up to four dependency-search packs concurrently. Retain original hash, identity, size, epoch and causal validation. No disk schema, cloud format, key or dependency changes.
- Expose each existing atomically installed pull page before the full library scan completes. Known local notes can open while organization is absent. Creation remains gated until the original catalog is available or a complete empty scan establishes safe creation. Full discovery remains mandatory before native verification/publication cleanup.
- Show first-download network failures immediately, including partial-download failures. Stop the empty-screen spinner and provide a recovery action. Preserve quiet transient-outage behavior for an already available library. Retry resumes the existing synchronizer and durable cursor.
- Hand an authenticated empty Vercel origin to the validated permanent Notes URL in the same tab. Source, journal, objects, staged assets, quarantine, outbox or retained failed edits prevent handoff. Native/hash shells and local development stay in place. This cannot alter the old immutable URL's binary; use the permanent production address to receive releases.
- During partial first restore, optional view positions wait for organization availability rather than blocking document navigation. Previously saved positions and all actual note changes remain intact; positions visited before the catalog arrives are not newly persisted during that interval.

## Qualification and boundaries

**210 active Notes tests passed; one optional scalability profile skipped against the exact isolated runtime.** The concurrently changing shared checkout also passed 214 tests, including four unrelated page-layer tests. Those unrelated frontend/library changes were preserved in the root and excluded from this release. The candidate uses the prior reviewed runtime plus six scoped recovery changes; its source manifest identifies 47 cumulative runtime overlays.

The isolated production webpack build/typecheck, targeted lint, mobile build and mobile server/secret-boundary audit passed. A first candidate attempt exposed frontend props from concurrent work; the final candidate instead applies only the recovery hunks onto the previously deployed library/screen. No shared work was reverted. An initial isolated PDF suite lacked its synthetic fixture; copying that test fixture allowed the complete unmodified PDF suite to run. No check was disabled.

New tests cover truly empty history restoration, progressive availability while a later pack is held, no replacement catalog during incomplete discovery, preserved staged originals, empty-origin handoff, first-download failure visibility, canonical URL validation and account fencing. Existing crash/quota/corruption/portable/history/ink/PDF tests remain included.

Real Chromium inspected the exact candidate with a synthetic provider: desktop dark/custom-purple failed download, successful retry after provider restoration, and 390×844 custom-light/green phone failure with zero horizontal overflow. This is separate from Google acceptance. Temporary viewport overrides were reset. No personal note bodies, cloud files or real browser storage were changed for this repair.

Automatic approval review rejected a proposed full private-library reconstruction because earlier cloud-test authorization covered synthetic test-folder data. The action was not executed. Metadata-only live checks and synthetic cold restoration were used instead; no live full-library restore latency or independent physical-device acceptance is claimed.

## Deployment handoff

The user explicitly deferred deployment after local qualification. The temporary device-sign-in attempt ended without credentials; its authorization tab and synthetic test tabs are no longer open, and both owned local test servers were stopped. No deployment was uploaded and no production infrastructure was changed for this repair.

The isolated candidate and source manifest are retained for a later approved release. Final offline checks matched all 47 scoped source hashes and found no configured private values in those sources or 310 compiled client files. No environment files were copied. The temporary authorization directory and candidate-only dependency symlink were removed.

Before any future deployment, compare the candidate with the then-current production and concurrent agent changes, inspect the exact upload plan, repeat the configured-private-value scan after any source changes, confirm the permanent alias and perform a scoped live cached-opening check. Do not replace newer frontend work without integration review. These future deployment checks are not claimed as completed.

See [evidence](evidence/README.md), the [release manifest](evidence/release-candidate.json), and the [current contract](../../workspace.md#first-download-and-deployment-addresses).
