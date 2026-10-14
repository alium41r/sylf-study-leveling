# Phase 2 Step 6 — controlled intelligence diagnostics

**Status: prepared for approval; zero paid/model calls.** This protocol tests the completed Changesets 1–3 without changing implementation, provider settings, budgets or execution contracts. It is a small diagnostic entry gate, not a production reliability benchmark. Phase 2 remains incomplete and Phase 3 does not start.

## Decision and evidence

Approve one frozen experiment of **52 primary dispatches at most, 64 total including up to 12 existing configured recoveries, with a proposed USD 3 spending ceiling**. Execute in gated blocks, starting with eight reasoning requests and twelve fixed-candidate reviews. Do not authorize the old full corpus, tuning, a model comparison or application of diagnostic plans through this approval.

The [approved Astra revision plan](inputs/ASTRA_REVISION_PLAN.md) specifies all five categories and the 52/64 limits. The [audit](inputs/ASTRA_INTELLIGENCE_AUDIT.md) explains why technically valid model approval is insufficient. [Changeset 1](../2026-10-09-step6-interface-changeset1/README.md), [Changeset 2](../2026-10-09-step6-interface-changeset2/README.md) and [Changeset 3](../2026-10-09-step6-interface-changeset3/README.md) provide the compact, grounded, targeted baseline. Their scripted fixtures qualify boundaries, not Flash's judgment.

Historical [High trials](../2026-10-03-phase-2/HIGH_REASONING.md) accepted 1/3 cases and included empty capped reviews; [disabled-thinking trials](../2026-10-03-phase-2/THINKING_DISABLED_QUALIFICATION.md) avoided observed truncation but failed final-source educational acceptance. Historical 14/17 came from different settings/source. These are motivating evidence, not controls or new diagnostic labels. None of the seventeen development cases or the Changeset 2–3 scripted fraction/percentage fixtures is replayed here.

## Frozen baseline

[freeze.json](freeze.json) pins 207 current source/runtime files, all 48 static request packets, the preparation tool, case authoring and effective non-secret provider settings. [The source archive](evidence/frozen-source.tar.gz) makes the uncommitted implementation recoverable without credentials, learner data or unrelated work. The tested compiled worker is the existing Changeset 3 runtime; preparation does not rebuild it or alter any application file.

| Control | Frozen value |
| --- | --- |
| Primary route | `syllabus` → DeepSeek `deepseek-flash`, `https://api.deepseek.com` |
| Existing fallback | Gemini `gemini-2.5-flash`; no replacement with a same-Flash retry |
| Thinking / effort | Both omitted by the dispatcher; documented provider defaults are enabled / High |
| Sampling | Temperature and top-p omitted; no qualification sampling override or seed |
| Transport | JSON object mode, no tools, no streaming, single upstream attempt per reservation |
| Output caps | 8,192 reasoning/blueprint/repair; 4,096 review/verification |
| Educational root | Six model calls, five planning calls, 80,000 input reservation units, 24,000 output tokens, 180 seconds; existing holdbacks remain authoritative |
| Synthetic clock | 12 October 2026; immutable case dates, availability and source facts |
| Experiment limit | 52 primary / 64 total; USD 3 including conservatively reserved unknown spend |

DeepSeek's current [API specification](https://api-docs.deepseek.com/api/create-chat-completion/) documents enabled thinking and High as defaults. The [model/pricing page](https://api-docs.deepseek.com/quick_start/pricing/) currently maps the alias to V4.1 Flash. We preserve omitted options rather than silently setting them. Immediately before approved execution, recheck public model/default/rate metadata and non-secret environment values. If they differ, stop for a new protocol version; do not change settings during this batch. Remote weights and omitted defaults cannot be permanently frozen by a local hash. Record the returned model identity and run time; requests are reproducible, individual stochastic answers need not be identical.

Production fallback configuration stays intact. A recovered Gemini answer is useful recovery evidence, **never first-pass Flash success**. A schema/grounding failure, clipping or unknown accounting receipt cannot be excused by later educational acceptance. Every fallback consumes this experiment's limit and the original root's remaining capacity. Once the twelve-recovery allowance is unavailable, stop before dispatching a stage that could require another configured recovery; do not disable or replace the production route silently.

