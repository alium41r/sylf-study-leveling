# Sylf AI usage, cost, and latency audit

**Audited October 15, 2026. Recommendation: fix accounting and avoid duplicate work before changing the AI architecture.** Current records cannot establish total spend or production latency. In the configured database, 41 of the last 30 days’ 42 usage rows store zero cost; these are not evidence of free calls. Planner output dominates the tokens that were recorded.

This audit made **no AI provider calls**, paid or otherwise, and changed no runtime behavior. Evidence consists of source inspection, offline synthetic prompt assembly, existing controlled experiment receipts, public provider documentation, and aggregate-only SQL in a read-only transaction. No conversations, user identifiers, uploaded documents, credentials, or raw provider bodies were exported. Database scope and local configuration are not proof of the hosted deployment’s configuration. Historical usage also spans earlier code versions.

**Architecture and coverage**

The shared owners are [configuration](../../../../lib/ai/config.ts), [provider adapters](../../../../lib/ai/providers/), [routing](../../../../lib/ai/agent-router.ts), [quota accounting](../../../../lib/ai/usage-limiter.ts), and [legacy usage logging](../../../../lib/ai/usage-logger.ts). Three providers are used: DeepSeek, Gemini, and Groq. GPT-OSS runs through Groq; there is no direct OpenAI or Anthropic integration in the inspected runtime. Brave, Serper, SearXNG, and native Gemini grounding are additional research dependencies with separate accounting requirements.

| Feature / entry points | Model calls and context | Limits and measurement coverage |
| --- | --- | --- |
| Sylvie: `/api/system-messages/chat` | Usually DeepSeek `deepseek-flash`; Gemini `gemini-2.5-flash` for vision; STEM requests select `deepseek-reasoner`. Groq `openai/gpt-oss-120b` and Gemini are fallbacks. Static modular instructions + page + bounded history + relevant Archive excerpts/tools. Deterministic answers, including the short Sylf introduction, need no model. | Output caps: simple 384, focus 512, calendar 640, general/coach 768, analyst/planner/vision 1,024, STEM 4,096; explicit detailed requests get at least 2,048. Up to five tool rounds plus a final answer attempt. Only the winning engine loop’s usage is logged, aggregated across its generations. |
| Classic Planner: `/api/ai-planner` | [Orchestrator](../../../../lib/ai/orchestrator.ts): grounded Gemini search → DeepSeek research synthesis; habit analysis runs in parallel; then master plan generation. Normally four generations with study history, three without it, before fallbacks. | 180-second logical timeout; most calls have no explicit output/thinking budget. Successful stage totals are combined into one row; search usage and cache counters are omitted. Provider/model labels cannot reliably price the mixed pipeline. |
| Planner Modes: `/api/planner/generate`, milestone expansion, rebalance | [Generation/critic/repair](../../../../lib/ai/planner/): DeepSeek Flash with Gemini fallback; confirmed brief, capacity, scope, preferences and friction. | Generation ≤3 dispatches, then critic and conditional targeted repair: ≤5 dispatches, with `singleAttempt` adapters. Caps 14,000 / 4,096 / 8,192; thinking disabled. Successful returned stages are logged separately, including invalid outputs; best-effort logging is not a complete attempt ledger. |
| Intake Designer/Copilot and plan assistant: `/api/planner/intake/[id]/{designer,copilot}`, `/api/planner/[id]/assistant` | [Designer](../../../../lib/planner/designer/model.ts) and [Copilot](../../../../lib/planner/copilot/model.ts): DeepSeek interpretation plus optional wording pass, normally one or two generations. Bounded intake context and recent turns. This is Sylvie’s existing Planner handoff destination. | Shared `ask` has a 30-second timeout per call but no explicit output cap, thinking setting, usage capture or shared generation quota reservation. Character/JSON validation happens after generation. |
| Planner scope research/comparison, reached through intake actions/assistants | [Research agent](../../../../lib/planner/research/agent.ts), [comparison](../../../../lib/planner/research/comparison.ts): DeepSeek query planning → search/fetch → extraction. LOOKUP/STANDARD allow two model passes; DEEP can add one follow-up pair. Source text budgets 24k / 36k / 72k characters. | Fetch concurrency of three, relevance/provenance checks and caches already exist. Usage input/output is returned internally but not written to the central cost ledger. No output token cap; extraction deliberately enables reasoning. Query planning disables it in the adaptive path; comparison’s older path does not. Search bills are absent. |
| Syllabus compiler: `/api/subjects/[id]/compile` | [Compiler](../../../../lib/ai/syllabus-compiler.ts): grounded Gemini research, Gemini synthesis, then DeepSeek fallback if needed. Produces 48 syllabus nodes. | Synthesis caps 8,192 / 4,096; only successful synthesis is logged. Search/failed outputs missing. Search timeout is a promise race, not transport cancellation. One compilation per subject and daily quota constrain repeat work. |
| Quest coverage: `/api/quests/evaluate-scope`, linked-node `POST /api/quests` | [Scope evaluator](../../../../lib/ai/scope-evaluator.ts): native Gemini SDK; model override then `gemini-3.7-flash`, `gemini-3.6-flash`, outside the shared model registry. Deterministic fallback exists. | Up to three model candidates, no explicit output/thinking limit or abort deadline, usage ignored. Client preview and save both evaluate; see priority 1 below. Model availability was not live-tested. |
| Image syllabus import: `/api/planner/intake/[id]/import` | [Vision extraction](../../../../lib/planner/import/vision.ts): Gemini 2.5 Flash for images; text-layer PDFs use local extraction. | 20-second abort, structured validation; no output cap/thinking control or token logging. Image input cannot be estimated reliably from text character counts. |
| Daily briefing: `/api/cron/daily-briefing` | [Briefing service](../../../../lib/ai/daily-briefing-service.ts): Gemini adapter with personal daily context. Eligibility and daily claims prevent routine duplication. | No explicit generation cap or token logging. Post-generation 800-character validation does not constrain billed output/reasoning. Concurrency defaults to batches of five; each batch waits for its slowest member. Milestone detection itself is deterministic. |

