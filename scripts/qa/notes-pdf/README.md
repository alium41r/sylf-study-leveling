# PDF qualification

These scripts exercise production PDF modules and the actual shared Notes screen. All learning material is original synthetic content; provider accounts/grants/HTTP are synthetic. There is no production local-only onboarding flag, hosted database access or live Google test. The QA entry is not imported by production.

Use Node 24 and existing installed packages. Set `NOTES_PLAYWRIGHT_MODULE` to an available Playwright ESM entry (qualification used the bundled runtime; these scripts install nothing). Generate matching assets before building the shared-screen fixture:

```sh
node scripts/build/build-notes-pdf-assets.mjs
npx vite build --config scripts/qa/notes-workspace/vite.config.mjs
npx vite preview --config scripts/qa/notes-workspace/vite.config.mjs
```

Output goes only to `/private/tmp/sylf-notes-phase3-ui`, served on loopback 4390. Stop your preview after testing. In a separate terminal, run sequentially; keep timing runs otherwise quiet:

```sh
node scripts/qa/notes-pdf/browser.mjs
node scripts/qa/notes-pdf/performance.mjs
npm run test -- --run __tests__/notes/pdf.test.ts
```

`fixtures/lecture.pdf` has text/vector/landscape pages, a nonzero CropBox, source rotation and UserUnit 2. `large-300.pdf` has 300 pages, vector worksheets, searchable text and a six-megapixel JPEG shared across 15 pages. `password.pdf` is an encrypted copy of owned fixture content, used only to confirm explicit rejection. `generate-fixtures.mjs` reproduces the two unprotected fixtures; metadata dates can change file hashes. The protected fixture can be regenerated using pypdf `PdfWriter`, appending `lecture.pdf`, and `encrypt("sylf-test-password")`. No proprietary content is inspected or copied.

The browser driver intentionally crashes its own renderer. It verifies acknowledged-state recovery, not survival of unsaved memory. Offline/concurrent/fresh-profile workflows use real contexts and encrypted IndexedDB against a synthetic transport. It writes the current Phase 5 evidence, including actual downloaded PDF/recovery files. `performance.mjs` records inspection/import, first page, six navigations, search, real worker export and bounded attached canvas metrics; worker/GPU/process memory are excluded.

After browser exports, independently verify structure and pixels with already available pypdf, Pillow and Poppler:

```sh
python3 scripts/qa/notes-pdf/verify-exports.py --pdftoppm /absolute/path/to/pdftoppm
```

Use a per-run `FONTCONFIG_FILE` if the host needs system-font discovery; no agent/system configuration change is required. Inspect the generated export PNGs visually, especially Unicode comment wrap and rotated alignment. This synthetic corpus does not qualify all PDF fonts/forms/signatures or physical pen behavior.

After `npm run build`, qualify the actual generated Next/Turbopack export worker under the existing production CSP:

```sh
NODE_ENV=production node scripts/qa/notes-pdf/next-worker.mjs
```

This locates the generated worker factory, serves only built static chunks on a disposable ephemeral loopback port, runs a source-copy job, and closes its server/browser. It adds no production test route or authentication bypass. It is not deployed OAuth/cookie acceptance. Build output names are recorded per run, not pinned source contracts.

To rerun existing Notes workflows without overwriting historical evidence, set `NOTES_QA_EVIDENCE` to an absolute output directory **ending in `/`**, then run these PDF drivers/verifier, `notes-ink/{browser,performance}.mjs`, or `notes-workspace/{browser,accessibility,offline,performance}.mjs`. The compiled worker also accepts this override. Current evidence and exact scopes are indexed in the [Phase 5 evidence](../../../documentation/notes/reports/phase-5/evidence/README.md).
