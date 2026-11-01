# C01 live experiment — stopped during Research

28 October 2026. **One authorized journey was started and cancelled. The complete educational journey is unqualified and remains unobserved. No second experiment was run.**

The operator discovered a material weekday-encoding conflict in the frozen qualification fixture after paid Research had started. The fixture/preflight author missed this in the unpaid checks. Cancellation used the existing `AttemptService.cancel`; the in-flight synthesis request was interrupted and its spending remains explicitly unknown. No natural strategy, translation, live allocation, independent educational review, refinement, revision, confirmation or Apply was produced. This is a failed qualification setup, not evidence that the model cannot produce a good plan.

## Authorization and retained execution

[AUTHORIZATION.json](AUTHORIZATION.json) records the human's approval of one C01 journey, DeepSeek V4.1 Flash with HIGH reasoning, and a strict **$1.75** ceiling. The original [prepared protocol](../2026-10-28-phase-c-qualification-preparation/PROTOCOL.md), inputs and manifest remain unchanged; their historical preparation-only authorization labels were not rewritten. [The one-use consumption receipt](evidence/authorization-consumed.json) prevents another launch under this approval.

The journey ran on Node 24.21.0 and genuine disposable PostgreSQL 18.4 through existing GenerationService, PlannerWorker/compiler, ResearchService, provider dispatcher and durable meter. It used the actual DeepSeek adapter and canonical chat endpoint, with public Search/Fetch, tools, provider retries and alternate routing blocked. Production configuration, migrations, services and credentials were not changed. `caffeinate -i -s` held a sleep assertion during preflight, execution and evidence collection; its release is recorded in [final verification](evidence/final-verification.json).

The approved allowances remained HIGH reasoning, 65,536 completion tokens and 500,000 conservative input units per call, with one financial root capped at 48 calls, 3 million aggregate input units, 700,000 completion tokens and its original four-hour deadline. No educational response was shortened to lower cost. The observed run never reached downstream resource escrow use.

| Identity | Value |
| --- | --- |
| Run | `28d07541-4655-450d-a0cc-59dbdca750ab` |
| Financial root | `e84d4fc9-e8b3-57f8-a704-cc6f8e41d7d9` |
| Attempt | `ef103fa8-6f40-4e24-9a83-c233d714b40c` |
| Final state | `CANCELLED`, Research stage |
| First dispatch | 15:21:47 UTC |
| Explicit cancellation | 15:26:34 UTC |
| Physical requests | 4: extraction, Chemistry verification, Biology verification, synthesis |

[The exported journey](evidence/live/journey.json) preserves the owned Attempt, payload, receipts and work-preservation evidence before disposable cleanup. [Operator cancellation](evidence/operator-cancellation.json) preserves the actual reason. The guard's later generic `PROVIDER_OR_PROTOCOL_FAILURE` label reflects the interrupted synthesis transport; the exception followed cancellation by approximately 0.26 seconds. It does **not** establish an independent provider outage. No automatic retry or new root followed.

## Blocking fixture defect

Planner's existing canonical availability uses **Monday = 0**. The frozen C01 packet used values corresponding to **Sunday = 0**, and the qualification caller passed them through unchanged. That affects weekly windows, daily ceilings and rest days together.

The explicit accepted instruction says Friday is free. Its numeric `restWeekdays: [5]` means **Saturday** to Planner, while Friday receives a 120-minute ceiling and a 17:00–19:00 window. Sunday receives the intended Saturday window and Monday receives the intended Sunday window. The original scripted full-journey witness already contained the discrepancy: 30 October, Friday, was available; 31 October, Saturday, was excluded. This should have been caught before paid dispatch.

[The fixture audit](evidence/fixture-weekday-audit.json) records all seven canonical weekdays, the actual service witness, authoritative owners and a proposed future normalization. No accepted facts were silently repaired during this run. Hash checks correctly established immutability but could not establish semantic correctness. Scripted publication/Apply success established internal consistency, not correspondence with the human's civil-day instructions. This is a fixture/preflight defect; the existing allocator's Monday-indexed interpretation is consistent with its contract.