The [source inventory](evidence/source-measurements.json) records 46 generation/adapter-factory call sites, 26 named prompt literals, additional inline/dynamic prompt owners, and 34 related API routes. These counts include factories and deterministic control/read endpoints, not 46 AI features or 34 billable endpoints. Planner persistence, confirmation, revisions, capabilities, quota and cost endpoints generally do not invoke models. The generic `dispatchWithFallback` helper has no production consumers outside its own definition; actual execution boundaries above matter more than that helper’s design.

Local configuration has all three provider keys present, no DeepSeek model/base URL override, Groq set to GPT-OSS 120B, and Planner V2 durable core disabled. Secret values were not read into the report.

**Verified usage: rolling 30 days ending 2026-10-15 07:05 UTC**

The database contains 122 usage rows overall, from August 23 through October 15. The last-30-day subset contains 42 rows, all marked `SETTLED`, all without `requestId`. Legacy `SETTLED` does not certify complete billing. [Aggregate snapshot](evidence/database-aggregates.json), [derived totals](evidence/telemetry-summary.json).

| Logged population | Rows and unit | Input tokens | Output tokens | Recorded cache-hit input | Mean input / output per row |
| --- | --- | ---: | ---: | ---: | ---: |
| Sylvie | 14 successful logical requests | 51,467 | 2,320 | 3,712 | 3,676 / 166 |
| Classic Planner | 6 successful request aggregates | 23,681 | 39,729 | 0 captured | 3,947 / 6,622 |
| Planner Modes | 22 provider-stage rows | 48,988 | 50,691 | 10,240 | 2,227 / 2,304 |
| Total recorded | 42 heterogeneous rows | **124,136** | **92,740** | **13,952** | Not a per-request average |

Chat subdivisions: general 10 requests averaging 3,539 input / 57 output; focus 3 averaging 3,701 / 242; analyst 1 with 4,974 / 1,024. Modes’ exam generation accounts for 36,374 output tokens over seven stage rows; its largest single completion is 13,420 tokens against the current 14,000 cap. Classic’s largest aggregate output is 11,835. Finish reasons were not persisted, so truncation frequency is unknown. The full workload/model breakdown is in the derived totals.

Conversation counts are separate: 10 sessions with 13 user messages, mean 1.30 user messages/session, maximum three. There is no reliable session-to-usage join, and these counts do not match the 14 chat usage rows. **Average tokens/cost per conversation cannot be measured from these records.** Multiplying unmatched populations would invent a measurement.

Only $0.000993 is stored as estimated cost; 41 rows store zero. There are no last-30-day syllabus/other rows. Unmetered paths mean this cannot establish their usage was zero. Production reasoning-token totals, true Gemini/Groq cache hits, failure/retry spend, search fees, invoice totals and latency averages are unavailable. Some stage metrics exist transiently in application logs, but no hosted log export or provider billing export was collected.

