# Isolated Phase 1 experiments

**Experimental code only. Not a production Notes implementation.** Copy into a temporary directory before running; do not install dependencies into Sylf or run Next/Vite from this documentation directory. No production feature should depend on these files.

The committed fixture intentionally lacks `node_modules`, build output, PDF worker binaries, copied Sylf implementation and generated PDFs. `.fixture` suffixes prevent contract TypeScript/configuration from entering Sylf's own compilation. `prepare-fixtures.mjs` copies the existing color utility and matching installed PDF worker, and creates a synthetic PDF.

Reproduction requires Node 24 (the run used 24.19.0), npm, an already available compatible Playwright/Chromium runtime, and network permission for package retrieval. Installing a browser is not part of this script. Use a scratch location and disposable browser profile; the tests deliberately delete their synthetic database and crash an isolated renderer.

From a fresh temporary copy of this directory:

```sh
cp tsconfig.json.fixture tsconfig.json
cp src/types-probe.ts.fixture src/types-probe.ts
npm ci --ignore-scripts --no-audit --no-fund
SYLF_SOURCE_ROOT=/absolute/path/to/sylf node prepare-fixtures.mjs
node --test tests/contracts.test.mjs
node node_modules/vite/bin/vite.js build
SYLF_SOURCE_ROOT=/absolute/path/to/sylf node prepare-fixtures.mjs --shell
npm run build
```

Start the two local fixture servers in separate terminals, bound only to loopback:

```sh
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4387 --strictPort
```

```sh
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4388
```

Then run the browser checks with an existing Playwright module (or omit `PLAYWRIGHT_MODULE` when `playwright` resolves locally):

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs P1_EVIDENCE_DIR=/absolute/path/to/scratch-results node browser-tests.mjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs P1_EVIDENCE_DIR=/absolute/path/to/scratch-results node archive-browser-test.mjs
```

Stop only these fixture servers when finished. The static worker is generated for the loopback Vite origin and caches only a static allowlist. It is **not** a service-worker implementation for Sylf or a local-authentication solution.

`contract-probe.mjs` is deliberately incomplete: its fake provider has no real authentication/pagination, archive validation is not hardened, canonical JSON covers a limited value set, metadata projection is a small illustrative subset, and session checks are not a complete concurrent ownership implementation. The final [architecture contract](../../../architecture-contract.md) is stricter. Preserve production boundaries by implementing and testing it under later authorization rather than promoting the lab wholesale.
