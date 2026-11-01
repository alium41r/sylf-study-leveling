# Phase B Steps 6–8 — complete headless AI-first journey

28 October 2026. **Phase B Steps 6–8 are technically complete and qualified offline. Phase C live educational-quality qualification remains required.**

The existing compiler now supports Research → real Calendar capacity → complete natural Strategy Document → faithful translation/actual allocation → independent full-result review → substantive refinement → reviewed publication → separate atomic confirmation. It uses the existing worker, Attempt, archive, provider dispatcher, accounting, compiler and ApplyService. Public admission remains compiler v1. No production routing, deployment, paid provider calls or Phase 3 UI is included.

Authority: [approved handoff](../../AI_FIRST_PLANNER_HANDOFF.md), [current foundation](../../AI_FIRST_FOUNDATION.md), [approved Phase B sequence](../2026-10-25-ai-first-phase-a/PHASE_B_PLAN.md), [Step 5 report](../2026-10-27-ai-first-phase-b-step5/README.md) and [Step 6 handoff](../2026-10-27-ai-first-phase-b-step5/STEP_6_HANDOFF.md). [WORK_LOG.md](WORK_LOG.md) retains intermediate failures, fixes and evidence rather than overwriting them.

## Implemented behavior

### Independent review and substantive refinement

A trusted optional `journeyVersion:1` policy pin selects the complete journey. Its absence preserves existing compiler-v2 Step 5 semantics and hashes. CHECKPOINT value v3 and role-call protocol v2 freeze complete inputs before dispatch; REVIEW/ISSUE v2 retain actual producing calls, exact candidate correspondence and durable issue history. Role policies, output formats and generous reasoning/generation allowances remain the approved Step 2 policies.

The reviewer receives original/resolved accepted goals, exact instructions, the full Research dossier and its verified/rejected/uncertain provenance, student claims and demonstrated evidence, complete natural text, translation receipt, canonical education, actual compiled schedule and Calendar witnesses, every issue head and previous assessment. Previous AI assertions remain untrusted context. Literal grounding, normalized severity and rejected-concern accountability reuse the existing quality owner.

Corrections route to Research, strategist, translator, deterministic allocation or reviewer reconsideration. Substantive author changes require complete translation, graph/resource/protection validation, allocation and fresh independent review. Every prior issue, including closed history, is inspected again. Server-owned issue identities and original requirements/findings stay stable. ADDRESSED means an actual correction attempt; only independent verification resolves it. A false objection is explicitly withdrawn and is never labeled repaired. Unchanged output, new UUIDs, fresh clocks and additional search counters cannot manufacture educational progress.

Allocator corrections reuse the existing allocator. A previously incomplete search can use its established 100,000-node maximum without reducing education. A changed validated feasible placement records explicit `allocationCorrection` provenance with no invented AI producer. Incomplete search remains distinct from mathematical shortage.

Known complete malformed reviews retain every parseable rejected concern and can open an explicitly linked correction with frozen facts. Uncertain dispatch, missing/invalid usage, incomplete completion, truncation and pending reservations cannot silently repeat or approve work. Identical unsuccessful work stops after accountable reconsideration. Original finite resource limits, downstream reserves, deadline and financial root remain authoritative; there is no one-repair or small round cap.

### Research continuation and author feedback

Completed Research is immutable. Actual late questions/reinvestigation have a separate immutable handoff tied to the saved assessment and receipt. The existing continuation owner atomically stops the parent and admits one child. A consequential decision requires actual student answers; changed hard facts require explicit accepted canonical-intent edits. Models cannot grant permissions or supply those answers.

Explicit post-review retry pins the exact research and foundation archive digests. It retains actual assessments, latest authored drafts, original issue identities, withdrawals/corrections and outstanding questions, including crashes before handoff, issue import or completion of a child's dossier. Generic retries that drop compatible context are fenced before additional Research dispatch. Linked children share consumed/reserved/uncertain spending and the original absolute deadline.

Pre-review translator INCOMPLETE responses and correspondence gaps have optional frozen `authorFeedback` derived from actual accepted responses. They route through the existing strategist/translator, with repeated substantive corrections allowed. Missing information/decisions enter linked Research, which can ask real clarification questions. Unchanged facts, strategy and failed interpretation stop without approval. The final reviewer still inspects the complete repaired result.

### Reviewed publication and atomic confirmation

