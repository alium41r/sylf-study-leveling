# Timer lifecycle and synchronization

Current owners and guarantees for study timers and Focus Party timers. Source, tests, schema and configuration resolve discrepancies; the [2026-10-14 audit](reports/2026-10-14-lifecycle/report.md) records its original verification. The [notice and release follow-up](reports/2026-10-14-notice-release/report.md) records deployment checks and the transaction-pooler repair.

## Owners

| Responsibility | Owner |
| --- | --- |
| Epoch snapshots, separate focus/break accounting | [`lib/timer-engine.ts`](../../lib/timer-engine.ts) |
| Local lifecycle, modes, recovery, terminal UI | [`FocusScreen`](../../app/focus/components/FocusScreen.tsx) |
| Tab leadership and lease fallback | [`useTimerLeadership`](../../app/focus/hooks/useTimerLeadership.ts), [`lib/timer-leader.ts`](../../lib/timer-leader.ts) |
| Durable client intent and background delivery | [`lib/timer-sync.ts`](../../lib/timer-sync.ts), [`TimerSyncWorker`](../../app/components/TimerSyncWorker.tsx) |
| Cookie authorization and account checks | [`/api/sessions`](../../app/api/sessions/route.ts), [`/api/focus-party/[id]/session/timer`](../../app/api/focus-party/%5Bid%5D/session/timer/route.ts) |
| Session identity, execution receipts, coordinated settlement | [`SessionService`](../../lib/planner/v2/server/sessions.ts), [`SessionProtocolV2`](../../lib/planner/v2/session-client.ts), [Planner index](../planner/README.md) |
| Atomic rewards and party accounting | [`20261014000000_timer_durable_completion`](../../prisma/migrations/20261014000000_timer_durable_completion/migration.sql), [`weekly settlement`](../../lib/planner/v2/server/settlement.ts) |
| Party authoritative state and local exit | [`FocusPartyContext`](../../app/social/components/focus-party/FocusPartyContext.tsx), [`useFocusPartyRealtime`](../../app/hooks/useFocusPartyRealtime.ts), [`party service`](../../lib/focus-party-service.ts) |

## End boundary

End and Complete first catch up expired phases and freeze the snapshot at the click time. The client synchronously writes the account-scoped terminal intent into localStorage, clears the running cache, releases leadership, announces the local summary and leaves Focus. It does not await creation, a request, a tab lock, settlement or statistics refresh. If offline routing is unavailable, Focus renders an ended screen immediately and navigates on reconnect. A failed local write freezes the timer and leaves recovery state intact so the student can free storage and retry.

The local summary means the session is saved on this device. Server-confirmed XP, balances and totals update after settlement. Timer list, related client caches and AuthProvider statistics refresh after accepted synchronization; reward values are not fabricated optimistically.

## One durable journal

Keys use `sylf_timer_journal_v1:<owner>:<clientKey>:`. Metadata binds a stable start identity, original start time, subject/quest or party participation, and eventual server session ID. Each operation has its own storage key, original timestamp, cumulative focus/break seconds and ordering sequence. END has a deterministic key and is itself a terminal marker, even if writing the metadata was interrupted. Complete saves its intent before END; recovery synthesizes a missing END and dispatches completion only after settlement.

The shared web/mobile shell owns delivery. It starts the original account's worker on authentication and wakes it on periodic retries, reconnect, pageshow, visibility and cross-tab storage changes. Navigation does not own delivery. Logout stops the worker; pending journals remain scoped to their original account. Cookie/account mismatch cannot replay another account's mutation. Transient authentication bootstrap failures also retry, so restarting offline cannot strand a journal after connectivity returns.

Requests bound both connection and body reads to 15 seconds. Network errors, lost acknowledgments and server failures retain the original intent and retry with backoff up to 60 seconds; rate-limit Retry-After is respected for scheduled retries. Manual retry and reconnect can request immediate recovery. A Web Lock reduces competing workers; absence or denial falls back to the same server receipts and locks. An acknowledgment deletes only the dispatched operation, never a replacement written while it was in flight. Confirmed, unreferenced metadata is pruned after seven days; pending operations and referenced running snapshots are preserved.

Storage is device/origin scoped. Closing the app pauses delivery until it is opened and authenticated again. Signing out never converts saved timer data into another user's session. Clearing browser data, uninstalling the app or device loss destroys data that has not reached the server; there is no remote copy of a fully offline intent. Invalid/removed resources or conflicting active work produce a visible error and retain the journal for resolution.