## Provisional educational observations

[SCORECARD.json](SCORECARD.json) retains **null scores for all eight complete-result dimensions and no weighted score**. The frozen rubric requires a complete observed result; absent strategy, execution and review cannot earn a pass or a fabricated failing numerical score. The initial observations were [recorded separately](evidence/initial-research-observation.json). The runtime Independent Reviewer was never invoked. The two verification calls below belong to Research.

- **Research extraction was detailed and useful.** It retained all Chemistry method errors and Biology misconceptions, the limited demonstrated strengths, unfamiliar-transfer uncertainty, both fixed deadlines, Friday rest, English work and uploads-only permission. It correctly distinguished confidence/video time from mastery, kept the eight practice questions as an inventory, and did not claim external-board authority. The practice examples it repeated were mathematically correct: `6/12 = 0.50 mol` and `0.100 × 0.50 = 0.050 mol`. This was an intake synthesis, not evidence of effective teaching or learner improvement.
- **Verification preserved provenance but exposed context problems.** Both verifiers excluded a diagnostic strength because the excerpt does not name Amina. Her name and ownership of the supplied diagnostic exist in accepted student context, which the verification packet did not carry. This is a provenance-joining/prompt-input issue to investigate, not a reason to weaken literal source verification. Strength evidence should survive with separate accepted-context attribution and exact source support.
- **School-mock applicability needs investigation.** The verification instruction reserves certification of assessed scope and structure to issuer-verified sources. The private school packet consequently remained uncertified. Keeping that limitation is correct; accepted GENERAL school-mock scope must still be distinguished from externally certified board scope. Whether the existing synthesis would handle it appropriately is unknown because that call was interrupted. No false clarification or downstream blockage was actually observed.
- **All substantive plan judgments remain open.** Educational depth, transfer checks, stopping rules, coverage, faithful translation, conditional work, workload, interval feasibility, reviewer misses/false objections, substantive refinement and Apply correspondence were not observed live. The known five-minute Calendar-review freshness risk was tested offline only and was not reached here.

This assistant authored the case and performed this source-based audit. It is not the two independent subject-competent human ratings required for qualification, and one interrupted pilot cannot establish consistency.

## Usage and spending

[ACCOUNTING.json](ACCOUNTING.json) contains every call, receipt identity, timestamps, effective model/fingerprint, completion state, actual known usage, unknown reservation and price calculation. Three responses completed with `STOP`, returned `deepseek-flash` and non-null fingerprints, and settled once. The fourth retains `UNKNOWN_SPEND`, null actual cost/usage, and its full outstanding reservation. Ledger zero placeholders for that request do not mean zero usage.

| Measure | Retained amount |
| --- | ---: |
| Known input tokens | 18,632 |
| Known completion tokens | 45,780 |
| Reasoning tokens, included in completion | 38,612 |
| Other completion tokens | 7,168 |
| Input cache-hit tokens | 128 |
| Known ledger estimate at conservative peak rates | $0.060487968 |
| Known published off-peak estimate | $0.030243984 |
| Interrupted request reservation | 82,130 input units + 65,536 completion tokens |
| Interrupted request's peak liability bound | $0.1032822 |
| Conservative total exposure, cache-miss and per-call upward rounding | **$0.163809** |
| Exact final invoice total | **Unknown** |