## Case bank and separation

[evaluator/cases.cjs](evaluator/cases.cjs) contains full accepted goals, supplied facts, availability, draft labels and rationales. [evaluator/labels.json](evaluator/labels.json) separates judgments from provider requests. Only the allowlisted fields in [model/packets/](model/packets/) may reach an adapter. Do not send this protocol, authoring module, labels, result templates, scenario IDs, expected issues or evaluator notes to a tested model. Repair alone receives the original validated named findings, as its production task requires; it receives no expected correction or evaluator label.

Every case uses fresh learner content and complete synthetic teacher/user facts. No external search, document acquisition or source synthesis call is needed. The cases are new authored tasks, not renamed circuit/Python/Bayes/linear-equation cases. Reusing four fixed reviewer defects for repair deliberately holds the initial discrepancy constant; it does not add four generation cases or rely on a model-generated diagnosis.

| Generation packet | Policy | Learner task |
| --- | --- | --- |
| g01 | EXAM | Classify textual fact, inference and unsupported claim, with passage evidence |
| g02 | EXAM | Interpret rainfall values while distinguishing a short pattern from a climate trend |
| g03 | ROADMAP | Reach a consent-aware oral-history question-outline checkpoint |
| g04 | ROADMAP | Demonstrate one semantic museum HTML card, keeping later project scope strategic |
| g05 | MASTERY | Produce and explain bounded Spanish ser/estar choices; preserve quoted accented text and an accepted newline instruction |
| g06 | MASTERY | Evaluate an implication/converse argument with a valid independent justification |
| g07 | GENERAL | Complete the actual diary-source annotation and disclose its evidence limit |
| g08 | GENERAL | Explain and check the actual quarter/eighth-note rhythm worksheet |

Reviewer candidates are independently fixed before any generation: four serious defects (incorrect even-sample median; invented archive transcription; fabricated shared catalogue facts; mandatory citation repetition after success), four sound plans (atom balancing; eyewitness comparison; joint food-web goals with one prerequisite; checked spreadsheet sum), two preferences (written greeting versus audio; verbal route versus diagram), and two uncertainties (unknown clause-assessment weight/readiness; future specimen irrelevant to a blank-log checkpoint). Labels and exact rationales stay evaluator-only. The catalogue case includes two selected owners, genuine split receipts and a paused protected activity.

Capacity scenarios are separate new tasks: revise an overbroad book-club survey claim, and interpret a scale-bar map estimate. Each has 30 versus 180 available minutes per day, with two fresh samples per condition. Counterbalanced condition order is fixed. Goals, facts, stopping point, preferences and instructions stay identical; only availability and its derived capacity facts/digest change.

## Diagnostic categories and gates

| Category | Calls | Procedure | Completion criterion |
| --- | ---: | --- | --- |
| Educational reasoning | 8 | Same eight packets; a single `strategy` string in JSON, allowing prose reasoning without compiler serialization. JSON mode and output cap stay unchanged. Discard the result after scoring. | All eight usable: at least 4/5 on each educational dimension and no serious defect. Record an unusable envelope separately from poor visible reasoning. |
| Structured output | 16 | Same eight packets through compact and retained full-artifact reference interfaces. Counterbalance pair order. No response is shown to its counterpart. | Compact 8/8 first-pass strict transport **and canonical/reference validation**, with all eight educationally usable. Allocation consequences are recorded separately. Fallback success does not erase failure. |
| Independent review | 12 | Actual reviewer instruction and lossless complete candidate/evidence/allocation context. No generator invocation. | Four of four serious defects detected with valid concrete grounds; zero false blockers on all eight nondefective candidates. Preference/uncertainty objections, if raised, must have the appropriate nonblocking basis. Empty findings are acceptable for a sound plan, not a defective one. |
| Targeted repair + verification | 8 | Four fixed defective candidates with prevalidated original findings. One actual repair and one fresh independent verification each; deterministic full assembly and allocation between them. | Four of four named defects genuinely resolved; no remaining/introduced serious defect; unaffected objects/protected content identical; exact issue correspondence; both stages fit the same existing root and holdback. |
| Capacity sensitivity | 8 | Two fresh goals × two capacities × two independently sampled outputs, compact interface. | All eight structurally valid and educationally usable. Every extra committed action/step needs an accepted contribution. Capacity alone must not cause unjustified work. Evaluate within-condition variability; do not demand identical minute estimates. |

