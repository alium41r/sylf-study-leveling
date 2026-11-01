# Sylf Notes Phase 7 — release qualification

**22 October 2026. The approved update is deployed and its named PDF copies work in Google Drive. Controlled public pilot: gated on independent clean-profile recovery. Tablet and broader-browser release remain unqualified.** Accessible checks are complete; external gaps below are explicit. No subsequent phase was started.

## Delivered fixes

- **Local first, quieter cloud:** local transactional saves remain immediate. Automatic Drive work waits for 30 seconds without editing; readiness is checked every five seconds. Leaving/changing a note requests a pass after its local save drains. Unchanged polling is two minutes. Resuming input stops later transfer/publication batches; hidden-tab completion is best effort. Local status and verified cloud status are distinct. Continuous writing can remain local until a pause, so device loss before upload is still a risk.
- **Draft policy:** a new empty default-titled note/notebook stays on-device, with pending work retained. Naming it, adding content, or importing a supported asset makes it eligible. A title-only note is included. Previously synchronized native history keeps syncing even when emptied; this never deletes the retained originals.
- **Readable Drive library:** eligible notes produce **`<note title>.pdf`** in folders matching Sylf names and hierarchy. Handwriting and annotated PDFs use the existing paged export engine; rich text uses a bounded browser-font print layout. PDFs are study copies. Incremental native packs preserve editability, identities and revision history; manual portable `.sylfnote` export/import remains available. Automatic full-history archives on each publication were replaced by these bounded derived copies.
- **Technical files organized:** **_Sylf system — do not edit** holds synchronization files and retained superseded copies. The retryable organizer verifies hashes/bytes before moving legacy files, preserving IDs. Both layouts remain readable. Nothing was deleted. The actual Drive root no longer showed hash-named packs after organization.
- **Reliable publication:** immutable staging, 4 MiB resumable chunks, owner/connection-bound sealed capabilities and provider checksum/size verification precede visible promotion. Durable scoped hash receipts remember predecessors across reopening without acknowledging native outbox jobs. Failed/lost responses reconcile safely; concurrent copies are preserved. Live Google exposed a file-specific upload-session path rejected by the initial validator; it now accepts only the exact expected file path or collection path on Google's permitted origin. Wrong-file/host regression checks pass.

