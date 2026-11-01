Current software completion and limits: [Workflow and live reasoning](WORKFLOW_COMPLETION.md). The earlier live-recovery log below is retained as historical evidence.

# Historical integration bee live recovery

The user authorized using their existing integration bee draft and continuing
until a plan is generated. Fresh approval explicitly permits up to **$1.75
additional DeepSeek spending** and sending the accepted goal, deadline, study
availability, relevant learning history and research context to DeepSeek. This is
manual product testing; formal Phase C qualification remains deferred.

## Implemented recovery

- Selecting the already-open draft no longer clears its view into a permanent
  loading state. Progress refreshes avoid overlap. Identical reads share one
  outstanding request through the existing `client-data-cache` owner, with
  mutation/logout invalidation and no persisted/stale preview data.
- Unexpected worker failures retain safe type/code and bundled source locations;
  raw exception messages, query values and provider bodies are excluded.
- New optional, immutable resource-policy spending bounds use the existing
  `AiUsageLog` financial root. Reservations include conservative full-call
  exposure, settled spending and research; unknown costs block further calls.
  Lower explicit student limits are accepted without changing per-call reasoning
  or output allowances. Compiler-v1 and absent-field historical policies retain
  their meanings. No migration or second ledger was added.
- DeepSeek Search and chat now share the same existing key normalization. The
  configured key contained an invisible character: chat removed it, whereas
  Search failed constructing its HTTP header. A retained offline reproducer and
  matching pre-fix compiled-source hash establish the pre-dispatch rejection.
  The existing public Search reconciliation service settled that exact receipt
  as rejected at zero cost; the stopped Attempt and original error remain intact.
  No credential was printed or committed.
- Worker/client query waits and TCP keepalive are bounded after an interrupted
  connection left the worker unable to accept continuation. Existing server
  statement limits, lease fencing, ownership and absolute deadlines remain.

## Live history and scope

The original user attempt stopped before Research and has no provider receipts.
The first agent retry reached Research and retained one paid model response,
estimated at $0.001938012 using the existing conservative pricing catalog, before
the proven header rejection. Its original four-hour deadline was preserved.

After the long connection interruption, an explicit replacement was submitted
through the actual authenticated workspace with a **$1.74** cap. Together with
the preceding known cost this remains below the approved $1.75 total. The earlier
Attempt was not rewritten, its deadline was not extended, and no unknown spending
was discarded. No plan has been applied to executable work.

The replacement completed real Research, including successfully accounted
DeepSeek Search requests, then requested resolution of a real overdue task. The
user explicitly permitted moving or deleting it. The existing coordinated owner
transaction moved the unstarted, unlinked 30-minute Maths practice task from
19 October to 30 October, preserving its content, duration, status and history.
The next linked Research context correctly counted 51 available minutes on
30 October. No task was deleted, completed or awarded rewards.

That continuation retained a complete, settled and independently reparsed valid
Research verification response, but failed during provider control/checkpoint
handling. The legacy provider error path concealed the underlying exception;
safe worker diagnostics now follow its internal cause without exposing messages.
Progress/history projections previously held the same exclusive account lock
as provider controls and heartbeat writes. Read-only views and control checks
now use database-enforced read-only repeatable snapshots. All financial and
execution mutations retain their coordinated locks and revalidation. The first
broader regression run caught remaining receipt-reader `FOR UPDATE` clauses;
those were corrected in the read paths, without removing financial writer locks.

Completion, final live usage, any further
repairs, retained plan evidence and verification results will be recorded here
when the requested result exists. A partial Research run is not plan generation.

## Verification so far

- Budget/lifecycle focused PostgreSQL run: **224 V2 + 225 retained legacy = 449
  passed**, no failures/required skips. Initial concurrency assertions correctly
  observed one admitted and one rejected reservation; a subsequent test-only
  receipt-count lookup used an unsupported projection field. It was corrected to
  inspect the existing ledger and the entire focused run passed. Earlier failure
  evidence is retained separately.
- Search/chat credential regression bank: **40 passed**, all unpaid.
- Workspace/diagnostic/Research unit bank: **38 passed** before the lower-cap
  assertion; read-sharing/logout/mutation regressions pass as well. Final totals
  will come from the final run rather than summing overlapping banks.