The legacy arm is a frozen **interface bundle** comparison using the current retained `blueprintInstruction`/`blueprintResponseContract` exports, not an attempt to recreate an old production compiler. Preparation asserts identical consequential request fields outside `responseContract`; both instructions share the current educational rules and policy guidance. The bundle includes legacy schema explanations and adaptation burden. It estimates the effect of that interface bundle, not the isolated effect of one word or tuple. Legacy failure does not veto a successful compact gate; legacy success does not excuse compact failure. No legacy result enters production.

“Independent” means a fresh call with accepted requirements, actual proposal, evidence and allocation; no generator conversation, hidden reasoning or claimed self-approval is supplied. Same-model independence does not eliminate correlated errors, which is why the fixed labels and external assessment are required.

## Assessment and severity

Use [evaluator/RUBRIC.md](evaluator/RUBRIC.md) and [the result template](evaluator/results-template.json). Before paid execution, an assessor other than the case author checks all labels/rationales and the supplied answer facts, without model outputs. Freeze that signoff as a dated addendum; do not correct cases after seeing replies. A label problem found before calls requires a versioned preparation update. Case-label signoff is currently **pending**, not claimed by successful schema checks.

One external assessor scores every primary result from accepted facts and full educational content. A second independent assessor adjudicates every serious defect, disputed blocker, claimed withdrawal and repair acceptance. These are human/external judgments; no additional paid judge-model calls are included in the 52/64 estimate. Assessors must not use the tested generator/reviewer as the arbiter. Hide provider/configuration, interface names, pair membership and trial order using neutral display IDs. Format can still be apparent; do not claim perfect format blinding. Semantic rendering must preserve commitments, givens, dependencies, criteria, uncertainty and protected work.

Parsing/grounding and educational scores are separate. A correct idea with invalid references is not a successful structured result. An accurately quoted objection that does not establish a concrete violation is not a true blocker. Report raw detection and grounded acceptance separately; invalid primary reviews count as operational failures and cannot earn a passed review gate. No aggregate score can offset a serious defect or a score below four in another dimension.

For the prose-only diagnostic, an otherwise complete STOP final response may be read and scored verbatim even if its simple JSON wrapper is malformed. Record the envelope failure separately; do not rewrite or assemble it. This allows education to be assessed without attributing a wrapper failure to bad reasoning. Blank, clipped or substantively incomplete responses cannot count as usable reasoning. This exception permits human assessment only: every structured/repair artifact still needs the unchanged validators, and no prose result becomes executable.

For repair, assessor one compares the entire reallocated artifact with the accepted facts and original issues before reading the verifier's verdict. Then compare the independent verifier with that assessment. A verifier's RESOLVED label is not proof of correction. Inspect all educational objects for remaining and new defects, including issues outside the original finding. If a serious defect exists, an approving verifier is a false acceptance and the gate fails; correctly blocking it qualifies detection but that repair still fails. If all four repairs are clean, live detection of introduced/residual defects has not been challenged; report that limitation instead of claiming perfect verifier sensitivity. Existing adversarial technical regressions remain separate evidence.

## Execution order and stopping rules

1. **Unpaid preflight:** validate freeze, label signoff, no-label packet boundary, case independence, spend guard and disposable fixture ownership. Existing source/runtime/frozen-contract correspondence must match. No keys or hosted user data enter evidence. This preparation did not start a database or instantiate an upstream request.
2. **First paid block: reasoning eight, then fixed review twelve.** These are independent and can diagnose different weaknesses. Run sequentially to keep attribution and unknown spend simple. Do not make a reviewer depend on generated plans. Assess this block before downstream spending. At cap, the 20 primary calls have a conservative peak-rate allowance of about USD 0.19, before recovery.
3. **Structure sixteen** after reasoning is usable. Run the preregistered counterbalanced pairs under identical settings. Stop the legacy arm after two independently failed first attempts; finish useful compact observations within the limits. Stop compact after two established failures. An incomplete/failing compact gate withholds capacity/full qualification.
4. **Repair four pairs** after fixed review is reliable and original labels are signed. Repair does not depend on a successful generation sample: its findings/candidates are fixed. Use each actual accepted repair response to materialize the full verification packet. No replacement with an ideal/scripted correction. Verification follows only if full assembly/allocation and the existing holdback succeed.
5. **Capacity eight** after reasoning and compact gates pass; it can run independently of repair, but running repair first answers the current recovery blocker sooner. Complete both samples for each tested condition. Do not select only favorable samples.

