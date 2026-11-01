# Sylf Native backend guide

The current contract for how Sylf Native reaches the existing Sylf backend. **Source, tests, schema and configuration win over this page.** Decisions are in [ADR 0009](../decisions/0009-native-authentication.md) (authentication), [ADR 0010](../decisions/0010-session-ownership-before-sign-in.md) (who owns a session) and [ADR 0011](../decisions/0011-shared-backend-foundation.md) (this foundation).

**State: built in Phase 12 and connected in Phase 13, tested locally on real SQL and in real Electron.** Nothing here has run on a device or against hosted services. A build with no backend behaves as Phase 10 did. [ADR 0012](../decisions/0012-connected-app.md) records how the app is joined.

**Planned (1 November 2026, not built).** The [Expansion stage](../expansion/README.md) extends this foundation with a heartbeat, one Realtime connection, a narrow visible-only fallback ([ADR 0013](../decisions/0013-expansion-stage.md) decision 7) and many more named reads. The [feature map](../expansion/feature-map.md#1-how-far-native-reaches-today) shows what Native reaches today.

## 1. How a request travels

```
screen → useResource(resource) ─┐
                                ├─ @sylf/backend client ─ errors, timeouts, dedupe, retries, parsing
TimerSync ── client.fetch ──────┘        │
                                         ├─ device:   token-session.mjs ── bearer ──────────────► /api/*
                                         └─ Electron: same origin ─ sylf://app/api/* ─ main process ─ token-session.mjs ─ bearer ─► /api/*
```

On the server, `getSession` in `lib/auth-server.ts` is the one identity check. A bearer token reaches every route through it, with the same revocation check as a cookie. Notes' broker and Calendar's OAuth connect still refuse a native client, on purpose (G-13).

## 2. Using it

`apps/sylf/src/shell/backend.ts` joins everything once, after the first frame. `useBackend()` returns `null` until then, and for good in a build with no backend.

```ts
const backend = useLiveBackend(); // Null unless someone is signed in.
const stats = useMemo(() => backend?.resources.resource({
  key: "user-stats",
  load: (signal) => backend.reads.stats(signal),
  tags: ["progress"],
}) ?? null, [backend]);
const state = useOptionalResource(stats);
```

A read has a name in `packages/backend/src/reads.ts`, so a screen holds no path and no schema. Each Space composes its reads in `spaces/<space>/data/live.ts`, into one resource per destination, with pure mappers that import only types. `toLiveResult` turns a resource's state into what a screen reads, so all three Spaces say loading, offline and failed the same way.

**Tags that matter:** `sessions`, `progress`, `today` and `traveller` are invalidated by the bridge when the server accepts a session. `subjects`, `circle`, `calendar` and `sylvie` by their own mutations.

A key names one object. Put the owner-independent identity of the read in it: the store is cleared at sign-out, so no key needs a user id.

**Mutations** use `client.send("POST", path, { body, schema })`, then `resources.invalidate("progress")`. They do not retry. A `timeout` means the outcome is unknown, so reload before offering to try again.

**A 401 is not always the end of a session.** One route answers 401 for a wrong password, and marks it `code: "password_incorrect"`, so it is never refreshed and replayed. The session has ended only when a refresh was refused, which carries `code: "session_ended"`, and only that signs the person out.

**Time** goes through the journal, through the bridge. Never call `PATCH /api/sessions` from a screen.

## 3. The states a screen shows

| `status` | Meaning | `data` |
| --- | --- | --- |
| `idle` | Nobody has watched it yet | `null` |
| `loading` | First read | `null` |
| `ready` | Has data. `stale` is true while a refresh runs | Value |
| `empty` | Loaded, and `isEmpty` said so | Value |
| `offline` | Nobody answered. It recovers by itself | The last good value, if any |
| `failed` | Refused or broke. `error` says how | The last good value, if any |
| `signed-out` | The session is over | The last good value, until `clear` |

`describeFailure(error)` gives the words. `BackendError.transient` says whether trying again could work with nothing changed.

## 4. Authentication

`backend.auth` is the one owner of identity. Its snapshot is `status` (`not-configured`, `restoring`, `signed-out`, `signed-in`), `userId`, `user` and `ended`.

- **`userId` is known from the device, with no network,** so a session started offline has its owner.
- **After a restart `user` is null.** Read identity from `useStats()`.
- **`ended: true`** means the server ended this session. Say so, rather than quietly showing a sign-in screen.
- **Password reset does not exist on any client** (G-4), and needs the owner. Registration closes in prelaunch.

| Route | Takes | Gives |
| --- | --- | --- |
| `POST /api/auth/native/login` | `identifier`, `password`, `clientName` | `session`, `user` |
| `POST /api/auth/native/register` | As the web, plus `clientName` | `session`, `user`. 409 when taken, 403 in prelaunch |
| `GET /api/auth/native/oauth/start` | `provider`, `challenge`, `redirect` | A redirect to the provider. Opened in the system browser |
| `POST /api/auth/native/token` | `grant: "refresh"`, or `grant: "oauth_code"` with `code`, `verifier`, `clientName` | `session`. 401 with `code: "session_ended"` means it is over |
| `POST /api/auth/native/logout` | `refreshToken` | Always `success` |
| `GET /api/auth/native/ping` | Nothing | `ok`. No database |

The contract is `lib/native-auth-contract.ts`, read by both sides.

**Electron answers some of these itself.** `GET /api/auth/native/session` exists only in the main process, and `POST /api/auth/native/oauth/begin` runs the browser flow on a loopback port. The renderer can never call `token`.

## 5. Small reads

| Read | Use for | Notes |
| --- | --- | --- |
| `GET /api/sessions?limit=20&cursor=` | Recent sessions | Finished only, newest first, cap 50. `id=` still restores one |
| `GET /api/user/detailed-stats?summary=true` | The week chart and subject shares | Same answer, without `sessionLog` |
| `GET /api/quests` | Today's quests | The student's own today, decided by the server in their timezone |
| `GET /api/quests?all=true&limit=50&cursor=` | Any list of quests | `{ quests, nextCursor }`, cap 100. **Never call `all=true` with no limit** |
| `GET /api/user/earned-this-week` | The lobby | `xp`, `sylph` credited since the student's Monday |
| `GET /api/chats?limit=20&cursor=` | Sylvie's threads | Cap 50 |
| `GET /api/conversations/[id]/messages?after=` | New messages | Capped at 200, oldest first. A full page means ask again from the last id |

Typed: `recentSessionsSchema`, `studySummarySchema`, `questPageSchema`, `userStatsSchema`, in `packages/backend/src/contracts.ts`. Real answers are parsed by the integration suite, so these are checked against the server, on an empty account and after a session.

**Relative URLs (G-8).** `client.assetUrl("/audio/rain.mp3")`. On a device that adds the origin. On Electron it stays relative, and the main process proxies `/audio/`, `/uploads/` and `/images/`, with no credential, by range.

**Streams.** `client.stream(path, init, onChunk)`, and `reads.sendToSylvie` on top of it, read Sylvie's real route in real Electron and on the integration suite, on an answer the server gives with no provider. **Never run:** a real provider's stream, and anything on Hermes.

## 6. The timer

`createStudySessionModel` is the only owner of a running session. `TimerSync` from `lib/timer-sync.ts` is the journal on every client. `createSessionBridge` is the one piece between them, and it computes nothing.

| What | State |
| --- | --- |
| `backend.timer.current()` | The signed-in owner's `TimerSync`, started, or `null`. Stops at sign-out, wakes on reconnection and foreground, retries while anything is pending |
| Journal storage | `createJournalStorage(preferences)`, one preference value, `sylf.native.timer-journal.v1` |
| `ownerId` on the session model | Stamped at start. Ownerless when nobody was signed in, and then never delivered unless the person accepts |
| The bridge | `currentBridge()`. Writes a session and its operations to the journal, and turns `onAccepted` into `settleAccepted` and `applyAccepted`. `flush`, `claim`, `decline` |
| `saved` | Flips in `settleAccepted`, on the server's answer, and nowhere else |
| `useSessionSync()` | `pending`, `offline`, `error`, `lastSaved`, for the words beside a session |

**A session's whole path.** `model.start` → bridge `create` → `TimerSync.drain` → `POST /api/sessions` with `executionProtocol: 2`. Then `PAUSE` and `RESUME` through `SessionProtocolV2`. `model.end` → `finish` → `END` → `settle_study_session_atomic` → `onAccepted` → `settleAccepted` → the tags above.

**Trap.** The server clamps a session's start to the account's creation and the last ended session, so a test on a seconds-old account gets seconds of credit. That is correct behavior, and it reads like a bug. And settlement pays on real minutes: a 66-second session earned 5 XP and 5 Sylph in the journey.

## 7. Platforms

| Platform | Credential | Network | Verified |
| --- | --- | --- | --- |
| Electron | `safeStorage`, in `userData/session.bin`, mode 600. Memory only when encryption is unavailable | Node's `fetch` in main. **No system proxy** | Real window, real server, [`electron-backend-check.json`](../reports/phase-12/evidence/electron-backend-check.json) |
| Android, iOS | `expo-secure-store`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, off Android's Auto Backup | Platform `fetch`, `credentials: "omit"` | **Node only,** through the integration suite. Android compiles. Nothing ran on a device |
| Web build in a browser | None. `useBackend()` is `null` | None | |

`EXPO_PUBLIC_SYLF_API_ORIGIN` (device) and `SYLF_BACKEND_ORIGIN` (Electron) name the server. Only `https`, or `http` to this machine, are accepted. **Neither is set anywhere, so nothing in this repository talks to a hosted server.** Packaging Electron with its origin belongs to the release pipeline.

## 8. Running it locally

Hosted variables go on the command, as `AGENTS.md`'s harness section and the [Phase 12 handoff](../handoffs/phase-12.md#6-harness) show.

| Command | What it does |
| --- | --- |
| `node scripts/test/test-backend-postgres.mjs [filter]` | Route handlers on real SQL, ADR 0009's tests among them |
| `... --suite timer`, `planner`, `pixel`, `planner-v2` | Each repository suite on the migrated schema |
| `node scripts/test/test-native-migrations-postgres.mjs` | Phase 12's migrations against an older database |
| `node scripts/test/run-backend-local.mjs --native-checks --electron --build` | The real server, then the device client's integration suite and the Electron check. Run `npm run build:web` in `native/` first |
| `node scripts/test/run-backend-local.mjs --journey` | The whole student journey in real Electron, as two processes on one profile. Run `npm run build:web` first |
| `node scripts/test/run-backend-local.mjs --serve` | A real server on `127.0.0.1:3111` for a client |

## 9. What is not proven

- **Nothing here ran against hosted Supabase, Redis or storage.** Local results describe disposable PostgreSQL 17 with fallbacks.
- **No real OAuth provider was contacted.** The exchange is mocked, and the system-browser step has never run for real on any platform.
- **No AI provider was called.** Sylvie's route ran end to end on the answers the server gives by itself.
- **Nothing ran on Hermes, Android or iOS.** `portability.test.ts` removes what Hermes lacks and proves the code no longer reaches for it, on V8.
- **Keychain and Keystore were not exercised.** `expo-secure-store` compiles, and its adapter has no test on a device.
- **`keepalive` is ignored by React Native's fetch,** so a request sent as the app dies may not finish. The journal replays it, which is the design.
