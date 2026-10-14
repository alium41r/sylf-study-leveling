# Free study-plan diagnostic — prepared, not authorized to spend

Use **two fresh student situations × two interfaces = at most four DeepSeek V4.1 Flash calls**, with a proposed **$0.20 total ceiling**. The complete [student cases](cases.json), [model packets](model/), [run manifest](run-manifest.json), [assessment rubric](evaluator/RUBRIC.md) and [cost calculation](evidence/cost.json) are reproducible. No paid calls have been made for this experiment. Independent preparation signoff and unpaid checks are recorded beside the protocol. An approval record does not exist; earlier diagnostic approvals do not authorize this run.

## Question and comparison

Can Flash produce an excellent, complete educational plan when it has the student's real context and substantial reasoning/output room, but no compiler serialization task? Compare that answer with the **current compact Sylf blueprint interface at the same enlarged diagnostic capacity**.

| Controlled factor | Both arms |
| --- | --- |
| Model | `deepseek-flash`, documented as DeepSeek-V4.1-Flash; shared native DeepSeek adapter and exact pinned endpoint |
| Reasoning | Explicit enabled thinking, `reasoning_effort: high`; no sampling overrides, tools or search |
| Completion allowance | **32,768 tokens per call, combined reasoning and final output**; no extra allowance on truncation |
| Student information | Identical full student context, actual prior work, goal, resources including their contents/keys, deadlines, uncertainty and net capacity; verified by shared-context digest and mapping checks |
| Calls | Fresh conversation per response; one sample per arm/case; sequential, counterbalanced interface order |
| Recovery | No retries, fallbacks, repair, paid reviewer or model-based conversion of outputs |

The **natural arm** uses a short educational system instruction and the shared student context. It requests a detailed, usable study plan in whatever form helps the student. It has **no JSON mode, one-field JSON wrapper, Sylf identity/contract, compiler requirement, mandatory headings, prescribed sequence or length target**. It still receives and must honor the student's genuine needs and constraints.

The **structured arm** uses the unchanged `blueprintRequest` system instruction, compact contract and JSON mode from Changeset 1, followed by unchanged compact/canonical validators, declared split expansion and deterministic allocation. Its full student context is also embedded unchanged, with canonical aliases/intent/evidence/capacity projections. Extra scaffolding, repeated facts and the existing concise-output instructions are part of the interface treatment. Input tokens are therefore measured, not forced equal. The comparison tests the **interface bundle**, not JSON format alone.

**Budget boundary:** production blueprint output is still 8,192 tokens and the existing educational root still has its frozen budgets. This experiment uses the native adapter in an isolated diagnostic process with 32,768 tokens for **both** arms, rather than changing the dispatcher, route table, root budget or compiler. It is not a live `generateLearningBlueprint`/Attempt/review/repair/Apply qualification. The extra diagnostic allowance requires approval for this experiment only. Nothing returned can enter Planner, quests or Focus. Good results here do not establish that the same behavior fits 8,192 tokens, or that a production review can finish at 4,096. A single complete response under 8,192 actual tokens also does not prove an identical response would occur with a lower declared cap.

## Cases and execution order

1. **Nadia — probability assessment:** four conceptual areas, independently reported strengths and specific unaided errors, the actual practice handout and solution key, an unreleased exam, eight uneven available days (235 net minutes), and a 30-minute session maximum. Test correct prioritization, transfer and realistic preparation without unsupported weights or automatic filling of capacity. Run **natural, then structured**.
2. **Omar — SQL assignment:** four actual library queries, complete database, syntax notes, expected tables, observed join/count errors, ten available dates (240 net minutes), and a 30-minute session maximum. Test a useful complete plan for the assignment without a gratuitous full course or application build. Run **structured, then natural**.

These are new domains/tasks, not altered versions of the former circuits/Python development cases or the previous eight reasoning/twelve reviewer cases. SQL project syntax correctness and all supplied expected tables are checked locally; probability arithmetic is recalculated independently. The contexts are realistic **synthetic student scenarios**, not anonymized real student outcomes or verified official qualifications. Supplied answer keys are legitimate student resources; hidden evaluator judgments and severity labels are never sent to Flash.

Run all four responses if there is no operational stopping condition; do not make the second pair depend on a subjective favorable score from the first. One sample per arm reduces spend and deliberately leaves reliability/stochastic variance unresolved. No duplicate calls or additional blocks are authorized by this protocol.

## Evaluation

Before paid calls, the existing separate independent AI reviewer critiques the cases, keys, factual mappings and rubric. Preserve its disagreements and author resolutions; no silent label edits. This is **AI-agent signoff, not human educational signoff**.

After paid calls, the author and that same independent AI agent separately evaluate complete outputs against the preregistered rubric. The independent agent locks judgments before seeing author scores, arm labels or efficiency metrics. Response formatting is necessarily visible, so masking is incomplete. No DeepSeek/Gemini review call is added.

Score correctness/learning value, personalization/evidence, completeness/usability, prioritization, practicality/proportional workload, and adaptation/uncertainty. Educational usability requires **>=4/5 on every dimension and no serious defect**; excellence also requires **mean >=4.5**. Accept different defensible strategies and equivalent solutions. Cite consequential findings and retain/adjudicate disagreements. Never reward mere verbosity or force a reference lesson sequence.