For reasoning or review, two adjudicated unusable/incorrect primary results stop the remainder of that arm; retain one-off failures and complete the arm if no second failure occurs. A single serious failure already prevents the all-cases gate from passing. Finish the other independent first-block arm when it can still answer a useful question. A failed reasoning arm withholds structure/capacity; a failed review arm withholds repair. Mark withheld arms NOT RUN, not passed. This is intentional early stopping, not a replacement sample or a reduced acceptance denominator.

For repair, stop the arm after two failed pairs. One invalid repair may use only existing configured validation recovery within the same educational attempt/root. No second educational repair or extra verification. Two clipped/empty primary reviews establish a cap failure and stop that arm; do not raise output limits. A provider authentication/configuration error, source/default drift, lost correspondence, broken spend guard or missing usage stops the whole batch. No paid retry for transient errors is inserted outside configured recovery; mark the case inconclusive/failing at its actual boundary.

**Global stop before the next reservation:** would exceed 64 total dispatches, 12 recoveries or USD 3 including pending/unknown allowances; any unmet root call/input/output/time/holdback limit; human stop; or loss of reproducibility. Save responses and receipts even on failure. A root deadline is never restarted between repair and verification. A reservation failure is evidence of a budget boundary, not permission to increase it. Every submitted upstream request counts, including failed/truncated/incomplete results. No ad hoc prompt changes, extra samples, settings switch, same-Flash reroute or “one more until it works.”

## Accounting, efficiency and reproducibility

[run-manifest.json](run-manifest.json) fixes the trial order, neutral packet paths, stage caps and dependencies. [evidence/cost.json](evidence/cost.json) provides the arithmetic. The exact primary request/holdback total is **758,318 conservative input reservation units and 360,448 output tokens at cap**. The input number is UTF-8 transport plus the current allowance, **not measured provider tokens**. Four verification requests depend on actual repairs; their existing holdbacks are included rather than guessed ideal output lengths.

| Stage | Primary calls | Input reservation units | Output cap total |
| --- | ---: | ---: | ---: |
| Reasoning | 8 | 36,508 | 65,536 |
| Review | 12 | 152,528 | 49,152 |
| Structure, both arms | 16 | 268,868 | 131,072 |
| Repair | 4 | 89,676 | 32,768 |
| Verification holdbacks | 4 | 94,282 | 16,384 |
| Capacity | 8 | 116,456 | 65,536 |

Check the machine-readable totals rather than relying on rounded prose. The four fixed repair-plus-verification reservations fit 80,000 input/24,000 output in one root; the largest input pair uses **64,611**, leaving 15,389 units in a stage-only root. This does not demonstrate a production generation→review→repair path: earlier paid calls consume real capacity and must be included in any later full qualification.

Current published uncached Flash rates per million tokens are **USD 0.15 input / 0.60 output off-peak**, and **0.30 / 1.20 peak**. No cache discount is assumed. The all-primary conservative peak allowance is **USD 0.66**. A planning range of **USD 0.11–0.55** assumes actual input at 25–50% of reservations and billed output at 40–100% of cap; these are scenarios, not promised usage. [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/).

The unchanged Gemini fallback has published standard paid text rates of **USD 0.30 input / 2.50 output**, including billed thinking. Twelve recoveries receive a conservative **USD 1.27 spending allowance** using 80,000 input and 32,768 billed-output planning tokens each. That planning allowance leaves room for separate thought counters; it does **not** raise the configured 8,192/4,096 caps or claim a provider hard bound. Expected conservative total is about **USD 1.93**; the proposed **USD 3** ceiling supplies headroom. Stop if an actual receipt exceeds its reserved spending allowance. Do not assume a Gemini key is free. [Google pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash).

