# Phase 11 baseline

**Recorded on 31 October 2026 at about 23:55 local, before any Phase 11 code change, at HEAD `f5a900b`, on the owner's uncommitted tree (322 changed paths).** Every regression claim in Phases 11 to 13 compares with this file.

Hosted variables were overridden on each command (`DATABASE_URL`, `DIRECT_URL`, `DATABASE_WORKER_URL` to an unused loopback port, Redis, Supabase and AI keys blank). `.env` was not read. Machine-readable failures are in [evidence/baseline-vitest-failures.json](evidence/baseline-vitest-failures.json).

## Summary

| Check | Command | Result |
| --- | --- | --- |
| Root Vitest | `npx vitest --run --reporter=json` | **36 failed, 4451 passed, 301 skipped**, 4788 total, in 424 files. 27 files failed, 8 of them because no suite could be collected |
| Root typecheck | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit` | **0 errors**. Also 0 with `--incremental false` (29 s), because the plain run hits an incremental cache in 5 s |
| `native/` verify | `npm run verify` | **Pass.** Typecheck, lint, 268 tests in 16 files, boundary audit, single-copy check and web build, in 27 s |

Nothing was flaky in this run, because each ran once. That is one observation, not a statement about stability.

## Reading these failures (added at the end of Phase 11)

Results above are as recorded and were not edited.

- **The route 500s** (`account-settings`, `routes`, `cognitive-stats`, `profile-api`, `system-achievements-api`, `shop-surface`, `connected-accounts`) are stale mocks: an unmocked call falls through to a real Prisma client and gets `DatabaseNotReachable`. **So root Vitest must always run with the hosted variables overridden.**
- **`coordinator-pooler`** fails because its fake client has no `.on`, which the code calls.
- **`scratch/calendar-postgres-check.test.ts`** connects to whatever `DATABASE_URL` says.
- **`__tests__/system/session-sidebar.test.tsx` is clock sensitive.** Its fixture builds "today" as hours ago, so two of its tests fail for a few hours after local midnight. They passed here, before midnight. Run it with `TZ=UTC` to tell that from a regression.

## Files that fail to collect (8)

These are not product tests. Vitest's default glob picks up `*.test.*` under `scripts/qa/` and `documentation/`, and two are guarded to run only inside a harness.

- `scripts/qa/planner-phase-c/c01-corrected.test.mjs`: No test suite found in file /Users/aliumair/Desktop/sylf/scripts/qa/planner-phase-c/c01-corrected.test.mjs
- `scripts/qa/planner-phase-c/execution-guard.test.mjs`: No test suite found in file /Users/aliumair/Desktop/sylf/scripts/qa/planner-phase-c/execution-guard.test.mjs
- `scripts/qa/planner-phase-c/preparation.test.mjs`: No test suite found in file /Users/aliumair/Desktop/sylf/scripts/qa/planner-phase-c/preparation.test.mjs
- `documentation/planner/reports/2026-10-09-step6-controlled-diagnostics/initial-block/guard.test.cjs`: No test suite found in file /Users/aliumair/Desktop/sylf/documentation/planner/reports/2026-10-09-step6-contro
- `documentation/planner/reports/2026-10-09-step6-controlled-diagnostics/initial-block/postgres.test.ts`: Required genuine PostgreSQL suite: use scripts/test/test-planner-v2-phase0-postgres.mjs; missing disposable ha
- `documentation/planner/reports/2026-10-09-step6-controlled-diagnostics/review-low/guard.test.cjs`: No test suite found in file /Users/aliumair/Desktop/sylf/documentation/planner/reports/2026-10-09-step6-contro
- `documentation/planner/reports/2026-10-09-step6-controlled-diagnostics/review-low/postgres.test.ts`: Required genuine PostgreSQL suite: use scripts/test/test-planner-v2-phase0-postgres.mjs; missing disposable ha
- `documentation/notes/reports/phase-1/prototype/tests/contracts.test.mjs`: No test suite found in file /Users/aliumair/Desktop/sylf/documentation/notes/reports/phase-1/prototype/tests/c

## Failing tests by file (36)

**`__tests__/ai/e2e-conversation.test.ts`** (1)

- Sylvie conversation integration with the real tool executor retains cheap-answer continuity only in the adopted conversation

**`__tests__/ai/model-migration.test.ts`** (1)

- DeepSeek model migration has no active reference to the retired model anywhere in the tree

**`__tests__/auth/account-settings.test.ts`** (2)

- Phase 3: Account Settings Data Binding & Profile Management PATCH /api/user/account successfully updates username & name, signs fresh session token, and sets cookie
- Phase 3: Account Settings Data Binding & Profile Management PATCH /api/user/account resets verificationStatus to UNVERIFIED when email address changes

**`__tests__/auth/routes.test.ts`** (1)

- Phase 1: API Route Handlers GET /api/user/stats returns authenticated user stats and formatted scholar ID

**`__tests__/dashboard/pixel-auth-mutation.test.tsx`** (1)

- Auth customization and refresh ordering cannot restore the previous account from a delayed read after login changes owner

**`__tests__/economy/cognitive-stats.test.ts`** (4)

- Cognitive Stats — invest API invests Sylph into a stat (+5, deducts 60, audits the ledger)
- Cognitive Stats — invest API invests SP into a stat (+5, deducts 1 SP)
- Cognitive Stats — invest API rejects when Sylph balance is too low
- Cognitive Stats — invest API rejects a stat at its cap

**`__tests__/mobile/settings-navigation.test.tsx`** (1)

- Phase 1D-G: Canonical Settings & System Hub Family Navigation renders AccountSettingsScreen when navigating to /settings/account

**`__tests__/mobile/shop-navigation.test.tsx`** (2)

- Phase 1D-F: Canonical Shop & Inventory Alias Parity renders canonical ShopScreen when navigating to /shop
- Phase 1D-F: Canonical Shop & Inventory Alias Parity renders canonical ShopScreen when navigating to /inventory (canonical production alias)

**`__tests__/notes/ink.test.ts`** (1)

- production paper page management drains sustained ink revisions in bounded passes without replacing source

**`__tests__/planner/exam-entry.test.tsx`** (4)

- Planner surfaces offers Planner modes from the header and opens the chooser
- Planner surfaces enters the chosen mode directly, without asking again
- Planner surfaces routes each mode to its own surface
- Planner surfaces closes the chooser on Escape and returns focus to its trigger

**`__tests__/profile/profile-api.test.ts`** (3)

- Profile System APIs GET /api/profile/[username] returns public dossier with characterConfig, cognitive stats and social links
- Profile System APIs GET /api/profile/[username] enforces granular privacy controls (hidden rank, hidden study hours & stats, hidden achievements)
- Profile System APIs PATCH /api/profile/customization updates characterConfig, bio, banner, and social links for authenticated user

**`__tests__/security/s4-ai-tool-clamps.test.ts`** (3)

- S4: AI tool reward-inflation clamps clamps a huge requiredMinutes (1,000,000) to the 240 ceiling
- S4: AI tool reward-inflation clamps clamps tiny/zero requiredMinutes to the 15 floor
- S4: AI tool reward-inflation clamps treats malformed minutes as the 30 default (never NaN/Infinity)

**`__tests__/settings/system-achievements-api.test.ts`** (2)

- System milestone source of truth validates redemption using the same live facts and awards only supported atomic XP/Sylph rewards
- System milestone source of truth retains claims and prevents a duplicate reward when the atomic race backstop fires

**`__tests__/settings/system-collection.test.tsx`** (1)

- Current System collection distinguishes available styles, saved personal images, official availability and local audio

**`__tests__/social/connected-accounts.test.ts`** (2)

- Connected Accounts & Public Dossier Privacy GET /api/profile/[username] returns verified connected accounts and STRICTLY omits Google email
- Connected Accounts & Public Dossier Privacy GET /api/profile/[username] strictly ignores legacy unverified manual socialLinks

**`__tests__/surface/shop-surface.test.ts`** (1)

- Surface Overhaul Phase 1 — Interactive System Store (`/shop`) Atomic Shop Purchase API Endpoint (`POST /api/shop/purchase`) executes purchase inside atomic transaction and returns remaining currency

**`__tests__/timer/coordinator-pooler.test.ts`** (3)

- keeps all coordination state inside one backend-bound transaction and releases it at commit
- rolls a busy snapshot back and starts fresh before running work, returning its connection before retry
- rolls failed writes back without leaving any session-level lock or settings behind

**`documentation/performance/phase-0/render-diagnostics.test.tsx`** (1)

- measures the party subscription dependency mismatch with stable and inline callbacks

**`scratch/calendar-postgres-check.test.ts`** (2)

- persists, replays creates, isolates owners, detects stale writes and deletes, and preserves multiple date notes
- queries timed overlaps in the viewer zone and all-day overlaps by civil dates
