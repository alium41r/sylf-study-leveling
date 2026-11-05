# Expansion Part 4 report — verification, integration and polish

**Status: partly performed.** Run 5 November 2026 on `expansion-part-3`, on this Mac, against **disposable local PostgreSQL only** (Docker Desktop, the harness in `scripts/test/run-backend-local.mjs`). No hosted service, hosted database or real AI provider was touched, and the Samsung tablet was not used. What ran is real and passed or failed as stated below. What did not run is listed first, so nothing here can be read as more than it is.

## 1. What was not done (read this first)

| Item | Why | What it takes |
| --- | --- | --- |
| **Tablet** (Galaxy Tab S9 FE) run, cold-start time, memory sweeps, battery, TalkBack | The owner has not authorized the tablet for this stage | The rewritten [tablet checklist](../../handoffs/tablet-checklist.md) §Expansion Part 3, with the owner's go-ahead. Needs a prebuild for the three new native modules |
| **Hosted** read-only checks (RLS, indexes, grants, Planner flags) | The Vercel connector needs the owner to approve team access, and the database queries are owner-only | The owner runs the deployment checklist's read-only section |
| **Planner V2 beyond "not enabled"** (create, authorize, watch, answer, confirm) | The flags, a worker and a provider key are off locally, and no paid provider call was allowed. The client is covered by unit tests only | Flags on with a fixture provider, or an approved real run with a spend |
| **Slice A journeys 1–8 as written** (new student, a hard week, all seven modes, deletion, etc.) | The Part 2 era Electron scripts `home-check.mjs` and `journey-check.mjs` (`first`, `second`) are **stale** against Part 2's onboarding and Focus redesign. Selectors were updated where cheap, and a new `live` stage covers Part 3's screens | Rewrite those two scripts against the current UI |
| **Slice C** route measurement on the realistic seed, indexes | Not run: it needs the 2,001-person seed and `measure-routes`, and nothing new reads more than a bounded page | Run `test-backend-postgres.mjs --measure` |
| **Slice D** measured performance | Needs the tablet. Only bundle structure was checked (below) | Tablet run |
| **Slice E** `design:accessibility-review`, TalkBack, `design:ux-copy` | Not run | Owner or a later pass |
| `securitymaxxing:llm`, `:deps`, `:diff` skills | Not run. Manual review and the RLS audit stand in (§3) | Run them on the final commit |
| Root live-database tests and mobile boundary | See §2 | Start a local Postgres and build `mobile/` |

## 2. What ran, and the results

| Check | Result |
| --- | --- |
| Native typecheck, ESLint (whole package), boundary audit (322 files), single-copy check | Clean |
| Native unit tests (`npm run test`) | **572 passed**, 1 skipped, 41 files. Includes new party, presence, Realtime, planner, maths and rich-text tests |
| **Real-server integration** (`--native-checks`) | **33 of 33 passed**, 24 of them existing and 9 new two-account tests: friends, messages with a third account refused, block with a blocker-only list (S-15), group manager handover (A-28), party create and invite, room seating and mirroring, **one study session for a party session and a clean room exit**, a stranger refused entry, leader leaving |
| Electron `backend-check` against the server | **39 of 39 passed** |
| **Live Electron check** (new `live` stage of `journey-check.mjs`, real window, real server, a second person acting through the API) | **21 of 21 passed**, no console errors: sign-up, friend request answered, party created and invited, room lists both people, Study together to Focus, the environment shows the room strip, the server seats the person as focusing, the record is a party session, ending leaves the room, exactly one study session recorded, Quick ask answered by the real route, Plans says plainly that AI plans are off, Blocked list and Unblock, no sample content |
| Root `tsc --noEmit` | Clean |
| Root ESLint on changed API files and security tests | 42 `no-explicit-any` errors, all in files that already had them (`conversations` routes, three older security tests). None added |
| Root tests (`vitest run`, 417 files) | **4,506 passed, 8 failed, 300 skipped.** The 8 are environmental, not regressions: 4 live-database tests (`focus-backgrounds-cascade-triggers`, no Postgres on port 5432, so nothing was reached), 3 mobile-boundary tests (`mobile/dist` not built), and `notes/ink` (the known 60 s timeout under full-suite load). The worktree has no `.env`, so no hosted database could be contacted |
| New root security tests (S-15, A-28, blocked list own-only) | 9 of 9 passed |
| **RLS audit** (`test-rls-audit-postgres.mjs`, extended) | Passed: 73 tables, all with RLS, none reachable by `anon`, no definer function executable by `anon`, direct economy writes denied. **New probe:** with the grants Realtime needs, an outsider sees 0 rows of a conversation's messages and both participants see 1 |
| Production-style web export (`build:web`) | Passes. The entry chunk is 2.4 MB (React Native Web and the shell); Realtime lives in the lazy backend chunk, the pickers in shared lazy chunks |
| Secret scan of tracked Native files and the new route and migration | No matches |

Evidence is in [`evidence/`](evidence/): `native-integration.json`, `electron-backend-check.json`, `rls-audit.json`, `journey-live.json`, and the `live-*.png` screenshots (request, people, party room, Focus with the party chosen, the environment with the room, Blocked, Quick ask, Plans off).

## 3. Findings

**Fixed in this part**

| Where | Finding | Fix |
| --- | --- | --- |
| Native client | Leaving a party called the leader-removal route; the party state schema did not match the server | Rewritten to the real routes and shapes, found by the integration run |
| Native client | A repeated room action answers without a `sessionId`, and the schema rejected it | Optional, with `enter` to learn it, found by the integration run |
| Blocked sheet | A block made elsewhere showed as an empty list for up to 30 s | Refreshes on open, found by the live check |
| Focus environment | The web wake lock rejected when the environment closed before it was granted (unhandled rejection) | Both ends caught, found by the live check |
| Focus page | A "What" heading with nothing under it when an account has no subjects | Hidden when empty, found by reading a screenshot |
| Tests (Part 2 era) | Two bridge tests counted the presence heartbeat as a session POST; a restore test assumed no request at start; three horizontal scroll views lacked `keyboardShouldPersistTaps`; `home-check` and `journey-check` used removed test IDs | Fixed or updated; the two Electron scripts still need a rewrite |

**Open, for the owner**

| ID | Finding | Severity | Decision |
| --- | --- | --- | --- |
| R-1 | **Realtime for messages needs grants that the history does not give.** On a database built from the migrations, `authenticated` has no `SELECT` on `Message` or `ConversationParticipant`, so Realtime delivers nothing and Native polls. With the grants, strict RLS holds (probed) | Low (a degradation, not a leak) | Grant them and apply the new publication migration, or leave Realtime off |
| R-2 | The server does not refuse a solo session beside a party session (A-22); only Native does | Low | Optional server rule |
| R-3 | 53 writing routes still have no rate limit (Part 1's count, unchanged by this part) | Medium | Slice B follow-up |
| R-4 | `home-check.mjs` fails at its window-size matrix and `journey-check.mjs` `first`/`second` fail at Focus's old Begin button | Process | Rewrite against the current UI |
| R-5 | Planner V2 behaviour and educational quality are unverified live | Product | E-6 |
| R-6 | `npm audit` reports a `deepmerge` and `glob` advisory in Expo's build tooling (`@expo/config`, `@expo/cli`). It was present before this part and is not in the shipped app | Low | Update Expo when the SDK allows |

## 4. Needs the owner

See the [expansion handoff](../../handoffs/expansion.md): the tablet go-ahead, the hosted checks (E-6, RLS, grants), the Realtime grant decision, and a rewrite of the two stale Electron scripts.
