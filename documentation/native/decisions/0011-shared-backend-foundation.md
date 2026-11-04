# ADR 0011 — The shared backend foundation

**Status: Proposed with Phase 12 (1 November 2026), for the owner to review.** It builds on [ADR 0009](0009-native-authentication.md) and is written for Phase 13 to use. The current contract is the [backend guide](../backend/README.md).

**As used (Phase 13).** Every decision held, and [ADR 0012](0012-connected-app.md) builds on them. Two additions: `reads.ts` names every read and write a screen makes, and `client.fetch` now reports connectivity and `session_ended`, because a journal request can be the first thing to learn of either.

## The problem

Sylf Native had no way to reach a server. Phase 13 needs to connect Home, Workspace and World without each screen inventing its own requests, errors and caches, without a second source of truth for identity, time or XP, and without changing the local-first decisions already made.

## Decisions

All **Proposed**.

| # | Decision | Why |
| --- | --- | --- |
| 1 | **One package, `@sylf/backend`.** No UI, no React. A client, an auth model, a resource store, connectivity, the journal's storage, typed contracts, joined by `createBackend`. | The pattern used four times already: a long-lived object outside React, tested with no renderer, read through `useSyncExternalStore`. |
| 2 | **The server stays the only authority.** The package holds no rule about XP, rank, streaks or time. It parses what `user/stats` and friends return. | Rewards are never computed on a client. |
| 3 | **Two clients, one interface.** `AuthGateway` is either the device, which holds tokens, or Electron's renderer, which talks to its own origin while the main process holds them. Screens and the auth model cannot tell which. | ADR 0009 needs them to differ, and nothing above them needs to know. |
| 4 | **Refresh has one implementation.** `token-session.mjs` is plain JavaScript, so Electron's main process loads it directly and the device client imports the same file. | Rotation has a rule that can end a session. Two copies of it would drift. |
| 5 | **Errors have one type,** `BackendError`, with a `kind`. Screens choose what to show from `kind`. Server text is shown only for refusals written for people, and never for a 5xx. | A screen should not know status codes, and Phase 11 found 500s that echo internals (S-14). |
| 6 | **Reads retry, mutations do not.** A read retries on what could be momentary, honoring `Retry-After`. A mutation that timed out has an unknown outcome, so only its owner may replay it. `TimerSync` can, through its durable identities. | Replaying a write blindly is how a client double-claims. |
| 7 | **Concurrent reads of one path are one request,** cancelled only when the last caller leaves. | Three views of the same data make one call. |
| 8 | **A read runs only while someone watches it.** Leaving cancels it. Nothing polls. A read repeats on invalidation, on reconnection and on return to the foreground, and only past its `ttlMs`. | Rule 4 of the Stage 2 handoff, and finding P-8: do not copy the web's 15 and 30 second polls. |
| 9 | **Cached server data lives in memory only,** and `clear()` drops it, including answers still in flight, at sign-out or an account change. | On a shared device, one person's cached reads must not outlive them. The web has private exceptions to its own disk cache. Native starts with none on disk, and adds it only for a measured need. |
| 10 | **A native cache instead of `lib/client-data-cache.ts`.** That module is a singleton tied to `window`, `localStorage` and the Notes session. | It is the web's. Extending it for React Native would mean changing what the web relies on. Noted because `AGENTS.md` names it, and this is the reasoned exception. |
| 11 | **`TimerSync` is the journal on every client.** `createJournalStorage` gives it the small part of `Storage` it asks for, over the two-call preferences adapter, in one preference value. No Kotlin or Swift changed. | The Stage 2 handoff overstated this: Phase 11 found no parallel journal is needed. One value also means a crash leaves the last whole journal. |
| 12 | **The journal survives sign-out.** Keys are namespaced by owner, as on the web, and a session waits for its owner. | ADR 0010 decision 7. |
| 13 | **Connectivity is learned from requests.** While it believes it is offline it asks `/api/auth/native/ping` on a growing delay, only while something is waiting. No connectivity library. | An unreachable server and no network look the same, and that is the only question that matters. An idle app schedules nothing. |
| 14 | **Nothing loads without a backend.** `@sylf/backend` sits behind `import()` in `shell/backend.ts`, and the boundary audit fails on a static import anywhere else. A build with no origin sends nothing. | Start-up and Stage 2's memory budget stay where they were, and the store build's "no sample content" rule is untouched. |
| 15 | **Small reads are additive on the server.** `limit` and `summary` are new query parameters. Absent, each route answers as it always did. | The web keeps working untouched. |

## What each kind of data is

| Kind | Examples | Lives in | Owner | Goes at sign-out |
| --- | --- | --- | --- | --- |
| Server-authoritative | Identity, XP, level, rank, streak, quests, recorded sessions | The server. A copy in the resource store | The server | Yes, at once |
| Cached | Any read through `resources` | Memory only | `createResourceStore` | Yes, including in-flight answers |
| Credentials | Refresh token | `SecureSessionAdapter`, or Electron's main process. The access token is in memory only | `token-session.mjs` | Yes |
| Acknowledged work | The timer journal, the active session, the last 12 ended | Preferences, written at once | `TimerSync`, `createStudySessionModel` | **No.** It waits for its owner |
| Local preferences | Theme, active Space, Workspace layout, World's sky | Preferences | Their stores | No |
| Local preferences (Part 2) | Mode settings, the one-time appearance seed marker (per account), the Home snapshot with its sub-views | Preferences | Their stores | No. A deleted account's sessions and unsent journal are removed by `forgetOwner` |
| Memory only (Part 2) | Account, Progress and Plan reads, the Codex catalog once opened, the alert-permission prompt flag | Memory | `resources`, their modules | Yes |
| Unsaved drafts | Notes and ink (Phase 14), anything a screen is editing | Their local-first owner | Notes' repository | No |

## Rejected

| Option | Why not |
| --- | --- |
| A data library such as TanStack Query | A substantial dependency for about 200 lines of behavior, and its model of retries would need overriding anyway |
| A connectivity library such as NetInfo | Needs a native module, and it answers "is there a network", not "can Sylf be reached" |
| Calling `fetch` from screens with a shared helper | Every screen then owns its own loading, offline and cancellation |
| A separate native journal | A second source of truth for study time. Ruled out by the brief |
| Storing the journal under separate preference keys | Needs `keys()` in the Expo module, in Kotlin and Swift, for no gain, and that code could not run here |
