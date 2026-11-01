# Phase 7 release qualification

This isolated Vite entry exercises production NotesLibrary, encrypted IndexedDB,
handwriting streams, PDF.js, portable archives and provider transport. It is never
imported by the application. Provider replies and input samples are synthetic.
A ten-minute fixture is a bounded test, not proof of hours, physical stylus latency,
Safari/iPadOS, browser-eviction safety or live Google throughput.

`main.tsx` exposes a visible button to start the test, plus progress and JSON results.
The included `preview.mjs` supplies a loopback-only synthetic fixture server with `/qa/reset`,
`/qa/offline`, `/qa/metrics`, `/qa/results` and bounded `/api/notes/drive` responses.
The Phase 7 evidence directory records this run's exact scope and source hashes.
No browser injection, real credentials or production API bypass belongs here.

The opt-in live-export restore test reads only the authorized synthetic test note
that was downloaded using the live UI. Set `NOTES_LIVE_TEST_ARCHIVE` to that file
and `NOTES_LIVE_TEST_EVIDENCE` to a result JSON path, then run:

```sh
npm run test -- --run scripts/qa/notes-release/verify-live.test.ts
```

It imports into a separate empty repository, verifies the expected synthetic text
and all original revision IDs, and never writes to the live account. This proves
portable restoration of that file; it does not prove cloud-only recovery on a
second physical device. Without the explicit path the test is skipped.

To reproduce with installed Node 24, build with
`node node_modules/vite/bin/vite.js build --config scripts/qa/notes-release/vite.config.mjs`,
copy `public/notes-pdf` into `/private/tmp/sylf-notes-phase7-ui/notes-pdf`, then run
`node scripts/qa/notes-release/preview.mjs`. Open its loopback address and use the
visible run button. `NOTES_QA_PORT` selects a separate fixture port;
`NOTES_QA_LIGHT=true` provides custom light appearance for `/workspace.html`.
The preview has no real credentials and must never be exposed as a public server.

After a default Next build in a hidden isolated folder,
`NODE_ENV=production node scripts/qa/notes-release/compiled-worker.mjs` serves a
button-driven smoke test of the actual generated Turbopack worker under production
CSP. `NOTES_NEXT_BUILD_DIR` selects its output folder (default
`dist/.notes-phase7-default-build`). It generates its own blank synthetic PDF unless
`NOTES_WORKER_FIXTURE` explicitly selects a test fixture. This is an isolated
worker check, not hosted Google/authentication acceptance.

For readable Drive PDF qualification, build into a separate output with
`NOTES_QA_OUT_DIR=/private/tmp/sylf-notes-phase7-pdf-ui` and serve it with
`NOTES_QA_OUT_DIR=/private/tmp/sylf-notes-phase7-pdf-ui NOTES_QA_PORT=4395`.
Open `/drive-pdf.html` and use its visible run button. It mounts a synthetic
BlockNote editor to seed real Yjs content, then renders from read-only durable
snapshots without changing native revision IDs. Rich text, title-only, handwriting
and annotated PDF samples/results are synthetic and retained separately. Copy
`public/notes-pdf` into that chosen output before serving. This does not test live
Google upload, OAuth or another device.
