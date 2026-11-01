# Phase C qualification protocol v1

28 October 2026, Asia/Karachi. **Preparation only; no paid execution is authorized.** Approval applies to the frozen manifest, selected case, resource policy and spending ceiling, not to production settings. Changes after responses require a new version and preserve old evidence.

## Authority and prerequisite

Follow the [approved handoff](../../AI_FIRST_PLANNER_HANDOFF.md), [foundation](../../AI_FIRST_FOUNDATION.md), [Phase B report](../2026-10-27-ai-first-phase-b-steps6-8/README.md) and [Phase C handoff](../2026-10-27-ai-first-phase-b-steps6-8/PHASE_C_HANDOFF.md). Educational excellence precedes efficiency. The proposed numeric rubric is an approval proposal, not an already agreed release threshold.

Reverify the 286 Phase B source pins, prior evidence and current baseline before testing. The fresh baseline is 618 required PostgreSQL checks, zero failures/required skips, plus the focused unit checks recorded in this report. The original 772-unit/33-Calendar/build evidence remains source-matched and unchanged. New preparation harness code is separately rehearsed and typechecked. Never invoke the old compiler-v1 `compiler-qualification.live.ts` as proof of this journey.

## Frozen inputs and separation

[CASE_BANK.json](CASE_BANK.json) contains 12 realistic synthetic student packets. C01 is the development pilot; C02–C12 are **holdout candidates**, not a validated independent benchmark. This assistant authored the cases and rubric; independent authors/subject experts must validate and extend the bank before release claims. Do not reuse the historical 17-case development corpus as a new holdout.

`modelPacket` in the preparation utility allowlists student context, accepted instructions, goals, resources, availability and commitments. It excludes case IDs, partition/expectation labels, clarification answer keys and evaluator fixture requirements. Only accepted input, uploaded contents and actual seeded student data reach the agents. [EVALUATOR_ONLY.json](EVALUATOR_ONLY.json) and [RUBRIC.json](RUBRIC.json) are never model inputs. Actual follow-up student answers come from a frozen answer packet only when asked, through `ResearchUnderstanding.continue`; unknown answers require the human or an honest stop. Never invent answers or silently modify accepted facts.

Resolve relative dates to the next Asia/Karachi civil date immediately before live approval, write absolute deadline/event dates and hash the resulting intake. Pin the anchor in the approval manifest. A delay that invalidates that anchor requires regeneration/reapproval; do not silently slide deadlines. Preserve exam-day exclusions. Repeated trials get distinct disposable users/roots with identical frozen inputs and independent responses; prior outputs never enter later trials.

The current [dated pilot input](PILOT_INPUT.json) is frozen at **29 October 2026**: chemistry **19 November**, biology **22 November**, with 16 actual Calendar occurrences and the unselected English task on **1 November**. Dates/instants were resolved through the existing compiled Calendar helpers. Review this exact packet with the approval request; it is not paid authorization.

The bank includes typed fixture requirements for paused work and stale external calendars. C01 has a complete runnable rehearsal. Later cases require their corresponding real service fixtures and an offline check before they are selected for paid execution; prose describing a paused task/cache is not a substitute for its actual persisted state.

## First experiment

Run C01 once: chemistry and biology school mocks, four defined areas per subject, exams 21/24 days after the anchor, three original teacher/diagnostic/practice packets, known misconceptions, fixed study windows, Friday rest, overlapping Saturday commitments and one unselected English task. The assessment is teacher-issued school scope, not an official external-board syllabus. Use `GENERAL` canonical policy with fixed deadlines and exact accepted scope; do not fabricate external assessment identity.

Use **the existing** GenerationService → PlannerWorker/createCompilerHandlers → ResearchService/ResearchUnderstanding → Calendar capacity → natural strategy/translation/allocation → ReviewedLearningStage → RevisionService.publishReviewed → separate ApplyService. Admit compiler 2 with `journeyVersion:1`. The rehearsal uses these actual services and genuine PostgreSQL; the later authorized live run replaces only the scripted adapter with the existing DeepSeek adapter. No routing table or production default changes.

The actual live execution adapter is deliberately not enabled in this preparation task. `prepare.mjs` cannot execute a model and rejects live flags; `--phase-c-rehearsal` is scripted-only and credential-free. After human approval, install the narrow real-adapter binding using this exact rehearsed setup, validate the approval/source/input hashes and current balance before dispatch, and retain that runner source in the execution evidence. This is an execution-stage step, not an invitation to use the legacy live harness or bypass the meter.

Keep all role calls real in the approved run. Do not mix scripted Research, strategy, translation or review with real roles and call it an end-to-end live journey. The first case permits uploaded-material research only; disable public search at this qualification boundary. DeepSeek Search remains the production-v2 preference, with existing fallback behavior unchanged. Search/Fetch delivery quality is a separate later paid block.