`RevisionService.publishReviewed` uses the existing canonical execution/diff sealer. Final publication independently validates the actual archive and receipts; exact strategy, translation, dossier/capacity and allocation; blueprints, executable specifications, context, forecasts, resources, per-plan/joint quality and mathematical aggregate. All selected revisions, one identical bundle-v2 binding, draft pointers, ChangeSet and successful Attempt commit together.

Current unresolved warnings/advisories project into the existing confirmation contract with exact acknowledgement requirements. Complete issue history stays in the bundle. Canonical report/envelope overflow fails explicitly; findings and educational work are not clipped to make publication succeed.

Bundle v2 names the exact actual allocation and independently approved review. A strategy can retain its original producing dossier across Calendar-only changes only through verified same-Research capacity ancestry. Historical readers preserve full correspondence without pretending old Calendar/source snapshots are current. Bundle v1, unprofiled v2 and incomplete candidates remain closed to execution.

Apply uses the existing atomic ApplyService, preserving ownership, current intent/base/Quest generations, protected/running work, whole diff, dependency graph, acknowledgements, materialization checks, lineage and rollback. It additionally validates the exact reviewed bundle/ChangeSet and current Calendar/source state. Actual uploaded bytes are verified before final publication/confirmation transactions; ownership and immutable metadata/hash are checked inside. An already applied receipt replays before later source/Calendar checks.

Later Research of selected active v2 plans receives their complete retained intelligence. Kept/running work retains exact resource aliases, content hashes and original source provenance, including resources beyond the old nine-source canonical projection. Newly accepted conflicting aliases get distinct references; protected execution is not renamed.

### Calendar concurrency and accounting

The additive publication migration extends existing Calendar mutation backstops. Native events/exceptions, shared ownership/membership, connected catalog/connections, sync/cache membership/windows and pending mutations coordinate through sorted account locks. Mutation backstops touch the existing account tuple once per transaction, without changing accepted facts/application timestamps, before the Calendar advisory lock. Final Planner transactions use nonblocking acquisition and NOWAIT tuple validation. A busy/stale snapshot restarts through existing coordination, including the narrow snapshot/lock acquisition race. Ordinary captures remain as-of evidence and preserve their first capture across transaction retries.

Remote providers remain subject to existing cache coverage/freshness; local transactions cannot lock remote changes. Interval witnesses establish feasible study availability, not exact external appointments or a promise against future changes.

The same AiUsageLog/role meter records every role and linked financial root. Complete producing responses retain their exact bytes and actual model/fingerprint/completion metadata. For the complete-journey pin, available response text and reported metadata are also retained when usage is absent/invalid; unknown completion is explicitly null. This does not invent tokens, costs, acceptance or billing completion. Unknown spending still blocks approval/replay. Earlier admitted profiles retain their prior interpretation.

## Affected implementation owners

| Area | Files |
| --- | --- |
| Versioned contracts, correspondence, history | `intelligence/foundation/{resources,contracts,validation,readers}.ts`, `intelligence/schemas/{reviewed-learning,understanding,natural-learning}.ts` |
| Complete review and feedback | `intelligence/reviewed-learning.ts`, existing `intelligence/quality.ts` exports |
| Deterministic orchestration and receipts | `server/{reviewed-learning,natural-learning,understanding,foundation,role-accounting,attempts,compiler,learning,worker}.ts`, existing `intelligence/provider.ts` |
| Canonical publication and execution | `server/{reviewed-publication,compilation,revisions,apply}.ts` |
| Capacity/live Calendar coordination | `server/calendar-capacity.ts`, existing `lib/calendar/planning.ts` |
| Additive SQL backstops | `20261027000000_planner_reviewed_learning`, `20261028000000_planner_reviewed_publication` |
| Qualification | New review unit/PostgreSQL suite and fixture; narrowly corrected retained Natural fixture; existing isolated foundation harness extended with the new suite/migrations |

Paths under `intelligence/` and `server/` are relative to `lib/planner/v2/`. The [exact modified/new file inventory](evidence/final-source-preservation.json) records the full scope. No Prisma fields changed in these steps; no schema cache marker change was needed. The additive migrations were exercised only in disposable qualification databases. Older migrations and reports remain unchanged.

## Verification

The [final verification manifest](evidence/verification.json) records the measured gates and limits. Intermediate and failed evidence remains separately named.

