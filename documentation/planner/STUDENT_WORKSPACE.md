# Student Planner workspace

Updated 30 October 2026. Original Phase 3 now exposes the implemented AI-first journey for manual inspection. Formal Phase C educational qualification is **deferred by the user**, not passed. Scripted tests establish mechanics, not real-model educational quality. The [implementation report](reports/2026-10-29-student-workspace/README.md) records verification and limitations.

## Entry and activation

The canonical workspace lives at `/planner`, with owned plan views at `/planner/[planId]` on web and mobile. The existing **System → Planner** tab retains Classic Planner and Planner Modes and links to this workspace. **Open Planner preview** appears only when both server flags are explicitly true:

- `PLANNER_V2_DURABLE_CORE_ENABLED=true`
- `PLANNER_V2_STUDENT_WORKSPACE_ENABLED=true`

Both default to disabled. No environment file, production provider route or hosted database is changed by this implementation. Existing compiler-v1 admission remains the default on existing routes. Reading owned saved workspace/history does not grant dispatch or Apply authority.

For local manual use, use Node 24 and an already prepared local database containing the reviewed Planner/Calendar migrations. Configure the existing database connections, private document store and DeepSeek credential through their existing owners. Start the existing web/worker composition with `npm run planner:dev`, supplying the two flags explicitly. This guide does not authorize deployment or migration of a production database. The preview reports missing provider configuration or an unavailable/incompatible worker instead of pretending it can generate.

The same-host worker readiness endpoint must report compatible SQL, readiness and compiler-v2 support. The existing `PLANNER_WORKER_HEALTH_PORT` selects the loopback port. There is no user-controlled health URL or alternate worker lifecycle. A separate-host deployment would need an explicitly designed authenticated readiness arrangement; this preview does not guess one.

## Student journey

1. Save an accepted goal, deadline, topics and visible study availability. Saving is free. Account rest weekdays are converted from Sunday=0 to Planner's Monday=0; account rest days, Calendar commitments, protected work and recovery margins continue to apply independently.
2. Add background or feedback in the owned conversation. Free notes stay student-authored; they cannot mint verified evidence or change accepted hard facts. Optional **Authorize AI advice & send** uses the existing assistant and its account accounting; it cannot enqueue or apply plans.
3. Select owned PDF/text materials and explicitly allow research. Documents are retained by the existing private repository. Reopening the plan permits explicit reselection of saved materials; ownership is checked again at admission.
4. Review and explicitly authorize the new AI request. Server-owned compiler-v2 admission selects the complete-journey resource profile. The browser cannot choose a compiler, model, budget, provider or execution permissions.
5. Watch persisted Research/strategy/translation/allocation/review progress. Stop sends durable cancellation. Leaving a page does not cancel a worker or create another provider request.
6. Answer the exact retained consequential questions. Accepted detail changes during clarification travel with those answers through Research continuation CAS. Linked attempts retain the original financial root, consumed/reserved usage, uncertain spending and absolute deadline.
7. Inspect activities, complete natural strategy, research notes, review decisions and findings. Unapproved/incomplete work stays visible. Earlier linked drafts are explicitly historical while a continuation gathers new evidence. History exposes immutable versions and prior attempts without granting execution authority.
8. Review the exact candidate changes and required warning acknowledgements, then separately confirm. The existing atomic ApplyService revalidates ownership, accepted intent/base, sources, Calendar, protection, graph, currentness, whole diff and acknowledgements. No draft view or educational score grants approval. The approved plan remains accessible by its canonical URL, with an onward link to study quests.

General goals and school mocks can be prepared without inventing official board certification. The accepted-details editor supports explicit official assessment identity and planning approach when needed. Research must still verify actual authority/applicability; a form entry or selected upload is not certification. The default interface does not require a numeric educational benchmark. The independent review contract still governs approval for executable work; its inability to approve no longer hides the authored result.

## Transport and persistence

`/api/planner/workspace` uses the existing authenticated `plannerRoute`, cookie revocation/ownership checks and private no-store responses:

