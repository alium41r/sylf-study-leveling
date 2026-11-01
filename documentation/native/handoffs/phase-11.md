# Sylf Native — Phase 11 handoff, for Phase 12

**Written 1 November 2026, at the end of Phase 11.** Self-contained: a fresh agent needs only the repository. Source, tests, schema and configuration win over any prose. Read [`AGENTS.md`](../../../AGENTS.md) and the [Stage 2 handoff](stage-2.md) for how the project runs, and this file for where the backend stands.

**State.** Phase 11 is complete on the Mac. Nothing is committed or deployed. HEAD is `f5a900b`. **Hosted Supabase, Redis and storage were not inspected, so every statement about RLS or schema describes what the migration history produces on a disposable PostgreSQL 17.** No native code changed. Decisions are in [ADR 0009](../decisions/0009-native-authentication.md) (authentication) and [ADR 0010](../decisions/0010-session-ownership-before-sign-in.md) (sessions before sign-in), both **Proposed**. The test baseline is [`reports/phase-11/baseline.md`](../reports/phase-11/baseline.md), and raw evidence is in [`reports/phase-11/evidence/`](../reports/phase-11/evidence/).

**`reports/phase-11/report.md`.** Writing this file was refused by a tool rule for subagents, so its content went back to the supervisor in the handback message, and the supervisor files it. If it is absent, nothing here depends on it: this handoff, the ADRs, the evidence and the feature guides carry what Phase 12 needs.

## 1. What changed in the backend

Reproduced on real PostgreSQL before each fix. Compare `evidence/backend-*-before-fix.json` with `backend-postgres.json`.

| Change | Files | What Phase 12 must know |
| --- | --- | --- |
| **OAuth linking** answers only to the verified session | `app/api/auth/callback/[provider]` | A forged `oauth_link_user_*` cookie links nothing |
| **Device sessions are real.** Tokens carry `sid` (an `AuthSession` id). A row reaching `expiresAt` ends its token on the next request | New `lib/auth-session-service.ts`, `lib/auth-server.ts`, `lib/auth.ts`, sign-in, logout and reissue routes | **Native sessions extend this row.** Never add a second table. `getSession` runs 2 SQL statements now, and fails closed |
| **Token reissue** goes through `reissueToken` | `user/security`, `user/reset-progress`, `user/account`, `user/onboarding` (2) | These six sites set a cookie. A bearer request must not receive one |
| **Security codes** moved to `lib/security-code.ts` | `send-code`, `account/delete`, `reset-progress` | Secure random, five wrong tries destroy the code, collisions redraw. Token format unchanged |
| **Public email confirmation** refuses any token containing `:` | `lib/auth-service.ts` | Prefix anything else you store in `VerificationToken` with `NAME:` |
| **Admin bootstrap** needs a verified address | `lib/auth-admin.ts`, `user/stats` | |
| **Pre-hijacking closed.** A verified provider claiming an unverified address removes the password and bumps `tokenVersion`. New OAuth accounts follow the provider's verification | `lib/auth-service.ts` | |
| **Group conversations** pass `mayAddToConversation` | `lib/block-service.ts`, `conversations`, `conversations/[id]` | Fails closed |
| **Leaderboard** filters per viewer and counts in the database | `lib/cache-service.ts`, `user/rankings` | Cache key is now `rankings:global:v2` |
| **Friends** honors each friend's privacy, per field | `app/api/friends` | **`level` and `hunterRank` can be `null`.** Zero hours may mean hidden. Show "hidden", not zero |
| **Friends SQL** no longer uses `Prisma.join` | `app/api/friends` | Do not nest `Prisma.join` inside `$queryRaw` here: outside production `lib/prisma.ts` reloads the client, the classes stop matching, and the SQL fails. `.catch(() => [])` had hidden it |
| **One session credits at most 12 hours** | `MAX_SESSION_FOCUS_SECONDS`, `lib/planner/v2/server/sessions.ts` | Both protocols. The session still ends normally |

**Written, not applied:** [`prisma/migrations/20261101000000_rls_defense_in_depth`](../../../prisma/migrations/20261101000000_rls_defense_in_depth/migration.sql). It enables RLS on the 28 tables the history left without it, and closes function EXECUTE for `anon`. Additive, idempotent, no data change.

**Behavior changes the owner should see.** An unverified password account claimed by a verified provider loses the password. An unverified `ADMIN_EMAILS` address is no longer promoted. A session past 12 hours stops crediting. A group can hold only people who accept you. One test fixture changed in setup only, with no assertion touched: `__tests__/social/group-avatar.test.ts`.

## 2. Backend map