The Drive owner can still modify the system folder; no owner-proof access restriction is claimed. Google's [hidden app-data space](https://developers.google.com/workspace/drive/api/guides/appdata) requires a different scope and remains owner-removable. No scope was expanded. Uploads follow Google's [resumable contract](https://developers.google.com/workspace/drive/api/guides/manage-uploads). Current limits and storage ownership are in the [workspace contract](../../workspace.md#phase-7-cloud-pacing-and-drive-organization).

## Deployment and live acceptance

The user approved the isolated release, official temporary Vercel CLI and synthetic tests in **Sylf Phase 7 Test**. The final deployment is **READY** at [the permanent Sylf address](https://sylf-alium41rs-projects.vercel.app), deployment `dpl_2TbeS7gQextmCpogJ8zGrSZyibGy`. Its normal Turbopack build took 169.6 seconds. A **44-file reviewed overlay** on the recorded Git base excluded unrelated local edits, environment files and non-runtime evidence. No environment variable, encryption key, OAuth grant or database schema was changed. Temporary CLI credential files were removed after acceptance.

| Live check | Actual result |
| --- | --- |
| Existing authorized Google connection | Reused successfully; local durable feedback and subsequent verified Drive status observed. No fresh consent or token-expiry drill claimed. |
| Text editing and PDF freshness | Edited only the synthetic note, observed local save, left it, then opened the actual Drive PDF. It contained the new text and all original paragraphs. |
| Folder hierarchy and title-only note | A blank untitled test note produced no visible copy. Naming it without adding a body created the correctly named PDF inside the matching nested folder. |
| Handwriting | Synthetic notebook mouse stroke and two-page navigation retained content; its named PDF appeared in the matching Drive collection. Physical stylus input was unavailable. |
| Actual resumable Google transfer | Production adapter uploaded 4,456,479 synthetic bytes in two chunks. Independent download matched exact bytes/SHA-256 and provider checksum/size. The binary test artifact was retained inside the system folder. |
| Legacy layout | Verified technical files moved without deletion. The final direct organizer pass moved seven; earlier bounded app passes had already moved others. Root visually showed named PDFs/folders and the system folder. |
| Portable recovery | Earlier live export restored through production importer into a separate empty repository: 8,210 bytes, exact original text and all three original revision IDs. Later synthetic edits were additional revisions. |
| Database/configuration | Read-only verified-TLS audit: 70 migration files, matching receipts/checksums, zero pending/unresolved; Notes broker RLS enabled, browser-role direct access denied. Existing canonical origin/key/client presence passed. No database mutation. |
| Final publication endpoint observations | 24 captured publication requests returned HTTP 200. This is bounded acceptance evidence, not ongoing availability monitoring. |

**Not performed:** the user cannot test a fresh browser profile/device now. Same-profile tabs and local fixture databases are not independent cloud-only recovery. The direct adapter probe reused a valid credential and did not exercise refresh. Live PDF import is present in the deployed menu, but automation's file chooser was blocked by the Chrome extension's file-access permission. That permission was not changed or bypassed; no successful live PDF import is claimed.

No personal note body was edited/deleted by testing; normal authorized app synchronization generated its own copies. Synthetic artifacts remain for inspection. No browser storage was cleared.

## Verification and performance

Final source passed **162 Notes tests**, with one opt-in scalability profile skipped; the separate authorized live-export restore passed. Root TypeScript, targeted ESLint, isolated candidate webpack build, final hosted Turbopack build, mobile build and mobile server/secret-boundary audit passed. Production-module tests cover interrupted transfer/retry, quota/crash/corruption retention, account/session isolation, outbox/history reconstruction, scoped publication receipts and conflicting copies. They do not substitute for destructive live-provider drills.

A real Chromium encrypted IndexedDB/PDF.js fixture ran **601.5 seconds**, with 600 synthetic native strokes, 19,800 samples, 601 original revisions and a 30-page PDF. Its simulated provider was unavailable for the first half, then restored during writing:

- **0 automatic uploads while continuously writing**; confirmed local-save p95 **16.4 ms**.
- Ten sampled PDF page renders: maximum **61.9 ms**; subsequent five-pack catch-up **6.56 seconds**.
- Independent encrypted repository recovered exact native state and every original notebook revision ID; portable restore preserved the original PDF hash.

This frozen workload predates the final PDF-publication/receipt refinements. It measures real browser persistence with synthetic input/provider responses, not ten minutes of Google traffic or physical pen latency. Final modules have separate regression/build/live coverage.

A separate real-browser renderer check passed rich text (three pages, Unicode, styles, lists, table and local image), title-only, two-page handwriting and an annotated source PDF. Original revision IDs were unchanged. Rich-text rendering took **1.49 seconds** for the synthetic three-page copy; other samples took 0.14–0.65 seconds. Large exports are bounded and can take longer. The compiled production PDF worker also passed under the existing CSP. Desktop and phone viewport checks included dark and custom-light appearances; viewport simulation is not hardware qualification.

[Evidence and reproduction](evidence/README.md) retain exact source hashes, logs, workload scope and failed-attempt diagnostics. An initial Vercel upload filter incorrectly excluded nested Focus tools; root-only exclusions fixed it before the final successful build. Local isolated Turbopack rejected an external dependency symlink; the candidate webpack build and actual hosted Turbopack build passed. No checks or security protections were disabled.

## Remaining limits and release gates

1. **Before a public pilot:** demonstrate cloud-only reconstruction on a fresh profile/device using the same account and authorized synthetic note, then test independent-device concurrent editing/conflict recovery. The user was unavailable for this check; it remains open.
2. **Device expansion:** physical iPad/Safari/Apple Pencil, Android/WebView/S Pen, Firefox, pressure/palm rejection, IME and assistive-technology workflows are untested. Desktop Chromium is the qualified browser scope so far.
3. **Separate test account/approval needed:** real revocation, wrong-account, provider quota/throttling, external deletion/corruption and encryption-key/database recovery drills. Ownership and restoration of wrapping-key backups are not independently verified. Real internet-disconnected Google editing/reconnect was not run; simulated outages passed.
4. **PDF fidelity:** rich-text copies are rasterized, so text is not searchable/selectable and layout is not exact editor pagination. Audio/video/file blocks are represented descriptively; native assets remain retained. Unsupported blocks, merged table cells and exceeded budgets fail visibly and retain the previous valid copy. An inherited paged-export limitation renders dotted paper as horizontal rules; native template/ink remain intact. This is a documented visual issue, not qualified pixel-perfect export.
5. **Durability boundaries:** local storage remains encrypted; cloud data is provider-readable, not E2EE. Explicit browser storage deletion can remove unsynchronized work. Cold reopening still needs online Sylf authentication. System-folder owner access cannot be prevented. Retained copies/history consume storage; no destructive pruning policy was introduced.
6. **Longer workloads:** hours-long sessions, academic-year histories, total browser/GPU memory, worst-case image/PDF budgets and broad concurrent deployments remain unmeasured. The live PDF picker needs a permitted manual or tool-driven test.

**Readiness verdict:** the deployed fixes passed accessible desktop and real Drive acceptance, including named viewable PDFs and nested title-only publication. Continue supervised acceptance. **Do not open a controlled public pilot until independent clean-profile recovery passes**, and do not advertise tablet/broad-browser production readiness. No additional phase was started.
