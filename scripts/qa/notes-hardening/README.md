# Phase 6 durability and resource qualification

These drivers exercise the production shared screen, encrypted repository, stream engines and Google pack adapter. Provider accounts, HTTP and content are synthetic. No production route, bypass, credentials, migration, installation or hosted access is added. Read the [Phase 6 report](../../../documentation/notes/reports/phase-6/report.md) and [evidence index](../../../documentation/notes/reports/phase-6/evidence/README.md) for scope and failed diagnostic attempts.

Use installed Node 24 and Chromium. Set `NOTES_PLAYWRIGHT_MODULE` to the available Playwright ESM entry if it is outside this repository. Build and preview the existing isolated entry:

```sh
npx vite build --config scripts/qa/notes-workspace/vite.config.mjs
npx vite preview --config scripts/qa/notes-workspace/vite.config.mjs
```

The output is disposable `/private/tmp/sylf-notes-phase3-ui`, on loopback 4390. The QA entry exposes the actual shared modules only inside this fixture; production does not import it. Run timing profiles sequentially on an otherwise quiet machine, then close your owned preview:

```sh
node scripts/qa/notes-hardening/backlog.mjs
node scripts/qa/notes-hardening/resources.mjs
node scripts/qa/notes-hardening/soak.mjs
node scripts/qa/notes-hardening/restore-cloud.mjs
```

`backlog.mjs` defaults to 1,000 revisions in real Chromium IndexedDB, publishes batches of 100 through the actual pack transport, and reconstructs native text/history in a separate encrypted database. `NOTES_PROFILE_REVISIONS` changes the fixture size. Its controller closes only its own synthetic library and databases.

`resources.mjs` follows 24 actual editor open/close cycles with eight distinct 2 MiB padded, valid 1-pixel PNGs. It checks Blob URL lifetime and image reopening, not megapixel decoding or total process memory. `NOTES_QA_LABEL=before` permits retained URLs only for a deliberately restored baseline source. The default checks complete view cleanup. No production source switching is automatic.

`soak.mjs` writes 1,200 strokes with 33 pressure/tilt/twist samples each, paced 250 ms apart (about five elapsed minutes). It records real confirmed saves, main-window GC samples and DOM counters. It checks provider interruption, reload, cancellable/successful integrity scans, and a whole-library download imported through the actual file input in a separate empty browser profile. `NOTES_SOAK_STROKES` and `NOTES_SOAK_PACING_MS` explicitly change duration; lower settings are smoke tests, not sustained qualification. Two-RAF samples are scheduling opportunities, not physical input latency. Some original run samples overlapped build/functional checks; do not treat them as isolated latency benchmarks.

`restore-cloud.mjs` consumes that complete `soak-results.json` and independent archive. It republishes the retained fine-grained ink history through actual foreground `NotesLibrary` synchronization and reconstructs from provider packs in another fresh profile. It compares exact native state hash, original revision IDs and stroke count, and checks keyboard cancellation/closure of recovery scans at four viewport/appearance combinations. These are simulated cloud transfers, not Drive acceptance.

Focused fault regressions are ordinary Vitest tests. The optional profiler uses fake IndexedDB and lightweight counters without retaining every read result:

```sh
npm run test -- --run __tests__/notes/hardening.test.ts
NOTES_PROFILE_REVISIONS=120 NOTES_PROFILE_PACK_EVERY=10 NOTES_PROFILE_SKIP_AUDIT=1 NOTES_PROFILE_OUTPUT=/absolute/output.json npm run test -- --run __tests__/notes/scalability.profile.test.ts
```

Do not substitute the fake database's large-run timeout for browser performance: its completed transaction list grows and is repeatedly scanned. The retained CPU summary and actual Chromium backlog distinguish this limitation. `NOTES_PROFILE_SKIP_AUDIT` is only a profiler setting; it never disables production verification. The optional profile is skipped in normal regressions.

All new browser drivers except `resources.mjs` accept `NOTES_QA_EVIDENCE`, an absolute directory ending in `/`; resources retain fixed Phase 6 before/after outputs. Existing Notes workspace, ink and PDF drivers now support the same evidence override, including the independent Python export verifier and compiled-worker check. Preserve historical phase evidence. No browser script establishes Safari, Firefox, native WebView, S Pen, Apple Pencil, hardware palm rejection, pen-to-photon or hours-long reliability.
