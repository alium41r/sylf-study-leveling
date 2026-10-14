# Controlled initial block — execution and independent evaluation

The approved block made **10 DeepSeek V4.1 Flash calls**: eight reasoning calls completed, and the first two independent-review calls exhausted their 4,096-token caps without final text. The review arm then stopped under the frozen two-operational-failure rule; the remaining ten reviews were not dispatched. There were no retries, fallback calls, Gemini calls, implementation changes or published diagnostic artifacts. Phase 2 qualification remains incomplete; no later block or Phase 3 work started.

Educational assessment found **six confirmed passes, one confirmed evidence failure and one pending criterion judgment**. Reviewer accuracy is **unassessable**, because neither attempted review produced a verdict. The estimated charge is **USD 0.013504704**, with a conservative peak/uncached upper estimate of **USD 0.0272352**; both are below the approved USD 0.40 ceiling. This is a diagnostic result, not a claim that the complete Planner is qualified.

## Educational reasoning

All eight responses finished with STOP and valid one-field JSON envelopes. The case-author-side primary assessor and the separately delegated AI reviewer scored the three educational dimensions independently, using neutral IDs and full accepted inputs before comparing assessments. The independent reviewer locked scores before reading execution mapping, provider receipts or the parent's scores. This was AI-agent evaluation, not human expert assessment; earlier knowledge of the tasks/model limits full blinding. The [locked primary records](evaluation/locked-primary-root.json), [independent primary](evaluation/locked-primary-agent.json) and [independent final report](evaluation/independent-evaluation-agent.md) preserve both judgments. No average can erase a failure; the [adjudication](evaluation/adjudication.json) records disagreements and disposition.

| Case | Final judgment | Evidence |
| --- | --- | --- |
| g01: passage evidence | FAIL | Credits supplied inference examples as partly demonstrated learner ability. The statement supports readiness/practice prioritization without actual learner evidence. Independent all-category stopping checks prevent a serious omission, but do not make that evidence claim grounded. |
| g02: rainfall interpretation | PASS | Prioritizes the observed overclaim, checks supplied units/comparisons and rejects a climate trend without inventing exam weights or fetching an archive. The multiple-station wording is a minor overgeneralization. |
| g03: oral history | PASS | Checks all four outline requirements and keeps recording, editing and speaker checking as later unbooked scope. |
| g04: HTML card | PENDING OUTPUT ADJUDICATION | The present-alt-attribute gate sits beside a no-image placeholder/future-photo explanation. An ordinary text placeholder needs a different check, but an image-based placeholder is a plausible alternative reading. A prose strategy need not specify every implementation detail or support every possible method. Preserve the ambiguity; do not call it a conclusively proven serious defect or a pass. |
| g05: Spanish | PASS | Uses bounded changed production/explanation, conditional help, correct accents and honest unknown retention. Pronoun variation should remain compatible with supplied es/está forms. |
| g06: implication | PASS | Correct unfamiliar argument/counterexample checks without compulsory formal proof. “No formal assessment exists” overstates what was supplied, without changing the bounded strategy. |
| g07: diary annotation | PASS | Completes all four real assignment requirements with quotations and a specific evidence limit. A checking pass tests a misconception; the wording should not promise automatic resolution. |
| g08: rhythm worksheet | PASS | Correctly counts all three actual bars, addresses the eighth-note misconception, and stops without extra worksheets or recordings. |

For g01, the supplied evidence says “The learner can find a direct quotation but treats plausible background stories as established facts.” The output instead says “Inference practice focuses on the evidence-to-conclusion link already partly performed.” Both assessors ultimately classify the unsupported readiness credit as an evidence score of three: a material, non-serious failure. The independent assessor's initial PASS and subsequent change remain recorded. The required all-eight reasoning gate therefore fails regardless of how g04 is later resolved.

