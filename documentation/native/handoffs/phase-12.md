# Sylf Native — Phase 12 handoff, for Phase 13

**Written 1 November 2026, at the end of Phase 12.** Self-contained: a fresh agent needs only the repository. Source, tests, schema and configuration win over any prose. Read [`AGENTS.md`](../../../AGENTS.md), the [Stage 2 handoff](stage-2.md) for how the project runs, the [Phase 11 handoff](phase-11.md) for the audit, and this file for where the backend foundation stands.

**State.** Phase 12 is complete on the Mac. Nothing is committed or deployed. HEAD is `f5a900b`. **Nothing here touched hosted Supabase, Redis or storage. No real OAuth provider was contacted, no AI provider was called, and nothing ran on a device or on Hermes.** Decisions are in [ADR 0009](../decisions/0009-native-authentication.md) (read its "As built" section first) and [ADR 0011](../decisions/0011-shared-backend-foundation.md), both **Proposed**. The contract is the [backend guide](../backend/README.md). Evidence is in [`reports/phase-12/evidence/`](../reports/phase-12/evidence/).

**`reports/phase-12/report.md`.** A tool rule refuses that file to subagents, so its content went to the supervisor in the handback, and the supervisor files it. Nothing here depends on it.

## 1. What is ready

Every row was exercised on a real server over HTTP, or in real Electron, unless it says otherwise.

| Contract | Where | State |
| --- | --- | --- |
| Native sign-in, register, refresh, sign-out, one device row | `/api/auth/native/*`, `lib/auth-session-service.ts`, `lib/native-auth-contract.ts` | **Ready.** All of ADR 0009's tests pass |
| OAuth with PKCE, no cookie | `oauth/start`, the callback's native branch, `token` with `grant: "oauth_code"` | **Ready to the provider's edge.** The provider exchange is mocked, and the system-browser step never ran |
| Revocation parity in `getSession` | `lib/auth-server.ts` | **Ready** |
| Electron's main process as the client | `apps/desktop/src/backend-proxy.mjs`, `session-vault.mjs` | **Ready.** Real window, real server |
| Device client | `createBearerGateway`, `expo-secure-store` adapter | **Logic ready, on Node.** Android compiles. Keystore and Hermes never ran |
| Typed client | `client.get`, `send`, `stream`, `fetch`, `assetUrl` | **Ready** |
| Cached reads and their states | `resources.resource`, `useResource` | **Ready** |
| Auth model | `backend.auth` | **Ready.** No screen uses it |
| `TimerSync` on native | `backend.timer.current()`, `createJournalStorage` | **Ready,** and delivered real sessions into real ledgers |
| `ownerId` on the session model | `packages/spaces/src/session/model.ts` | **Ready** |
| Small reads | `sessions?limit=`, `detailed-stats?summary=true`, `quests?all=true&limit=`, `chats?limit=`, messages capped | **Ready,** typed where Phase 13 needs them first |
| Relative assets (G-8) | `client.assetUrl`, Electron's proxy | **Ready.** An audio element loaded a proxied file under the app's CSP |
| Streaming (G-12) | `client.stream`, `protocol.handle` | **Proven in Electron with a stub stream.** Not on Hermes, and not on Sylvie's real route |

## 2. What Phase 13 must connect

**Nothing below is connected, by design.** Sample labels and "Not saved yet" are all still in place, and still true.

1. **A sign-in surface.** `backend.auth.signIn`, `register`, `signInWithProvider`, `signOut`. Say so when `ended` is true. In Aloft, not a generic form. Handle `not-configured`: a build with no backend has no account, and must stay as it is today.
2. **The session bridge.** The piece that was left out on purpose: when `createStudySessionModel` starts, pauses, resumes or ends, write to `backend.timer.current()`.
   - `create({ ownerId, clientKey, startedAt, subjectId, questId })`, then `enqueue` and `finish`. `startedAt` needs converting to ISO.
   - **Only for a session with an `ownerId`.** An ownerless session is never delivered ([ADR 0010](../decisions/0010-session-ownership-before-sign-in.md), with its sheet and its five tests).
   - The model's operation ids differ from `TimerSync`'s. Let `TimerSync` make its own.
   - `onAccepted` is what flips `saved`. Change `saved: false` to a real boolean there, and nowhere else.
   - `reconcileSessionSnapshot` makes accepted state win over what the device holds.
3. **The three binding points:** `spaces/home/data/index.ts`, `spaces/workspace/data/index.ts`, `spaces/world/data/index.ts`. Replace each with an adapter over `resources`. `provenance` then does the rest. Keep the empty binding for a build with no backend.
4. **A subject picker,** because the server wants `subjectId`.
5. **Today:** `calendar/personal?start&end` plus `quests?date=`. `Quest.scheduledFor` is a date, so never invent a time.
6. **Circle:** `level` and `hunterRank` can be `null`, which means hidden, not zero.
7. **World's `earnedThisWeek`** has no route. Add a read or remove it.
8. **Sylvie:** `client.stream` on `system-messages/chat`, with no provider call in any test.

