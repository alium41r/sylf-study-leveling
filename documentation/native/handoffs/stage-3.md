# Sylf Native — Stage 3 handoff (Phases 11 to 13)

**Written 1 November 2026, at the end of Phase 13. Read this first in a fresh session.** It is self-contained: a new agent needs only the repository. Source, tests, schema and configuration win over any prose. For how the project runs, the [Stage 2 handoff](stage-2.md) §1 and §8 are still current, and for the Mac's setup, the [Stage 1 handoff](stage-1.md).

**The roadmap changed after this was written, 1 November 2026.** The next work is the [Expansion stage](../expansion/README.md), not Phase 14. Part 1 is complete, so start from its [handoff](expansion-part-1.md). The owner's review and the remaining tablet verification are carried in the stage's entry gate, and Phase 14 waits for the stage to end. Everything here stays current as a record of Stage 3, with two changes: rule 2's "nothing polls" is narrowed by [ADR 0013](../decisions/0013-expansion-stage.md) decision 7, and §7 will be restated in `expansion.md`.

**State.** Stage 3 is complete on the Mac, awaiting review. Nothing is committed or deployed. HEAD is `f5a900b`. **Nothing touched hosted Supabase, Redis or storage. No real OAuth provider was contacted, no AI provider was called, and nothing ran on a device, on Hermes, or on iOS or Windows.** Phase 14 must not start without the owner's approval, and the tablet stays out of bounds until they authorize it.

**Final verification, 1 November, supersedes the test results below.** The current evidence is the [Stage 3 verification report](../reports/stage-3-verification/report.md). The core journey now passes on the real tablet on Hermes, and the Mac's final set passes apart from one load-sensitive root test. The web tree settled, D-7 is fixed, and the deleted harness is explained. By-hand tablet checks, landscape and real OAuth remain. For deploying, use the [deployment checklist](../backend/deployment-checklist.md).

**Device findings to keep.** Android does not resize this window for the keyboard, so use `useKeyboardLift` on any new surface with fields. Every scroll view needs `keyboardShouldPersistTaps="handled"`, and a test enforces it. A running session's controls must never wait for a read. World's animation stops `uiautomator`, so use screenshots there and while a session runs.

**Sylf Native is a real client now.** A student can create an account, see their day, study, have it reach the server once, watch their record move, and come back on another launch. Local results are real SQL, real settlement and a real Electron window. Every statement here describes a disposable PostgreSQL 17 and this Mac.

Reports: [Phase 11](../reports/phase-11/report.md), [Phase 12](../reports/phase-12/report.md), [Phase 13](../reports/phase-13/report.md). Decisions: [ADR 0009](../decisions/0009-native-authentication.md), [0010](../decisions/0010-session-ownership-before-sign-in.md), [0011](../decisions/0011-shared-backend-foundation.md), [0012](../decisions/0012-connected-app.md), all **Proposed**. The contract is the [backend guide](../backend/README.md).

## 1. Architecture

```
Next.js server: app/api/** ─ getSession (cookie, or bearer with the same revocation) ─ SessionService, RPCs, ledgers ─ PostgreSQL
                              ▲ /api/auth/native/* ─ one AuthSession row per device
                              │
Electron: main process ── token-session.mjs ─ safeStorage vault ─ bearer ──┤  sylf://app/api/* ◄─ renderer holds no token
Device:   token-session.mjs ─ expo-secure-store ─ bearer ──────────────────┘
                              │
@sylf/backend (behind import(), absent with no backend)
   createBackend: client, resources, auth, timer, reads
   createSessionBridge ─ between the two owners below
                              │
apps/sylf
   App.tsx ─ prepareBackend, connectBackend ─ AccountGate (only with a backend)
   ├─ SignInSurface, AccountSheet, ClaimSheet
   └─ SpacesShell, keyed by account
        Home:      data/live.ts ─ one resource per destination
        Workspace: data/live.ts ─ Planner, Calendar, Audio. Sylvie reads her own. Four tools `limited`
        World:     data/live.ts ─ Traveller, Collection
packages/spaces: createStudySessionModel, the one owner of time
lib/timer-sync.ts: TimerSync, the one journal, reached through @sylf/shared/backend
```

| One authority | Owner |
| --- | --- |
| Identity on the server | `AuthSession`, `getSession` |
| Identity on a client | `backend.auth` |
| A running session | `createStudySessionModel` |
| Delivery | `TimerSync` and `SessionProtocolV2`, joined to the model by `createSessionBridge` |
| Progression, rewards, what is credited | The server. Clients read it |
| Cached reads | `createResourceStore`, memory only, gone at sign-out |

