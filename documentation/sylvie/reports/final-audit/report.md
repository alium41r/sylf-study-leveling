# Final AI audit and polish

Completed 16 October 2026 (Asia/Karachi). This pass reviewed the active Phase 1–3 runtime and made focused corrections. No paid AI calls, application deployment, new dependencies, schema changes or migration deployment were performed. Abandoned node/constellation systems and unfinished Planner V2 were excluded. Existing working-tree changes were preserved against a task-start snapshot.

## Architecture and audit coverage

| Active system | Current execution boundary | Context and delivery |
| --- | --- | --- |
| Sylvie workspace, shortcut popup, Focus assistant | Shared chat owner/composer/renderer → authenticated chat route → shared DeepSeek/Gemini/Groq adapters | Same cached persona/knowledge/capability instructions; selective Archive references and intent-scoped tools. Native SSE for eligible text replies; tool rounds remain buffered. |
| Planner Designer/Copilot | Existing intake/projection → typed interpreter → validated commands/proposals | Shared composer, image gallery and Markdown. Images force proposal review; existing signed apply and version guards remain. Structured replies remain buffered. |
| Classic Planner | Existing orchestrator, research/habit/master-plan stages and serializable materialization transaction | Stage budgets, exact-history habit cache, cancellation and per-dispatch accounting retained. Progress events are separate from token streaming. |
| Planner Modes, research/comparison, document import | Existing generation/critic/repair, search cache/provenance and native Gemini wrapper | Existing semantic validators, bounded excerpts, generation budgets, ownership and quota owners retained. |
| Daily briefing and Focus formula requests | Existing briefing service/cron and chat JSON compatibility | Briefings remain read-only model calls with a 512-token cap; formulas retain the JSON contract. |

Provider SDK retries remain disabled/bounded; the caller owns fallback. Winning-engine totals do not replace per-dispatch receipts. Input includes cached tokens; completion includes reasoning tokens, without adding either subset twice. Missing usage, unknown pricing and grounding fees remain unknown. Stable instructions precede volatile date/page/history data. No paid explicit cache, new summarizer, automatic resend or competing planning engine was introduced.

The three default Sylvie instruction files total **4,428 characters**, excluding runtime role/date/page/verbosity text. This is a source character count, **not a tokenizer measurement**. Normal conversation history remains at most 20 messages/18,000 characters; Archive retrieval is local, selects at most two relevant articles and does not make an AI call. Tool results remain bounded to 8,000 characters each/24,000 per attempt. General conversation does not load personal profiles, images or unrelated documents. Simple/detailed request policies and specialized reasoning budgets were preserved rather than reduced without semantic evidence.

## Confirmed issues fixed