A natural review may approve the first candidate. Do not inject a defect, force another revision or rerun until an attractive sample appears. If substantive refinement occurs naturally, retain every issue/withdrawal and compare the entire before/after result. If it does not, record the natural revision → verification → Apply witness as still unobserved.

## Resources and money

All four roles use the existing `deepseek-flash` policy with HIGH effort; strategist TEXT, others JSON. Preserve 65,536 completion tokens per call, including reasoning, and allow 500,000 conservative UTF-8 input units per call. Never clip the full dossier/strategy/history to fit these limits. An exceeded allowance is an operational boundary, not evidence that educational work should be shortened.

The proposed one-root envelope is 48 calls, 3,000,000 aggregate input units/tokens under the existing reservation/settlement interpretation, 700,000 completion tokens and the existing four-hour absolute deadline. Translator holdback funds two full role calls and reviewer holdback funds three; all original escrow checks remain. These are finite funding safeguards, not desired call counts or a small refinement-round cap. Linked continuations inherit the same root, consumed/reserved/uncertain resources and deadline.

Using published peak/cache-miss Flash rates, conservative model liability is `3,000,000 × $0.30/M + 700,000 × $1.20/M = $1.74`; request **$1.75 maximum authorization** for this one experiment. No paid tools/OCR/reference judges are included. No account-wide billing lock is claimed: the bound assumes the provider honors its documented model/rates/output limit and the existing input reservation bound. Rate changes, model mismatch, usage overruns, missing usage or uncertain billing stop further dispatch and require reconciliation; no invoice total is fabricated.

Illustrative whole-journey totals, not calibrated forecasts: 180k input/100k completion costs $0.174; 500k/250k costs $0.45; 1M/500k costs $0.90 at the conservative rate. Actual reasoning, context and number of useful refinements are unknown. Retain all actual usage and costs; do not tune pedagogical depth to these examples. A smaller authorized sum may require a different explicit resource profile/scope and offline admission check, not silently smaller output or disabled reasoning.

