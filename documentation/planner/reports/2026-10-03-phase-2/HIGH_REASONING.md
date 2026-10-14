# Flash High reasoning qualification — 8 October 2026

Status: **FAILED QUALIFICATION — 1/3 accepted; full corpus not run**. The user explicitly rejected the Pro comparison and authorized temporary DeepSeek V4.1 Flash High qualification. No Pro comparison, Max reasoning, permanent setting change or later-phase work is authorized or performed.

## Comparison protocol

Use the existing disposable live harness and the configured Flash primary/chat fallback, with `thinking: enabled` and `reasoningEffort: high` on every model stage. The adapter sends `reasoning_effort: high`, not Max. Record effective per-call options, finish reasons, actual usage, unknown spend, timing, raw final outputs and durable checkpoints. Restore the process-local route at teardown. The shared provider boundary, root budgets, output limits, call caps, deadlines, holdbacks, original prompts, registered case inputs, review requirements and canonical apply path remain unchanged.

DeepSeek's [official thinking documentation](https://api-docs.deepseek.com/guides/thinking_mode/) supports High and distinguishes it from Max. Thinking mode ignores temperature; this experiment supplies no qualification sampling override. Every adapter call still receives the existing explicit output cap and single-attempt/cancellation controls. A clipped or malformed result cannot count as educational success.

First command:

```sh
node scripts/test-planner-v2-phase2-live.mjs --native-bin /private/tmp/sylf-planner-phase2-runtime-18-4/package/native/bin --live-non-gemini --live-high-reasoning --live-cases tiny-roomy-exam,triage,owned-course-research
```

These are the three currently rejected educational cases. Inspect proportion against the identical ordinary tiny-goal baseline, quiz preparation versus an unavailable actual assignment, and verified course outcomes plus real split feasibility. Model approval, publication and apply are not educational acceptance. A repair witness must arise from an actual independent named finding, one compiler repair, exact independent resolution and canonical ApplyService, with an independently acceptable final candidate. No finding, defect, output or prior response is injected.

Run the full unchanged 17-case corpus at High only if this subset materially improves educational results without truncation or other observed regressions. Insufficient budget, clipping, timeout, failed grounding or invalid allocation remains recorded rather than expanding limits. Earlier runs and their selected full-corpus assessment remain separate; a three-case trial cannot replace whole-corpus qualification.

## Control validation and preflight

The only implementation changes are explicit qualification controls in the existing harness and a High variant of the existing adapter transport test. [Three transport tests](evidence/step6-high-controls.json) pass, proving the exact Low/High payload, unchanged JSON mode/cap/cancellation/single dispatch and actual usage, plus unchanged default behavior. [Six invalid control combinations](evidence/step6-high-cli-controls.json) stop before database/provider work, including High with Low, Groq or a sampling override. Scoped lint, isolated Phase 2 TypeScript and script syntax checks pass. Production provider configuration and compiler sources are unchanged by this experiment.

The first invocation stopped before starting a database or making any provider call because the sandbox denied the loopback listener. Its [predispatch failure](evidence/step6-live-2026-10-08T16-21-10-915Z/postgres-harness-run.json) remains preserved. The authorized retry permits the disposable local runtime; it does not access hosted learner data.

## Actual subset results

The [16:22:12 UTC run](evidence/step6-live-2026-10-08T16-22-12-193Z/live-corpus.json) passes **405 database prerequisites**, with no required skips, and then records one SUCCEEDED/applied case and two FAILED cases. Source hashes remain unchanged throughout. Its manifest/source-pin status is FAILED because the live expectations fail, not because of source drift; the disposable Docker PostgreSQL server is removed at teardown.

Every external attempt records model `deepseek-flash`, thinking enabled and effort **high**, unchanged JSON mode, explicit 8,192 generation/research or 4,096 review cap, and single-attempt execution. No Max, Gemini, Groq or Pro call occurs. [Separate evaluation](evidence/step6-live-2026-10-08T16-22-12-193Z/independent-evaluation.json) and the [comparison summary](evidence/step6-high-reasoning-comparison.json) retain actual outputs and dimension-specific observations:

