# Step 6 general boundary corrections — 8 October 2026

Status: **IMPLEMENTED; LIVE ACCEPTANCE FAILED**. Phase 2 remains incomplete; Phase 3 has not begun. This continuation supersedes the comparison experiments as an execution roadmap, while preserving their evidence.

## Diagnosis before edits

The selected [14/17 matrix](evidence/step6-live-2026-10-08T15-28-59-317Z/live-corpus.json), [independent assessment](evidence/step6-live-evaluation.json), [High subset](HIGH_REASONING.md) and [blocker record](STEP_6_BLOCKERS.md) expose shared boundaries rather than missing provider credits:

1. Instructions protecting actual assignments were applied to preparation for a future assessment. A verified outcome/source reference was also treated as evidence of available example data or taught methods. Neither inference follows from the actual supplied content.
2. Reviewer input included estimates and activities but no explicit conserved workload arithmetic. Empty reviews missed obligatory extensions and discrepancies against the generator's own whole-strategy estimate.
3. Adaptation received unscheduled refs, a capacity proof and the expanded proposal, but not the allocator's exact per-activity valid dates and single-chunk limits or the original split receipts. It repeated a parent boundary that left an oversized remainder.
4. Research verification's static reference shape accepted syntactically valid local IDs; the existing ownership validator correctly rejected an invented new scope alias. The model was not explicitly told that ADD_SCOPE identities are allocated by the server.
5. Independent review instructions repeated long examples and the same rules. High reasoning exhausted the existing output cap. Removing repetition can improve fit, but does not prove reasoning will complete within that cap.

## Changes and invariants

- Generation now distinguishes future assessment preparation, available assignment deliverables and unverified resources. It requires actual content support for attributed data/methods and explicit available or learner-created practice for preparation. Required authentic deliverables keep honest unmet dependencies. No title parser or corpus-specific decision is introduced.
- Review and verification share a concise general rubric. Every original goal, raw evidence/provenance, exclusion, scope disposition, split receipt, dependency, uncertainty and actual allocation remains in the input. Findings still require exact owned refs, literal grounds, consequences and resolutions; blockers still need requirement/observation plus offending proposal. Concision does not authorize dropping blockers or evidence.
- A deterministic workload audit counts expanded committed activities once, excludes split receipts from added effort, and distinguishes protected remaining minutes from historical timeboxes. It exposes discrepancies against the model's own strategy estimate as review attention, not an arbitrary duration limit or automatic educational verdict.
- The existing allocator exposes necessary per-activity bounds from the same hard-date domains and capacity functions used for scheduling. Adaptation rechecks that its report digest matches the durable allocation, then receives those bounds and split receipts. These are necessary bounds, not a promise of feasible dependency packing. One adaptation, unchanged reallocation and all protected work remain authoritative.
- Research verification receives the exact accepted scope inventory. ADD_SCOPE must use no parent or an existing parent alias; the server allocates the new identity. Existing strict unknown-reference rejection remains. Verified-result cache keys are versioned so previous model-contract results are not silently reused.
- A qualification-only production-options selector preserves every primary Flash thinking/reasoning/sampling option from the actual V2 syllabus route. It uses the already configured DeepSeek chat fallback temporarily, per the user's non-Gemini authorization; it changes no production configuration. Previous experiment switches are mutually exclusive with this selector.

Frozen contracts, root budgets, output/token limits, call caps, deadlines, review/verification holdbacks, lease/checkpoint lineage, candidate sealing and canonical ApplyService are unchanged. No second scheduler, queue, generation endpoint, persistence model or execution path is added. Unrelated concurrent changes are preserved.

## Validation and acceptance

Focused intelligence tests and typecheck/lint are being recorded alongside implementation. The disposable live harness first reruns only `tiny-roomy-exam`, `triage`, and `owned-course-research` with production primary options. A full unchanged 17-case run is conditional on independent acceptance of all three. A genuine natural named review finding → repair → exact independent verification → canonical ApplyService witness is separately required; fixtures and successful apply alone do not satisfy educational acceptance.

Live outcomes, usage, latency, fallback, truncation and remaining limits will be appended after observation. No budgets will be raised to make the run pass.


### First production-options subset

[17:04:25 UTC raw run](evidence/step6-live-2026-10-08T17-04-25-567Z/live-corpus.json) passes all405prerequisites with no required skips and no source changes during the run, then fails all three cases safely. [Independent inspection](evidence/step6-live-2026-10-08T17-04-25-567Z/independent-evaluation.json) accepts0/3: tiny generates60minutes with correct supplied/learner-chosen givens, but both mandatory reviews truncate with no final content; both triage generation attempts truncate to partial JSON; owned extraction/verification/adoption succeeds without invented aliases, but both blueprint calls truncate with no final content. There is no candidate, execution, REPAIR or VERIFICATION. All9external calls settle actual50,217input/55,900output tokens;6truncate,3fallbacks occur, all9prices remain UNKNOWN. Case median/max latency81.274s/113.860s; upstream median/max32.293s/41.301s. These failures are output-envelope failures, not quota failures. No budget/option is changed.

The trace also reveals long repeated generator rationale and instructional prose. A second narrow correction consolidates the generator rubric and JSON example, generalizes repeated scenario guidance, asks for specific concise field prose and direct analysis, and retains all scope, contract, authenticity, protection, numerical-input, independent-performance and adaptation rules. Review/verification likewise request concise direct comparisons before emitting JSON. This is a prompt correction, not a lowered evidence standard or output-cap change. Its second subset remains pending.

