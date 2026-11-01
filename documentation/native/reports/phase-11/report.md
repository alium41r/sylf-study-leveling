# Sylf Native — Phase 11 report: Backend Audit and Engineering Assessment

**1 November 2026. Status: complete on the Mac, awaiting the supervisor's gate.** The next phase starts from the [Phase 11 handoff](../../handoffs/phase-11.md). Decisions are in [ADR 0009](../../decisions/0009-native-authentication.md) and [ADR 0010](../../decisions/0010-session-ownership-before-sign-in.md). Regressions compare with the [baseline](baseline.md).

*Filed by the supervisor from Subagent A's handback, unchanged. A tool rule refused the subagent's own write of this file.*

**Read this first.**

- The audit found and fixed one critical and seven high defects, reproduced on real PostgreSQL before the fix. The critical one let anyone link their own Google account to any user id and then sign in as that person.
- **Nothing is deployed, and hosted Supabase, Redis and storage were not inspected.** Every RLS and schema statement describes what the migration history produces on a disposable PostgreSQL 17, not production. The fixes need a deployment, and the migration needs the owner.
- Results are real SQL, RPCs and triggers. Supabase's Realtime, PostgREST and Storage services were not running: the audit reproduces their roles and JWT claims.
- Performance figures are in process on this Mac with no network. They compare routes and do not predict production latency.
- Native code was not changed.

**Can Phase 12 start? Yes.** No critical or high defect found by this audit remains open in code.

## 1. Architecture

```
Clients: Next.js web, Capacitor (mobile/), Sylf Native (no backend calls yet)
   │  cookie `hunter_token` (HS256 JWT, 30 days, httpOnly, SameSite=Lax)
proxy.ts                edge. Page redirects only, never authorization
app/api/**              148 route.ts files
   ├─ getSession        lib/auth-server.ts: the one identity check
   ├─ plannerRoute      lib/planner/server/http.ts → getSession (26 routes)
   ├─ notes owner()     lib/notes/server/http.ts → getSession, plus requireOrigin (5)
   ├─ requireAdmin      lib/auth-admin.ts → getSession (7 routes)
   └─ CRON_SECRET       3 routes, constant-time, failing closed
lib/**                  engines, services, contracts
   ├─ SessionService    coordinated, serializable transactions
   ├─ RPCs              settle_study_session_atomic, claim_quest_reward, purchase_shop_item, Focus Party RPCs
   └─ lib/prisma.ts     one pg pool, as the owner role, which bypasses RLS
PostgreSQL              73 tables, 79 migrations with this phase's, ledgers, triggers, RLS
Supabase                Realtime (4 published tables, app-minted JWT), Storage (service role only)
Upstash Redis           rate limits and cache, with in-process fallbacks
```

Intentionally public routes: `auth/login`, `register`, `logout`, `check-username`, `verify-email/confirm`, both OAuth routes, `waitlist`, `acoustics`, `focus-backgrounds`, and the calendar webhook. No server actions exist. Routes read only `userId` from the token, apart from `/api/realtime/token`, so one branch in `getSession` covers native. Scan: [`evidence/route-scan.mjs`](evidence/route-scan.mjs).

## 2. Feature inventory

"Tested" means tests exist and this phase saw them or new ones pass. Hosted behavior is unverified for all.

