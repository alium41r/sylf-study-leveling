# Evidence and reproduction

Snapshot: October 15, 2026. These are aggregate counters and source measurements, not provider invoices or current production guarantees. No new model dispatches were made.

| File | Basis and limits |
| --- | --- |
| [database-aggregates.json](database-aggregates.json) | Configured app database, collected at the embedded UTC timestamp using a read-only transaction. Only counts, sums, lengths, model/workload groups and schema metadata; no IDs or conversation bodies. Local configuration fields contain booleans and an allowlisted model name only. |
| [telemetry-summary.json](telemetry-summary.json) | Offline grouped arithmetic over that snapshot. Planner feature rows mix request aggregates and provider stages, so their mean is not a mean per plan. |
| [repricing-estimates.json](repricing-estimates.json) | Conditional current-list-price scenarios. Paid Gemini assumed; DeepSeek all-off-peak/all-peak and Groq all-hit/all-miss bounds. Not full app spend or historical invoices. |
| [source-measurements.json](source-measurements.json) | Synthetic prompt assembly, exact source characters, approximate chars/4 tokens, generation/factory calls, prompt owners and related routes. No real conversation or provider tokenizer. Greeting assembly is a hypothetical model path; deterministic answers can bypass it. |
| [historical-metrics.json](historical-metrics.json) | Numeric extraction of pre-existing research/fetch and V2 diagnostic evidence. Original source paths and qualifications are embedded. No historical experiment was rerun. |

Run offline helpers from the repository root:

```sh
node documentation/performance/reports/2026-10-15-ai-usage/evidence/inspect-source.cjs
node documentation/performance/reports/2026-10-15-ai-usage/evidence/summarize-usage.cjs
```

The source helper uses the installed TypeScript compiler, stubs database access and blocks `fetch`. It intentionally estimates text characters only; provider framing/media tokens and dynamic prompt slots are not measured. The calculator refuses unknown models in the identifiable subset rather than assigning a zero price. Public rates were checked against [DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/), [Gemini](https://ai.google.dev/gemini-api/docs/pricing.md), [Groq models](https://console.groq.com/docs/models) and [Groq caching](https://console.groq.com/docs/prompt-caching) on the audit date. Update assumptions before using it for a later snapshot.

An optional **database read**, with configured credentials and network access, reproduces a new rolling window and overwrites the snapshot. It makes no provider call:

```sh
node --env-file=.env --env-file=.env.local documentation/performance/reports/2026-10-15-ai-usage/evidence/read-database.mjs
```

The database helper opens `BEGIN READ ONLY`, exports aggregate metadata and rolls back. It sanitizes non-enum workload descriptions, connection errors and environment values. It does not change runtime telemetry, user records or quota. The successful audit snapshot predates the helper’s additional future-proof workload redaction; its observed groups were already fixed labels. Raw hosted logs and provider account/billing consoles were not collected.

Validation performed: `node --check` on the three helpers; offline reproduction of prompt counts and repricing; reconciliation of all 42 rows and token totals; JSON parsing, local Markdown reference checks and diff whitespace checks. No application build/test suite was needed for this documentation-only deliverable; offline helpers are not imported by the application.
