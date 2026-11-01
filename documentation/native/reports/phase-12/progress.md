# Phase 12 progress

Resumable state for Phase 12 (Subagent B). Started 1 November 2026. Priority order is in the supervisor's task: auth, typed client, TimerSync on native, bounded reads, G-8 to G-14, P-5, D-2. Then the coverage gaps: Planner and Pixel Postgres suites, `npm run verify`, every Electron check one at a time, `mobile:build`, `mobile:verify`, `android:build`.

## Done
- `prisma/schema.prisma`: AuthSession gained `kind`, `refreshHash`, `previousRefreshHash`, `rotatedAt`, `clientName`, `tokenVersion`. Migrations `20261101100000_native_auth_sessions` and `20261101110000_open_session_index` (P-5). `SCHEMA_BUILD_VERSION` 41, `prisma generate` run.
- `lib/native-auth-contract.ts` (portable), `lib/auth.ts` (native token), `lib/auth-server.ts` (bearer branch), `lib/auth-session-service.ts` (open, rotate, end, `attachReissuedSession`, `expireSessionCookie`), `lib/auth-password.ts` (shared with web login and register), `lib/auth-native.ts` (OAuth state and code), routes under `app/api/auth/native/`, native branch in `auth/callback/[provider]`, `realtime/token`.
- All reissue and cookie-clearing sites use the helpers. `__tests__/backend/postgres/native-auth.postgres.ts` written.
- Bounded reads: `GET /api/sessions?limit=`, `detailed-stats?summary=true`, `quests?limit=&cursor=`, `chats?limit=&cursor=`, messages capped at 200 (`lib/pagination.ts`).
- Portability: `structuredClone` removed from `session-client`, `throwIfAborted` removed from `api-transport`, `emit` guarded in `timer-sync`.

- `native/packages/backend` (`@sylf/backend`): `token-session.mjs` (shared with Electron main), `errors`, `client`, `connectivity`, `resources`, `journal-storage`, `gateway`, `auth-model`, `timer-delivery`, `contracts`, `compose`, unit tests, `integration/backend.integration.ts`.
- `native/packages/shared/src/backend.ts` (second door, audited). `SecureSessionAdapter` in `@sylf/platform`, `expo-secure-store` ~58.0 added and in `app.config.ts`. `ownerId` on the session model (ADR 0010 decision 8).
- Electron: `apps/desktop/src/backend-proxy.mjs`, `session-vault.mjs`, `backend-check.mjs`, `main.mjs` wired, `self-test.mjs` extended. App: `apps/sylf/src/shell/backend.ts`, `App.tsx`.
- Harness: `run-backend-local.mjs --native-checks [--electron]`.

## In progress
- Nothing. `android:build` compiled at 35,655,531 bytes (34.0 MiB). Only the handback remains. `report.md` goes in the handback, because a tool rule refuses it to subagents.

## Decisions so far
- Refresh token is `<sid>.<secret>`, so a token of any age finds its row and reuse is detected two generations back. Stronger than ADR 0009's hash lookup.
- `tokenVersion` column added beyond the ADR's list: refresh tokens are opaque and must fail when the account version moves.
- `kind` is TEXT with a CHECK constraint, not an enum: `AuthSession` comes from `db push`, and the harness builds gap tables before replaying migrations.
- Grace reuse clears `previousRefreshHash` and keeps `rotatedAt`: once only, inside the original window.
- OAuth state is a signed JWT (no cookie). The one-time code sits in `VerificationToken` as `NATIVE_OAUTH:<hash>:<challenge>`.
- **Electron uses Node's fetch, not `net.fetch`.** `net.fetch` adds `sec-fetch-site` to every request, measured with the stub, and the server rightly refuses a bearer token with one. Not weakened. Cost: no system proxy.
- `safeStorage` async API (the sync one is deprecated in Electron 45).
- Journal: one preference value holds the whole journal (`createJournalStorage`), so no Kotlin or Swift change. `TimerSync` is reused unchanged except for the `emit` guard.
- `@sylf/backend` is behind `import()` in `shell/backend.ts`, enforced by the boundary audit, so a build with no backend loads none of it.

## Test results (final code, 1 Nov 2026)
See handoff §5 for the table. Backend 107, device client 17, Electron backend 39, RLS pass, migrations 13, timer 81, planner suite 1915 passed 4 failed (baseline) 34 skipped, planner-v2 422 passed 2 failed (D-7), Pixel 8, Calendar 33, Notes pass, smoke 25, root tests 36 failures identical to the baseline, verify 434 plus 1 skipped, Electron self-test 12, Design 19, Spaces 52, Home 72, World 189, Session 113, Workspace 184 whole, mobile build and verify pass. `planner-v2` suite ran before the last two small edits (`expireSessionCookie`, `detailed-stats` summary), neither of which it reaches.