| Feature | Backend owner | State | Notes |
| --- | --- | --- | --- |
| Password auth | `auth/login`, `register`, `lib/auth-service` | Implemented, tested | No password reset on any client (G-4) |
| OAuth | `auth/oauth`, `auth/callback`, `lib/oauth` | Implemented, tested | Google, GitHub, Discord, Instagram. Takeover fixed (S-1). Provider exchange mocked |
| Email verification | `auth/verify-email/*` | Implemented, tested | Hardened (S-5) |
| Device sessions | `AuthSession`, `lib/auth-session-service` | Implemented, tested | Was display only until this phase (S-2) |
| Connect provider by API | `user/connections/[provider]/link` | Stub, 501 | Linking works through `auth/oauth` |
| Two-factor | `user/security` `action: "2fa"` | Stub, 501 | |
| Profiles and privacy | `lib/profile-service`, `lib/privacy` | Implemented, tested | `GROUPS` is in code, not in the `PrivacyLevel` enum |
| Focus sessions, timer | `SessionService`, RPCs, `lib/timer-sync` | Implemented, tested | 81 tests on the migrated schema |
| Study analytics | `user/detailed-stats`, `profile/stats` | Implemented | 35-day window. `/api/insights` is AI insights, not a chart |
| Goals | `goals`, mutation guards | Implemented, tested | |
| Quests | `quests`, `claim_quest_reward` | Implemented, tested | Date only, no time of day (G-3) |
| XP and progression | `lib/game-engine`, RPCs, ledgers | Implemented, tested | Server only |
| Achievements | `achievements` | Implemented, tested | |
| Friends | `friends/*`, `lib/block-service` | Implemented, tested | S-9, D-1 |
| Chat | `conversations/*` | Implemented | S-7. No message limits (S-17) |
| Focus Parties | `lib/focus-party-service`, RPCs, Realtime | Implemented, tested | One active party, four members |
| Calendar | `lib/calendar/*` | Implemented, tested | 33 tests. External sync not exercised |
| AI Planner V2 | `lib/planner/v2`, worker | Implemented | `ApplyService` unchanged. Its own suites were not run here |
| Notes | `lib/notes`, Dexie, Drive broker | Implemented, local-first | The server stores no note |
| Sylvie | `system-messages/chat`, `lib/ai` | Implemented | SSE. No provider called |
| Economy | `shop`, `inventory`, `cosmetics`, ledgers | Implemented, tested | |
| Audio catalog | `acoustics` | Implemented | Relative URLs (G-8) |
| Focus backgrounds | `focus-backgrounds/*` | Implemented, tested | Storage not exercised |
| World persistence | None | Planned, Phase 15 | |
| Resource Shelf | None | Planned | A view over Notes (G-7) |

## 3. Native-to-Web compatibility matrix

Reuse: the route gives this today. Adapt: data exists and needs composing. Gap: does not exist. The Home, Workspace and World guides were corrected to match.

| Native | Need | Real owner | Status | Difference |
| --- | --- | --- | --- | --- |
| Today | Timed entries | `calendar/personal?start&end` | Reuse | |
| Today | Planned entries | `quests?date=` | **Gap** | `scheduledFor` is `YYYY-MM-DD`, so `startsAt` has no source (G-3) |
| Today | `Objective` | `quests`, `goals` | Reuse | |
| Focus | `subject`, `topic` | `subjects`, quest title | Adapt | Needs `subjectId`, `questId` |
| Focus | `StudyDesk` | `focus-backgrounds`, `/preference`, `user/focus-backgrounds` | Reuse | |
| Focus | `RecentSession` | `detailed-stats.sessionLog` | Adapt | `GET /api/sessions` takes one id (G-2) |
| Circle | `CirclePerson` | `friends` | Reuse, changed | `level`, `hunterRank` can be `null`, hidden values read as 0 or false |
| Circle | `StudyParty` | `focus-party` | Adapt | One active party plus invites, not a list |
| Progress | Level, rank, streak | `user/stats` | Reuse | Rank is `User.hunterRank` |
| Progress | `week`, `subjects` | `detailed-stats` | Reuse | Not `/api/insights`. 186 KB (P-2) |
| Progress | `Achievement` | `achievements` | Reuse | |
| Session | `snapshot`, `operations` | `lib/timer-sync`, `SessionProtocolV2` | Reuse | Portable, see below |
| Session | `clientKey` | `TimerSessionStart` | Reuse | Must be a UUID. The app passes one, and the model's fallback is test-only |
| Session | `startedAt` | ISO | Adapt | Convert at delivery |
| Session | `title`, `subject` | `subjectId`, `questId` | Client gap | Picker, Phase 13 |
| Session | Owner | `expectedOwnerId` | Client gap | ADR 0010 |
| Session | Restore elsewhere | `user/stats.activeSessionId`, `sessions?id=` | Reuse | |
| Notes, PDFs, Whiteboard | Documents | None on the server | Gap by design | No `/api/notes` list. Phase 14 |
| Workspace Planner | `PlannerView` | `quests`, `goals`, `planner` | Adapt | As Today |
| Workspace Calendar | `CalendarEntry` | `calendar/personal` | Reuse | `calendar/month` also reconciles HP (I-3) |
| Sylvie | `SylvieThread` | `chats`, `system-messages?sessionId=`, SSE | Reuse, unproven | R8 |
| Audio | `SoundTrack` | `acoustics` | Reuse | Relative URLs (G-8) |
| Resources | `ResourceEntry` | None | Gap by design | G-7 |
| World | Name, level, Sylph, rank, title, class | `user/stats` | Reuse | |
| World | `earnedThisWeek` | None | **Gap** | `XpLedger` has no route, `currency/stats` is all-time (G-5) |
| World | `CollectionView` | `cosmetics` | Reuse | Rarity from the catalog |