**What decides what a screen shows.** Someone signed in: live. A backend and nobody signed in: empty. No backend and `DEV_TOOLS`: sample. No backend and no `DEV_TOOLS`: empty. Sample can never sit beside a real account.

## 2. Implemented and verified

"Verified" here means: real server, real SQL, real Electron window, on this Mac.

| Feature | Verified by |
| --- | --- |
| Sign-in, create account, sign-out, restart with no password | Journey, in two real processes on one profile |
| A wrong password: refused once, in the server's words | Journey counts the request. Unit test for the route marked `password_incorrect` |
| An ended session says why | Journey: revoked from another device, through `logout-all` |
| A change of account leaves no trace | Journey scans every Space, the dock and Workspace for the last person's words |
| Study without an account, and being asked once | Journey, and ADR 0010's five tests |
| One session across the dock, Focus and Workspace's Timer | Journey, and the Session check |
| Subject and task reach the server | Journey reads them back from `/api/sessions` |
| `saved` flips only on acceptance | Bridge tests, journey, integration suite |
| No duplicates, through reloads and a real process restart | Journey: exactly one row. Bridge test for a crash between the two writes |
| Offline, a restart offline, and reconnection | Journey takes the network away at a stub |
| Past the 12-hour cap | Bridge test with a fake server, the server's clamp in the integrity suite, and the sentence in unit tests. **The screen was not run past 12 real hours** |
| XP, Sylph and study time move, on the server | Journey: 66 seconds credited 5 XP and 5 Sylph |
| Today, Focus history, Progress, Circle | Journey, on empty and real data, with hidden fields |
| Planner: today, quests, goals | Mapper tests and journey. **Ticking a quest and Claim on an achievement were never pressed in the journey or sent by the client against a server.** The routes behind them have their own suites |
| Calendar: a month, adding an event | Journey |
| Sylvie through `client.stream` | Journey and integration, on an answer the server gives by itself |
| Audio's catalog | Journey. Playback is disabled, and says so |
| World lobby: identity, progression, cosmetics, earned this week | Journey, route suite |
| World guard | Journey: a running session blocks entry, and time past the gate changes nothing |
| No token in the renderer | Journey and backend check |
| A running session makes no requests of its own | Journey: 0 in 6 seconds |

## 3. Partial

| Item | What exists | What does not |
| --- | --- | --- |
| Notes, PDFs, Whiteboard, Resources | An honest limited state, signed in | Everything else. **Phase 14** |
| AI Planner V2 | Applied plans appear as quests. The tool says where plans are built | Any part of the lifecycle on native. The end-to-end flow was not verified, so nothing imitates it |
| Sylvie | Threads, a streamed turn, plain text | Rich text, images, confirming a proposal. A reply that proposes a change needs the web |
| Audio | The catalog | Playback, which needs the native audio engine |
| Circle | Friends, requests, a party, invitations | Finding people, joining a party, study parties in session |
| A session on another device | A note in Focus. The server folds a matching start into it | Adopting it into the dock (`SessionProtocolV2.restore`) |
| Account | Name, sign-out | Password or email change, deleting an account, password reset (G-4). The sheet says so |
| Appearance | Six themes on every surface | A settings surface: there is none yet |

## 4. What needs a device or an external service

| Needs | What | Where |
| --- | --- | --- |
| The tablet | Everything on Hermes, Keystore, Android's keyboard, the UI thread, native memory | [Tablet checklist](tablet-checklist.md), most important first |
| A real OAuth app | The system-browser step, on any platform. Whether every provider accepts a JWT `state` of this length | Owner |
| A hosted database | Everything in §5, and real latency: local figures are in process | Owner |
| A real AI provider | A real streamed reply, and quota behavior. A paid call | Owner |
| iOS, Windows | Never built | Later |

## 5. For the owner, in order

**Nothing here has been done.** None of these block Phase 14's local work.

**Before deploying anything.** Run read-only on the hosted database:

```sql
-- getSession reads these columns and fails closed, so they must exist.
SELECT column_name FROM information_schema.columns WHERE table_name = 'AuthSession' AND column_name IN ('tokenHash', 'expiresAt');
-- Tables with no RLS, to compare with the migration's list.
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
-- Indexes the history does not create: expect these three at least.
SELECT indexname FROM pg_indexes WHERE indexname IN ('StudySession_userId_startedAt_idx', 'AuthSession_tokenHash_key', 'Quest_userId_status_idx');
```

