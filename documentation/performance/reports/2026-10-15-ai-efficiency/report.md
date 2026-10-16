# Phase 2: AI efficiency implementation

**Deployment follow-up:** the telemetry migration was subsequently applied and verified on the configured Supabase project. See the [hosted migration report](../2026-10-15-ai-telemetry-migration/report.md). Statements below about the unapplied migration and Docker blocker describe this original implementation run, not the subsequent hosted verification.

Implemented October 15, 2026 against the [complete Phase 1 audit and evidence](../2026-10-15-ai-usage/report.md). Active AI paths now have per-dispatch accounting, explicit generation budgets, bounded retries, cancellation and context controls. No paid diagnostic or generation calls were made. Verification uses provider mocks, synthetic fixtures, source checks and free model-list metadata.

**Scope correction:** the user excluded the abandoned node/constellation system and page during implementation. All direct changes to its quest evaluation, preview/save flow and legacy syllabus compiler were restored. Duplicate evaluations in that abandoned flow remain unchanged and are explicitly excluded, rather than reported as resolved. Shared provider infrastructure continues to serve its existing consumers.

## Findings and disposition

| Phase 1 finding | Status and resolution |
| --- | --- |
| Missing canonical DeepSeek, Gemini and Groq pricing; unknown treated as free | Resolved for current known models. Versioned paid list rates, peak DeepSeek upper estimate, explicit null for unknown prices/usage/grounding. Historical zero estimates become unknown without invented repricing. |
| Mixed-provider Classic totals and winning-engine-only chat accounting | Resolved at active execution boundaries. Every observed wire dispatch has its own provider/model/root/stage receipt; old aggregate writes are suppressed. Failed attempts remain visible even when a fallback succeeds. |
| Missing Designer/Copilot, research, OCR, briefing and native Gemini accounting | Instrumented through existing shared providers and the native Gemini wrapper. Grounding token usage is captured, but total cost remains unknown when search charges cannot be established. |
| Lost reasoning/cache counts, actual model, latency, retries and finish reason | Captured when returned. Missing breakdowns stay unknown. Requested and returned identities are separate. Transport latency is distinct from full request latency. Pending receipts survive interruptions when the initial write succeeds. |
| Raw cheap-answer message snippets and provider error logging | Removed from changed active paths; fixed operational labels replace them. No prompts, user documents, conversations or credentials are added to logs. |
| Duplicate quest scope preview/save and stale node previews | Excluded per user; original implementation restored. No new evaluation receipt/cache or abandoned-page work retained. |
| Legacy syllabus compiler missing accounting/cancellation | Direct compiler changes excluded per user with the abandoned node system. No claim of complete legacy compiler coverage. |
| Unbounded output/reasoning in active operations | Explicit stage budgets added; complex synthesis/planning/research reasoning retained. Existing Modes budgets/validators remain. See budget table. Caps constrain exposure, not guaranteed consumption. |
| Gemini ignored disabled-thinking outside single-attempt mode | Fixed for Gemini 2.5. GPT-OSS maps disabled-thinking to its supported minimum `low`; it cannot truly disable reasoning. Other models retain their supported policies. |
| Hidden SDK retries and nested model fallback cascades | SDK attempts bounded to one. Chat owns failover and skips duplicate effective model/provider attempts. Classic duplicate Gemini attempts removed. Groq text fallback no longer escalates automatically to expensive Qwen; explicit choices remain available. |
| Client unlock without abort; abandoned and late requests | Chat uses a shared 120-second server deadline and 125-second client deadline. Cancellation reaches provider transport. Conversation identity/unmount guards and duplicate-submit protection prevent stale results; overlay, tutor and formula clients also use cancellation and identity guards. |
| Tool-result/context growth and repeated fallback reads | Results bounded to 8,000 serialized characters each and 24,000 per engine attempt. Structural IDs, dates and counts receive priority; omissions are explicit. Identical reads share a cache across chat fallbacks; duplicate reads within an attempt refer to the earlier result. |
| Repeated Classic habit analysis | Same-owner, exact-history SHA-256 cache, ten-minute expiry, at most 500 entries. Changed owner/history/expiry recalculates. No extra summarization model call and no cached fallback default. |
| Repeated research and excessive default history | Existing research provenance/freshness caches, bounded source excerpts, selective Archive retrieval and bounded chat history retained. No broad memory/profile dump, new summarizer or speculative history compression. |
| Prompt caching and static-prefix efficiency | Stable instructions remain first. Cache counters now allow measurement. No artificial padding to reach Gemini's cache threshold or new paid explicit cache storage. |
| Model naming assumptions and expensive routing | Canonical DeepSeek Flash replaces legacy automatic STEM/vision aliases; reasoning policies and explicit user/environment pins remain. Gemini 2.5 and Groq GPT-OSS availability confirmed through free metadata. DeepSeek metadata was unreachable, so no new live capability claim is made. |
| Sequential latency | Classic research/habit parallelism and research fetch concurrency retained. Briefing workers refill available slots instead of waiting for a whole batch. Completed overlay/tutor text displays immediately; artificial reveal delay removed. Stateful tools remain sequential. |
| Streaming, optional wording and smaller-model migration | Deferred pending measured benefit and semantic qualification. Optional wording remains; no extra model/provider or architecture rewrite. Streaming would improve delivery perception but requires a separate transport/UI change. |
| Historical spend, production p50/p95, failure/cache rates and per-conversation cost unavailable | Cannot be reconstructed safely. New correlated receipts support future measurement after deployment. Billing exports and representative live traffic are still needed. No overall savings percentage or monthly spend claim. |
| V2 review reasoning exhaustion and calendar context duplication | Deferred to unfinished V2 qualification. No activation, prompt rewrite, budget reduction or materialization changes. Existing durable metering remains authoritative; adapter logging is explicitly skipped to prevent duplicate rows. Shared pricing correction applies safely. |