**Portability, checked by walking imports.** `session-client` depends on `zod`, its contracts and `lib/timer-engine`, with no browser global. It uses `crypto.randomUUID`, installed on native, and `structuredClone`, which is not. **The Stage 2 handoff overstates the journal problem:** `TimerSync` already takes storage, request and lock as arguments, so native needs a storage adapter, not a second journal. `PreferencesAdapter` lacks `length`, `key`, `removeItem`. By reading the code, not by running it: `emit` calls `window.dispatchEvent`, and React Native defines `window` without it, so it would throw after the server accepted.

## 4. Security and RLS

### Fixed, reproduced first

Evidence: `backend-auth-before-fix.json` (11 of 16 failed), `backend-integrity-before-fix.json` (10 of 11 failed: 8 on real defects, 2 on my own test setup, corrected afterwards), and `backend-postgres.json` (30 of 30 after, including 3 pre-hijacking tests added with the fix, so those 3 have no failing run recorded). One test written as a suspicion, case-variant email, passed before any fix, so that lead was cleared. The RPC guard's 42501 was only observed with this phase's migration applied, so that test does not separately prove the in-function guard.

| ID | Severity | Defect | Fix |
| --- | --- | --- | --- |
| **S-1** | **Critical** | **Account takeover.** The OAuth callback took the unsigned `oauth_link_user_<provider>` cookie as the user to link. Anyone could set it to a sequential victim id, complete Google with their own account, and sign in as the victim | The verified session is the only authority. A disagreeing cookie links nothing |
| **S-2** | High | **Revoking a device did nothing.** `DELETE /api/user/sessions` removed a display row and said it succeeded, while the token kept working. Logout cleared only the browser's copy. Devices appeared only after opening Settings | Tokens carry `sid`. A row ending ends the token on its next request. Sign-in records the device, logout ends it, reissue keeps `sid`. Older tokens work, found by hash |
| **S-3** | High | **Privilege escalation.** `ADMIN_EMAILS` promoted an unverified address, so claiming a listed unregistered address made an administrator | Only a verified address counts |
| **S-4** | High | **Security codes** used `Math.random` with unlimited guesses, and a code collision between two users gave a 500 | `lib/security-code.ts`: secure random, five wrong tries destroy the code, collisions redraw |
| **S-5** | High | **The public verify-email endpoint read security codes** from the same table, unauthenticated and unlimited, verifying the account, destroying the code and returning the owner's email | Tokens containing `:` are refused. A new link no longer cancels a code |
| **S-6** | High | **Pre-hijacking.** Registering a victim's address with a password survived the real owner's later Google sign-in. New OAuth accounts were marked verified even if the provider said not | A verified provider claiming an unverified address removes that password and its sessions. New accounts follow the provider |
| **S-7** | High | **Blocks and message privacy did not apply to groups.** `isGroup: true` could add any user id, and adding to a group had no check | `mayAddToConversation` on both routes, failing closed |
| **I-1** | High | **One forged session credited 20 days** (1,728,000 s). `startedAt` is a client claim | One session credits at most 12 hours, matching the Focus Party clamp, on both protocols. Age is not limited, because delayed offline sessions keep their date |
| **S-8** | Medium | **The leaderboard ignored privacy** | Filtered per viewer |
| **S-9** | Medium | **`/api/friends` ignored a friend's settings** | Applied per field |

