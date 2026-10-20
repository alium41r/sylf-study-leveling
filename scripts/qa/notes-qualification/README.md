# Notes foundation qualification harness

Internal synthetic data only. This imports the actual `lib/notes/` modules; it is not a production route or a cloud connection. Test database names must start with `sylf-notes-qualification-`. Run with the repository's Node 24 environment and installed dependencies. Do not point this harness at user libraries.

```sh
npm run test -- --run __tests__/notes
npx vite build --config scripts/qa/notes-qualification/vite.config.mjs
npx vite preview --config scripts/qa/notes-qualification/vite.config.mjs
```

In another terminal, use an already installed Playwright module and browser:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
NOTES_EVIDENCE_DIR=/absolute/path/to/output \
node scripts/qa/notes-qualification/browser.mjs
```

The built harness uses loopback port 4389. `NOTES_QUALIFICATION_OUT` overrides the temporary build directory. The build emits `client-boundary.json`, auditing the actual shared editor import graph for server modules. For React development StrictMode qualification:

```sh
npx vite --config scripts/qa/notes-qualification/vite.config.mjs --host 127.0.0.1 --port 4390 --strictPort
```

Run the driver with `NOTES_HARNESS_URL=http://127.0.0.1:4390/`, `NOTES_CHECK_FILTER=StrictMode` and a separate `NOTES_EVIDENCE_DIR`. Stop both servers when finished. The browser driver uses disposable contexts and synthetic accounts, plus a temporary persistent profile for the full browser-process crash test; it tests injected quota failures, not filling the physical disk. Offline testing covers an already loaded shell; it does not claim offline cold boot.

See [Phase 2 evidence](../../../documentation/notes/reports/phase-2/evidence/README.md) for measured scope and limitations. No tool installation is part of the harness.