**Mutations:** `client.send`, then `resources.invalidate(tag)`. A `timeout` means the outcome is unknown.

## 3. What changed on the server

| Change | Files | Know this |
| --- | --- | --- |
| Six nullable `AuthSession` columns, and a partial index | `20261101100000_native_auth_sessions`, `20261101110000_open_session_index` | **Written, validated locally, applied nowhere hosted.** `SCHEMA_BUILD_VERSION` is 41. Native sign-in needs the first one. Rollback SQL is in each file's header |
| Bearer branch | `lib/auth.ts`, `lib/auth-server.ts` | Cookie wins, valid or not. A `Sec-Fetch-Site` header refuses the bearer path. The web token is never a bearer token |
| Password check shared | `lib/auth-password.ts`, used by `auth/login`, `auth/register` | Same limits, same words |
| No cookie for a bearer request | `attachReissuedSession`, `expireSessionCookie`, on all reissue and clearing sites | `reissueToken` has no outside caller now. **Add any new cookie through these** |
| `kind: "BROWSER"` on new browser rows | `openAuthSession` | Older rows have `NULL` |
| Bounded reads | `lib/pagination.ts` and the five routes | Absent `limit`, each route answers as it always did. Messages are capped for everyone: pollers just ask again |
| Portability | `lib/api-transport.ts`, `lib/planner/v2/session-client.ts`, `lib/timer-sync.ts` | No more `throwIfAborted`, `structuredClone`, or an unguarded `dispatchEvent` |

**Found while building, worth carrying forward.**

- **`net.fetch` adds `Sec-Fetch-Site` even from the main process.** So Electron uses Node's `fetch`. That means no system proxy and no OS trust store (Open).
- **`signal.throwIfAborted` does not exist on React Native's `AbortSignal`.** It ran after the server accepted, so on a device every timer request would have looked failed. Phase 11's list missed this one.
- **Some routes answer 401 for a wrong password.** So a 401 does not mean the session ended: only a refused refresh does, and only that carries `code: "session_ended"`.
- **Two people could have shared a read.** A request in flight for one account could be joined by the next, so `client.reset()` runs on every owner change.

- **A new finding, D-7: two Planner V2 suites fail on this tree.** They ran for the first time here, so there is no earlier result to compare with. `reviewed-learning` (`SYNC_CACHE`: "Required Calendar capacity is incomplete") and `role-resources` (the first provider delta never reaches the activity stream). Reproduced alone, twice each. Neither path imports anything Phase 12 changed, and both sit on the owner's uncommitted edits to `lib/planner/v2/intelligence/capacity.ts` and `lib/ai/providers/`. That is from reading imports, not a run on an older tree. Left alone.

## 4. Decisions Phase 13 inherits

Proposed in ADR 0011: no screen calls `fetch`, nothing polls, cached reads stay in memory, reads retry, mutations do not, and `@sylf/backend` stays behind `import()`, enforced by the boundary audit. If a screen needs something the package does not offer, extend the package.

## 5. Coverage

All on the final code, with commands in the report.

| Check | Result |
| --- | --- |
| Backend, authorization, ownership, ADR 0009, bounded reads | 107 of 107 |
| Device client against the real server | 17 of 17 |
| Electron against the real server, ADR 0009's test 8 | 39 of 39 |
| RLS audit, migrations | Pass, 13 of 13 |
| Timer | 81 of 81 |
| Planner and Planner V2 units, Planner database suites | 1,915 passed, 4 failed (baseline `exam-entry`), 34 skipped (live providers) |
| All Planner V2 Postgres suites | 422 passed, **2 failed (D-7)** |
| Pixel, Calendar, Notes | 8, 33, pass |
| HTTP smoke on the production build | 25 of 25 |
| Root tests | 36 failures, the baseline exactly: 0 new, 0 fixed |
| `npm run verify` | 434 passed, 1 skipped (Linux only) |
| Electron self-test, Design, Spaces, Home, World, Session | 12, 19, 52, 72, 189, 113, all passed |
| **Workspace, whole, on the final code** | **184 of 184.** This closes the Stage 2 caveat, in one run |
| `mobile:build`, `mobile:verify` | Pass |

Evidence for each is in [`reports/phase-12/evidence/`](../reports/phase-12/evidence/). Anything left is in §8.

## 6. Harness

Docker Desktop: `open -ga Docker`, and quit it after use with `osascript -e 'quit app "Docker Desktop"'`.