**Behavior changes to review.** An unverified password account claimed by a verified Google address loses that password, and no way exists to set a new one. An unverified `ADMIN_EMAILS` account is no longer promoted, and existing `isAdmin` accounts are unaffected. A session past 12 hours stops crediting and still ends normally. Groups with non-friends return 403 unless they accept messages from everyone.

**One test fixture changed.** `__tests__/social/group-avatar.test.ts` made a group with strangers on an unmocked database. Its setup now declares they are friends, with three added mocks. No assertion changed.

### RLS and grants

Evidence: [`rls-audit.json`](evidence/rls-audit.json).

| Question | History before this phase |
| --- | --- |
| Tables | 73 |
| RLS enabled | **45.** The other 28 include `User`, `Quest`, `StudySession`, `Message`, `VerificationToken`. S2 wrote owner policies and did not enable RLS on them, so those policies did nothing |
| Reachable by `anon` or `authenticated` | None. S2 revoked them, so grants were the only wall. Direct read or write of `User` is refused with 42501 |
| Exposed to `anon` | Active focus background catalog, intended |
| Realtime | 4 published tables. An outsider sees 0 rows on those and `SessionInvite`, and writes are refused |
| SECURITY DEFINER | All set `search_path` |
| Functions `anon` could execute | 13, including `remove_focus_party_member`, missed because the 20261014 loop names a function that no longer exists |

**S-10, S-11: written, not applied.** `20261101000000_rls_defense_in_depth` enables RLS on the 28 tables, revokes those functions from `anon`, keeps three helpers for `authenticated` because Realtime policies call them, and closes default EXECUTE for future functions. Additive, idempotent, no data change.

**After it, on the disposable database:** RLS on 73 of 73, no function executable by `anon`, and `remove_focus_party_member` refused to a forged leader with 42501. **Policies were tested with the grant forced on,** in rolled-back transactions: person A sees exactly their own row and 0 of person B's in `Goal`, `StudySession`, `ChatSession`, `AuthSession`, `VerificationToken`, `SystemMessage` and `Quest`.

**Hosted state is unknown.** The handoff has a read-only query.

### Open, not fixed

| ID | Severity | Finding | Why open |
| --- | --- | --- | --- |
| S-12 | Medium | Changing email needs no password | Settings UI change, product decision |
| I-2 | Medium | Study time is a client claim. Bounded by wall clock, non-overlap and 12 h per session, a modified client can still claim up to 24 h a day | A daily ceiling is a product decision |
| S-13 | Low | Login reveals whether an account exists, by message and timing | Rate limited |
| S-14 | Low | Some 500s echo `error.message` | Low value |
| S-15 | Low | `areUsersBlocked` fails open on a query error | `mayAddToConversation` does not |
| S-16 | Low | Minimum password length is 6 | Product decision |
| S-17 | Low | Chat messages have no length or rate limit | Abuse control |
| S-18 | Info | A Realtime token lives 30 minutes, unrevocable. `authenticated` can query membership helpers about any id | Accepted in ADR 0009 |
| I-3 | Low | `GET /api/calendar/month` runs HP reconciliation | Native should read `calendar/personal` |

## 5. Performance