Assess natural plan delivery separately from structured first-response parsing, canonical validity and allocation. Do not require a structured generator to author dates; allocation owns them. A complete malformed answer can still receive semantic analysis where readable, but fails technical delivery. Blank/truncated output cannot pass as a complete plan. Observe unnecessary compulsory workload, effort beyond the student's needs, unavailable resources and false mastery claims. Report contingent/optional work separately.

The [rubric's interpretation table](evaluator/RUBRIC.md) fixes the decision rules: good prose with poor structured content supports investigating interface burden; good content with invalid structure supports an expression/validation diagnosis; common semantic failures support investigating educational/model configuration limitations. Shared success at enlarged capacity demonstrates case-level capability only. An incomplete response leaves capacity/delivery unresolved. Mixed results remain mixed. **No automatic prompt changes, cap changes, model switch or further diagnostic spending follows any outcome.**

## Cost and stopping rules

Current published peak/cache-miss prices are **$0.30/million input tokens and $1.20/million combined output tokens**; off-peak rates are half. Reasoning tokens are included in completion billing and counted once. Sources checked on 10 October: [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/) and [Chat Completions specification](https://api-docs.deepseek.com/api/create-chat-completion/). Recheck before paid execution; uncertainty or rates beyond the approved peak allowance stop dispatch.

- Four complete output allowances total **131,072 tokens**. Conservative full-wire UTF-8 input bounds plus framing slack total **77,252 units**. This retains the repository diagnostic's conservative byte-bound principle; it is not a measured tokenizer count or provider billing invoice.
- Full peak/cache-miss reservations total **$0.180462**; full off-peak/cache-miss allowance is **$0.090231**. Reserve every call's full upper allowance before dispatch, retain reservations rather than recycling unused capacity, and keep the independent **$0.20 hard admission ceiling**. Do not assume cache discounts or time-of-day pricing to admit a call.
- For illustration only, 3,000 input and 8,000–16,000 combined output tokens per call would cost approximately **$0.021–$0.0804** across off-peak/peak conditions. These are usage scenarios, not predicted usage or a promise that 32,768 is sufficient.
- Stop the whole run on the first blank/`length`/non-stop result, timeout, HTTP/transport uncertainty, missing/malformed usage/reasoning/cache counters, spend beyond reservation, changed model/fingerprint, changed frozen sources/packets, lost sleep guard, journal failure or operator `STOP`. Do not retry, salvage, replenish or reuse earlier approval. A complete structured schema rejection is informative and permits the unchanged remaining comparisons; record it without repair.
- Each call has a **240-second** diagnostic timeout; the entire run has a **20-minute** bound. A timed-out request can still incur charges: retain its full reservation, mark unknown spend and stop. These limits belong solely to this standalone diagnostic.
- Journal and exclusive lock prevent duplicate/restarted runs. Check the owned macOS `caffeinate` assertion before and during every call and release it at completion or failure. Reuse the verified existing sleep owner.

Report actual input/cache hit/miss, total completion, reasoning and nonreasoning completion counts, final response bytes, finish reason, latency, request hashes, returned model/fingerprint, estimated published-price cost and conservative upper cost. Require identical observable fingerprint state across calls, including null/non-null transitions. If every response omits fingerprints, record that limitation: freezing a request and model alias cannot freeze or verify remote model weights. `completion - reasoning` is the provider's nonreasoning completion count; it is not a locally retokenized visible text count. Store final content and counters, not private internal reasoning text. Mark invoice verification unknown unless an invoice is supplied.

## Reproduction and approval boundary

All preparation commands replace transport with an unpaid stub. They do not contact providers, load a live key into the adapter or write production data:

```sh
node documentation/planner/reports/2026-10-10-step6-free-plan-experiment/prepare.cjs check
node documentation/planner/reports/2026-10-10-step6-free-plan-experiment/preflight.cjs
node documentation/planner/reports/2026-10-10-step6-free-plan-experiment/execution-preflight.cjs
npx eslint documentation/planner/reports/2026-10-10-step6-free-plan-experiment/*.cjs
```

`prepare.cjs prepare` authored the packets before signoff; do not regenerate them after freeze. The source/runtime/provider environment snapshot is checked against the existing 207 pinned files. Local tests cover exact adapter bodies, matched full student inputs, canonical mapping/validation/allocation, incorrect references/capacity, exclusive persistent admission, retry/model/wire rejection, missing-usage halt, insufficient ceiling and sleep prevention. Fifteen additional execution-loop modes use simulated approval only inside disposable VM fixtures: no real approval record or live transport is installed. They cover successful execution, preserved schema failures, approval/rate/hash/ceiling rejection, truncation, blank output, unknown usage, HTTP failure, sleep loss and fingerprint changes/disappearance/appearance. Technical stubs are unassessed plumbing inputs, **not educational defaults or reference plans**.

Paid execution remains gated by a **new explicit human approval**, signed-off frozen protocol, fresh unpaid preflight, freshly checked official peak prices and a matching `approval.json` recording the exact user message, hashes, four calls, $0.20 and the 32,768-token standalone comparison. No such file is present. After approval only, the operator creates that record and uses `execute.cjs paid`; the fixed journal disallows rerunning an existing run. Approval may also be declined without any further work or spend. Keep production and previous protocols unchanged.

Prepared execution and evaluation stop after these four calls and the report. Phase 2 qualification stays open and Phase 3 stays paused until a separate decision.
