# Migration verification evidence

The source migration was applied only once with the project's existing Prisma workflow. No provider execution or paid API call was made. Snapshots contain schema/ledger metadata and aggregate counts, not credentials, user identifiers or conversations.

| Artifact | Purpose |
| --- | --- |
| [preflight.json](preflight.json) | Read-only hosted catalog/ledger before application; exactly one pending migration. |
| [postflight.json](postflight.json) | Read-only catalog after application; no pending/failed/checksum mismatches, 29 telemetry columns and preserved access. |
| [inspection-latest.json](inspection-latest.json) | Final read-only inspection after rollback-only runtime tests. |
| [telemetry-schema-match.json](telemetry-schema-match.json) | All scalar fields compared against source, plus preserved indexes, constraints and permissions. |
| [checks.json](checks.json) | Sanitized verification summary and migration checksum. |
| [unrelated-schema-diff.txt](unrelated-schema-diff.txt) | Whole-database Prisma comparison. Nonempty outside telemetry; no generated SQL applied. |
| [inspect-database.mjs](inspect-database.mjs) | Read-only metadata collector using `DIRECT_URL`; defaults to a separate latest snapshot. |
| [inspect-schema.mjs](inspect-schema.mjs) | Offline source/catalog comparison. |
| [telemetry-database.test.ts](../../../../../__tests__/ai/telemetry-database.test.ts) | Explicit opt-in hosted tests; real Prisma/auth/routes, synthetic rollback-only fixtures and blocked provider/network execution. |

Run from the repository root, with the correct configured Supabase target:

```sh
npx prisma migrate status
node --env-file=.env --env-file=.env.local documentation/performance/reports/2026-10-15-ai-telemetry-migration/evidence/inspect-database.mjs
node documentation/performance/reports/2026-10-15-ai-telemetry-migration/evidence/inspect-schema.mjs
SYLF_AI_DATABASE_VERIFY=1 node --env-file=.env --env-file=.env.local node_modules/vitest/vitest.mjs run __tests__/ai/telemetry-database.test.ts
npm run test -- --run __tests__/ai/dispatch-telemetry.test.ts __tests__/ai/cost-summary.test.ts __tests__/ai/e2e-conversation.test.ts __tests__/ai/sylvie-runtime.test.ts __tests__/ai/provider-contract.test.ts
npx tsc --noEmit
npx eslint __tests__/ai/telemetry-database.test.ts
```

The hosted test is skipped in ordinary test runs. Opting in authorizes temporary database writes inside transactions that intentionally roll back. Its assertions also verify that no fixture rows persist. No model transport is available to the test. Raw command/provider/database error logs are not stored here.