148 route files. Every protected route reaches identity through `getSession` in `lib/auth-server.ts`, directly or through `plannerRoute` (26 routes), Notes' `owner()` (5) or `requireAdmin` (7). Three routes use `CRON_SECRET`. No server actions exist. Routes read only `userId` from the token, apart from `/api/realtime/token`. So one branch in `getSession` gives a native client every route.

Non-browser clients are refused in exactly these places, on purpose or for now:

| Place | Effect |
| --- | --- |
| `sec-fetch-site: cross-site` checks in `calendar/*` and `system-messages/chat` | Native sends no such header, so these pass |
| `requireOrigin` in `lib/notes/server/security.ts` | **Refuses native on the Notes broker.** Phase 14 |
| `sessionHash` in Notes and `lib/calendar/external/connections.ts` | Binds OAuth state to the cookie. Calendar connect stays a web flow |

## 3. What to build: native authentication

[ADR 0009](../decisions/0009-native-authentication.md) has the design, the change list and the required tests. In short:

- One `AuthSession` row per device, with nullable columns added. A 15-minute access JWT with `aud: "sylf-native"`, and a rotating opaque refresh token stored as a hash.
- The bearer branch lives inside `getSession` and runs the same revocation check. Audiences do not cross, **no endpoint exchanges a cookie for a bearer token**, and a request with `Sec-Fetch-Site` cannot use the bearer path.
- **Electron:** the main process is the client. `protocol.handle` answers `sylf://app/api/*`, `safeStorage` holds the refresh token, and the renderer never sees a token. No CSP or CORS change.
- **React Native:** `expo-secure-store` for refresh, memory for access, `credentials: "omit"`.
- A bearer request must never receive `Set-Cookie`.

## 4. Other work this phase leaves for Phase 12

| ID | Work | Detail |
| --- | --- | --- |
| G-2, P-2 | A small read for recent sessions and the week | `detailed-stats` is 186 KB at 3,000 sessions. Either `?summary=true`, or `GET /api/sessions?limit=` |
| P-3 | Bounded lists | `quests?all=true` was 905 KB for 1,500 quests. `chats` and `conversations/[id]/messages?after=` have no limit. **Native must not call `all=true`** |
| P-5 | Index | `"StudySession"("userId") WHERE "endedAt" IS NULL` |
| D-2 | Reconcile the migration history | 7 tables, 4 enums, 12 column statements and 50 indexes exist only through `db push`, and 11 of 78 migrations need them. `evidence/rls-audit.json` lists them |
| G-8 | Resolve relative URLs | `/audio/...` and legacy uploads, which sit outside `/api/`, so the Electron proxy needs a rule |
| G-9 | Allow-list `lib/planner/v2/session-client` and `lib/timer-sync` | Both passed a manual import walk. **`TimerSync` already takes storage, request and lock as arguments, so reuse it. There is no need for a parallel journal,** whatever the Stage 2 handoff suggests |
| G-10 | Make `TimerSync` runnable on native | `PreferencesAdapter` lacks `length`, `key`, `removeItem`. **`emit` must check `window.dispatchEvent`:** React Native defines `window` without it, so it would throw after the server accepted |
| G-11 | `structuredClone` | Not polyfilled for Hermes. Used by `SessionProtocolV2.accepted()` |
| G-12 | Streaming | Prove `protocol.handle` streams SSE for Sylvie. Hermes stays for the tablet day |

**Decisions for Phase 13, and known now:** `quests` have no time of day, so Today's line can only place calendar events (see below), and World's `earnedThisWeek` has no route.

## 5. Contract differences

The native-to-web matrix lives where it stays current, in each guide's owner table: [Home §5](../home/README.md), [Workspace §5](../workspace/README.md), [World](../world/README.md) and the [session map in ADR 0008](../decisions/0008-study-session-and-timer-dock.md#backend-map). The corrections that matter:

| Native assumed | Reality |
| --- | --- |
| Week chart from `/api/insights` | `user/detailed-stats` `.dailyStudy`, `.subjectBreakdown`. `/api/insights` is AI insights |
| Rank in `UserStats` | `User.hunterRank` |
| `/api/notes` lists notes | No such list. The server stores no note. Phase 14 |
| `DayEntry.startsAt` for planned work | **`Quest.scheduledFor` is a date.** Proposed: a line of timed events, then today's quests in order, with minutes. Do not invent a time |
| `parties: StudyParty[]` | `focus-party` returns one active party and invites |
| Recent sessions from `/api/sessions` | That `GET` takes one id |
| `earnedThisWeek` from ledgers | No route. `currency/stats` is all-time |
| Read the calendar through `calendar/month` | It also reconciles HP penalties. Read `calendar/personal?start&end` |

## 6. Harness

Docker Desktop is installed: `open -ga Docker`, and quit it after use with `osascript -e 'quit app "Docker Desktop"'`. Its VM takes up to 4 GB.