| Gate | Current authoritative result |
| --- | --- |
| First complete full PostgreSQL gate | [615 pass, zero failures/required skips](evidence/qualification-full-1/postgres-harness-run.json), including all 556 retained cases; precedes the final unaccounted-response retention change |
| Final full PostgreSQL gate | [393 V2 + 225 legacy = 618 pass](evidence/qualification-final-7/postgres-harness-run.json), zero failures/required skips; all 556 retained cases plus 62 new cases |
| Planner/research/provider/Calendar/timezone units | [772 pass, zero failures](evidence/qualified-unit-results.json), including all 760 retained unit case identities; the 33 opt-in Calendar cases all pass separately |
| Separate Calendar PostgreSQL services | [33 pass, zero failures/skips](evidence/calendar-lock-order-2/calendar-postgres-run.json) with the final lock ordering |
| TypeScript and worker build | [Node 24 worker build](evidence/worker-build.log) and [15 compiled imports](evidence/qualified-worker-imports.json) pass with credentials removed and network calls blocked; [Prisma validation](evidence/prisma-validate.log) passes |
| Scoped ESLint | [30 files, zero errors/warnings](evidence/final-qualified-lint.json) |
| Next production build and final typecheck | [Production Webpack build](evidence/web-build-run.json), [post-build `tsc --noEmit`](evidence/post-build-typecheck-run.json) and [full typecheck after fixture adjustment](evidence/fixture-typecheck.log) pass on Node 24.21.0 |
| Retained test identities | [All 556 PostgreSQL and 760 unit baseline cases retained](evidence/final-retention.json), including duplicate-name multiplicity; every opt-in Calendar case covered separately |
| Preservation and static checks | [5,334 baseline files byte-identical; 25 scoped changes, nine new source files](evidence/final-source-preservation.json); no missing/unrelated changes or modified historical evidence/migrations. [All 286 native source pins match; whitespace and document links pass](evidence/final-static-audit.json) |

The Planner PostgreSQL harness uses an audited disposable schema bootstrap plus actual ordered relevant migrations, real services/SQL/transactions/concurrency and scripted provider responses. It does not prove replay of the repository's incomplete historical migration chain. Calendar service checks use the established minimal Calendar bootstrap with inert Planner table seams; actual Planner publication guards use the full separate Planner harness. Provider credentials are stripped. Optional paid qualification is excluded.

## Failures and corrections

The work log and individually retained evidence document every failed development gate. Production fixes include live initial-capacity handling, immutable capture across transaction retries, unused-input versus financially recorded dispatch distinction, complete re-review after Calendar changes, content-based no-progress, exact inherited provenance, actual source checks and frozen author-feedback correspondence/routing. Publication/Apply barriers were removed only for the new profile after their replacement checks and native cases were installed.

Fixture corrections are separate: scripted Natural/review education fixtures start study tomorrow, isolating their intended source mutations and educational rounds from incidental civil-minute expiry. This includes the retained Calendar reallocation cases and new four-round refinement case. All exact call/version/history/feasibility, four-strategy/four-review and resolved-issue assertions remain; dedicated Calendar/currentness cases stay active. The new late-cancellation case expects the exact preserved null usage telemetry. New fixtures follow immutable previous links rather than JSONB key order, create genuinely unresolved packing, verify every actual uploaded source and use requested-intent bindings while Research resolution is pending. No deadline, execution safeguard or retained assertion was weakened.

The expanded bank exceeded the historical ten-minute aggregate test-process envelope once. Only the disposable wrapper's finite whole-suite limit increased to twenty minutes. Per-test deadlines, worker leases, provider/processing/root deadlines and production safeguards are unchanged. The failed administrative run and all failed development/test runs remain separately retained. One subsequent sandbox attempt could not open a loopback socket; it started no database. Authorized native reruns use only disposable loopback PostgreSQL.

## Remaining work and limits

No unresolved technical blocker remains for the authorized Phase B headless scope. All required PostgreSQL checks ran without required skips. Mobile/visual verification does not apply to this backend-only change; shared client/mobile files remain byte-identical to the task-start baseline. The Mac's task-owned sleep prevention is released at closure, as recorded in the final manifest. There is no unresolved product-scope approval request.

**Phase C live educational-quality qualification remains required and separately authorized**. Scripted responses prove mechanics and safeguards; they do not establish exceptional real-model education, semantic translation fidelity or reviewer judgment. Production admission/routing/cutover, production migration deployment and Phase 3 UI are outside this assignment. Existing physical storage/execution/report envelopes and remote Calendar cache limits remain explicit. Lost/unreceived provider responses remain uncertain; retained evidence cannot manufacture billing completion or authorize replay.

The dependency-ordered next work and proposed unpaid preparation are in [PHASE_C_HANDOFF.md](PHASE_C_HANDOFF.md). Historical development notes remain in [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md).
