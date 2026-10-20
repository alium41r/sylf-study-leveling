# Scripts

Repository utilities grouped by purpose. Run them from the repository root; most
scripts resolve the repository root from their own location, and asset/QA writers
expect `process.cwd()` to be the root.

| Directory | Purpose | Representative commands |
| --- | --- | --- |
| `build/` | Reproducible builds invoked by npm lifecycle scripts. | `npm run planner:worker:build`, `npm run calendar:recognition:build` |
| `assets/` | Source-art pipelines and read-only image diagnostics. | `npm run sylv:vectorize`, `npm run sylv:optimize`, `node scripts/assets/prepare-pixel-companion-eyes.mjs` |
| `db/` | Migration application, disposable-data maintenance and local sync helpers. | `node scripts/db/apply-migration.mjs`, `node scripts/db/run-calendar-sync.mjs` |
| `dev/` | Local development orchestration. | `npm run planner:dev` |
| `qa/` | Browser/editor qualification harnesses and their fixtures. | `node scripts/qa/qa-planner-session.mjs` |
| `security/` | Repository audits exposed through npm scripts. | `npm run audit:secrets`, `npm run audit:models` |
| `test/` | Opt-in disposable-PostgreSQL integrations (Docker required). | `node scripts/test/test-planner-postgres.mjs`, `node scripts/test/test-timer-postgres.mjs` |
| `verify/` | Focused static, bundle and browser verification. | `npm run mobile:verify`, `node scripts/verify/verify-planner-browser.mjs` |

## Notes

- Database harnesses create disposable loopback databases and never read a hosted
  database URL. They are intentionally outside the default `npm test` run.
- `verify/` writers such as `verify-app-sanity.mjs` and `verify-planner-browser.mjs`
  refresh `.browser-qa/`; refreshable output is not an immutable historical record.
- Planner V2 phase scripts are retained qualification harnesses. They use the
  alternate TypeScript/Vitest configuration in [`config/`](../config/README.md).
- Dated reports may cite pre-reorganization paths. This file and `package.json`
  describe the current locations; historical commands remain task-era records.