Both initial assessments were harsher on g04. The alternative-implementation challenge withdrew the categorical inference that the output necessarily teaches an alt attribute on a text container. The ambiguity and original scores remain explicit; no final score was manufactured. The technical distinction is supported by the [HTML standard's image attribute/fallback rules](https://html.spec.whatwg.org/multipage/embedded-content.html#attr-img-alt). The frozen case and rubric were not changed in reaction to this run.

## Independent review and failures

The attempted reviews were v09, a nondefective written-greeting plan, and v04, the defective compulsory-citation-repetition plan. Each returned `finish_reason=length`, 4,096 completion tokens, 4,096 reasoning tokens and an empty final string. Neither reached usable schema/grounding validation. This is output exhaustion, not demonstrated malformed completed JSON or an educational misclassification.

Review delivery is **0/2**, with **10/12 cases not run** after the stopping threshold. Sensitivity, precision, false-positive rate and semantic accuracy are **not measurable from zero delivered verdicts**. A blank response is not a true negative on v09. No grounded blocker was delivered for v04; this is a delivery failure, not evidence that the model explicitly judged its defective plan sound. The joint/protected candidate v03 was not exercised live. The complete strict review gate fails, while reviewer judgment and grounding ability remain unqualified.

## Usage, latency and cost

| Measured arm | Input tokens | Completion tokens, including reasoning | Reasoning tokens | Median / p90 / maximum transport latency | Estimated off-peak charge |
| --- | ---: | ---: | ---: | --- | ---: |
| Reasoning, 8 calls | 8,315 | 11,038 | 8,137 | 7.978 / 16.130 / 16.130 seconds | $0.007870050 |
| Review, 2 calls | 5,549 | 8,192 | 8,192 | 20.731 / 20.975 / 20.975 seconds | $0.005634654 |
| Total, 10 calls | **13,864** | **19,230** | **16,329** | 8.175 / 20.487 / 20.975 seconds | **$0.013504704** |

There were 768 cache-hit and 13,096 cache-miss input tokens; non-reasoning completion totaled 2,901 tokens. Reasoning is included exactly once in completion billing. p90 uses nearest rank, and latency measures each wire through parsed provider response; it excludes database bootstrap and evaluation. Total transport time was 109.579 seconds; the executor's start/end sleep receipts span 113.047 seconds. The small samples do not establish population latency.

All calls occurred at 12:42–12:44 UTC, outside the published peak windows. The charge estimate uses raw counters and current off-peak rates of $0.003/cache-hit million, $0.15/cache-miss million and $0.60/output million. The guard continued to reserve full peak/uncached rates, retaining **$0.1063986** for the ten attempted calls; those reservations are not actual billed spend. [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/). Account invoices/balance were not inspected, and canonical alias pricing remains explicitly UNKNOWN/null. [Execution metrics](evidence/execution-metrics.json) retain both cost estimates, per-call counters and receipts; raw reasoning text was not exported.

## Safeguards and limits

The [approval record](approved-execution.json) binds the unchanged protocol manifest, independent signoff and passing unpaid preflight. Public alias/default/rate metadata was rechecked before dispatch. All ten calls had one wire, settled usage, a matching cancelled canonical attempt and no publication. Source/config/runtime pins, all prepared packets and all forty approved protocol artifacts still match. Launcher/executor sleep assertions were verified, checked before wires and released on exit. The disposable PostgreSQL harness completed; a technical harness result is not educational acceptance. [Raw evidence](evidence/paid-run/) and [metrics](evidence/execution-metrics.json) preserve the results.

The clearest operational limit is review budget fit: under the frozen enabled/High defaults, both review calls spent the entire completion cap on reasoning. That observation does not establish reviewer semantic capability or identify whether model behavior, reviewer instructions, output demands or their interaction caused the exhaustion. The reasoning arm separately exposes unsupported evidence attribution and a disputed criterion; valid transport alone is insufficient. Compact blueprint serialization, recovery, repair, capacity comparisons and repair → verification → ApplyService qualification remain untested here. One sample per small synthetic scenario cannot establish reliable general planning quality.

**Execution is finished and cannot automatically resume.** Remaining credit or unused approval headroom grants no additional attempts. No prompts, models, budgets, implementation or case labels were tuned. Wait for the user's review before any further diagnostic block or implementation work.
