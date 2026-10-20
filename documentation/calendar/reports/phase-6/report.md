# Calendar Phase 6 — implementation and final handoff

Date: 2026-10-18. This report describes this checkout and local qualification, not a deployed production release. **Full production readiness is not claimed.** Phase 5 credentials, deployment, scheduler and real Google/Outlook account qualification remain deliberately postponed.

## Implemented experience

- Existing notebooks now offer **Handwriting to text** contextually. Users can select strokes with pen/mouse, recognize a selection or up to six horizontal lines, edit the result, copy it, append it to the typed note, and explicitly save reviewed text for search. Original editable strokes are preserved. Choosing selection collapses the recognition inspector so the writing surface remains usable; completing a selection reveals its recognition controls.
- **Calendar settings → Advanced Options → Find in notebooks** searches titles, typed text and reviewed recognized text. Inclusive date bounds and recognized-only filtering are supported. Results identify the note/date and open the full original document before autosave can mount. Search is debounced, cancellable and paginated; errors do not present stale results as current matches.
- **Calendar settings → Shared calendars** supports creation, naming, exact-Sylf-username invitations, acceptance/decline, viewer/editor permissions, removal, leaving and owner deletion. Shared events use the normal event editor, views, recurrence engine and recovery. The destination is explicit in More options; private Sylf remains the default. Shared event labels identify their calendar.
- The existing floating **Sylvie** searches private notebooks and reads shared commitments. Accepted shared destinations are discoverable through existing connection tools; supported shared event changes use the established signed confirmation flow. No additional assistant, model backend or scheduling authority was introduced.
- Default calendar navigation remains simple. Recognition stays in notebooks, collaboration stays in settings, search stays in Advanced Options, and ordinary calendar use does not depend on AI, recognition downloads or provider configuration.
- Refined phone layouts: calendar navigation/actions wrap correctly at 320px, keeping settings reachable. Removed doubled settings separators. Ink preview bounds now iterate points instead of spreading potentially 50,000 coordinates onto the call stack. Existing typography, semantic appearance tokens, modal behavior, study details and annotations remain in place.

## Recognition choice, privacy and limits

The chosen implementation is **Transformers.js 3.8.1 + pinned quantized TrOCR small handwritten English**, running in a dedicated browser WebAssembly worker. Model: `Xenova/trocr-small-handwritten`, revision `2432e24d184b1d964d07ed04f5d9e21d31a59141`; engine identity `trocr-small-en-2432e24-q8`.

Research informed this choice:

