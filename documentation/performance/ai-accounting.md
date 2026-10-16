# AI dispatch accounting

Current implementation: `lib/ai/telemetry.ts`, `lib/ai/usage-logger.ts`, shared provider adapters, and the native Gemini dispatch wrapper. The [October 15 implementation report](reports/2026-10-15-ai-efficiency/report.md) records verification and limitations.

## Coverage and lifecycle

Authenticated execution boundaries establish `withAiRequest` for Sylvie, Classic Planner, Planner routes (including Modes, Designer/Copilot, research and image import), and daily briefings. Each explicit provider transport receives a unique dispatch `requestId`, shared logical `rootRequestId`, sequence, stage and retry index. Deterministic replies create no dispatch.

A best-effort `DISPATCHED` receipt is written before transport and updated on completion. Request boundaries await settlement writes. Successful transport, failure and cancellation are recorded separately; success does not imply semantic validity. A process interruption can leave a pending receipt. Database failures emit a fixed warning and must not fail generation. Persistence is not guaranteed during database outages; database-write overhead has not been measured.

Legacy aggregate logging is suppressed inside this boundary to avoid double counting. Planner V2 retains its existing durable reservation/settlement owner and opts out of shared adapter logging. V2 qualification and rollout remain separate. The abandoned node/constellation evaluation and legacy syllabus compiler are excluded at the user's request; their direct implementations are unchanged.

## Counter and price semantics

- Input includes cached input. Cache-hit input is a subset, never added again.
- Completion includes billable reasoning. Reasoning is a subset; Gemini candidate and thought counts are normalized into completion once.
- Missing usage, cache or reasoning breakdowns remain unknown. Zero counter defaults in pending rows are not verified usage; inspect `usageKnown` and `cacheUsageKnown`. Historical rows lack these certifications.
- `model` uses the returned provider identity when available; `requestedModel` is separate. `modelVerified=false` identifies a requested identity without returned verification.
- `latencyMs` measures provider transport, excluding the initial receipt write. It is not end-to-end user latency. `finishReason` enables truncation analysis.

`AI_PRICING_VERSION` identifies standard paid list-price assumptions. DeepSeek uses peak rates as a conservative upper estimate; account credits, off-peak discounts and free allowances are not inferred. Unknown models and unknown usage yield null cost. Grounded Gemini calls also have null total cost because grounding charges cannot be inferred reliably from token counters. Historical estimates are not retroactively repriced.

When the provider omits its cache breakdown, token cost assumes uncached input; the separate unknown-cache flag prevents interpreting that estimate as observed cache performance. Pending receipts have null latency and do not enter transport averages.

`/api/ai-costs` returns null totals for incomplete populations, a separate known subtotal, unknown counts, logical roots, dispatch counts and mean transport latency. Historical rows may represent whole requests or stages; do not interpret their mixed population as uniform dispatches. Provider billing exports remain the authority for actual charges.

## Privacy and deployment

Receipts contain authenticated ownership plus numeric/fixed operational metadata, never conversation text, documents, search queries, credentials or raw provider errors. Owner scoping remains enforced by the existing authenticated API.

Migration `20261015130000_ai_dispatch_telemetry` was applied to the configured Supabase project through `prisma migrate deploy` on October 15, 2026. All 29 telemetry columns match the current Prisma schema, indexes/constraints/permissions are preserved, and no pending or failed migrations remain. Prisma was regenerated; schema build version is 32. [Hosted verification](reports/2026-10-15-ai-telemetry-migration/report.md) covers rollback-only logging/cost/chat checks and separate, pre-existing schema differences outside telemetry. Any other environment still needs this migration before the updated application code.