| Operation | Meaning |
| --- | --- |
| GET | Preview readiness and paginated owned contract-v2 plans |
| GET `planId` | Accepted intent, derived current workspace, conversation, selected material metadata, retained draft, questions, history index and financial-root usage |
| GET `planId`, `attemptId`, `history=true` | Owned immutable artifact index for a selected attempt |
| GET `planId`, `attemptId`, `artifactId` | One owned immutable artifact; no cross-plan/owner lookup |
| POST `CREATE` | Existing IntentService creation, without a model call |
| POST `NOTE` | Free student note in existing versioned conversation, with replay and CAS |
| POST `GENERATE` | Explicit consent/profile plus existing canonical generation request, admitted by the existing GenerationService as compiler v2 |
| POST `CONTINUE` | Existing Research continuation, exact question/intent/archive correspondence |

Existing assistant, upload, intent PATCH, operation CANCEL and commit endpoints remain their mutation owners. No new tables, migrations, job engine, calendar store, scheduling engine or provider dispatcher were added. Failed/incomplete attempts can be inspected without publishing a revision. Archived/compiler-v1 histories and old prompt/checkpoint interpretations remain intact.

The default draft projection reads the latest complete Strategy Document; earlier exact strategy versions load individually from history to avoid repeating their text in every poll. The existing 4 MiB transport and artifact/storage ceilings still apply; overflow is explicit rather than clipped education. The most recent 100 attempt identities appear in the convenience history selector; historical data is not deleted. Concurrent view changes may require refreshing; service mutations and Apply recheck authoritative state.

Progress, history and provider control checks use coherent, database-enforced
read-only snapshots. They do not hold the account writer lock while validating
retained artifacts. Admission, dispatch, settlement, heartbeat renewal,
cancellation, publication and Apply still use the existing coordinated writer
boundary and recheck ownership, currentness, lease and deadlines. A view never
authorizes a subsequent mutation.

Worker snapshot preparation uses that same read boundary, checks its lease at
entry and checks a new committed lease after the snapshot closes. Heartbeats
can renew during preparation. Checkpoint writers still reconstruct the owned
input and compare its complete digest inside their coordinated transaction.
Heartbeat writer-lock contention is recoverable only while an independent
currentness/lease/deadline check succeeds; no lease duration or root deadline
is extended by a read or a failed renewal.

## Resources and recovery

The explicit `student-preview-v2` policy uses the existing DeepSeek Flash role routing with LOW reasoning for Research (including verification/OCR) and translation, and HIGH for strategy and independent review. Its generation/context allowances and downstream reserves are unchanged. Historical `student-preview-v1` admissions and linked continuations retain their immutable HIGH policies; a new profile never silently changes an admitted root. Strategy output is TEXT; Research, translation and review use JSON. Each call permits 65,536 completion tokens and 500,000 input units. One root permits up to 48 calls, 3,000,000 input units and 700,000 completion tokens within four hours, with translation/review holdbacks and finite research-tool limits. These are safeguards, not requested output lengths, expected usage, a dollar quote or new financial entitlement. Existing quota/account authorization and truthful ledger accounting still apply.

New preview requests additionally bind an explicit dollar ceiling to the immutable
resource policy: at most $1.75, with a lower amount selectable under **Resource
safeguards**. The existing root ledger accounts for settled costs, concurrent
reserved model calls and research. A complete call must fit its conservative
price quote before dispatch; the system does not shorten its reasoning/output
allowance to squeeze it into the remaining money. Unknown costs or dispatches
stop further paid admissions. Linked continuations retain this same ceiling,
consumed spending and deadline. Historical policies without this optional field
retain their original interpretation; no old root silently gains a new cap.

Concurrent identical workspace reads share one outstanding request through the
existing client cache owner, without retaining a stale snapshot or local-storage
copy. Mutations and logout invalidate outstanding responses. Selecting the open
draft preserves its view, and progress polling avoids overlapping refreshes.
Worker and application pools also bound client-side query waits so a dropped
network connection cannot leave a request hung indefinitely; existing server
statement limits and execution deadlines are unchanged.

Starting a fresh preview request over running/queued/decision work is rejected server-side. Uncertain spending on the preceding journey blocks a new preview request as well as automatic continuation. A new request is a separate explicit student authorization, never a hidden budget reset. Known estimated costs, unknown costs, token/reasoning usage and unsettled dispatches remain distinct. Optional assistant advice has its own existing financial root and account accounting.

A lost mutation acknowledgement retains its original request identity for **Retry same action**. Read refresh never dispatches. There are no automatic mutation retries. Cancellation, provider failures, exhausted limits and stale Calendar/context remain durable, understandable stop states. Resuming an expired root does not extend its deadline; an explicitly authorized new request may be necessary.