- Worker build, web production build, a subsequent typecheck, and mobile
  build/bundle verification passed at intermediate snapshots. An earlier
  typecheck raced Next's generated-type cleanup and was rerun after the build.
- Scoped new code lint passes; the modified pre-existing DeepSeek adapter still
  has nine retained explicit-`any` lint errors outside the changed lines.

The complete bank passed **404 V2 + 225 legacy = 629** at the snapshot before
the read-boundary repair (`evidence/full-regression`). After that repair,
**226 V2 + 225 legacy = 451** passed with unchanged source pins, including the
two new owner-lock/control regressions (`evidence/readonly-ledger-verified`).
The initial read-only regression failure is retained in
`evidence/read-controls-foundation`; it caught receipt readers that still used
`FOR UPDATE`. An earlier direct legacy-harness invocation omitted the later V2
migrations and is not a valid V2 qualification run; its failures remain separate.
No production schema or historical migration was altered to address those tests.

The repaired snapshot also passes 53 focused unit tests, scoped lint, worker
compilation, a production web build and a subsequent standalone typecheck. The
restricted-shell build was stopped when stalled; the unrestricted build compiled
but exhausted the default 2 GiB TypeScript heap. A temporary 8 GiB build-command
allowance completed successfully without changing production settings.

The final full regression run is pending. No successful complete real-model
strategy/translation/schedule is claimed at this interim point.

## Subsequent operational recovery

The next continuation completed Research and capacity but the safe diagnostic
identified `55P03` in heartbeat renewal. A checkpoint transaction held the account
writer lock beyond a single 10-second lock attempt. The worker now independently
checks the actual committed lease, owner, fence, intent and deadline after that
specific contention result; it only continues while those checks succeed. A
genuine 25-second PostgreSQL contention test passes. No renewal, lease or root
deadline is inferred or extended by that check.

The following continuation demonstrated this recovery, then correctly rejected
a later write after its real 45-second lease expired and reclaimed the retained
checkpoint under a higher fence. The remaining problem was snapshot-only
preparation holding writer locks, rather than a provider failure. Snapshot
preparation now uses a fenced read-only transaction and checks a fresh committed
lease after closing that snapshot. Actual checkpoint writes still reconstruct
and compare the complete owned canonical input in their coordinated transaction.
The retained Research is queued for recovery; these changes do not authorize
repeating settled calls or resetting the financial root.

The browser's old 20-second request timeout also rejected a legitimate history
read that completed in 35 seconds. Reads now have a finite 60-second allowance;
mutations retain their 20-second uncertain-acknowledgement boundary. Real timer
regressions cover both behaviors. No AI reasoning allowance or execution deadline
was changed. The updated unit bank passes 532 tests across the core and adjacent
navigation/provider suites; snapshot-boundary PostgreSQL verification is pending.

The complete PostgreSQL bank passed 632 checks after the heartbeat change, but
its source-pin receipt correctly notes that the client timeout and its tests
changed during that run. It is retained as backend evidence, not claimed as a
clean final source snapshot. A final source-pinned run remains required.

Private credential fingerprints, exact pre-dispatch proof, retained pre-fix
runtime bytes and the reconciliation receipt remain in ignored, mode-restricted
local backup storage. They are not publication artifacts or a second ledger.

## Overnight continuation, 30 October (Karachi) — still in progress

The final pre-PDF full snapshot passed **411 V2 + 225 legacy = 636** required
PostgreSQL checks with unchanged source pins (`evidence/action-final-full`).
This includes strict Research action identity and one metered, recoverable
correction of a complete rejected response. Exact rejected/provider bytes and
charges remain; a second invalid answer stops. Historical inputs retain their
original prompt and interpretation.

The earlier root honestly expired during the long interruption. It was not
extended. A subsequently authorized request accidentally omitted the research
checkbox and correctly stopped on its permission boundary; its $0.002290812
charge remains counted. A replacement explicitly enabled research and capped
its new financial root at **$1.60**. Earlier roots total **$0.142303812**, so the
aggregate maximum is **$1.742303812**, below the approved **$1.75** task limit.
Linked retries retain that cap, consumed usage and the original root deadline
of **04:06:23 on 30 October, Asia/Karachi**. No unknown charge was cleared to
permit continuation.

