# Reviewer Low comparison — prepared, awaiting paid authorization

**No paid Low calls have been made.** The unpaid preflight passed on 9 October 2026. This experiment tests whether the existing review interface can deliver correct, validated judgments at Low reasoning inside its unchanged 4,096-token cap. It does not establish reliability from two examples. The [earlier High-default run](../initial-block/EXECUTION_REPORT.md) delivered no verdict on either case.

## Exact comparison

Run the same two fixed candidates, once each, in their original order: v09 (sound written greetings), then v04 (defective compulsory citation rewrites). Their prompts, accepted facts, consequential evidence, allocations, JSON schema, validation, provider root budgets and signed expectations are unchanged. Use `deepseek-flash` / DeepSeek V4.1 Flash, JSON output, no streaming, no sampling overrides and the existing deadline. The sole wire change is `reasoning_effort: "low"`; thinking remains omitted. Low enables thinking according to [DeepSeek's API contract](https://api-docs.deepseek.com/api/create-chat-completion/).

The [manifest](run-manifest.json) restricts dispatch to these two original trials. The [variant freeze](freeze-low.json) pins the new local tooling, original protocol and previous paid receipts; all 207 implementation/runtime pins and 48 prepared packets remain authoritative. Original files, the original spending journal and production routing are preserved. No generation, structure, recovery, repair, verification, capacity or UI work is included.

The diagnostic guard first validates the unchanged native adapter request, then adds only the approved Low field immediately before transport. The actual wire hash and selected effort are journaled; an unpaid regression confirms that this body equals the existing adapter's native `reasoningEffort: "low"` option. This isolated bridge reuses the frozen dispatcher and adapter, canonical accounting, spending guard, sleep owner and review validator. It changes no shared source or configuration. The local PostgreSQL suite and launcher are derived from the original diagnostic harness, with pair scope and synthetic usage counters adjusted.

## Spend and execution safeguards

| Bound | Value |
| --- | ---: |
| Paid dispatches, after fresh approval | At most 2 |
| Retry, fallback and recovery dispatches | 0 |
| Output cap per review, including reasoning | 4,096 tokens |
| Full input reservations, both calls | 23,242 units |
| Full output reservations, both calls | 8,192 tokens |
| Peak, uncached full reservation | **$0.016803** |
| Proposed hard ceiling for this comparison | **$0.02** |

The reservation uses $0.30/million cache-miss input and $1.20/million completion at published peak rates; actual usage may cost less. Completion includes reasoning once. [Pricing source](https://api-docs.deepseek.com/quick_start/pricing/). No completion length or invoice charge is predicted. Current support/rate metadata is [recorded](evidence/public-metadata.json) and must remain fresh at execution.

Each request requires a durable full reservation before its single wire. Reservations are retained without recycling savings. An exclusive persistent journal refuses overwrite, restart, duplicate dispatch, expanded scope, changed limits, unauthorized routes and concurrent calls. Missing reasoning/cache/usage counters, model drift, transport uncertainty, accounting failure, exhausted budget or lost sleep protection halt further dispatch. A known, settled capped or malformed response is recorded as a failure; the second distinct case may still be attempted to distinguish sound/defective delivery, within the original two-operational-failure rule. Neither case is retried. `review-low/STOP` is an operator stop.

The launcher and executor each own a `caffeinate` assertion; it is checked before every wire and released on exit. Execution uses a disposable local database and the existing attempt/provider meter. Each root is cancelled after accounting; publication, revision/Quest creation and ApplyService are forbidden. No Gemini, Pro or Max path is available.

The [approval template](approval-template.json) remains **PENDING**. New explicit human approval must bind the exact manifest, variant freeze, independent signoff, current metadata and passing unpaid preflight. The previous $0.40 approval is not reused. Paid mode refuses pending approval before provider setup. Unused headroom cannot authorize continuation.

## Evaluation and decision rule

Reuse the unchanged [independent AI-agent label signoff](../initial-block/label-signoff.json), [written signoff disposition](../initial-block/SIGNOFF_RESOLUTION.md) and [strict rubric](../evaluator/RUBRIC.md). This signoff is not human educational assessment. No expected labels, gold findings or evaluator notes enter a paid model request; all model-facing content is exactly the original packet.

A passing pair requires **both** nonempty complete STOP responses, strict schema/evidence/ownership validation and correct educational judgments:

- **v09:** no unsupported blocker on the accepted written-greeting outcome. Pronunciation or conversation practice cannot become a compulsory condition. Properly grounded advisory preferences remain permissible; empty findings are also permissible.
- **v04:** a valid, appropriately blocking finding identifies the compulsory twelve identical rewrites after the accepted citation has passed its check. Quote the actual accepted stopping requirement and actual offending proposal; correct educational meaning is required, not the author's exact phrasing. Extra false blockers fail precision.

Assess each complete response against its full accepted facts and candidate before comparing configurations. Preserve raw final text, rejected concerns and validator outcomes. The existing independent reviewer agent can assess results under the proposed execution approval; it did not author the cases. A second assessor checks severe/disputed concerns and any claimed acceptance, using neutral assessment IDs and concealed configuration mapping until initial judgments are locked. Prior case knowledge and awareness of the experiment limit full blinding. Preserve disagreements; unresolved adjudication is PENDING, never a pass. Do not edit labels, prompts or output in reaction to this pair, salvage clipped output, or recover malformed findings.

Report per-call finish reason, original and strict accepted findings, semantic judgment, literal grounding, false/missed blocker, raw input/cache counters, completion/reasoning/non-reasoning tokens, transport latency, model/fingerprint, reservations and usage-based cost. Report delivery separately from semantic accuracy: blank or unusable output provides no accepted verdict, not a true negative. Compare with the two historical High calls descriptively; one sample per case cannot estimate population accuracy or prove a causal latency difference. Do not retain/export private reasoning text.

If both pass, propose a separately authorized bounded continuation of the ten previously unattempted reviewer cases, in frozen order, with one call per case and no tuning. Their full peak/uncached reservations total **$0.0879378**; they are **not** included in this approval request. Broader consistency, shared/split/protected evidence and sensitivity/false blockers remain unqualified until tested.

If Low still produces capped/blank outputs, the next decision concerns review-interface/model budget fit; semantic capability remains unknown. If it delivers valid but incorrect findings, the next decision concerns reviewer educational capability or instructions/evidence interpretation. If it gives conceptually correct but invalid findings, the next decision concerns schema/grounding output reliability. A mixed pair fails the pair gate. No outcome permits automatic prompt changes, model switches, higher limits or further calls.

## Unpaid verification

The [preflight receipt](evidence/preflight.json) records **2 intercepted requests, 0 paid calls, genuine durable accounting, matching full reservations and verified sleep prevention**. Both scripted fixture reviews passed the unchanged validator, two canonical roots were cancelled, and there were no revisions or Quests. These scripted responses demonstrate execution mechanics, not Low model quality.

- 12 new pair-guard tests passed, including native Low wire equivalence, scope/ceiling, no retry/fallback, grounding rejection, unknown usage and sleep/journal failures.
- All 15 original frozen guard tests passed unchanged.
- The disposable PostgreSQL diagnostic suite passed: 1 test, 0 failures and 0 required skips.
- `npx tsc --noEmit` and targeted ESLint passed.
- Original freeze check reports `FROZEN_INPUTS_MATCH`, with 0 external calls.

After approval, the prepared command is `node documentation/planner/reports/2026-10-09-step6-controlled-diagnostics/review-low/launch.cjs paid /absolute/path/to/new-approved-record.json`. No approved record exists yet. The paid run uses a new, non-overwritable `review-low/evidence/paid-run/` directory; results require independent evaluation before any success claim or continuation proposal.