**Every backend command needs the overrides,** on that command:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/none DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:55432/none DATABASE_WORKER_URL=postgresql://postgres:postgres@127.0.0.1:55432/none UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= SUPABASE_SERVICE_ROLE_KEY= SUPABASE_JWT_SECRET= NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= GROQ_API_KEY= GEMINI_API_KEY= OPENAI_API_KEY= ANTHROPIC_API_KEY=
```

| Command | What it does |
| --- | --- |
| `node scripts/test/test-backend-postgres.mjs --out <dir> --label <name> [filter]` | Route handlers on real SQL. New suites go in `__tests__/backend/postgres/` |
| `... --suite timer` / `planner` / `pixel` / `planner-v2` | Each repository suite on the migrated schema. `--suite planner` also collects `__tests__/planner-v2/`, because the filter is a substring. **`planner-v2` needs Node 24:** `PATH=/usr/local/bin:$PATH /usr/local/bin/node scripts/test/...`, because the worker build refuses Node 26. It takes over 10 minutes, so run it in the background |
| `... --label x --measure <file> measure-routes` | Route cost |
| `node scripts/test/test-rls-audit-postgres.mjs --out <dir>` | RLS, grants, RPCs |
| `node scripts/test/test-native-migrations-postgres.mjs --out <dir>` | The migrations against an older database, with their rollback |
| `node scripts/test/run-backend-local.mjs --native-checks --electron [--build] --out <dir>` | The real server, then the device client's integration suite, then the real Electron window. **Run `npm run build:web` in `native/` first** |
| `node scripts/test/run-backend-local.mjs --serve` | A real server on `127.0.0.1:3111` |

**Traps.**

- `--out` defaults to Phase 11's folder on the older scripts. Always pass it.
- Root Vitest overwrites `documentation/performance/phase-0/artifacts/render-diagnostics.json`. `--suite planner-v2` overwrites `documentation/planner/reports/2026-10-03-phase-2/evidence/step6-maximum-postgres.json`. Copy both aside and put them back.
- The guard refuses any Bash text that mentions root Vitest's config without `DATABASE_URL` on the same command, so even a `grep` for it needs the prefix.
- The Planner suites accept only a database whose name contains `planner`. Without that, they fail at collection with a misleading message about `vi.mock`.
- These suites use `suiteEnvironment`, not `backendEnvironment`: blank variables break them, because they read optional settings with `??`.
- A seconds-old account gets seconds of credit: the server clamps the start to its creation.
- `fetch` with `Sec-Fetch-Site` is what a browser does. A test simulating a browser must send it.

## 7. For the owner, not for an agent

| Item | Why |
| --- | --- |
| **Everything in [Phase 11 handoff §7](phase-11.md#7-for-the-owner-not-for-an-agent) still stands** | Deploy the OAuth fix first. Run its read-only checks |
| **Apply `20261101100000_native_auth_sessions` before deploying this code** | Additive and idempotent. The order matters: Prisma now names these columns, so with the code ahead of the migration, `GET /api/user/sessions` fails and a browser sign-in records no device row (it still signs in, with a token that has no `sid`). `getSession` itself keeps working, because it selects only `expiresAt` |
| Apply `20261101110000_open_session_index` | Build it `CONCURRENTLY` first on a large table. Prisma cannot express it, and `db push` would offer to drop it |
| Set `EXPO_PUBLIC_SYLF_API_ORIGIN` and `SYLF_BACKEND_ORIGIN` for a real build | Unset, nothing connects |
| D-2, the migration history | **Deferred with a reason.** A later additive migration cannot fix replay, because 11 migrations need columns before they run. The real fix is a baseline taken from the hosted schema, which needs hosted read access and a decision |
| Decide password reset (G-4), S-12, I-2, whether first launch needs an account | Product decisions, carried from Phase 11 |
| Decide Node's `fetch` versus system proxies on Electron | Matters for students on managed networks |

## 8. Open risks

| Risk | State |
| --- | --- |
| Hosted state | Unknown, by rule |
| Real OAuth | Mocked at the exchange. Providers may also need checking against a JWT `state` of this length |
| Hermes | Removing what it lacks proves the code no longer reaches for it, not that it runs |
| Keychain and Keystore | Compile only |
| A killed app during OAuth | The verifier is in memory, so the sign-in has to be restarted |
| A lost refresh response past 60 seconds | Ends the session. Accepted |
| Performance | Local, in process. A hosted round trip per statement is unmeasured |
| Stage 2's device risks | Unchanged |

## 9. Rules to keep

- One authority each for sessions, identity and progression: `AuthSession`, `backend.auth`, the server.
- `TimerSync` is the journal. Never add a second one.
- Rewards are never computed on a client.
- No token reaches Electron's renderer. `backend-check.mjs` proves it, so keep it passing.
- Leave the Sample and Not saved labels until real data flows behind each.
- Stop at the Phase 13 boundary.