- The [browser handwriting API](https://developer.chrome.com/docs/web-platform/handwriting-recognition) has limited platform availability and is unsuitable as Sylf's only cross-device implementation.
- [Tesseract.js's own FAQ](https://github.com/naptha/tesseract.js/blob/master/docs/faq.md) excludes ordinary handwriting as a supported use case.
- [Microsoft's TrOCR model card](https://huggingface.co/microsoft/trocr-small-handwritten) describes single-line handwriting input. [The ONNX conversion](https://huggingface.co/Xenova/trocr-small-handwritten/tree/main/onnx) provides smaller quantized encoder/decoder weights. [Transformers.js browser guidance](https://huggingface.co/docs/transformers.js/v3.8.1/tutorials/react) provides the local runtime approach.

Selected pen vectors are rasterized into normalized dark ink on white, grouped by horizontal overlap and read line by line. No handwritten image or geometry is sent to a recognition server. Model files are fetched only after explicit recognition; downloading public weights still contacts their host. No paid recognition API, user model key or Supabase binary storage is required. This is not handwriting recognition by Sylvie's conversational model.

One run is limited to six lines, 1,000 selected strokes, 96 generated tokens per line and a three-minute timeout. The worker terminates on completion, failure, cancel, notebook unmount or logout. Runtime/model downloads are approximately 80–90 MB initially; browser model/HTTP caches are reused when available. Slow, unsupported or first-use-offline devices receive an honest error and keep their original ink. Modern Worker/WebAssembly/OffscreenCanvas support is required. Ordinary horizontally written English is the supported input; math, diagrams, multilingual text, columns and whole-page layout analysis are not promised. Recognition is imperfect and always reviewed before indexing.

Transformers.js's Apache-2.0 license and bundled dependency notices are emitted with the worker; ONNX Runtime's MIT notice is included. Microsoft's [source repository license](https://github.com/microsoft/unilm/blob/master/LICENSE) does not by itself settle model/training-data distribution rights. The selected model card does not declare an explicit model license field. Confirm upstream model/IAM-related terms before public/commercial rollout; no claim of verified commercial model licensing is made here.

## Notebook persistence and search architecture

The original `CalendarNote.document` v1/v2 vector document remains the only editable notebook source. `CalendarNoteRecognition` contains reviewed text, selected stroke UUIDs, canonical source hash, engine and a separate revision. No screenshot, alternate notebook or duplicate vector document is stored for recognition/search.

A recognition save locks the owner's note, checks the note revision, verifies every selected stroke and its canonical SHA-256 source, and applies its own result revision. Identical acknowledged-late retries replay. Limits are 20 results and 16,000 recognized characters per note; each result is at most 4,000 characters with at most 1,000 stroke references. The original notebook save path prunes derivatives whose source ink changed; title/typed edits preserve valid recognition. Removing a derived result never removes ink. Concurrent edits fail clearly instead of replacing another review. Unsaved review drafts use owner/note-scoped device recovery and logout cleanup; storage failure is disclosed with unload protection.

A `tsvector` lives on the existing note, with a GIN index. Triggers maintain title/typed/reviewed lexemes and skip rebuilding for ink-only samples unless recognition invalidation changes indexed text. Generated short preview, handwriting-presence and document-mode columns avoid detoasting/transporting every notebook document for calendar ranges. Notebook cells now use short text/handwriting indicators; full editable ink loads on opening. Calendar annotations retain full geometry because their visible semantic anchors need it.

`GET /api/calendar/notebooks` searches with at most ten prefix-keyword terms, inclusive optional start/end dates, optional `recognizedOnly`, and a date/ID cursor. It returns 20 bounded excerpts, never source geometry. `GET ?noteId=<UUID>` reads owned recognition; POST saves reviewed text with note/result revisions; DELETE removes a revision-matched result. Every path uses `getSession`, resource ownership, no-store responses, bounded inputs and cross-site write rejection.

## Collaboration security model

`SharedCalendar` is an explicit event container. `SharedCalendarMember` starts PENDING, then becomes ACTIVE only on the invited user's acceptance. Roles are VIEWER or EDITOR; owners alone administer membership, rename or delete. Members can leave; owners can revoke or change roles. Limits: ten owned calendars, twenty invited people per calendar, forty active invited memberships and fifty catalog entries. Owner/member list exposure is bounded; only owners receive the management member list. Invitations use usernames rather than disclosing account email addresses.

Shared events reuse `CalendarEvent.sharedCalendarId`, existing recurrence exceptions, event revisions, mutation identities and recovery. Storage `userId` remains the calendar owner so editor departure does not delete shared events. Every shared write locks its calendar and checks the **current accepted role inside the transaction**. Membership mutations take the same row lock. Membership administration uses the current calendar revision; capacity checks serialize on the relevant user row. Ordinary personal-event writes explicitly require a null shared container, preventing another path from bypassing shared permissions.

No shared container relates to private notebooks, recognized text, study records, goals, Planner state, Sylvie conversations, provider credentials or provider event caches. Sharing does not expose the owner's personal/default calendar or connected calendars. Direct browser database roles have no table privileges and RLS is enabled. APIs use session ownership/roles rather than trusting caller-supplied identity. Deleting a shared calendar cascades only its shared native events/members. Notes and private events remain intact.

Accepted shared events compose with existing private/provider projections. Read-only event editors and drag handles respect VIEWER permission, but server checks are authoritative. Visible shared calendars refresh through the existing 30-second projection polling path, including calendars with no events. This is intentionally not simultaneous document editing or guaranteed instant revocation of already-viewed information.

**Shared event reminders are explicitly unsupported in this implementation.** Existing native reminder receipts/delivery remain personal-only; shared creation clears reminders in the editor and rejects nonempty reminders server-side. This prevents incorrect cross-member delivery or silently competing receipt authorities. Provider-managed reminders and existing personal reminders remain unchanged.

## Sylvie contracts and boundaries

- New `searchCalendarNotes` accepts bounded keywords, optional inclusive dates and recognized-only filtering. It returns at most eight private excerpts with truncation/refinement information; no raw vectors or invented handwriting interpretation.
- `readCalendarNotes` now includes bounded reviewed recognition for the requested date. Retrieved text remains untrusted reference data.
- `getCalendarConnections` additionally lists accepted shared calendar IDs, names and roles. `readCalendar` can filter event matches by `sharedCalendarId`; workload summaries still consider the user's commitments.
- Existing create/update/delete proposals carry an explicit shared destination where applicable. Shared visibility is disclosed in the review. Viewers/pending/removed members cannot write. Signed confirmation, revision checks, idempotency, existing metering/model routing and failure handling remain authoritative. Shared event role/calendar revisions participate in schedule fingerprints; write-time permission checks remain authoritative even for an empty shared destination.
- Membership administration stays in settings. Study schedule changes still require the authoritative Planner pathway; no Planner V2 functionality is enabled. External synchronization/ETags and failure coverage remain Phase 5's authority.

## Performance and storage audit

[Measured local database evidence](evidence/notebook-performance.json) used disposable PostgreSQL-compatible PGlite, **1,000 notebooks × 500 vector points**, not hosted user data. Results are local qualification, not Supabase production throughput guarantees:

| Measurement | Result |
| --- | --- |
| First 20-result keyword page | 87 ms |
| Full-document comparison payload | 7,216,001 bytes |
| Calendar preview response for those 1,000 notes | 300,894 bytes, approximately 96% smaller |
| Average stored source document | 4,165 bytes |
| Average derived search vector | 109 bytes |
| GIN index in this fixture | 180,224 bytes |

The common keyword matched every note, so PostgreSQL chose a sequential scan on this small dataset; the captured plan is retained rather than claiming artificial GIN acceleration. Owner/date indexes, the GIN index and bounded keyset results support larger catalogs. Recognized text is bounded and vectors remain stored once. Actual per-user storage varies with point count, typed length, compressibility and index overhead; these measurements are not a universal quota estimate.

A packaging audit found WASM duplicated twice inside the initial worker. The final build emits a separate runtime and enforces a 3 MiB JavaScript worker ceiling: approximately **830 KiB JS + 21 MiB WASM**, instead of 56 MiB embedded JS plus runtime. Public assets are generated separately and loaded only on explicit recognition. Model weights stay in browser caches, not deployment artifacts or Supabase. No recognition network request occurs on ordinary calendar opening.

Existing bounded recurrence expansion/exception queries, provider cache horizons, sync/outbox backoff and note/event recovery were retained. No speculative caching service, paid infrastructure, duplicate scheduling engine or unbounded provider history was introduced. Annotation payloads still need their full bounded vector documents; very dense annotation histories and target-device memory/latency should be monitored during real usage.

## Verification

- Focused calendar/Sylvie tests: **205 passed**, with **33 database tests intentionally skipped** outside the isolated runner. The isolated database run separately passed **33/33** across native persistence, external-provider infrastructure, recognition/search and shared permissions. A final focused Sylvie run passed 14/14, including an additional bounded shared-discovery regression. Tests cover ownership, pending/viewer denials, accepted editor writes, stale revisions, source preservation/invalidation, recurrence, leaving/revocation, cascade isolation, browser-role privileges, pagination and the 1,000-note fixture. Final logs are beside this report.
- Route type generation, strict TypeScript and changed calendar/Sylvie ESLint passed. Production web build passed. Mobile build and server-symbol/secret verification passed.
- Actual Chromium worker inference, including a clean production security policy with WebAssembly allowed and JavaScript eval disallowed, transcribed the reference sample as “Mr. Brown commented icily.” The complete Sylf input path recognized eight manually drawn HELLO strokes as “Hello”; correction, reviewed save, recognized-only search, opening the original document and rectangular selection were exercised. All eight source strokes survived. The optimized worker also passed production-mode inference in about 23 seconds ([evidence](evidence/production-recognition.json)). Device-storage failure was injected: closing was blocked with a clear explanation until the review could be saved or deliberately discarded. These are functional examples, not a broad accuracy benchmark.
- [Browser evidence](evidence/browser-checks.json) records **48 checks**: notebook/recognition, populated sharing settings and search at 390/820/1440px across light mint, dark navy, light mode with dark background and dark mode with light background; month/week/day at three widths; advanced views at 320px. No WCAG A/AA violations or document/dialog overflow were detected in those runs. Screenshots were visually inspected. A subsequent interaction check caught a clipped settings button at 320px despite a non-overflowing root; wrapping fixes made it reachable and a final screenshot records that correction.
- Real shared-calendar creation and event creation were exercised through the existing editor. Search fetched the complete original notebook before editing, preventing preview data from replacing ink. Temporary QA notes/events/calendars are removed after verification; no real user invitations or external accounts were used.

## Remaining qualification and deployment

1. Apply ordered migrations through `20261018030000_calendar_completion`, regenerate Prisma and deploy schema cache version 36. This phase's additive migration was tested in isolation and applied to the configured development database. Use the repository's normal production migration process; never replay already-applied non-idempotent SQL blindly.
2. Install locked npm dependencies and run the established build scripts. They prepare `public/calendar-recognition/`; deploy the generated worker, runtime and license files. The generated directory is ignored by Git. CSP allows same-origin workers/WASM compilation and the scoped Hugging Face model-download hosts; general JavaScript eval remains disallowed in production. Confirm deployment/CDN headers and storage behavior.
3. Complete the [Phase 5 provider/deployment guide](../phase-5/setup.md): stable callback/notification URLs, Google Calendar permissions, Microsoft Entra app, server-side encryption key/secrets and scheduler. Then qualify Google/Outlook/ICS with real accounts, refresh/revocation, conditional writes, recurrence, notifications and recovery. Phase 6 did not need or configure those deferred credentials.
4. Confirm recognition model/distribution terms and qualify accuracy/latency/storage on supported physical iPad/Apple Pencil and Android/S Pen devices, Safari and Capacitor WebViews. Chromium mouse/pointer tests and a mobile bundle build are not physical stylus or WebView qualification. Model errors remain correctable and original ink remains available.
5. Existing reminder delivery still requires the app to run; there is no push/closed-browser guarantee. Shared reminders, recognition of equations/diagrams/multilingual layouts, collaborator access to notes/providers and simultaneous ink editing are unsupported, explicitly separated from implemented capabilities.

The six implementation phases form one calendar system with reusable authorities and independent normal operation. Production approval remains conditional on the external-account, deployment and device/model qualifications above.