**Cost estimates and accounting defects**

The rate table omits the active canonical `deepseek-flash` identifier, all Gemini rates and all Groq rates. The legacy estimator prices unknown models at zero; alias rates are stale. `/api/ai-costs` already marks legacy zero-cost rows as unknown, which helps presentation but cannot recover missing charges. Classic also stamps a DeepSeek provider on a blended pipeline and saves display labels such as `Gemini (gemini-2.5-flash)` instead of billable stage identities.

Public standard rates checked October 15, USD per million tokens:

| Model | Uncached input | Cached input | Output, including billable reasoning |
| --- | ---: | ---: | ---: |
| DeepSeek Flash, off-peak / peak | $0.15 / $0.30 | $0.003 / $0.006 | $0.60 / $1.20 |
| Gemini 2.5 Flash, paid text/image tier | $0.30 | $0.03 | $2.50 |
| Groq GPT-OSS 120B | $0.15 | $0.075 on a cache hit | $0.60 |
| Groq GPT-OSS 20B fallback | $0.075 | $0.0375 on a cache hit | $0.30 |

DeepSeek’s old Flash/vision aliases are served and priced as canonical Flash; thinking is enabled by default. [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/). Gemini’s account tier is unknown; paid grounding beyond its allowance is $35/1,000 grounded prompts and explicit cache storage adds charges. [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing.md). Groq fallback Qwen3.8-27B is listed at $0.80 input / $4 output, so fallbacks are not uniformly cheap. [Groq models](https://console.groq.com/docs/models), [cache pricing](https://console.groq.com/docs/prompt-caching).

Repricing stored counters at these current list prices gives the following **conditional scenarios, not historical invoices or complete spend bounds**:

| Identifiable subset | Subset cost | Mean per logged unit |
| --- | ---: | ---: |
| 14 chat rows | $0.01310–$0.01611 | $0.000936–$0.001151 / logged request |
| 22 Modes stage rows | $0.04216–$0.07641 | $0.001916–$0.003473 / logged stage |
| Combined 36 rows | $0.05526–$0.09252 | No cross-feature request average |

Assumptions: all-off-peak versus all-peak DeepSeek; paid Gemini with no known cache discount; all-hit versus all-miss Groq input. Excludes six mixed Classic rows, free allowances/credits, hidden attempts and search fees. Historical adapter versions/counters are not retrospectively certified. These numbers **must not be used as a monthly app budget**. [Calculations](evidence/repricing-estimates.json), [reproducible calculator](evidence/summarize-usage.cjs).

For future accounting, use `((I−H)×inputRate + H×cacheRate + O×outputRate)/1,000,000 + searchFees`. Cache hits H are a subset of input I; reasoning is a subset of billable output O where the provider includes it. Never add either subset twice. DeepSeek captures cache hits today; Gemini adds candidate and thought output but discards the split/cache field; Groq drops cache/reasoning detail. Actual returned model, attempt duration and request correlation are also lost in legacy normalization.

**Prompt/context efficiency and latency**

Offline synthetic assembly measured exact characters; `characters ÷ 4` below is a rough English/JSON token proxy, excluding provider framing, media and real history. It is not a tokenizer or live latency test.

| Synthetic request | System characters | Tool schema characters | Approximate total input tokens | Retrieval |
| --- | ---: | ---: | ---: | --- |
| General explanation | 4,815 | 2 | 1,212 | None |
| Timer help | 5,771 | 2 | 1,450 | One timer entry |
| Personal statistics | 4,866 | 245 | 1,281 | `getUserStats` only; result not yet included |
| Move task | 4,839 | 930 | 1,451 | `getQuests`, `moveQuest`; results not yet included |

The persona/knowledge/capability files total 4,427 characters. They form a stable shared prefix, with variable page/date/context later. Archive selection is local, at most two 2,800-character excerpts; general conversations retrieve none. No profile, statistics or memory dump is loaded by default. History is capped at 20 messages / 18k characters, approximately 4,500 additional proxy tokens. Current usage averages span older code: the difference between those averages and these synthetic prompts cannot be attributed entirely to history or current prompt overhead.

The remaining context growth risk is tool results: full quest/goal records and search summaries can be replayed through multiple model rounds without a comparable total budget. Duplicate reads are cached within an engine attempt; fallback attempts rebuild the conversation and can repeat them. Designer’s static prompt is 6,402 characters and Copilot’s 4,751; intake context is byte-bounded, with eight recent turns / 2,400 characters. Research already limits sources/excerpts and caches matching results.

Provider caching is automatic where supported; loading Markdown once per process is a separate filesystem optimization. Gemini 2.5 Flash implicit caching requires a 2,048-token minimum prefix; do not pad Sylvie’s small prompts just to qualify. [Gemini caching](https://ai.google.dev/gemini-api/docs/caching). Groq GPT-OSS caching uses matching prefixes, expires after two idle hours and is not guaranteed. [Groq caching](https://console.groq.com/docs/prompt-caching). Missing cache telemetry prevents measuring achieved savings.

There is **no verified production p50/p95 latency**. Source identifies these contributors:

- Sylvie waits for complete, non-streamed provider replies. Tools in a round run sequentially, then another model call follows. Up to seven generations can occur per engine attempt. Automatic non-vision fallback can allocate three separate 90-second attempts, about 270 seconds before uncancelled tool work; this is a configured allowance, not observed latency.
- The conversation panel unlocks after 45 seconds without aborting the fetch. Retrying can leave two server requests running and produce late-response races. Providers also have nested fallbacks: Gemini model candidates and Groq candidates/SDK retries; `singleAttempt` is not set by chat. The requested model label can therefore differ from the model that answered.
- Gemini’s normalized `thinking: disabled` is applied only in its `singleAttempt` path; chat fallback does not use that path. Groq ignores the normalized thinking setting. Output caps can be consumed by reasoning without a useful final answer; legacy chat does not preserve a reliable finish reason.
- Classic already parallelizes research and habit analysis. Its serial research-search → synthesis → master chain remains; grounding is not fully cancellable. Designer/Copilot can add a serial wording call. Independent owned-data reads and briefing batch barriers are smaller candidates to measure, not demonstrated bottlenecks.
- Overlay/focus text reveal happens after receiving the full response and adds roughly 0.7–0.8 seconds at nominal timer cadence. Streaming would improve perceived responsiveness; it does not itself reduce token cost.

**Ranked opportunities, expected savings, and quality risks**

Ranking combines observed output volume, identifiable duplicate work and worst-case exposure. Unmetered traffic prevents a proven global dollar ranking or defensible overall savings percentage.

| Priority | Finding and proposed next change | Expected saving / evidence | Quality and reliability guard |
| --- | --- | --- | --- |
| 0 | Complete accounting first: record each provider dispatch’s actual model, input/output/reasoning/cache, duration, outcome and logical request/stage identity; distinguish unknown from free. Version rates and reconcile with provider exports. Reuse existing adapters and request/root/attempt fields. | No direct token saving; makes every later claim measurable. Current coverage misses research, Designer/Copilot, scope, OCR, briefing, grounding and many failed attempts. | Preserve success when telemetry fails; record unknown/late charges honestly. Log numeric metadata/fixed labels, never prompts or documents. Remove the existing cheap-answer log’s first 40 message characters; replace syllabus workload descriptions with a fixed label. |
| 1 | Avoid repeated scope evaluations. The modal debounces every edit by 450ms; started requests are not cancelled or protected against stale responses. Save reevaluates the same text. Reuse an unchanged preview through a server-owned/signed, version-bound evaluation receipt; coalesce edits and cancel stale work. | Each unchanged preview→save can avoid **one complete evaluation**, plus additional calls from typing pauses. Frequency/cost is unmeasured; no percentage claim. | Bind receipt to authenticated owner, exact input and node version. Never accept client-supplied coverage as reward authority. Keep deterministic fallback. |
| 1 | Control generated output/reasoning by stage, starting with unbounded Designer/Copilot, research/comparison, scope, OCR, briefing and Classic. Keep planning reasoning where it helps. | Recorded Classic + Modes output is 90,420 tokens versus chat’s 2,320. Every 1,000 genuinely avoided DeepSeek output tokens saves $0.00060–$0.00120; paid Gemini saves $0.00250. Actual reducible output is unknown. A cap saves nothing when already below it. | Test semantic completeness and nonempty final JSON. Do not globally disable reasoning or shrink plan size/critic budgets solely to save tokens. |
| 1 | Align client/server deadlines, propagate cancellation, correlate retries and bound wire attempts across fallback layers. | Avoided duplicate/abandoned requests save their entire billed work; rates are unknown. Can also remove long fallback tails. | Preserve useful failover and user confirmations; transport abort does not guarantee zero provider charges. Account for late/unknown usage. |
| 2 | Bound tool-result fields/rows and total accumulated context; keep stable prefixes and existing selective retrieval. Only compress older history when it actually grows. | Every 1,000 removed uncached DeepSeek input tokens saves $0.00015–$0.00030; removing already-cached tokens saves only $0.000003–$0.000006. Per-call token savings are directly measurable after instrumentation. | Preserve IDs, dates, relevant preferences and task evidence. Pagination/truncation must be explicit. Current short conversation sample does not justify another AI summarization call. |
| 2 | Reuse matching research and habit evidence; consider deterministic/cached study-pattern summaries instead of repeating Classic habit analysis. Measure optional wording passes and model routing before removing them. | A valid habit-summary reuse can avoid one analysis generation. Cache-miss and wording-pass frequencies are unknown. No demonstrated benefit from moving all work to a smaller model. | Keep cache keys tied to owner/data version or public provenance; preserve freshness, personalization and research quality. Confirm model availability without assuming an alias’s name proves its behavior. |
| 3 | Tune remaining read sequencing, briefing scheduling, streaming and cache prefix order only after timing stages. | Latency opportunity, not quantified cost saving. Historical research fetch concurrency is already implemented and must not be counted again. | Do not increase API volume/concurrency blindly or parallelize stateful mutations. |

**Planner V2: separate, unfinished**

V2 is disabled in the inspected local configuration and has no durable request IDs in this usage sample. This does not certify deployment-wide inactivity. Its [metered provider boundary](../../../../lib/planner/v2/intelligence/provider.ts) already reserves per dispatch, uses single-attempt adapters, settles known usage and retains unknown/late charge exposure. This is a useful future boundary, not a reason to activate unfinished V2 or rebuild Sylvie now. Its strict pricing returns unknown for missing model rates rather than zero; the shared canonical-rate gap still needs correction.

Budget ceilings, not actual consumption: advice/calendar 2 calls / 30s / 16k input / 4k output; educational 6 / 180s / 80k / 24k; research 8 / 300s / 160k / 32k. Interpretation caps 768 output, blueprint/adaptation 8,192, review/verification 4,096, OCR 1,024. Byte-based input reservations are conservative allowances, not tokenizer measurements or bills. Calendar envelope content can appear both in model context and the explicit blueprint payload; quantify that duplication before changing contracts.

Existing October 9 controlled receipts show 10 dispatches: 13,864 input, 19,230 completion **including 16,329 reasoning**, 768 cache-hit input; median transport latency 8.175s, maximum 20.975s. Two review calls consumed all 4,096 output tokens each in reasoning and returned no final text. A separate low-reasoning review pair still used 6,627 reasoning of 6,944 completion tokens, with one usable and one blank response; median 17.775s. These tiny diagnostics are not production averages or proof of a safe optimization. Existing off-peak cost estimates were $0.013505 and $0.004886 respectively, not verified invoices. [Numeric evidence and original paths](evidence/historical-metrics.json).

The older paired research extraction is also instructive: reasoning disabled used 3,199 output tokens / 9.508s and yielded six accepted claims; enabled used 14,836 / 54.681s and yielded eight. This single fixture demonstrates a quality tradeoff, not a general effect size. Fix review delivery and qualify educational reasoning before V2 rollout; retain critics, provenance and deterministic materialization guards.

**Recommended sequence and remaining uncertainty**

First establish complete numeric dispatch telemetry and current, explicit pricing. Next remove duplicate scope work and align cancellation/deadlines. Then evaluate stage-specific output/reasoning policies against existing functional and semantic fixtures; follow with bounded tool context and measured cache reuse. Keep V2 qualification separate.

Total actual spend, cost per complete plan/conversation, failure/retry rates, cache efficiency and production latency remain unknown. Provider billing exports plus a representative period of correlated metadata are needed to close those gaps. No architectural decision or new paid experiment is required to accept this audit. Any later paid diagnostics still require the user’s approval.

Verification: offline prompt assembly and cost arithmetic reproduced; aggregate sums reconciled; helper syntax, evidence JSON and local references checked. This deliverable changes documentation and offline audit helpers only. [Evidence/reproduction guide](evidence/README.md).