The current local pricing table has no entry for the resolved `deepseek-flash` alias, so canonical cost receipts may be null. Preserve those receipts and calculate a separate published-rate diagnostic estimate; never relabel null as zero or patch pricing as part of this experiment. Reconcile provider-reported usage and any bill/credit receipt available after execution. Missing actual usage stops the batch with full reserved unknown spend charged to the ceiling. No additional paid polling, judges, search or tooling is budgeted.

Per dispatch retain immutable packet SHA, source/config SHA, actual provider/model and effective supplied options, root/call IDs, reservation/holdback, stage timestamps, finish reason, raw final-content bytes, validation codes, concerns/dispositions, actual prompt/completion/cache tokens, provider-exposed reasoning counters if any, nullable canonical cost and separate published-rate estimate. Do not derive exact reasoning tokens from bytes or reveal hidden reasoning to another tested stage. Store primary and recovery outcomes separately. Report medians, p90 and maxima by stage, call count, fallback rate, size and spend **per usable result**, alongside quality failures. Report repair output size/changed objects and preserved-object hashes; no arbitrary compression target can override sufficiency.

Historical upstream times near 23 seconds suggest roughly 20–45 minutes for all 52 sequential primaries plus review pauses; this is planning guidance, not a latency gate or SLA. Existing 180-second root deadlines remain the actual limit. Evaluator time is separate. Early stopping will often spend less.

## Offline tools and remaining authorization

From the repository root:

```sh
node documentation/planner/reports/2026-10-09-step6-controlled-diagnostics/prepare.cjs check
```

This checks source/config/case/tool/packet hashes and makes no external call. `prepare` regenerates only this directory using the frozen builders and validators. There is **no paid execution mode**. Once approved, the execution operator must consume the manifest through the existing metered dispatcher and disposable fixture accounting, with an experiment-level reservation guard; `adapterOptions` in packets are descriptive, not permission to bypass accounting. Do not invoke the old seventeen-case live command for this case bank. No new production path is proposed.

After an actual accepted repair, this offline command assembles and checks the verification request:

```sh
node documentation/planner/reports/2026-10-09-step6-controlled-diagnostics/prepare.cjs materialize v01 /absolute/path/actual-repair.json /absolute/path/result-directory
```

It invokes the existing targeted repair validator, copies unaffected content, reallocates, checks the existing verification holdback, and records complete object hashes. The verification packet is dynamic by necessity; freeze its hash before its single dispatch. A synthetic dry run validates this materialization tool, not model ability. Paid execution wiring and its guard must pass an unpaid intercepted/mock preflight before authorization is consumed; this document does not claim that a fresh paid runner already exists.

[Preparation evidence](evidence/preparation.json), [four scripted materialization checks](evidence/materialization-checks.json), [artifact checks](evidence/artifact-checks.json), [static checks](evidence/static-checks.json) and [source preservation](evidence/source-preservation.json) document the unpaid verification. Twelve canonical candidates allocate; four original findings validate; all four scripted corrections assemble within their verification holds; an arbitrary patch path is rejected; packet labels stay hidden. TypeScript and scoped lint pass. All twelve frozen contracts and the completed Changeset 3 implementation/runtime hashes match. Of 4,588 pre-existing files checked, only the authorized Planner documentation index changed. No unit/PostgreSQL gate or live result is claimed as a new run here.

Approval must cover this version, the staged 52/64/12 limits, unchanged High-default Flash plus existing Gemini recovery, the USD 3 ceiling and the independent assessment arrangement. Label signoff and the unpaid execution preflight are required before the first call. No paid call has been authorized or made by preparation.

If a gate fails, classify it before proposing another change: poor prose and structured education → model/configuration; good prose but poor compact serialization → interface; good generation but inaccurate fixed review → reviewer; correct diagnosis but failed corrections/holdback → repair/budget. Correlation is not causal proof; preserve the failing boundary and evidence. A settings or model experiment requires a separate frozen, approved comparison. Do not tune these prompts against this bank. If these cases influence changes, mark them development and use fresh confirmation cases.

Only after the relevant gates pass on one snapshot should the unchanged full development corpus and fresh confirmation qualification resume. The natural independently accepted repair→verification→canonical ApplyService witness remains open. Fixed defective fixtures, synthetic assembly checks and diagnostic verification are not that witness. None of these diagnostic artifacts is published or applied.
