# Notes interface Phase 1 checks

These scenarios use the real shared Notes UI, encrypted repository, BlockNote/ink adapters and PDF reader. Account/Drive HTTP is synthetic. No production authentication bypass is added.

Use the repository's Node 24 runtime and installed dependencies. Build and serve the existing Notes QA entry:

```sh
npx vite build --config scripts/qa/notes-workspace/vite.config.mjs
npx vite preview --config scripts/qa/notes-workspace/vite.config.mjs
```

In another terminal, set `NOTES_PLAYWRIGHT_MODULE` to an installed Playwright ESM entry if Playwright is not resolvable by package name, then run:

```sh
node scripts/qa/notes-redesign/run.mjs
npm run test -- --run __tests__/notes
```

The runner creates disposable browser contexts and stores screenshots/results in `documentation/notes/reports/2026-10-23-interface-phase-1/evidence/`. It covers mixed text/ink, reload, zoom, placement, copying, focus/docking, responsive custom appearances, folder hierarchy, PDF/image imports, composite readable PDF and sustained typing. Failure diagnostics are retained if a scenario fails. It does not qualify physical stylus hardware or a live Google account.
