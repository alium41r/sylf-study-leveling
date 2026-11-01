# Phase B Step 2 — role resource admission and accounting

26 October 2026. Implements Step 2 of the [approved Phase B plan](../2026-10-25-ai-first-phase-a/PHASE_B_PLAN.md), following the [handoff](../../AI_FIRST_PLANNER_HANDOFF.md), [current foundation contract](../../AI_FIRST_FOUNDATION.md) and [Step 1 report](../2026-10-25-ai-first-phase-b-step1/README.md).

## Result

Compiler v2 now supports explicit role resource policies through the existing provider dispatcher, meter, Attempt lifecycle, owned quota and financial receipts. Multiple substantive reasoning/refinement calls can share one durable root across linked Attempts without resetting usage, deadlines or uncertain spending. No additional execution engine, queue, ledger or agent manager was introduced.

Production web admission remains compiler v1. V2 research/strategy orchestration, source tools, publication and apply remain gated. The new migration is prepared and locally verified, **not deployed**. No paid API calls or production routing changes occurred.

## Capabilities and guarantees

| Area | Implemented behavior |
| --- | --- |
| Explicit admission | Trusted service composition supplies `resources`; the server binds it to accepted owned targets. Full policy is immutable in Attempt payload, with version/digest/limits in optional `budget.aiFirst`. Client/model bodies cannot grant resources or permission. Unprofiled Step 1 attempts retain their activation barrier. |
| Quality capacity | Strategy uses complete natural TEXT; translation and structured review support JSON. Role-specific input/output allowances and explicit effort bypass the old route's 8,192-output ceiling. The named offline example grants 256 calls, 64M input units, 16M completion tokens and four hours, with HIGH/65,536-token role calls. These are finite safety ceilings, not educational targets, production defaults or live quality evidence. |
| Downstream funding | Research/strategy preserve translation and independent-review holdbacks; translation preserves review. The example funds two translation calls and three reviewer calls, including verification. Every new semantic revision must pass admission again; prior review does not permanently release protection for later work. |
| Existing financial owner | Role receipts use `AiUsageLog`, with RESERVED → DISPATCHED → SETTLED/UNKNOWN_SPEND or proven cancellation-before-dispatch. Aggregate counters project these receipts. One dispatched root consumes one existing feature quota unit across continuations; undispatched reservations can be released. No separate balance ledger exists. |
| Linked Attempts | Explicit stopped-parent continuation retains root, policy, accepted instructions/targets, original start/deadline, quota and actual/reserved usage. Parent/child admission is serialized and SQL prevents siblings. Late reconciliation updates finance while stopped parent artifacts remain immutable; the child reads the fresh aggregate. |
| Unknown spending | Uncertain dispatch holds its input/output reservation and consumes a call. It blocks further admission/continuation until actual reconciliation. Known token usage with unknown price stays charged in token/call accounting and its currency value stays null. No unknown charge is fabricated as zero. |
| Actual usage | Completion includes reasoning once; reasoning/cache subsets retain reported values or unknown. Receipts retain requested provider/model, reported effective model, nullable fingerprint, finish reason, input/prompt/policy digests and known/unknown pricing. A reported alias is not an immutable model snapshot. |
| Recovery | Stable root-scoped logical keys cannot produce a second dispatch. Complete bounded visible responses are saved with usage before assembly/validation. Saved responses recover under the current lease without another provider call. Truncated, missing-usage and uncertain responses never silently repeat or switch providers. |
| Response correspondence | Saved checkpoint input/text/digest must match the actual retained role receipt. STOP/nonblank/valid JSON are delivery conditions, not educational approval. Physical overflow preserves actual spend and an explicit overflow outcome; the education is not clipped or replaced. Hidden reasoning text is never persisted. |
| Execution safety | Existing owner coordination, lease/deadline/currentness, fence, cancellation, immutable history and accounting reconciliation remain authoritative. SQL checks policy/root immutability, finite aggregate reservations, holdbacks, receipt transitions and complete-response acceptance. No change to canonical ApplyService or Quest/Focus protections. |
| Cost reporting | Pre-dispatch reservations and undispatched cancellations are excluded from actual request totals. Cached/reasoning usage and unknown-cost flags retain their real meanings. |

Input reservations are conservative UTF-8 transport units; actual prompt tokens replace them on settlement. Role completion allowance includes reasoning plus visible output. The offline profile is deliberately generous and explicitly selected. Educational usefulness and provider delivery remain unqualified until later scripted journeys and separately authorized paid evaluation.