[Official pricing](https://api-docs.deepseek.com/quick_start/pricing/) was checked on 28 October. Search/Fetch are separately priced at $0.75 per 1,000 successful requests. No promotional waiver is assumed for Sylf's direct raw API calls. All paid search, fetch and fallback providers are excluded from the first experiment.

## Reachability and execution preflight

1. Use Node 24.21.0, matching package/.node-version and the qualified worker. Verify a disposable loopback database, full matching SQL guards/readiness and synthetic owners. Do not inherit production database, storage, authentication or other-provider credentials.
2. Run the metadata-only preflight with only the existing DeepSeek key. It fixes `https://api.deepseek.com`, permits only GET `/models` and `/user/balance`, rejects redirects, uses normal TLS trust, bounded responses and a 15-second timeout, and makes no automatic retry. It matches the current adapter's in-memory non-ASCII credential sanitation without changing stored credentials.
3. The restricted shell returned ENOTFOUND. The network-enabled command context reached both authenticated endpoints with 200. Use that **same approved network context for the eventual worker subprocess**, not a web tool/browser that happens to reach the docs. Fresh metadata results, sufficient balance, matching model identity/capabilities and a valid approval are required immediately before paid execution. No paid “smoke test” is authorized here.
4. GET success establishes DNS/TLS/auth/account reachability only. It does not establish POST/stream delivery, JSON reliability, long-call stability, source discovery quality or educational performance. The first paid stage is part of the one approved journey, not an extra unmetered ping. Never probe Search/Fetch/chat POSTs with credentials before approval, even with malformed bodies.
5. Clear model/base-URL/price overrides in the isolated qualification child rather than changing repository/provider settings. Use only the approved Flash route and canonical origin. No provider fallback expansion, HTTP proxy workaround, certificate bypass or alternate account is permitted. Recheck metadata/rates before execution if they changed.

[Models metadata](https://api-docs.deepseek.com/api/list-models/) reports the alias, context/output limits and supported efforts. [Balance](https://api-docs.deepseek.com/api/get-user-balance/) is account metadata. The current successful result is [redacted network evidence](evidence/network-preflight.json); exact balances remain in a mode-0600 private temporary receipt. The provider model alias/display name is not an immutable version: retain the published version, actual effective model, nullable response fingerprint and timestamp separately.

## Durable orchestration and safeguards

Use actual accepted instructions and the complete verified dossier. All calendar inputs are actual canonical Calendar rows; overlapping commitments must be unioned. Preserve one/two-target authority, rest/deadline/workload limits, source hashes and unselected/protected work. The native allocator's interval witness is required; total free minutes alone do not prove feasibility.

Let the existing worker own leases, cancellation and recovery. Pump ordinary worker ticks until the owned financial root's current linked leaf reaches a genuine durable boundary; a stopped parent with a queued Research child is not the final outcome. Follow owned continuation identifiers and CAS digests. A consequential question suspends for a real predeclared student answer or the human. Do not reset budgets/deadlines or accept a generic retry that drops issue history. Recover saved complete responses through the existing receipts; uncertain dispatch is never automatically repeated.

Run one serial root only. No second case, repetition or model experiment starts under C01 approval. No automatic top-up, restart, reduced effort/cap, bypass of validation, concern removal or permission upgrade is allowed. Preserve actual late finance without accepting cancelled/expired output. Cancellation, missing/incomplete response, unknown spend/model/cost, changed owned facts, stale Calendar, infeasibility, unresolved allocation or no credible progress must remain honest outcomes.

**Long-review risk to monitor:** Calendar snapshots last at most five minutes. Source inspection shows that expiry can append a capacity version and require a new full review, even without an event edit. Scripted fast-call success does not qualify long real-model delivery. Record review duration, capacity source/currentness digests and actual semantic/placement changes. Do not spend on repeated clock-only review churn: pause the root through its existing cancellation/stop boundary, retain the completed response/actual finance and diagnose before another paid dispatch. The execution-stage real-adapter binding must verify this stopping behavior offline before paid use. Do not solve it by shortening reasoning, extending freshness or accepting a stale review. This is a known operational risk, not an observed live-model failure.

Publication requires the actual complete independently reviewed candidate. Apply, if operationally appropriate, is an explicit operator action against that exact ChangeSet in the **disposable database only**, after inspection and acknowledgements; the model never confirms. Capture full historical correspondence and replay. An external educational failure can still exist in an internally approved candidate; never publish to the real student's workspace as part of qualification.

## Evaluation and stopping

Use [RUBRIC.json](RUBRIC.json) and [SCORECARD_TEMPLATE.json](SCORECARD_TEMPLATE.json), frozen before outputs. Proposed individual acceptance: weighted score ≥4.5/5, every core dimension ≥4, no serious defect, all mechanical gates passed and no unobserved core facet relabeled as a pass. This is not a length target or an internal self-score.

Two independent subject-competent human raters are required for a qualification claim. First independently list defects against original input/materials before seeing the runtime review; then reveal its findings/history and assess misses, false blockers, unsupported withdrawal, regressions and genuine correction. Preserve disagreement, evidence references and adjudication. This assistant authored the cases; its initial audit is provisional, not independent expert evidence.

For C01, recompute numerical examples/units, inspect diagnostic misconceptions and conditional support, read complete natural text alongside every executable instruction/resource/criterion/dependency, and validate actual calendar witnesses/workload. Inspect coverage before both mock dates, not just the first 14-day segment. Do not grade a mention of a topic as sufficient teaching. The evaluator-only transfer items test correctness of checks and actual independence; they are never given to tested agents.

Stop the initial block after its one natural journey/boundary. Stop further paid work immediately on a serious integrity error, unknown/uncertain spend, loss of authority, model/rate mismatch or inability to retain evidence. An ordinary educational defect can receive its natural role-routed correction within the same approved root while safe; do not abort all substantive refinement at the first useful finding. Remaining resource/no-progress boundaries retain the best assessed draft as incomplete, never lower the standard.

The separate later review-accuracy assay needs paired sound and deliberately defective bundles, independently labeled before model review; report false-blocker rate, serious-defect recall, route accuracy, valid withdrawals and full reinspection. Synthetic defect correction is diagnostic evidence, not the required naturally occurring live revision witness. Do not buy this additional block under first-experiment approval.

One pilot cannot establish consistency. Later work, separately funded, should validate independent cases, run preregistered repeated samples and stratified held-out/reference comparisons, report every attempt and operational boundary with per-stratum uncertainty, use two raters/adjudication and meet the retained ≥100-case release ambition. No cherry-picking, pooling model versions, hiding failed attempts or treating absent review opportunities as perfect reliability. Cost/latency optimization follows demonstrated quality.

## Evidence and reproduction

Retain source/config/policy/prompt/input/material hashes, normalized dates, synthetic-owner/Attempt/root/continuation IDs, exact visible role responses, role-call/financial receipts, usage/reasoning subset/cache data, requested/effective model/fingerprint/completion, known/unknown costs, all dossier/strategy/translation/allocation/review/issue versions, rejected concerns, ChangeSet/revisions/Apply receipts and independent scorecards. Export from the owned disposable database **before cleanup**, including interrupted work. Do not record API keys, hosted credentials or hidden reasoning text. Keep raw exact educational evidence distinct from sanitized operational errors.

The rehearsal command, on Node 24 and the existing native PostgreSQL runtime, is:

```sh
node scripts/test/test-planner-ai-first-foundation.mjs --phase-c-rehearsal --native-bin /private/tmp/sylf-phase-a-runtime/package/native/bin --evidence-dir documentation/planner/reports/2026-10-28-phase-c-qualification-preparation/evidence/new-rehearsal
```

This uses an explicit disposable alias for the new `.phasec.ts` fixture, retains ordinary baseline test selection, strips credentials and blocks external fetching. The default foundation runner remains unpaid. Preparation commands and approval boundaries are in [the operator guide](../../../../scripts/qa/planner-phase-c/README.md).