The [published rates](https://api-docs.deepseek.com/quick_start/pricing/) were rechecked after cancellation: Flash peak input/cache-hit/output rates are $0.30/$0.006/$1.20 per million, with half-price off-peak rates. These requests occurred outside the stated UTC peak windows. The off-peak scenario including the interrupted request's full reservation is $0.081885084; the stricter peak bound above remains the spending safeguard. Reasoning is counted once within completion.

The free [post-run balance check](evidence/metadata-after.json) observed a **$0.02 rounded account-wide reduction**. It cannot reconcile these receipts or settle the interrupted request, so it is not reported as the experiment's actual invoice cost. Missing actual spending was not reset, refunded in the ledger, or treated as permission to continue. These bounds assume the provider honors its published model, prices and requested limits; they are not an account-wide billing lock.

## Verification and safeguards

The unpaid [preflight record](evidence/preflight-passed.json) is preserved as originally written, with this report documenting the semantic check it missed.

| Verification | Result and limit |
| --- | --- |
| Existing technical baseline | Source-matched preparation evidence: 618 PostgreSQL checks, 35 focused units; original broader build/unit/Calendar evidence retained. See [preparation verification](../2026-10-28-phase-c-qualification-preparation/evidence/preparation-verification.json). |
| Scripted binding | Actual services, full journey, disposable Apply/replay: 1 pilot + 225 legacy PostgreSQL checks; zero external calls. |
| Long-review stopping | Actual PostgreSQL: 1 pilot + 225 legacy checks; completed late response settled, cancellation before a second review, zero external calls. |
| Execution guard | [7 tests pass](evidence/guard-tests.txt): ceiling/uncertainty, role settings, no unauthorized invocation, long-review retention and repeated allocation-review stop. |
| Live observation harness | [1 observation + 225 legacy checks pass](evidence/live/harness/focused/postgres-harness-run.json), no required skips. This asserts retained safe observation, **not** educational success. |
| Typecheck/lint | Full TypeScript passes; scoped ESLint: 5 files, zero errors/warnings. |
| Preservation | [Final verification](evidence/final-verification.json): original source/input hashes, historical evidence, unrelated changes and migrations preserved. |

Actual cancellation removed the lease and prevented publication. Three completed receipts survived; the interrupted receipt remained uncertain. The unselected English task was unchanged. There were no revisions or Apply receipt, no protected work was mutated, no production database was used, and the disposable database was stopped and removed. Linked continuation, substantive refinement and successful live publication/replay were not witnessed here.

New files are confined to the qualification caller/guard/test and this report. The four executed source versions are [retained with the evidence](evidence/executed-sources/); the temporary harness adaptation and source pins are under [the live evidence](evidence/live/). Existing compiler-v1/v2 runtime, provider routing and production settings were not edited for this experiment.

## Required next work

1. Correct the **fixture input boundary**, preserving this frozen version. Use an explicit weekday convention and the existing civil-date helpers. Add unpaid assertions against named Friday/Saturday/Sunday dates, rest, windows, daily ceilings, joint workload, actual Calendar witness and intended overlapping-event coverage. A schema-valid and internally feasible fixture is insufficient. Freeze a new manifest and rehearse before any new authorization.
2. Carry accepted student identity/document ownership and the normalized anchor into verification with separate provenance. Test anonymous diagnostic strengths and private teacher-issued school scope under GENERAL policy. Preserve the distinction between source support, student acceptance and official certification; do not upgrade authority or invent facts.
3. Improve the qualification stop interface and reason reporting so an operator can request existing root cancellation without locating the disposable server manually. Preserve pre-dispatch financial admission, uncertainty retention, single-root enforcement and truthful cancellation-versus-provider diagnostics. Do not replay the interrupted synthesis to obtain a nicer result.
4. Reconcile the interrupted request through available billing/usage evidence before considering more live work. Any corrected C01 is a **new experiment requiring fresh explicit approval**; unused allowance from this run is not authorization. Keep HIGH reasoning and educational capacity. The future complete result still needs the frozen independent audit, actual educational review/refinement observation, Calendar currentness and separate disposable Apply inspection.

No production fixes, deployment, UI or additional paid qualification were performed. This report completes observation of the single bounded run; the intended complete educational-quality experiment remains incomplete.