1. **Prompt loss after failed requests.** Draft ownership now lives beside the existing shared request owner. Failed sends restore the submitted text only if no newer draft/thread superseded it. Conversation switches clear the old draft. The Planner retains its editable prompt on transport failure and clears successful submissions without erasing newer text.
2. **Cross-account direct-message injection.** The direct-message API now checks ownership of an existing conversation before writing. It validates message shape/length/type and derives authorship only from authentication. History limits are bounded to 100; malformed session IDs are rejected.
3. **Classic Planner quota/cancellation gaps.** Invalid requests are rejected before reserving quota. Response-reader cancellation aborts upstream work. Late model results cannot begin materialization after cancellation. Failed commits refund the reservation; successfully committed work keeps its charge even if delivery fails. The route execution allowance now accommodates the existing 180-second model deadline plus persistence/telemetry. Actual hosting-plan limits still need deployment qualification.
4. **Incorrect model/quota presentation.** Classic no longer invents a Gemini model when the provider identity is missing, and its quota error correctly describes the weekly limit.
5. **DeepSeek thinking/tool contract.** Required current-turn reasoning metadata was retained by the adapter but omitted from subsequent tool requests. It now travels only within the server's temporary provider history, with empty metadata for older persisted visible turns. It is omitted on tool-free requests and never rendered, logged or saved. [DeepSeek's contract](https://api-docs.deepseek.com/guides/thinking_mode/) requires this field for thinking/tool continuation. Synthetic transport tests verify the wire shape; live acceptance remains unqualified.
6. **Deterministic context crossing new chats.** New conversations no longer recall the shared “new” cache entry. Follow-ups use the adopted conversation ID, and the redundant cache write was removed.
7. **Image help misclassification.** Questions about the image feature/support/limits no longer automatically require a previous image. Explicit image references retain ownership and availability checks.
8. **Redundant image transfers.** DeepSeek follow-ups previously downloaded/base64-encoded stored images before sending their signed URLs. Inline data is now loaded only when a Gemini attempt needs it, once across the cascade.
9. **Microphone lifecycle and mobile legacy images.** Recognition timeout/constructor/cleanup paths release the active owner. Opening or closing the popup cancels prior dictation. Older authenticated attachment links now use the existing mobile API-base resolver too.
10. **Briefing tone/context and operational privacy.** Removed the broad core-profile context and forced “Hunter” briefing language; task summaries and workload hints remain. Independent task/flag reads run together and select only needed fields. Changed deterministic, quota, routing, import and cron error paths use fixed log labels rather than raw exceptions, account/path details or potentially private values. Tool follow-up receipts retain their engine-attempt index and explicit stage.

## Efficiency and latency findings

| Change | Verified evidence | Practical interpretation |
| --- | --- | --- |
| DeepSeek private-image follow-up | Regression fixture: one referenced image now causes **zero app-server image downloads**, previously one; no inline payload is built for DeepSeek | Avoids a download and base64/history-copy work per referenced image. Provider image billing is unchanged; no measured dollar or network-latency saving is claimed. |
| Daily briefing context | Removed the core-context builder's five direct database reads, plus its timezone lookup when uncached; task/flag reads are parallel | Avoids duplicate task/profile/progression context and unnecessary query stages. Actual DB latency and provider token reduction were not benchmarked. |
| Failed/invalid/aborted requests | Tests verify validation before reservation/dispatch and no materialization for late cancelled results | Prevents avoidable quota loss and abandoned work. The number of such production requests is unknown. |
| Streaming UI | Synthetic 180 ms chunk fixture displayed a first partial reply in 189/280/281 ms after the click returned for main/popup/Focus | Confirms incremental rendering and immediate Stop behavior. These are local fixture observations, **not provider TTFT, end-to-end latency or production benchmarks**. |

No additional model call is needed for image retrieval, streaming, dictation, public Archive lookup, action confirmation or the exact short-introduction regression. Reusing an image still incurs provider image input when analyzed again. Browser dictation adds no Sylf transcription API charge; its browser-owned online service, permissions and availability remain outside Sylf's control.

No overall savings percentage, monthly spend, per-conversation cost, live p50/p95, or cache-hit improvement can be established from the available evidence. Pre-dispatch database writes remain awaited for durable receipts; their overhead is not separately measured and was not removed speculatively. Large research/master-plan reasoning remains the highest potential per-operation exposure because of its necessary synthesis/validation and output budgets; current evidence does not justify lowering those budgets.

## Actual usage and cost evidence

A read-only aggregate query against the configured hosted database returned **122 legacy rows**. None has a dispatch/root ID, known-usage qualification, reasoning breakdown or transport latency. One dormant syllabus row is outside this audit; the active recorded groups are below. These are observed database counters, **not reconciled provider invoices or complete wire usage**.

| Recorded feature | Rows | Input tokens | Completion tokens | Cached input recorded | Mean input/output per row | Stored priced subtotal |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Chat | 87 | 419,918 | 15,885 | 167,424 | 4,826.6 / 182.6 | $0.051472 across 59 rows only |
| Planner (legacy mixed stages/providers) | 34 | 93,473 | 129,864 | 10,240 | 2,749.2 / 3,819.5 | Unknown; no priced rows |

Chat's subtotal omits 28 unpriced rows and failed/missing dispatches; it is not total spend. Planner's historical provider/model labels mix stages and cannot safely support stage repricing. Completion counters cannot be split into visible/reasoning tokens. There are no conversation correlations or representative image/dictation/briefing usage groups. No before/after production comparison is possible because the updated application has not been deployed by this work.

Current configured standard paid rates were checked against primary sources: DeepSeek Flash input $0.30/cache $0.006/output $1.20 per million at peak (off-peak half), [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/); Gemini 2.5 Flash text/image input $0.30/cache $0.03/output including thoughts $2.50, [Google pricing](https://ai.google.dev/gemini-api/docs/pricing); Groq GPT-OSS 120B input $0.15/output $0.60, [Groq models](https://console.groq.com/docs/models). These validate configured list-rate estimates, not account credits, grounding costs or invoices. The conservative peak estimate was retained.

[Aggregate evidence and reproducible read-only query](evidence/hosted-telemetry.json), [query source](evidence/read-telemetry.mjs). No conversations, user IDs, prompts, private image paths, credentials or signatures were selected into this evidence.

## Security, images and persistence

Actual hosted checks used synthetic users/receipts/messages **inside transactions that always rolled back**, with provider construction and external fetch blocked. They verified pre-dispatch/settled receipts, mixed-provider cache/reasoning normalization, unknown spend, cost aggregation, real cookie authentication/revocation path, concise deterministic chat/history, and direct-message cross-account isolation. All three tests passed; no test data remained.

Image tests exercise actual Sharp validation, malformed/bomb/size limits, orientation/metadata processing, deduplication, private manifest exposure, ownership and route limits; storage/provider operations are mocked in those tests. The related private bucket/restrictive RLS migration and real upload/download/signing/anonymous-denial checks were completed in [Phase 3](../multimodal-phase-3/report.md); this audit did not redeploy it or relabel that earlier evidence as a new run. Providers receive short-lived URLs; browser attachment delivery remains cookie-authenticated/no-store. Images are never accepted from arbitrary client URLs.

Chat deletion and failed upload/message writes attempt cleanup. A process crash or storage outage can still leave private orphan objects; no distributed cleanup worker or unrelated database change was added. Planner native-image turns remain tab-local; full document import keeps its existing owner. Signed tool/proposal confirmation, atomic consumption, linked-plan guards and existing reward/transaction authorities remain intact. An operation already committing when a connection drops has an uncertain acknowledgment; the UI does not automatically replay it.

## UI and automated verification

- **Final broad run:** 2,156 passed, **9 existing failures**, 257 skipped across 189 files. The 14 earlier AI/Classic capacity/API failures were resolved by adding the missing current Prisma/transaction/floating-rest mocks; business assertions remain. Remaining failures are the older Planner entry/chooser/source-shape expectations in three files, listed in [baseline failures](evidence/remaining-baseline-failures.json). Planner entry behavior was not rewritten to satisfy obsolete expectations.
- The first expanded run also timed out once in `quick-plan-research`; its isolated eight-test repeat and final broad run passed. No timeout increase was used to hide it.
- **Focused provider/image/accounting:** 41 tests passed. **Final cancellation/commit/conversation boundaries:** 52 passed. **Hosted rollback verification:** three passed. These overlap the broad coverage and must not be summed as independent cases.
- TypeScript, production webpack build, mobile build and mobile server-only/secret bundle verification passed. Generated mobile artifacts were restored. The successful build is the webpack build; no new Turbopack completion claim is made.
- Changed files were lint-compared with the task-start snapshot: no increased rule counts; existing lint debt remains. New regression files and shared chat changes introduce no lint violations. See [lint comparison](evidence/lint-comparison.json).
- Browser integration used actual shared components with intercepted synthetic responses: four surfaces × desktop 1440×1000/mobile 390×844 × dark/light/custom appearance, **24 checks**. Composer visibility, overflow, append/cancel dictation, failed prompt retention, image submission/reuse, stable rows and streamed cancellation passed. Planner image requests remained proposal-only; main image reuse sent zero files and one owned reference. Screenshots were visually inspected. [Browser evidence](evidence/browser-checks.json).

## Remaining qualification and priorities

1. With separate approval, run a small paid semantic corpus on each supported provider: concise/detailed answers, multi-round tools with thinking, difficult diagrams, image follow-ups and fallback disclosures. Measure provider TTFT, complete-request time, truncation and usage rather than relying on mocks.
2. After authorized deployment, qualify the real host/proxy SSE and execution limits, cancelled connections, telemetry settlement and mobile cookie/image delivery. Collect correlated receipts and reconcile invoices before making further budget/routing changes. No deployment was performed here.
3. Test real microphone permission, stop/interim/final behavior, on-device availability, backgrounding and interruption on supported Safari/Chromium and Capacitor devices. Synthetic recognizers do not certify browser service quality or platform entitlements.
4. Reconcile the nine older Planner entry tests with the current product contract separately. Retain the confirmed AI boundary tests and repeat the occasional scope-test timing case under normal CI load.
5. Sylvie’s automatic Planner handoff currently carries text/context only. Image-based setup works directly in the Planner composer; transferring private chat images through the handoff is not implemented. Automatic image follow-up recognition is deliberately narrow; “Use image again” provides explicit selection.
6. Review orphan-storage cleanup only if operational evidence warrants a bounded repair mechanism. No new autonomous cleanup system was introduced.

The audited code and local/hosted synthetic checks are ready for review. **Live provider/device behavior and production hosting remain release qualifications; this report does not certify them as production-tested.**
