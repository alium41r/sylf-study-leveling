# Notes Phase 3 qualification

This isolated entry imports the **actual** Notes screen, Sylf shell/providers, repository, editor and transport. Its only test seams live in this directory: synthetic HTTP responses, captured library reference, simulated ownership and IDB quota exceptions. It is never imported by the production web/mobile entry. No production local-only provisioning flag exists.

Use Node 24 and the already installed dependencies. Point `NOTES_PLAYWRIGHT_MODULE` to an available Playwright ESM module (the test host used the bundled Codex runtime); no installation is performed by these scripts.

```
export NOTES_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs
npx vite build --config scripts/qa/notes-workspace/vite.config.mjs
npx vite preview --config scripts/qa/notes-workspace/vite.config.mjs
```

In a separate terminal, run sequentially:

```
node scripts/qa/notes-workspace/browser.mjs
node scripts/qa/notes-workspace/accessibility.mjs
node scripts/qa/notes-workspace/performance.mjs
node scripts/qa/notes-workspace/offline.mjs
```

The build goes only to `/private/tmp/sylf-notes-phase3-ui`; the preview listens on loopback port 4390. The offline worker driver starts and closes its own loopback server on 4391. Browser contexts/cloud fixtures are disposable; the renderer crash is intentional. Drivers write current evidence to `documentation/notes/reports/phase-3/evidence/`. Stop preview after testing. The synthetic Drive relay has no connection to Google; consent, deployment CORS/cookies and physical/native behavior require the separate live checklist.

Unit/contracts: `npm run test -- --run __tests__/notes`. Metadata SQL: `node scripts/test/test-notes-postgres.mjs` uses the existing `postgres:17` image with `--pull=never`, creates only a disposable loopback database, and removes its own container. It never reads a hosted database URL. It does not install Docker or pull an image.