Evidence: [`route-cost.json`](evidence/route-cost.json), [`http-smoke.json`](evidence/http-smoke.json). In process on the M1, disposable PostgreSQL in Docker, 2,001 people, 61,500 quests, 7,000 sessions, one student with 40 friends, 3,000 sessions, 1,500 quests. Twelve measured calls after two warm-ups. SQL counted at the driver. Measured after this phase's fixes, except P-1.

| Route | SQL | p50 | Max | Bytes |
| --- | ---: | ---: | ---: | ---: |
| `getSession` alone | 2 | 1.9 ms | 3.8 ms | |
| `/api/user/stats` | 5 | 5.9 | 10.2 | 935 |
| **`/api/user/detailed-stats`** | 8 | **71.4** | 97.3 | **186,231** |
| `/api/friends` | 14 | 24.1 | 40.3 | 22,653 |
| `/api/user/rankings` | 5 | 28.1 | 31.0 | 18,457 |
| **`/api/quests?all=true`** | 8 | 30.6 | 32.9 | **905,287** |
| `/api/quests/weekly` | 6 | 4.3 | 6.1 | 364 |
| `/api/goals` | 4 | 2.8 | 4.0 | 8,063 |
| `/api/subjects` | 5 | 4.2 | 5.0 | 2,506 |
| `/api/achievements` | **13** | 4.6 | 5.8 | 8,471 |
| `/api/notifications` | 4 | 5.9 | 6.9 | 1,470 |
| `/api/calendar/month` | **18** | 11.7 | 17.1 | 8,335 |
| `/api/focus-party` | 7 | 2.5 | 2.8 | |

Over real HTTP on the production server, on an almost empty database, requests took 7 to 45 ms, sign-in 83 ms, registration 138 ms.

| ID | Finding | Status |
| --- | --- | --- |
| P-1 | The leaderboard loaded every completed quest id to count them. Query alone: 61.1 ms, 889,635 bytes, against 15.6 ms, 133,699 bytes counting in the database | **Fixed** |
| P-2 | `detailed-stats` is the only source for a week chart | Open, Phase 12 |
| P-3 | `quests?all=true` has no limit. Nor do `chats`, `conversations/[id]/messages?after=` | Open. Native must not call `all=true` |
| P-4 | **`getSession` went from 1 statement to 2,** the price of S-2, on every authenticated request. The 1 is from reading the old code | Accepted. A `LEFT JOIN` could restore one statement if a hosted measurement says it matters |
| P-5 | Open-session lookup and flood guard filter a student's history: 0.25 and 0.41 ms at 3,000 rows. A partial index on `endedAt IS NULL` fixes both | Open, not urgent |
| P-6 | `users/search` is a substring scan with `LIMIT 10` | No action |
| P-7 | The leaderboard caches everyone in one value, and `unstable_cache` refuses over 2 MB. At about 370 bytes per response entry that is about 5,000 people. **An estimate** | Open |
| P-8 | Web polls friends and conversations every 15 s, notifications and invites every 30 s | Native: subscribe when seen, do not copy these |
| P-9 | No leak found by reading. `rate-limit` and `redis` memory maps are bounded | No action. No runtime leak test was done |

## 6. Other defects

| ID | Severity | Defect | Status |
| --- | --- | --- | --- |
| **D-1** | High outside production | **`/api/friends` lost all study data outside production.** `lib/prisma.ts` purges the require cache, so `Prisma.join` came from another module copy, the query failed, and `.catch(() => [])` hid it. Every friend looked idle. Production skips the purge, by reading the code | **Fixed.** Ids bind as an array, failures are logged |
| D-2 | Medium | **The history is not self-sufficient.** 7 tables, 4 enums, 12 column statements and 50 indexes exist only through `db push`, and 11 of 78 migrations cannot apply in order from empty | Open, Phase 12. `disposable-backend.mjs` bridges it |
| D-3 | Medium | **Working-tree `schema.prisma` no longer builds from empty.** Three `CalendarNote` generated columns use `@default(dbgenerated(...))` with column references, so `test-timer`, `test-pixel`, `test-planner-postgres.mjs` fail at bootstrap | **Open. The owner's uncommitted edit, left alone** |
| D-4 | Medium | **Stale mocks let unit tests reach a real Prisma client.** With a hosted `DATABASE_URL` in the shell they would query production | Open. Always run root Vitest with overrides |
| D-5 | Low | Root Vitest collects `*.test.*` under `scripts/qa/` and `documentation/` | Open |
| D-6 | Low | `session-sidebar.test.tsx` fails for hours after local midnight | Open, not caused by this phase |

