# Phase 2 Step 6 — controlled intelligence diagnostics, revision 2

**Independent AI-agent label signoff and unpaid preflight complete; final human paid approval pending. No paid calls authorized or made.** The initial experiment is limited to **eight educational-reasoning requests and twelve independent-review requests**, **USD 0.40 maximum**, and **DeepSeek V4.1 Flash only**. Independent label signoff and human paid authorization are separate gates. The [active manifest](initial-block/run-manifest.json) defines execution; the [v1 protocol](history/v1/README.md) is superseded.

The approximate USD 2 DeepSeek balance is context, not permission to spend it. Gemini, fallback, retries, model comparisons, later diagnostic blocks and the old qualification corpus are excluded. No diagnostic artifact is applied. Phase 2 remains incomplete and Phase 3 stays deferred.

## Frozen baseline

The [Astra revision plan](inputs/ASTRA_REVISION_PLAN.md), [audit](inputs/ASTRA_INTELLIGENCE_AUDIT.md), and completed [Changeset 1](../2026-10-09-step6-interface-changeset1/README.md), [Changeset 2](../2026-10-09-step6-interface-changeset2/README.md) and [Changeset 3](../2026-10-09-step6-interface-changeset3/README.md) remain the design inputs. Historical [High](../2026-10-03-phase-2/HIGH_REASONING.md) and [disabled-thinking](../2026-10-03-phase-2/THINKING_DISABLED_QUALIFICATION.md) failures motivate the separated stages; they do not supply these labels.

[freeze.json](freeze.json) retains the same 207 source/runtime files, all 48 prepared packets, authoring/preparer hashes and effective provider settings. The [source archive](evidence/frozen-source.tar.gz) excludes credentials and learner data. All twenty active packets are unchanged. New diagnostic tooling lives in this report directory; production code and routing are unchanged. [protocol-manifest.json](protocol-manifest.json) pins revision-2 scope, tooling and evaluator controls.

| Control | Frozen value |
| --- | --- |
| Tested model | DeepSeek `deepseek-flash`, currently V4.1 Flash |
| Only permitted endpoint | `https://api.deepseek.com/chat/completions`; redirects forbidden |
| Thinking / effort | Omitted, preserving documented enabled / High defaults |
| Sampling | Temperature and top-p omitted |
| Transport | JSON object, no tools or streaming, one upstream attempt per case |
| Output caps | 8,192 reasoning; 4,096 review |
| Existing educational root | Six model calls, five planning calls, 80,000 input reservation units, 24,000 output tokens, 180 seconds; existing holdbacks |
| Experiment | At most 20 dispatches; zero recoveries; USD 0.40 ceiling; sequential |
| Protection | No diagnostic revision, Quest or ApplyService publication |

DeepSeek's [model/pricing documentation](https://api-docs.deepseek.com/quick_start/pricing/) maps the alias to V4.1 Flash; its [API documentation](https://api-docs.deepseek.com/api/create-chat-completion/) supplies reasoning defaults and completion limits. Recheck public model/default/rate metadata immediately before approved execution. Drift or uncertainty stops the run. Local hashes cannot freeze remote weights or omitted defaults; record returned model identity and fingerprint. A different returned identity stops the run.

Production Gemini fallback stays configured. The diagnostic adapter factory refuses other providers/models before construction; the spending and wire guards independently reject them. No routing table is mutated, and no failed request is replaced with a same-model retry. This narrower run tests first-pass intelligence, not production recovery effectiveness.

## Categories, dependencies and cases

| Diagnostic category | Active calls | Gate / next dependency |
| --- | ---: | --- |
| Educational reasoning | 8, first | All eight score at least 4/5 on every educational dimension, with no serious defect; wrapper failure recorded separately |
| Independent review | 12, second | Detect all four serious defects with valid grounding; no false blockers on eight nondefective plans; strict operational validation |
| Structured output | Deferred: 16 | Separate budget/approval, after useful reasoning evidence |
| Targeted repair + verification | Deferred: 8 | Separate budget/approval, after useful reviewer evidence |
| Capacity sensitivity / efficiency | Deferred: 8 | Availability-only comparisons deferred; active-stage latency and cost measured now |

Reasoning and fixed review are independent: reviewers never receive the generated prose. Poor reasoning need not prevent useful reviewer evidence when accounting is certain. No downstream category starts automatically. This block cannot qualify compact serialization, repair, capacity invariance, full planning quality, or the outstanding independently accepted repair → verification → ApplyService witness.

