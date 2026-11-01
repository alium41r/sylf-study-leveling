# Phase A evidence

- `verification.json`: final outcome, current test totals, runtime/migration provenance, source preservation and explicit qualification limits.
- `unit-results.json`, `units.log`: 382 tests in 32 files, including foundation contracts and shared provider/telemetry regressions.
- `postgres-phase1-results.json`, `postgres-current-results.json`, `postgres-harness-run.json`, `postgres-source-pins.json`, `postgres-run.log`: final real PostgreSQL run; 186 V2 passes/32 failures, 225 legacy passes, zero required skips, nine new foundation cases passed.
- `baseline-control/`: matched V2 control without Phase A integration/guards; the same 32 failure names and 225 legacy passes. `prior-client-mismatch/` retains the earlier control whose regenerated Prisma client lacked its two nullable mapping columns.
- `focused/`: 38/39 current-SQL checks, including nine new foundation tests and isolated HTTP/apply/Focus Party paths. The remaining timer fixture uses an expired deadline.
- `initial-regression/`: earlier failed runtime/bootstrap-era qualification retained without promotion to current results.
- `preservation.json`: all unrelated starting changes retained; thirteen scoped pre-existing files changed; original contracts/authorities/package pins preserved.
- `typecheck.log`, `lint.log`, `existing-lint.json`, `worker-build.log`, `node-imports.json`, `web-build.log`, `mobile-build.log`, `mobile-verify.log`: static/build checks and the separate pre-existing provider/logger lint diagnostics. The default-heap web failure is retained separately.

All database identities are generated loopback fixtures; provider calls are scripted. No hosted migration, provider call, production routing/deployment change, educational qualification or release claim is represented by these receipts.