## Research reference protocol v3

The stopped corrected C01 run returned cross-plan and qualified scope references. New Research captures now pin `verificationVersion:3`, supply an explicit selected-plan reference inventory and distinguish ordinary diagnostic weakness from consequential factual contradiction.

Only exact inventory aliases, or an exact qualified alias belonging to that selected plan, can map to its canonical local reference. Foreign prefixes are never stripped or rebound. Source/claim identities, literal evidence, applicability and official authority checks remain unchanged. A complete, settled, retained invalid response can receive **one** correction request under the same meter/root/deadline, carrying the exact rejected response as untrusted data. Truncation, missing response, uncertain spending and provider transport failure cannot authorize that correction. A second invalid result stops normally.

Absent and v2 Research markers retain their original prompt/packet/parser interpretation, including replay from saved responses. Original C01 receipts/reports are preserved. This technical correction has not been qualified with paid real-model calls.


## Automatic workflow and expandable provider reasoning

Research, strategist, translator/scheduler and reviewer are logical stages of
one existing durable compiler job. The app runs one web process and the existing
background worker; it does not launch an OS process for each agent. Successful
stages hand off automatically. Only a genuine clarification, operational stop or
explicit confirmation needs a student action.

A consequential unresolved Research flag now produces explicit server feedback
explaining why COMPLETE cannot advance and how to investigate, clarify or
honestly retain a nonblocking uncertainty. The server never changes the flag or
invents the missing fact. Expired continuation is rejected before creating a
child or editing intent. The workspace offers a new authorized request instead;
an expired clarification can first be explicitly closed.

The compact chronological trace uses actual dispatch records and source actions. The active block opens automatically. A read-only SSE connection consumes frames immediately instead of buffering the HTTP response body. Durable previews coalesce at roughly 350 ms and the web reader checks their lightweight projection at 400 ms, refreshing full chronology only when a checkpoint changes. There is no simulated typing: text can appear only after the provider sends it. Streams close/re-authenticate at a finite 55-second boundary; offline/hidden/unmounted views release the stream and reconnect with the existing read-only polling fallback. Session-epoch checks reject old-owner events after logout.

Expandable blocks display DeepSeek's documented `reasoning_content` channel,
opted in explicitly through the existing adapter and dispatcher. This is provider
output, not synthetic status narration or an additional model call. JSON role
answers remain buffered for validation; only the separate reasoning channel and
natural strategy text stream to the preview. Other provider/default callers keep
their original behavior. See [DeepSeek's thinking-mode contract](https://api-docs.deepseek.com/guides/thinking_mode/).

Partial previews are bounded at 65,536 characters in the existing fenced Attempt
payload. The complete returned reasoning (up to the finite 2 MiB retention
ceiling) is sealed with its source/version/digest inside the existing immutable
financial response receipt. Expanding a completed block reads that retained
trace through the owned, no-store workspace endpoint. It cannot dispatch or
approve work. Credentials and internal reference IDs are redacted for display;
the original response evidence is unchanged. A missing or interrupted stream is
identified honestly, and older requests without retained reasoning cannot be
backfilled. Reasoning tokens remain a subset of completion usage, not a second
charge. No new scheduler, agent engine, table or migration was introduced.


## Focused Research protocol

New captures pin `researchProtocolVersion:1`. Research delivers factual context
and provenance; the strategist designs education, the translator represents it,
and the allocator owns clock placement. The prompt directs Research to finish
when material facts are sufficient, retain honest nonblocking uncertainty, and
avoid lesson design, repeated calendar arithmetic or exhaustive paper collection.
EXAM identity/applicability and consequential clarification rules remain intact.

New action packets include the schema-derived response contract, including a
literal excerpt and anchor for each identity field as well as each claim. A
single already-authorized, separately metered correction receives deterministic
validator paths/types/field bounds, rather than guessing from a generic failure.
The server never fabricates an anchor or accepts invalid evidence. Completed
proposal history is represented without repeating full discarded dossiers;
current sources, accepted input, answers, verification findings and exact raw
receipts remain retained. Durable tool outcomes identify failed/empty reads or
searches so a new rationale cannot hide the previous operation's result.
Historical captures without this marker preserve their original prompt packets.

See the [30 October efficiency/streaming report](reports/2026-10-30-research-efficiency/README.md).