## 7. Missing contracts and blockers

| ID | Blocker | Owner |
| --- | --- | --- |
| G-1 | Native authentication does not exist. Designed in ADR 0009 | Phase 12 |
| G-2 | No small list of recent sessions | Phase 12 |
| G-3 | Quests have no time of day | Phase 13 design |
| G-4 | **No password reset anywhere** | Owner, needs email delivery |
| G-5 | `earnedThisWeek` has no route | Phase 13 |
| G-6 | Notes, PDFs, boards have no server listing | Phase 14 by design |
| G-7 | Resource Shelf has no owner | Phase 14 |
| G-8 | Audio and legacy uploads use relative URLs outside `/api/` | Phase 12 |
| G-9 | `session-client`, `timer-sync` not on the allow-list | Phase 12 |
| G-10 | `PreferencesAdapter` gaps, and `emit` on React Native | Phase 12 |
| G-11 | `structuredClone` on Hermes, `keepalive` ignored | Phase 12, tablet day |
| G-12 | SSE on Hermes and through `protocol.handle` unproven | Phase 12, tablet day |
| G-13 | `requireOrigin`, `sessionHash` refuse native on Notes broker and Calendar OAuth | Phase 14, web flow |
| G-14 | Six routes set a cookie on any response | Phase 12 |

## 8. Recommendations

1. **Critical.** Deploy S-1, and review hosted `ConnectedAccount` for links nobody made. Whether it was used cannot be judged from here.
2. **High.** Apply the RLS migration after the read-only check.
3. **High.** Before deploying, confirm hosted `AuthSession` has `tokenHash` and `expiresAt`, because `getSession` reads them and fails closed. This is a real outage risk if they are missing.
4. **High.** Build G-1 from ADR 0009.
5. **High.** Decide G-4.
6. **Medium.** Reconcile D-2, fix D-3, add P-2 and P-3's bounded reads, decide S-12 and I-2.
7. **Low.** D-4, D-5, S-13 to S-17.

## 9. What the interfaces imply against what a student gets

| Surface | Judgement |
| --- | --- |
| **Today** | **Mismatch.** The timeline is honest only for events. Proposed: timed events on the line, then today's quests in order with minutes. Inventing a time would be a false promise |
| **Focus** | **Strong.** The most useful surface. A session needs a subject to teach a student anything about their week |
| **Dock** | **Strong.** Keep "Not saved yet" until the server accepts. No notification when a countdown ends in the background is a real gap |
| **Progress** | **Strong once P-2 is addressed.** The week chart and subject shares answer "am I studying enough?" |
| **Circle** | **Good.** It must show hidden rank and hours as hidden, not zero |
| **Workspace** | **Honest while labels stay.** Calculator and Timer are real, and Calendar, Planner, Sylvie and Audio's catalog can connect in Phase 13. The other four wait for Phase 14 |
| **World lobby** | **Fine.** `earnedThisWeek` motivates only if accurate. Add the read or remove it |

## 10. Test results

Commands used overridden hosted variables, or the harness, which blanks all 68 variables the source names.