The unchanged [case authoring](evaluator/cases.cjs), [private labels](evaluator/labels.json), [complete candidates](evaluator/candidates/) and [rubric](evaluator/RUBRIC.md) define evaluation. Only frozen packet messages and system instructions reach Flash. Case IDs, labels, expected findings, assessor notes and protocol files remain outside requests.

| Reasoning case | Policy | Fresh educational task |
| --- | --- | --- |
| g01 | EXAM | Distinguish textual fact, inference and unsupported claim using passage evidence |
| g02 | EXAM | Interpret rainfall values without inventing a climate trend |
| g03 | ROADMAP | Reach a consent-aware oral-history question-outline checkpoint |
| g04 | ROADMAP | Build one semantic museum HTML card while retaining later project scope |
| g05 | MASTERY | Produce bounded ser/estar choices; preserve accented quotations and an accepted newline |
| g06 | MASTERY | Independently justify an implication/converse distinction |
| g07 | GENERAL | Complete the actual diary annotation and disclose its evidence limit |
| g08 | GENERAL | Explain and check the actual quarter/eighth-note worksheet |

The twelve fixed reviews include four serious defects, four sound plans, two preferences and two uncertainties. Exact labels/rationales remain evaluator-only. The catalogue case includes joint ownership, split receipts and a paused protected object. These scenarios do not replay the existing seventeen-case corpus.

## Independent signoff and strict assessment

Before calls, an assessor independent of the author and tested Flash model must inspect all eight generation rubrics and twelve labels against full accepted facts and candidate content. Signoff binds authoring, labels, rubric and candidate hashes. A separate reviewer agent can provide this unpaid external review only with explicit user delegation authorization; identify it as an agent, not a human. The [signoff record](initial-block/label-signoff.json) states this gate accurately. Draft labels and successful validators are insufficient.

The user authorized one separate agent, `/root/independent_label_signoff`, which has now signed off all twenty cases. This is **AI-agent review, not human educational signoff**. Its initial judgments were recorded before consulting the author's labels/rubric; task descriptions and class mixture were known, so full blinding is not claimed. The [independent report](initial-block/independent-review-agent.md) preserves all checks, rationale, minor notes and limitations. No material oracle errors remain. The [disposition](initial-block/SIGNOFF_RESOLUTION.md), accepted by the reviewer, clarifies fair grading and limited transfer claims under the unchanged rubric. Original cases, labels, candidates, prompts, packets and execution tooling are unchanged; historical PENDING_HUMAN_REVIEW metadata is preserved and is not a claim of human review. [The previous pending state](history/v2-pre-signoff/README.md) remains available.

Score primary outputs before consulting the tested reviewer's verdict. Keep all three dimensions separate; averages cannot erase serious defects. Every failure needs a quoted accepted requirement, offending output and concrete consequence. Preferences and honest uncertainty cannot become false blockers. A second independent assessor adjudicates severe failures and disputed blockers; preserve disagreements. Pending adjudication means PENDING, not passed. No paid judge-model call is budgeted.

For reasoning only, a complete STOP final response can be scored verbatim despite a malformed simple wrapper; record the operational failure separately and add no missing content. Capped, blank or incomplete responses are UNASSESSABLE. Reviews still require unchanged schema, ownership and literal-grounding validation. Retain rejected text and every parseable concern. With recovery forbidden, an invalid review remains failed; concerns are not silently dropped or rewritten.

## Cost and spending guard

[Cost calculations](initial-block/cost.json) use peak uncached rates: USD 0.30 per million input tokens and USD 1.20 per million output tokens. No cache, off-peak or unused-output discount is needed. [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/).

| Active arm | Input reservation units | Output cap sum | Peak allowance |
| --- | ---: | ---: | ---: |
| Eight reasoning requests | 36,508 | 65,536 | USD 0.0895956 |
| Twelve reviews | 152,528 | 49,152 | USD 0.1047408 |
| Total | 189,036 | 114,688 | **USD 0.1943364** |

The equivalent full-cap off-peak calculation is USD 0.0971682. Actual usage may be lower. These are conservative allowances using the existing UTF-8 input reservation authority, not tokenizer measurements or a promised invoice. The enforced ceiling is **USD 0.40**, leaving approximately USD 0.206 above the full peak allowance. Completion includes thinking; do not omit it or add it twice. Nullable canonical alias prices remain unchanged; retain a separate published-rate upper estimate.