| Case | Educational observation | Actual compiler outcome |
| --- | --- | --- |
| Tiny with extra capacity | **Pass:** one integrated 60-minute task, compared with prior roomy 90 and ordinary 60. Correct series-circuit values, learner-chosen changed givens, independent solution/explanation/check and bounded stopping point. Effort remains an estimate, not observed mastery. The ordinary baseline is the prior non-thinking run; a same-run ordinary High counterpart was not sampled. | Two complete STOP calls; empty independent review; sealed candidate and canonical apply. No repair. 44.218s. |
| Triage | Goal correspondence improves: course-topic practice, all four dispositions, explicit mixed-circuit sacrifice and 25/25 actual placements. No requirement to obtain future actual quiz questions. Wording suggesting more likely core content remains unsupported by verified weights. | **Fail:** primary generation clips at 8,192; fallback produces a valid blueprint. Both mandatory reviews clip at 4,096 with zero final-content bytes. No accepted review, candidate, repair or apply. 111.399s. |
| Owned course | Actual ownership/read/hash and literal note excerpts remain intact. Research returns five supported course/project claims and describes private applicability without official status. | **Fail:** verification invents `scope_4` in ADD_SCOPE although only `scope_1/2/3` exist. Strict validation rejects it; a third synthesis reservation is forbidden after the two research calls. Terminal BUDGET_EXHAUSTED at RESEARCH. No adopted research, blueprint, allocation, review, repair or apply. 45.776s. |

The [offline diagnosis](evidence/step6-live-2026-10-08T16-22-12-193Z/owned-verification-diagnosis.json) reproduces the same INVALID_OUTPUT with the unchanged compiled verifier, actual returned JSON, accepted scope and server-read source. It performs no external call or mutation. The owned failure exhausts the **research synthesis sub-cap**, not the overall eight-call root cap, provider quota or token ceiling. The earlier split problem is not exercised by this attempt and is not declared fixed.

## Usage, latency and truncation

Eight actual external attempts include two same-Flash fallbacks. All eight settle actual usage: **41,527 input / 43,457 output tokens**. No missing usage, unknown spend or provider/quota failure is observed. All eight pricing receipts remain UNKNOWN; zero known priced cost does not mean free calls. Output usage includes provider-reported completion counters, not just final JSON text.

Case admission-to-terminal median is **45.776s**, p90/max **111.399s** across three cases. Upstream median is **22.588s**, p90/max **38.359s** across eight attempts. These temporary sample measurements do not establish service promises. Triage accounts for all **three MAX_TOKENS calls**: one 8,192-token generation and two 4,096-token reviews; each clipped call reaches its actual output limit and is metered. Both clipped reviews return zero final-content bytes. No returned bytes are repaired or replayed.

## Repair and full-corpus decision

**No REPAIR or VERIFICATION dispatch occurs.** The tiny case has no findings, triage lacks a completed independent review, and owned research fails before quality review. No natural named issue reaches the repair/verification/apply path; none is injected to manufacture a witness.

**The full 17-case High corpus is not run.** The subset improves tiny-goal proportion and triage meaning but introduces generation/review truncation and fails research. It does not satisfy the user's conditional progression gate. High is therefore **not qualified under the existing limits**; this is observed failure, not proof that every future prompt or run must fail. No budget, holdback, deadline, call cap, output limit or production policy is changed.

The subset cannot establish the paired capacity expectation across a full High corpus: its ordinary tiny-goal comparator is the earlier non-thinking matrix, not a fresh ordinary High case. The earlier selected full-corpus assessment remains **14/17**, untouched and separate. All-run observations retain 47 finished runs / 1,168 external attempts, including the zero-call sandbox failure and this trial. Phase 2 remains incomplete and Phase 3 has not begun.
