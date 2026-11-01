# ADR 0010 — Who owns a study session made before sign-in

**Status: Proposed with Phase 11 (1 November 2026), for Phase 13 to build and the owner to review.** Decision 8 and test 5 were built in Phase 12, because the session model had to be ready for an owner: `ownerId` is stamped at start from whoever is signed in, and Phase 10's stored state reads as ownerless. The rest is Phase 13's. It builds on [ADR 0008](0008-study-session-and-timer-dock.md) and the [timer contract](../../timer/README.md). Stage 2 handoff §6 asked for this decision.

**As built (Phase 13).** All eight decisions and all five tests are done. The tests are in `packages/backend/src/session-bridge.test.ts`, by number, and the journey runs the sheet in real Electron. **One narrowing:** a session that began before the account existed is not offered either, even if it ended after, because the server's clamp makes its credit unknowable. See [ADR 0012](0012-connected-app.md).

## The problem

Native's study session runs with no account: `createStudySessionModel` keeps `clientKey`, `startedAt`, `snapshot` and `operations` with no owner. The web journal cannot hold that. Its keys are `sylf_timer_journal_v1:<owner>:<clientKey>:`, `ownerId` must be a positive integer, and `TimerSync.create` refuses a different owner. Every call carries `expectedOwnerId`, and the server answers `ACCOUNT_CHANGED` when it disagrees.

## What the server does today

Read from `SessionService`. The timer suites and this phase's suites exercise these on disposable PostgreSQL, except the first row's effect on a new account, which is read from the code:

| Rule | Where | Effect on a session from before sign-in |
| --- | --- | --- |
| A start time cannot be before the account existed | `recoverStartTime`: `max(claimed, user.createdAt, last endedAt)` | For an **account created after the session**, the start moves to the account's creation, and almost nothing is credited |
| A start time cannot overlap credited work | The same line | An existing account keeps it, as long as nothing else was credited over the same hours |
| Time cannot exceed the wall clock | `settle_study_session_atomic` | Honest |
| One session credits at most 12 hours | `MAX_SESSION_FOCUS_SECONDS`, new in Phase 11 | Honest |
| `clientSessionKey` must be a UUID | `startSessionSchema` | The app passes `randomUUID`. The model's fallback key is for tests only and would be refused |
| Replays make no second session | `TimerSessionStart` | A delivered session cannot be delivered twice, to the same account |

## Decisions

All **Proposed**.

| # | Decision | Why |
| --- | --- | --- |
| 1 | **A session made with nobody signed in belongs to nobody.** It stays on the device, carries no owner, is never delivered, and still says "Tracked on this device. Not saved to your study record yet." | The server cannot tell who sat at the device. Guessing would put one person's time on another's record, and XP, streaks and leaderboards all read from it. |
| 2 | **A session made while signed in belongs to that account for good,** stamped when it starts. It stays owned after a sign-out, a revoked session or an expired one, and is delivered only when the same account is back. | This is the web's rule, and `expectedOwnerId` already enforces it. |
| 3 | **Signing in never credits anything by itself.** If ownerless sessions exist, the app asks once, in one calm sheet: how many, how long, and "Add to my record" or "Keep on this device". A running or paused session is part of the same question. | The owner of a record decides what goes on it, and a shared device is exactly the case where an automatic rule is wrong. |
| 4 | **Accepting assigns the owner once, and cannot be undone.** The session moves into the journal under that owner and is delivered through `SessionProtocolV2`, with every server rule above applying. | One delivery path. The client computes nothing, and rewards stay on the server. |
| 5 | **A session from before the account existed is not offered.** It ended before `createdAt`, so the server would credit next to nothing, and offering it would promise something that does not happen. It stays under "On this device". | The clamp is an integrity guard and stays. Weakening it to credit sessions before an account existed would let anyone mint history. |
| 6 | **Declined sessions stay local** and age out with the 12 kept. Nothing converts later on its own. | No hidden behavior. |
| 7 | **Sign-out keeps undelivered work.** It clears server-derived caches and never the journal, which is namespaced by owner. | Durability: a session is acknowledged work. The web has the same rule. |
| 8 | **The model gains one field, `ownerId: number | null`,** on `ActiveSession` and `EndedSession`, parsed as `null` when missing, so Phase 10's stored state reads correctly. | One owner of state, and no second store. |

## Consequences

- A student who studies, then creates an account, keeps that session on the device and does not get it on their record. This is the cost of decision 5. The app should ask for an account early, so it rarely happens. **Open for the owner:** whether first launch should require an account.
- The sheet is one new surface, and belongs to Phase 13. It follows the Aloft rules, and the words are the existing vocabulary: "On this device", "Not saved yet".
- Phase 13 also needs a subject picker, because the model has `subject` as display text and the server needs `subjectId`. A session with no subject is legal on the server.

## Tests Phase 13 must pass

1. An ownerless session is never sent, with or without a sign-in.
2. Declining leaves it untouched, and accepting delivers it once, with a replay making no second session.
3. Account B signing in cannot see or take account A's undelivered sessions.
4. A session from before `createdAt` is not offered.
5. Phase 10's stored state, with no `ownerId`, parses to ownerless.