| # | Do | Why |
| --- | --- | --- |
| 1 | **Apply `20261101100000_native_auth_sessions`, before the code** | Additive and idempotent. Prisma names these columns, so with the code ahead of the migration, `GET /api/user/sessions` fails and a browser sign-in records no device row |
| 2 | **Deploy, which delivers the OAuth takeover fix (S-1), and review `ConnectedAccount` for links nobody made** | S-1 existed in production code. Whether it was used cannot be judged from here |
| 3 | Confirm your own account is `VERIFIED` | The `ADMIN_EMAILS` promotion now needs it. An account already `isAdmin` is unaffected |
| 4 | Apply `20261101000000_rls_defense_in_depth` | Not applied anywhere hosted |
| 5 | Apply `20261101110000_open_session_index`, built `CONCURRENTLY` first on a large table | Prisma cannot express it, and `db push` would offer to drop it |
| 6 | Fix or confirm `CalendarNote` in `schema.prisma` (D-3) | Your edit, and it stops the schema building from empty |
| 7 | Decide D-2, the migration history | A later migration cannot fix replay. The real fix is a baseline from the hosted schema |
| 8 | Set `EXPO_PUBLIC_SYLF_API_ORIGIN` and `SYLF_BACKEND_ORIGIN` for a real build | Unset, nothing connects |
| 9 | Look at D-7 | See the [Phase 13 report](../reports/phase-13/report.md) |

**Decisions.**

| Question | Built as |
| --- | --- |
| Password reset (G-4). None exists on any client, and it needs email delivery | The sign-in page says so plainly |
| Must first launch require an account (S2) | No. "Study without an account" is on the sign-in page |
| Does an email change need a password (S-12) | Unchanged |
| A daily ceiling on credited study (I-2) | None. A modified client can claim up to 24 hours a day |
| Node's `fetch` against system proxies on Electron | Node's `fetch`, so no system proxy or OS trust store. Matters on managed networks |
| Whether a friend may see that fields are hidden | `visible` on `/api/friends` says which are, so Circle can say hidden |

**Possible leftover.** Electron's `safeStorage` ran in throwaway profiles and may have left a Safe Storage item in the login keychain.

**Please confirm both of these were intended.** `.env.local` changed at 08:12:31 on 1 November, and `app/dev/planner-studio-harness/` (`Harness.tsx`, `page.tsx`, untracked) disappeared at about 09:54. Phase 13's agent had no activity from 07:35:47 to 10:41:51, so neither came from this run. The folder is not in any stage snapshot.

## 6. Harness

Docker Desktop: `open -ga Docker`, and quit it after use with `osascript -e 'quit app "Docker Desktop"'`.