The next real failure was PostgreSQL `22P05`: the actual MIT 2011 qualifying
PDF contains NUL glyphs in its extracted text. The reader now represents only
NUL/unpaired UTF-16 glyphs as visible U+FFFD markers and records an explicit
PARTIAL extraction gap. Original bytes and their SHA-256 hash remain unchanged;
affected mathematical symbols and completeness remain unverified. Persistence
errors stop as Research SAVE_FAILED, without publishing unsaved source content
into the next checkpoint. The exact public PDF passes the unpaid safe-fetch
reproduction. New source durability and failed-save tests plus all Research
cases and legacy checks pass **25 + 225 = 250** (`evidence/pdf-verified-final`).
Intermediate fixture failures are retained: incorrect upload permission, a
worker-library mismatch corrected without changing the runtime target, and an
accidental alteration of the synthetic PDF `/Contents` key. No production
deadline/assertion was loosened to pass them.

The midnight canonical check confirms Friday **30 October**, accepted deadline
**8 November** with exam-day study disabled, account Sunday rest `[0]` matching
Planner Monday-based `[6]`, accepted Mon–Sat 09:00–21:00 windows and 90-minute
daily workload ceiling. Recovery reserves nine minutes/day. The moved Maths
task leaves 51 minutes on 30 October; seven further eligible days each have
81 minutes: **618 minutes total**. Both existing Calendar source catalogs are
complete, with no Calendar events, running work or unresolved legacy exceptions.
Official LUMS event rules remain uncertain; MIT resources are practice
references, not certified LUMS specifications. Self-reported basic integration
knowledge is not demonstrated mastery.

The actual-account linked child is running under the same $1.60 root. No
completed real-model strategy, translation or schedule is claimed yet. Sleep
prevention remains active. Updated full verification and the final user-visible
result must be recorded before completion.

A transient database socket timeout then exposed a checked-out `pg` client
error with no listener; the process exited. Its in-flight Research verification
response nevertheless settled in the ledger before exit. The database owner
now observes asynchronous errors for the duration of each checked-out
transaction, rejects the transaction and discards the connection. It does not
retry network errors or infer successful commit. Release restores the pool's
existing idle listener before removing the transaction listener. Genuine backend
termination tests exercise both read-only and coordinated transactions, verify
no callback replay and verify the next healthy connection; the targeted gate
passes **12 + 225 = 237** checks (`evidence/socket-recovery`). Two additional
unit regressions pass. The existing worker recovered the same Attempt under
fence 2 and reused its settled verification response without another dispatch.

The next independent synthesis correctly rejected double-counting the legacy
Maths task. Saving that valid objection then failed because synthesis allowed a
16,000-character explanation but the run's gap field allowed only 1,000. The gap
reader now accepts the same finite 16,000-character allowance, retaining old
valid entries, and a linked capture explicitly carries an unsupported saved
synthesis forward even if the transition save failed. The complete criticism
is not truncated. A genuine crash/continuation test verifies its exact retention,
four aggregate calls and unchanged claimed-parent deadline; an initial test-only
comparison against the pre-claim null deadline was corrected. **26 + 225 = 251**
PostgreSQL checks pass (`evidence/complete-objections-verified`).

New Research captures pin an explicit Calendar interpretation capability.
Planner weekdays are Monday-based; account rest days are Sunday-based;
`availableMinutes` is already net of other commitments, protected work and
recovery. Natural strategist, translator and complete reviewer calls share this
contract explanation, with retained prompt bindings preserving old calls.
No scheduling arithmetic, consent or accepted weekday was changed. Unexpected
worker failures now report the last durable stage instead of the initial
preflight stage; a regression covers a handler that advances to Research and
then fails. The current full V2 unit bank passes **496** tests. The next real
child remains on the original $1.60 root and 04:06:23 deadline.

The real continuation has now retained the MIT 2011 PDF with its original hash
and explicit PARTIAL glyph warning, and its revised summary correctly states
51 net minutes on 30 October without deducting the Maths task again. The
independent synthesis accepted the corrected Calendar handling. Separate unpaid
diagnosis of the MIT 2015 answer PDF returns the existing `PDF_INDEX_BOUND`
limitation; its contents remain unread. No paid OCR or alternate PDF engine was
introduced to conceal that limit.
