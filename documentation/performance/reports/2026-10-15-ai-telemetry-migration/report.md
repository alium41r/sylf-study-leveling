# Hosted AI dispatch telemetry migration

Applied and verified on October 15, 2026 for the configured Supabase project `gjkwkdqdoekzllmnsejo`. The exact pending `20261015130000_ai_dispatch_telemetry` migration was applied through the existing `npx prisma migrate deploy` workflow using `DIRECT_URL`. No application deployment, unrelated migration, unfinished feature activation or paid AI call was performed.

## Preflight and application

Read-only preflight found precisely one pending migration, no failed entries, no checksum differences against applied repository migrations, and no unknown applied migrations. `AiUsageLog` had 17 columns. Its existing row-level security was enabled, backend access was available, and browser roles had no table read access.

Prisma applied only the telemetry migration. Follow-up migration status reports all **64 migrations applied**, with none pending or failed. The registered migration checksum matches the repository SQL. Prisma client regeneration succeeded.

The migration adds 12 nullable fields, bringing the table to **29 columns**. Every scalar field's type/nullability matches the current Prisma model, the zero-cost default is removed, and existing indexes, primary/foreign keys and permissions are unchanged. Of 122 existing usage rows, **63 unpriced legacy zero estimates became null/unknown**. Token counters and existing nonzero estimates were not repriced. These are database metadata measurements, not provider billing figures.

## Runtime verification without paid calls

Two explicit opt-in tests used the real Supabase database, generated Prisma client and application code inside rollback-only transactions. Synthetic users, dispatches and messages were removed by rollback, with absence checked afterwards. Identity and conversation content were synthetic; no real user conversation or credentials were exported. PostgreSQL sequence values can advance during rolled-back inserts, leaving harmless ID gaps.

The dispatch test exercised a pre-call pending receipt followed by settlement, two priced mixed-provider receipts, a failed dispatch, grounded usage and an unknown model. It verified unique dispatch IDs under one root, actual/requested model identity, reasoning/cache subsets, pricing version, transport latency and honest unknown spend. The real cookie-authenticated cost route returned the expected known subtotal and an incomplete total. The fixture's $0.000915 subtotal is arithmetic over fabricated counters, **not money spent or a savings measurement**. No telemetry warnings occurred.

The chat test used the actual cookie signature and database token-version check. Unauthorized chat returned 401. Asking for a very short introduction returned the concise deterministic sentence, persisted its two history messages, and retrieved them through the authenticated messages route. It consumed no quota and created no dispatch receipt. Both provider adapter acquisition and external fetch were blocked during the tests; neither was attempted.

| Verification | Result |
| --- | --- |
| Hosted rollback-only logging/cost/chat tests | 2 passed, zero paid/provider calls; no persisted fixtures |
| Existing dispatch, cost, conversation, runtime and provider-contract regressions | 47 passed in five files |
| Normal regression run with new hosted suite | 47 passed, hosted tests skipped unless explicitly opted in |
| Prisma generation and migration status | Passed; 64 applied, none pending/failed |
| Strict TypeScript | Passed |
| ESLint for added test | Passed |
| Telemetry model/catalog comparison | 29 expected columns, 29 actual, no type/nullability mismatches; constraints/indexes/permissions preserved |
| Whole-database Prisma diff | Nonempty; unrelated differences described below; no diff SQL executed |

The model path's generation/tool contracts are covered by existing provider mocks. No real model generation, paid fallback, production HTTP endpoint or browser session was exercised. This verifies the migrated database against current local application code, not a deployed application release or live model quality.

## Remaining limitations and unrelated differences

There is **no remaining blocker for this telemetry migration**. A whole-database `prisma migrate diff` does report pre-existing differences outside `AiUsageLog`: Focus background defaults/nullability, Focus Party/Session index names, additional composite Planner foreign keys, ledger defaults, timer foreign-key definitions and an extra User index. The pending migration changes only `AiUsageLog`, and the application schema change for this task is also confined to that model.

Some differences represent SQL-owned safety constraints that Prisma's schema does not express. In particular, the diff proposes removing composite Planner constraints; automatically applying it would risk weakening existing guards. The diff was retained as read-only evidence and **was not applied**. Full database-wide Prisma alignment cannot be claimed; resolving unrelated differences would require a separately scoped review. No unfinished Planner functionality was activated or deployed.

Provider billing reconciliation, unknown grounding/search charges, best-effort telemetry during database outages, and paid generation quality retain the limits described in the [accounting contract](../../ai-accounting.md). The old Docker blocker did not prevent this authorized verification against Supabase. No additional user action is required for the completed migration.

[Sanitized evidence and reproduction](evidence/README.md).