| Category | Command | Passed | Failed | Skipped |
| --- | --- | ---: | ---: | ---: |
| Backend, authorization, ownership | `node scripts/test/test-backend-postgres.mjs --label backend-postgres auth-defects integrity` | 30 | 0 | 0 |
| RLS and grants | `node scripts/test/test-rls-audit-postgres.mjs` | Pass | | |
| Timer, durable core, coordinated routes | `... --suite timer` | 81 | 0 | 0 |
| Calendar | `node scripts/test/test-calendar-postgres.mjs` | 33 | 0 | 0 |
| Notes | `node scripts/test/test-notes-postgres.mjs` | Pass | 0 | |
| HTTP smoke, production server | `run-backend-local.mjs --smoke --build` | 25 | 0 | 0 |
| Root Vitest | `npx vitest --run` | 4449 | 38 | 301 |
| Root typecheck | `tsc --noEmit --incremental false` | 0 errors | | |
| ESLint, final 13 new and core files | `npx eslint` | Clean | 0 | |
| ESLint, wider changed set | `npx eslint` | | 17 | |
| Web build | Inside the smoke run | Pass, 49 s | | |
| `native/` verify | `npm run verify` | Pass, 268 tests | 0 | |

- **Regressions.** Root Vitest has the same 36 as the baseline plus 2 in `session-sidebar.test.tsx`, which this phase did not touch. Its fixture builds "today" as hours ago, the baseline ran before local midnight and the later runs after. With `TZ=UTC` all 5 pass. No baseline failure was fixed. Eight files fail to collect, as in the baseline.
- **ESLint's 17** are `no-explicit-any` on lines I judged older than this phase, by reading them and not by a line-level diff.
- **Calendar and Notes** ran before the last edit to `rankings` and were not rerun. Neither touches it.
- **Blocked.** `test-timer`, `test-pixel`, `test-planner-postgres.mjs` fail at bootstrap on D-3. Timer suites ran through the new harness. Pixel and Planner's own suites did not run.
- **Flaky.** None seen, in one or two runs each, which is not a statement about stability.
- **Never run.** Any hosted service, Android, iOS, the tablet, the Electron checks (no native code changed), `mobile:build` and `mobile:verify` (no client-imported module changed), real OAuth, email delivery, any AI provider, `test-planner-v2-*`.

## 11. Files changed

**New.** `lib/auth-session-service.ts`, `lib/security-code.ts`, `prisma/migrations/20261101000000_rls_defense_in_depth/`, `scripts/test/lib/disposable-backend.mjs`, `scripts/test/test-backend-postgres.mjs`, `scripts/test/test-rls-audit-postgres.mjs`, `scripts/test/run-backend-local.mjs`, `config/vitest.backend-postgres.config.ts`, `__tests__/backend/postgres/`.

**Authentication.** `lib/auth.ts`, `lib/auth-server.ts`, `lib/auth-service.ts`, `lib/auth-admin.ts`, `app/api/auth/callback/[provider]`, `auth/login`, `logout`, `logout-all`, `register`, `user/sessions`, `user/security`, `user/security/send-code`, `user/account`, `user/account/delete`, `user/reset-progress`, `user/onboarding`, `user/stats`.

**Integrity, privacy, performance.** `lib/planner/v2/server/sessions.ts` (the cap only), `lib/block-service.ts`, `lib/cache-service.ts`, `app/api/conversations`, `conversations/[id]`, `friends`, `user/rankings`.

**Test fixture.** `__tests__/social/group-avatar.test.ts`, setup only.

**Docs.** Master plan, ADR 0008's backend map, ADRs 0009 and 0010, Home, Workspace and World guides, timer and authentication docs, `scripts/README.md`, native and handoff indexes.

**Unchanged by this phase.** `prisma/schema.prisma`, every existing RPC and trigger, ledgers, `ApplyService`, `native/`. Nothing is committed and HEAD is `f5a900b`. The one tracked evidence file a harness wrote, `documentation/timer/reports/2026-10-14-lifecycle/evidence/postgres-harness-run.json`, was restored from a copy, though the failing timer harness ran again only before that restore. `tsconfig.json` matches your snapshot.

**Process notes.** `baseline.md` was written through Bash before the Write refusal appeared, as you required. It gained an added notes section later, with recorded results untouched. To clear leftovers I ran `pkill` against Vitest process names.