## Implementation stages

**1. Establish measurement.** Reused `AiUsageLog` and existing adapters rather than adding a parallel ledger. Added nullable dispatch metadata, pre-call pending receipts and settlement updates; provider outages and unknown charges remain visible. Gemini normalization counts candidates plus thoughts once; DeepSeek/Groq normalize reasoning and cache subsets without adding them twice. `/api/ai-costs` and the existing usage panel distinguish incomplete totals from known subtotals. See the [current accounting contract](../../ai-accounting.md).

**2. Bound generation and context.** Added output budgets where previously unspecified. Reasoning remains available for complex educational and planning stages; small structured interpretation, query planning, habit summaries and briefings explicitly avoid unnecessary reasoning. Existing chat personality, confirmation controls, Planner delegation, Archive retrieval, permissions, quota ownership and materialization guards retain their owners.

| Stage | Output token ceiling / policy |
| --- | --- |
| Sylvie | Existing intent caps retained: 384–4,096; detailed requests at least 2,048. |
| Classic research synthesis / master plan | 16,384 / 32,768; reasoning retained. |
| Classic habit summary | 512; reasoning disabled where supported. |
| Planner Modes generation / critic / repair | Existing 14,000 / 4,096 / 8,192 retained. |
| Designer/Copilot interpretation / short wording | 8,192 / 2,048; structured reasoning disabled. |
| Research query planning / extraction and comparison | 2,048 disabled / 32,768 reasoning retained. |
| Image import | 16,384; existing 20-second deadline; truncated outlines rejected. |
| Daily briefing | 512; reasoning disabled; 30 seconds. |
| Native web search / unspecified adapter safety default | 8,192 / 16,384; specialized callers override. |

These are maximum completion budgets, including provider-billed reasoning where applicable. They are not predicted output lengths. A lower cap has no cost effect for responses already below it; truncation and reasoning-only responses require semantic monitoring.

**3. Remove duplicate and abandoned work.** Added exact-history habit reuse, fallback read reuse, route-owned retries and request cancellation. Existing caller deadlines are preserved, including V2's longer work budgets. Removed duplicate fallback candidates and unsupported policy retries; useful cross-provider recovery remains. The server/client deadline gap allows normal response delivery but does not guarantee that an aborted provider stops billing.