The shared DeepSeek adapter adds opt-in whitespace preservation and reported identity/fingerprint metadata. Its default behavior remains unchanged. Request/response fields follow the [official DeepSeek chat API](https://api-docs.deepseek.com/api/create-chat-completion/); no provider endpoint was called for this work.

## Versioning and ownership

The canonical wire remains version 2. `RuntimeBudgetV2Schema` gains an explicit optional `aiFirst.schemaVersion:1` interpretation; absent metadata preserves legacy limits, hashes and counter/deadline validation. Compiler-v1 requests cannot admit the new interpretation. Legacy route caps, fallback behavior, quota, profiles and history retain their semantics.

Migration [20261026000000_planner_role_resources](../../../../prisma/migrations/20261026000000_planner_role_resources/migration.sql) preserves root uniqueness for legacy/unprofiled work and adds separate constraints for profiled v2 original roots, one child per parent and one logical call key per root. It extends financial receipt states only for role receipts and installs resource/receipt guards. Worker readiness checks the matching guards and indexes. No Prisma field or schema-cache marker change is required. All existing migrations remain byte-for-byte unchanged.

Existing resource ownership is unchanged: [AttemptService](../../../../lib/planner/v2/server/attempts.ts) handles lifecycle; [role-accounting helpers](../../../../lib/planner/v2/server/role-accounting.ts) extend the existing [accounting owner](../../../../lib/planner/v2/server/accounting.ts); [provider.ts](../../../../lib/planner/v2/intelligence/provider.ts) remains the dispatcher/meter. New [role-call contracts](../../../../lib/planner/v2/intelligence/foundation/role-calls.ts) extend the foundation policy. [Foundation persistence](../../../../lib/planner/v2/server/foundation.ts) checks exact response correspondence. [Generation](../../../../lib/planner/v2/server/generation.ts) accepts trusted policy configuration; [worker readiness](../../../../lib/planner/v2/server/worker.ts) checks deployment compatibility. The [cost reader](../../../../app/api/ai-costs/route.ts) excludes undispatched receipts.

## Verification

Final results and commands are recorded in [verification.json](evidence/verification.json), with run history in the [evidence index](evidence/README.md).

- **395 unit tests pass** in 35 files, including five new role-policy/adapter tests and retained provider/cost/telemetry coverage.
- **243 V2 + 225 legacy PostgreSQL checks pass (468 total)** with zero required skips. Fourteen new role cases cover formats/effort/usage, calls beyond legacy ceilings, concurrent holdbacks, continuations, unknown spend, saved-response takeover, incomplete results, deadlines, ownership, immutable policy, actual overrun, checkpoint correspondence, concurrent children, missing usage and physical overflow. One additional actual cost-route regression checks undispatched versus dispatched receipts.
- Full TypeScript, worker build, credential-free ordinary Node imports, Prisma validation and production web build pass on Node 24.21.0. The web build uses the existing explicit 6 GiB qualification process allowance. No configuration change or diagnostic suppression was added.
- Scoped lint finds **zero introduced diagnostics**. Seventeen existing `no-explicit-any` errors remain in the shared DeepSeek adapter/types; the exact task-start sources were reconstructed and hash-verified, and their diagnostic sets match. This is an existing lint limitation, not a new failure or a claim of full lint cleanliness.
- Final PostgreSQL source pins report no drift. [Preservation evidence](evidence/preservation.json) accounts for intended changes and unchanged execution/provider-routing/history owners, including unrelated ongoing Notes/Calendar work.

Intermediate failures are retained: one worker type-narrowing error, the missing versioned financial-state extension, and a stopped-parent projection refresh rejected by immutable-history guards. They were corrected without relaxing the guards. A standalone typecheck initially raced the web build regenerating `.next/types`; its sequential rerun passes. The initial automatic permission review timed out; the permitted retry succeeded. No approval blocker remains.

## Limitations and Step 3

Resource admission/accounting is complete for this step. It does not claim educational model quality, immutable provider versions when only an alias is reported, an invoice-backed price where provider/pricing detail is missing, or a complete AI journey. Actual routing remains unchanged. Undispatched cancelled logical keys remain history; a retry needs an explicit replacement key. Physical artifact/storage limits remain explicit boundaries, never clipping permissions.

Step 3 must implement Research & Understanding through the existing compiler and research/context/document owners:

1. Compose exact accepted instructions, requested/resolved intents, owned app context, protected work, raw/adopted evidence, provenance/applicability and consequential uncertainty into a durable dossier. Student reports/time spent must not be relabeled as demonstrated mastery.
2. Invoke the research role with stable logical keys, exact input bindings, explicit policy and worker cancellation. Bind checkpoints to resource snapshots and recover saved responses; reconcile uncertain dispatch instead of repeating it. No new manager or provider transport is needed.
3. Integrate search/fetch/document/OCR tool admission, source freshness and charging through existing services with an explicit v2 interpretation. Legacy tool windows/charges intentionally reject profiled v2 so their old limits cannot become accidental quality constraints.
4. Add consequential clarification and research-driven intent adoption/continuation with ownership/CAS and immutable correspondence. Step 2 permits resource continuation only under unchanged accepted request/targets; it does not silently authorize changed facts, assessment identity, goals or permissions. Preserve this same financial root/policy/deadline while implementing the appropriate proof or student decision.
5. Qualify those services with scripted adapters and disposable PostgreSQL. Strategy/translation, calendar integration, review/refinement and publication/apply stay at their dependency-ordered later steps. No paid run, deployment or Phase 3 UI is implicit.