**Every backend command needs the overrides,** on that command:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/none DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:55432/none DATABASE_WORKER_URL=postgresql://postgres:postgres@127.0.0.1:55432/none UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= SUPABASE_SERVICE_ROLE_KEY= SUPABASE_JWT_SECRET= NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= GROQ_API_KEY= GEMINI_API_KEY= OPENAI_API_KEY= ANTHROPIC_API_KEY=
```

| Command | What it does |
| --- | --- |
| `node scripts/test/test-backend-postgres.mjs --out <dir> --label <name> [filter]` | Route handlers on real SQL |
| `... --suite timer`, `planner`, `pixel`, `planner-v2` | Each repository suite on the migrated schema. `planner-v2` needs Node 24: `PATH=/usr/local/bin:$PATH /usr/local/bin/node scripts/test/...` |
| `... --label x --measure <file> measure-routes` | Route cost |
| `node scripts/test/test-rls-audit-postgres.mjs --out <dir>` | RLS, grants, RPCs |
| `node scripts/test/test-native-migrations-postgres.mjs --out <dir>` | The migrations against an older database, with their rollback |
| `node scripts/test/run-backend-local.mjs --native-checks --electron [--build] --out <dir>` | The real server, the device client's integration suite, and the Electron backend check |
| `node scripts/test/run-backend-local.mjs --journey [--build] --out <dir>` | **The student journey.** Two real processes on one profile. Build `native/` first with `npm run build:web` |
| `node scripts/test/run-backend-local.mjs --serve` | A real server on `127.0.0.1:3111` |

**Traps, all from real failures.**

- `--out` defaults to Phase 11's folder on the older scripts. Always pass it.
- Root Vitest overwrites `documentation/performance/phase-0/artifacts/render-diagnostics.json`. `--suite planner-v2` overwrites `documentation/planner/reports/2026-10-03-phase-2/evidence/step6-maximum-postgres.json`. Copy both aside and put them back.
- The guard refuses any Bash text that mentions root Vitest's config without `DATABASE_URL` on the same command, any `rm -rf`, and any text with `adb`, even in a heredoc that only writes a document.
- The Planner suites accept only a database whose name contains `planner`, and use `suiteEnvironment`, not `backendEnvironment`.
- A seconds-old account gets seconds of credit, and settlement pays on real minutes, so the journey waits 66 seconds.
- **Sunday is a rest day by default, and the server refuses quests on one.** The journey clears `restDays` first.
- `fetch` with `Sec-Fetch-Site` is what a browser does. `net.fetch` adds it even from Electron's main process.
- The app restores its last Space and destination, so a check must name where it goes: `open("space=home&home=today")`.
- Dialogs are `role="alertdialog"`.
- A check that reads a window below its minimum size is reading something else: call `setMinimumSize` first.
- A root `tsc` needs `NODE_OPTIONS=--max-old-space-size=4096`, because the default heap ran out on this tree.

## 7. Requirements for Phase 14

**Prerequisite:** the [Expansion stage](../expansion/README.md) is complete, then the owner briefs Phase 14. The brief takes precedence over everything here.

**What Phase 14 owns.** Notes, PDFs, Whiteboard and the Resource Shelf: R2 (ink), R3 (rich text), R4 (PDFs), and whatever the brief adds, such as the hardware keyboard hook that ADR 0008 decision 27 deferred.

**What it inherits.**

- `LIMITED_TOOLS` in `spaces/workspace/data/live.ts` holds the four honest states. Each tool checks `result.limited`. Remove an entry when its tool is real, and Sample, empty and live all keep working.
- The tools' view models in `spaces/workspace/data/contracts.ts` were never audited against a real document source, because there is none on the server (G-6, G-7).
- **G-13:** `requireOrigin` and `sessionHash` refuse native on the Notes broker and Calendar's OAuth connect, on purpose. Phase 14 needs the web flow it was designed for.
- Local-first stays. The Notes `userKey`, `lib/notes` and Dexie's owners are not native. Do not store authored content in `resources`: it is memory only and cleared at sign-out.
- ADR 0011's table says what goes at sign-out. Unsaved drafts do not.

**Rules to keep.**

1. One authority each, as in §1. `TimerSync` is the journal. Never add a second one.
2. No screen calls `fetch`, nothing polls, and `@sylf/backend` stays behind `import()`. New reads get a name in `reads.ts`.
3. Rewards are never computed on a client. `saved` flips in one place.
4. A build with no backend behaves as it did. A store build shows no sample.
5. No token reaches Electron's renderer. The journey and `backend-check.mjs` prove it.
6. World time never counts as study. No game before Phase 15.
7. Keep the journey passing: it is the closest thing here to a student.

## 8. Unresolved issues, most important first

**Critical or high: none known in code.** The first three matter most, and each is a gap in proof rather than a known defect.

| # | Priority | Issue | State |
| --- | --- | --- | --- |
| 1 | Medium | The core has now run on Hermes. By-hand, landscape and setting checks have not | [Verification report](../reports/stage-3-verification/report.md) |
| 2 | High | **Hosted state is unknown,** and the migrations are not applied | §5 |
| 3 | High | **Real OAuth has never run** | Needs a real app and a decision |
| 4 | Done | The web tree moved during Phase 13. The full set has since run on it | Verification report |
| 5 | Done | D-7 was a real time-zone bug, now fixed | Verification report |
| 6 | Done | A quest and an achievement run through the client against a real server | Integration suite |
| 7 | Medium | Password reset does not exist (G-4) | Owner |
| 8 | Medium | A session open on another device is noted, not adopted | Later |
| 9 | Medium | No notification when a countdown ends in the background (R9) | Later |
| 10 | Medium | D-2, D-3, S-12, I-2 | Owner |
| 11 | Low | The Planner suite's `exam-entry` 4, and root's 36 baseline failures | Unchanged |
| 12 | Low | Sylvie's proposals cannot be confirmed here, and her text is plain | Later |
| 13 | Low | Electron has no system proxy | Owner |
| 14 | Low | No settings surface, so Appearance has no entry outside the development build | Later |

**Deferred functionality:** Notes, PDFs, Whiteboard, Resources (Phase 14). AI Planner V2 on native. Audio playback. Finding friends, joining parties. Breaks. Sessions adopted across devices. World persistence and the game (Phase 15).