[The guard](initial-block/guard.cjs) uses integer nanodollars, an exclusive process lock and a journal flushed before dispatch. Full peak reservations remain charged to the run's ceiling; actual savings never unlock extra attempts. The actual adapter wire must exactly match the frozen model/messages/options/cap. Only one request per trial is permitted. Changed payloads/endpoints/identities, concurrent or repeated cases, forbidden routes and insufficient allowance fail before another request.

Raw provider usage is checked before the adapter can normalize absent fields to zero. Missing/invalid usage, over-reservation counters, HTTP/network failure, interruption, accounting failure, sleep loss, persistence failure or metadata uncertainty stop both arms. Unknown charges retain their full reservation. Late receipts do not authorize retry/resume. Existing journals cannot be reset or resumed automatically. The guard relies on verified published rates and documented caps; without those, do not dispatch.

Stop an arm after two operational failures or two independently adjudicated educational failures. One failure already prevents its all-case gate from passing. The other arm may continue only with certain accounting. Post-batch judgments are not backdated into execution stops. Creating `initial-block/STOP` halts before the next dispatch; removing it does not grant new authorization. Budget uncertainty always stops the entire batch.

## Execution arrangement, unpaid evidence and approval

[The launcher](initial-block/launch.cjs) derives a disposable copy of the existing PostgreSQL harness, retaining bootstrap, loopback/marker validation and cleanup. It selects only [this stage suite](initial-block/postgres.test.ts), omits rebuilding the frozen runtime, and does not invoke the old live corpus. Authorized synthetic Plan owners, including joint owners, use the actual AttemptService, workerProviderMeter and dispatcher. Every isolated stage has one fresh educational root with unchanged limits, holdbacks, leases, fencing and accounting. The stage root is cancelled after collecting output; no successful full-planning lifecycle is claimed or published.

```sh
node documentation/planner/reports/2026-10-09-step6-controlled-diagnostics/prepare.cjs check
node documentation/planner/reports/2026-10-09-step6-controlled-diagnostics/initial-block/launch.cjs preflight
```

Preflight uses dummy credentials and intercepted responses for the exact twenty requests. It verifies execution and validation, not model judgment. The [preflight receipt](initial-block/evidence/preflight.json) links real accounting, guard failures, frozen-source checks and sleep assertions. No paid API, hosted database, provider switch or Gemini key is used. Use `prepare.cjs check`: its original `prepare` command authors the archived v1 bank and is not the revision-2 execution command.

[Post-signoff checks](initial-block/evidence/post-signoff-checks.json) revalidate all six tooling pins, frozen source/packets, twenty settled canonical receipts, sleep evidence and rejection of the pending approval record. Since execution inputs and tooling did not change, the passing unpaid preflight remains applicable; no new model-quality or release-qualification claim is made.

Launcher and executor use macOS `caffeinate`; `pmset` confirms the owned idle-system-sleep assertion before requests. Recheck before each wire and release on exit. No permanent power setting changes. This prevents ordinary idle sleep; forced shutdown/lid closure still uses the interruption and unknown-spend stop policy.

Paid mode requires an approval record binding this protocol, completed independent signoff and passing preflight. [approval-template.json](initial-block/approval-template.json) is PENDING and grants no permission. After explicit human approval, record its provenance and consume it once:

```sh
node documentation/planner/reports/2026-10-09-step6-controlled-diagnostics/initial-block/launch.cjs paid /absolute/path/to/approved-record.json
```

**This command has not been run.** One fixed paid-journal directory blocks repeat execution. Approval is for at most twenty attempts and USD 0.40 total, not another allowance per restart. Recheck metadata and implementation before using authorization. No additional diagnostic block is automatically authorized.

After execution, report usable reasoning, separate dimension scores, serious defects, raw versus grounded review detection, false blockers and unassessable cases. Report first-pass JSON/usage/finish outcomes, median/p90/max latency, reserved spend and actual peak upper estimate per usable result. Preserve final text, rejected concerns, usage/caps/holdbacks, source/packet hashes, model/fingerprint and timestamps. Do not infer reasoning-token counts from bytes. Do not tune against this bank; if findings drive changes, retain it as development evidence and use fresh confirmation cases later.