| Command | What it does |
| --- | --- |
| `node scripts/test/test-backend-postgres.mjs [filter]` | Route handlers on real SQL with the real `getSession`. **Add native auth tests to `__tests__/backend/postgres/`.** About 40 s |
| `node scripts/test/test-backend-postgres.mjs --suite timer --label <name>` | The six timer and durable-core suites, 81 tests |
| `node scripts/test/test-backend-postgres.mjs --label <name> --measure <file> measure-routes` | Route cost. Use a label that differs from the measure file's name |
| `node scripts/test/test-rls-audit-postgres.mjs` | RLS, grants, RPCs, forced-grant policy tests |
| See below | The real server, built, on a disposable database |

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/none DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:55432/none DATABASE_WORKER_URL=postgresql://postgres:postgres@127.0.0.1:55432/none UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= SUPABASE_SERVICE_ROLE_KEY= SUPABASE_JWT_SECRET= NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= GROQ_API_KEY= GEMINI_API_KEY= OPENAI_API_KEY= ANTHROPIC_API_KEY= node scripts/test/run-backend-local.mjs --smoke --build
```

Use `--serve` in place of `--smoke` to keep it running on `127.0.0.1:3111` for a client. All of these live in `scripts/test/lib/disposable-backend.mjs`, which replays all of `prisma/migrations/`, bridges the history gaps, and blanks all 68 variables the source names, so a child process cannot read a hosted value from `.env`.

**Root Vitest needs the same overrides, every time.** Stale mocks in some unit tests fall through to a real Prisma client (D-4), so a hosted `DATABASE_URL` in the shell would reach production. `scratch/calendar-postgres-check.test.ts` writes to whatever it is given.

**Harness traps.**

- `test-timer`, `test-pixel` and `test-planner-postgres.mjs` fail at bootstrap, before any test, because the working-tree `schema.prisma` has `@default(dbgenerated(...))` with column references on `CalendarNote`. That is the owner's uncommitted edit (D-3), so it was left alone. `test-calendar` and `test-notes` work.
- `test-timer-postgres.mjs` overwrites a tracked evidence file even when it fails. Back it up first, or use `--suite timer`.
- The Planner suites accept only a database named `sylf_planner_phase[01]_…`. `plannerSuites: true` handles that. Keep the guard.
- zsh: `*` in `--include=*.ts` needs quoting, and `=====` at the start of a word is an error.
- The guard hook refuses any Bash text mentioning `.claude` orchestration or hook paths, or a Next.js command without localhost variables on that same command. Text inside a heredoc counts.
- `session-sidebar.test.tsx` fails for a few hours after local midnight (D-6). Run it with `TZ=UTC` to tell that from a regression.

## 7. For the owner, not for an agent

These need hosted access or a decision, and nothing else is blocked by them.

**Before deploying these fixes,** run read-only on the hosted database:

```sql
-- getSession reads these columns and fails closed, so they must exist.
SELECT column_name FROM information_schema.columns WHERE table_name = 'AuthSession' AND column_name IN ('tokenHash', 'expiresAt');
-- Tables with no RLS, to compare with the migration's list.
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
-- Indexes the history does not create: expect these three at least.
SELECT indexname FROM pg_indexes WHERE indexname IN ('StudySession_userId_startedAt_idx', 'AuthSession_tokenHash_key', 'Quest_userId_status_idx');
```

| Item | Why |
| --- | --- |
| **Deploy the OAuth fix, and review `ConnectedAccount` for links nobody made** | The takeover (S-1) existed in production code. Whether it was used cannot be judged from here |
| Apply `20261101000000_rls_defense_in_depth` | Not applied anywhere hosted |
| Confirm your own account is `VERIFIED` | The `ADMIN_EMAILS` promotion now needs it. An account already `isAdmin` is unaffected |
| Fix or confirm `CalendarNote` in `schema.prisma` | D-3 |
| Decide password reset (G-4) | None exists on any client, and it needs email delivery |
| Decide: does an email change need a password (S-12), a daily ceiling on credited study (I-2), must first launch require an account (ADR 0010) | Product decisions |

## 8. Open risks

| Risk | State |
| --- | --- |
| R1 Native authentication | Designed, not built |
| Hosted state | Unknown, by rule |
| Supabase services | Realtime, PostgREST and Storage were not running. Roles and JWT claims were reproduced |
| Performance | Local, in process. A hosted round trip per statement is unmeasured |
| Stage 2's device risks | Unchanged. Nothing ran on a device |

## 9. Rules to keep

- One authority each for sessions, identity and progression. Reuse `AuthSession` and `TimerSync`.
- Never weaken a test to pass it. Reproduce on real PostgreSQL first.
- Rewards are never computed on a client.
- Leave the Sample and Not saved labels until real data flows behind each.
- Stop at the Phase 12 boundary.