The shell shows a pending-delivery notice once per failure episode. It disappears after six seconds, can be dismissed immediately, and clears when accepted. Repeated retry ticks do not reopen it or extend its lifetime. Hiding the notice never stops delivery or removes saved operations. User-facing wording describes saving to the account rather than requiring students to understand synchronization.

## Server invariants

Owner coordination uses the existing SERIALIZABLE transaction and a nonblocking transaction advisory lock. A busy attempt rolls back, releases its connection and retries with a fresh snapshot. Lock waits are bounded; transaction-local settings and locks end at COMMIT/ROLLBACK. No session-level advisory lock or global connection setting may escape a transaction through the hosted transaction pooler.

- Keyed creation uses a `TimerSessionStart` receipt bound to authenticated owner, request hash and session. Retrying after a lost POST response or after END returns the same row. Recovery cannot predate account creation or overlap already ended work. Another subject's active session is protected rather than silently closed.
- Ordinary timers and manual quests now use the existing versioned execution overlay alongside Planner timers. Original boundary timestamps preserve offline pause/resume/end intervals; paused time cannot become focus. Stored focus and break share one bounded wall-clock budget.
- Exact transition receipts replay an uncertain acknowledgment. Stale versions reconcile against accepted execution; accepted pause/resume and greater totals update the screen when no later local boundary is pending. A device-storage failure keeps its local timer frozen. Server END is terminal. Transactions coordinate session, quest, totals, rewards and receipts, using the existing PostgreSQL economic RPCs and ledgers.
- Final settlement awards based on the full stored session, including a zero-delta final flush after the last checkpoint. Late heartbeats and repeated final requests cannot change closed duration, end time or rewards.
- Weekly missions use one ledger receipt per owner/week. Late delivery settles the session's attributed week, preserves the latest streak marker, and repairs known consecutive weeks. Existing Sylph-only weekly payout policy is preserved; the message accurately names that payout.
- Versioned sessions keep their original civil-date attribution. Read models sum accepted focus seconds, never wall-clock age including pauses/breaks. Stale legacy rows retain their accepted time without appearing actively studying. Focus's daily labels exclude an overnight session attributed to another day.
- Timer/economic and party RPCs are server capabilities. Browser/JWT roles cannot call SECURITY DEFINER functions with a fabricated user ID; authenticated HTTP resource ownership checks remain required.

## Focus Parties

Party participants keep their existing server-owned timer accounting and Supabase Realtime integration. Start/pause/resume remain acknowledged authoritative actions; failures are visible, reads/actions have bounded requests, reconnect/visibility recovery is independent of subscription setup, and disconnected/unconfigured Realtime uses a 15-second REST fallback. Epoch interpolation supplies local ticks.

Leave Focus uses the same durable journal's party branch. It immediately presents LEFT/frozen time and returns to the lobby, even if another action is busy. The original session ID, joined-at participation nonce and exit time are persisted. Delayed/replayed exits bank only through that boundary, cannot remove a later rejoin, and concurrent last-member departures close the room under a parent-session lock. The existing member row retains closed focus intervals until exit, so an in-flight pause/resume cannot bank beyond the saved cutoff. Prior participation time is preserved as a base; the interval history is cleared on exit. The confirmed server total replaces the provisional local total. Rejoin waits for an unresolved local exit. Party time is not sent to the study-session reward path.

## Deployment and verification

Deploy the timer migration before the matching application code, then generate the Prisma client. The API's server database role must retain execute privileges as the migration/function owner or through an explicit backend grant. Do not grant these capabilities to public browser roles.

Relevant commands:

```sh
npm run test -- --run __tests__/timer __tests__/planner-v2/session-client.test.ts __tests__/focus --exclude '**/focus-backgrounds-cascade-triggers.test.ts'
npx tsc --noEmit
node scripts/test/test-timer-postgres.mjs
node scripts/verify/verify-timer-build.mjs
npm run mobile:build
npm run mobile:verify
```

The PostgreSQL harness uses a generated disposable loopback database with synthetic fixtures and supports `--native-bin /absolute/path/to/bin` when Docker is unavailable. It does not load hosted credentials or accept a database URL. Its audited schema bootstrap and current SQL tests do not establish replayability of the complete historical migration chain. The excluded focus-background cascade suite requires a hosted database and is unrelated to timer settlement; its availability must be checked separately.