The initial full407-test PostgreSQL refresh has one parallel-reservation assertion failure (3fulfilled versus4expected) while the live405prerequisites pass the same test. Its complete failed evidence is [preserved](evidence/step6-boundary-2026-10-08/reservation-regression-first-run/postgres-phase1-results.json). No lifecycle/counter authority is changed or test weakened; a fresh regression run is required before claiming that gate green.


### Consolidated-prompt subset and exact stopped boundary

[17:16:24 UTC raw run](evidence/step6-live-2026-10-08T17-16-24-282Z/live-corpus.json) again passes405prerequisites, with no required skips or source changes during the run. [Independent inspection](evidence/step6-live-2026-10-08T17-16-24-282Z/independent-evaluation.json) accepts0/3. Tiny generation fits after an existing schema fallback (primary had an undeclared scopeRefsNote:null), but both4096-token reviews still return zero final content. Triage still clips both8192-token generation attempts. Owned research has one network_error; its durable ledger closes as BUDGET_EXHAUSTED/UNKNOWN_SPEND, retaining4729input/8192output reserved units. The calling turn was interrupted during this pending call, so this failure does not establish normal owned-research impossibility. Its233.368s observed upstream latency is retained separately from the earlier durable closure timestamp.

All7external attempts remain recorded:6SETTLED,1UNKNOWN_SPEND,33,640known input/32,734known output tokens,4truncated calls,3fallbacks,7UNKNOWN pricing receipts. Unknown usage/cost is not counted as zero actual spend. Case median/max89.663s/233.762s; upstream median/max24.086s/233.368s. No REPAIR/VERIFICATION, candidate or ApplyService execution occurs in either subset. The full17-case corpus is **NOT_RUN**, because its prerequisite acceptance gate fails. No defect/finding is injected, output replayed or historical repair promoted.

The actual V2 route is `syllabus` in the existing shared provider boundary. It selects deepseek-flash and leaves thinking/reasoning/sampling unspecified; the adapter sends no corresponding overrides. [DeepSeek's current primary documentation](https://api-docs.deepseek.com/guides/thinking_mode/) states that thinking defaults to enabled at High effort. Thus these are actual production-primary option runs, not new explicit High comparison experiments. The distinct in-chat `planner` route's disabled-thinking configuration is not the V2 compiler route. No route was substituted to circumvent caps. The temporary existing DeepSeek fallback is recorded and restored at teardown, since the user has no Gemini quota.

The observed stopping condition is repeated failure to emit mandatory structured output under the actual production-default reasoning behavior and unchanged4096review/8192generation envelopes. Prompt consolidation improves generation size but does not close acceptance. This evidence does not prove that every possible future prompt would fail. Further blind retries are stopped.

**Minimal proposed configuration deviation, not implemented:** explicitly pin thinking disabled for the V2 compiler purposes within the existing provider/configuration owner, retaining deepseek-flash, independent review, all budgets/caps/deadlines/holdbacks, metering, lifecycle and ApplyService authority; preserve unrelated AI workloads. Then repeat the same3-case gate and only conditionally the17-case corpus and natural repair witness. This changes a production reasoning setting, which the user's constraints keep unchanged, so it requires separate authorization before implementation. No model change, budget expansion, provider bypass or weakened review is proposed or performed.

Final technical/source preservation checks have been refreshed. The current completion record remains INCOMPLETE; there is no Phase3 handoff authorization or work.


### Final required technical gates

[Final aggregate](evidence/step6-boundary-2026-10-08/step6-gate.json) records9passed/3failed gates. All549units in43files and500independent allocation oracles pass, along with source/intelligence/worker/whole-repository TypeScript, scoped lint, ordinary Node imports, frozen contracts/governing design, report references and unrelated-source preservation. The isolated build compiles then reaches the unchanged Acoustics route-export blocker, separately classified and retained.

The same-assertion native PostgreSQL refresh passes **406/407** (181/182V2and225existing tests), zero required skips and no source drift. The one remaining failure is `an explicit linked new root can retry a lost repair while ordinary takeover cannot`; retained runner diagnostics say STACK_TRACE_ERROR without an actionable error message. This is **unresolved**, not classified as a proven environment-only issue or silently passed. The prior Docker failures remain separately archived. Native lease/deadline/reservation tests and both400-Quest/maximum-envelope tests pass. No test timeout, assertion, retry allowance or production lifecycle code was altered to obtain this result.

Consequently both required technical PostgreSQL acceptance and live educational acceptance remain open, as does Phase2completion certification. Source/regression evidence must be investigated before any completion claim, independently of the proposed production reasoning decision. The report does not turn a prompt improvement, source-old success, safe failure or fixture repair into educational acceptance. No further live retry or model experiment is running.


## Subsequent sleep investigation

[Sleep/wake evidence and selective awake reruns](SLEEP_INVESTIGATION.md) identify231/33/12-second sleeps during owned research, the second Docker full regression and the native full regression respectively. All four selected regression failures pass unchanged on both awake runtimes; owned research succeeds through reviewed candidate publication and canonical apply, with a separate educational inspection of that single case. Prior UNKNOWN_SPEND and full-run failures remain historical evidence, not normal-condition impossibility. Tiny/triage truncations preceded sleep and remain valid; blueprint/review truncation also reproduces in the successful owned run and requires two fallbacks. No repair/verification is triggered. The407-test/full17-case gates were not rerun. No implementation/provider change, limit expansion or Phase3work occurs.