**4. Verify and document.** Regression coverage exercises mixed-provider receipts, unknown spend, failure isolation, usage normalization, cancellation, context truncation, cache ownership/freshness, pricing and the cost API. An old Classic byte-hash freeze was replaced by functional behavior coverage because this request explicitly authorizes Classic changes; two obsolete hash assertions already failed on the baseline. No validators or business assertions were weakened to hide unrelated failures.

## Measured before/after evidence

| Controlled comparison | Before | After | Interpretation |
| --- | ---: | ---: | --- |
| Synthetic 50-task tool result | 20,160 JSON characters | 5,427 JSON characters | Exact local serialization size; omissions disclosed. |
| Same fixture, characters ÷ 4 | 5,040 approximate tokens | 1,357 approximate tokens | Rough text proxy, not provider tokenization or billing. |
| Repeated Classic plan with identical owned history | Habit analysis on each generation | One habit generation omitted on valid cache hit | Mocked fixture preserves identical returned plan; owner/history/expiry invalidate reuse. |
| Chat fallback allowance | Up to three separate 90-second engine windows, plus tools | One shared 120-second server deadline | Source/configuration comparison, not measured production latency. |
| Completed overlay/tutor reveal | Nominal 0.7–0.8-second artificial reveal | Immediate completed-text render | Timer removal verified in source; no live user latency measurement. |

Actual provider token, dollar and latency reductions were **not measured**. No generation calls were made, and historical rows cannot price mixed/failed work accurately. List-price arithmetic from Phase 1 remains conditional: every 1,000 genuinely avoided DeepSeek output tokens is $0.00060–$0.00120 at documented off-peak/peak rates; Gemini 2.5 paid output is $0.00250. Avoiding cached input is worth substantially less than avoiding uncached input. These unit rates do not establish reducible volume or an app-wide saving.

## Verification results and limits

- Final focused regression run: **10 files, 48 tests passed**. Broader AI/Planner run: **2,008 passed, 23 failed, 255 skipped** across 175 files. Every remaining failure title reproduced on the original HEAD baseline: outdated Planner API/database mocks and older Planner surface expectations in six files. Their names are recorded in [checks.json](evidence/checks.json).
- TypeScript and Prisma client generation passed. Production build passed with `next build --webpack`. Default Turbopack stalled and was stopped; its completion is not certified.
- Mobile production build and bundle verification passed, with no server-only symbols or secrets found. Generated bundle artifacts were restored to avoid unrelated changes.
- New modules and new regression files pass ESLint. Changed files have 122 lint errors and 31 warnings versus 129 errors and 31 warnings in the matched original baseline, with no increased error/warning rule counts per file. Changed older files retain pre-existing lint debt; the comparison is recorded in the evidence. No broad type/style cleanup was attempted.
- Synthetic actual ConversationPanel rendered at 1440×1000 and 390×844 in dark, light and custom colors using existing theme-token generators; all six checks found a composer and no horizontal overflow. Screenshots use fixture conversations and mocked APIs, not user data. This is a component smoke check, not full authenticated browser coverage.
- Disposable PostgreSQL verification could not start: Docker daemon returned HTTP 500 before creating the database. The additive migration is present but **not applied to the live database**. Prisma generation/typechecking do not replace migration verification.
- Free provider metadata listed Gemini 2.5 Flash with generation support and Groq GPT-OSS 120B/20B plus Qwen. DeepSeek metadata timed out. Metadata availability does not certify paid generation quality or account-specific limits.

## Deployment and remaining decisions

Apply `20261015130000_ai_dispatch_telemetry` before deploying the application changes, then check pending/unknown receipts and aggregate transport latency under representative traffic. Schema build version is 32. Database telemetry is best effort: an outage can lose receipts, and pre-dispatch writes add unmeasured database latency. Grounding/search fees, free tiers, credits and unknown models require billing reconciliation.

No user input is needed for the completed source changes. Paid live semantic/latency diagnostics still require approval. V2 qualification, streaming and the intentionally excluded abandoned node flow are not silently included. Large research/planning output quality is not live-certified by mocks; keep existing semantic validators and review truncation/empty answers before lowering any budgets further.

[Evidence and reproduction](evidence/README.md).
