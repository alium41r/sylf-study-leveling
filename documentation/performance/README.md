# Performance audits and experiments

These are dated reports and measurement sets, not current architecture or performance guarantees. Existing report/evidence directories and test output locations are preserved.

| Area | Report and evidence | Role |
| --- | --- | --- |
| Hosted AI telemetry migration | [October 15 migration verification](reports/2026-10-15-ai-telemetry-migration/report.md) | Exact pending migration applied through the existing Prisma/Supabase workflow; real database logging/cost/chat checks rolled back all fixtures. Records unrelated schema drift without applying it. |
| Current AI accounting | [Dispatch contract](ai-accounting.md), [October 15 implementation](reports/2026-10-15-ai-efficiency/report.md), [verification evidence](reports/2026-10-15-ai-efficiency/evidence/README.md) | Active-path telemetry, budgets, cancellation and reuse. Separates offline measurements, baseline failures, deployment prerequisites and excluded legacy flows. |
| AI usage, cost and latency | [October 15 AI audit](reports/2026-10-15-ai-usage/report.md), [aggregate evidence and reproduction](reports/2026-10-15-ai-usage/evidence/README.md) | Read-only source/database audit; separates verified counters, list-price scenarios, missing telemetry and unfinished Planner V2. No new provider calls or runtime changes. |
| September performance baseline | [Phase 0 modernization report](phase-0/MASTER-MODERNIZATION-REPORT.md), [artifacts](phase-0/artifacts/) | Audit/architecture deliverable anchored to September 11/14 builds; it records concurrent source drift and unimplemented roadmap recommendations. |
| Earlier companion prototype | [Prototype report](companion-prototype/README.md), [measurements](companion-prototype/measurements.json) | Historical Pixi mesh Phase 1 experiment. |
| Earlier prototype refinement | [Phase 2 review](companion-phase2/README.md), [measurements](companion-phase2/measurements.json), [contact comparison](companion-phase2/contact-comparison.json) | Historical follow-up to that prototype; its video/production descriptions are task-era facts. |
| Planner/research measurements | [Shared artifacts](phase-0/artifacts/), [Planner evidence index](../planner/README.md#evidence-and-functional-locations) | Corpus, thinking-cost, and fetch-concurrency outputs are intentionally retained at existing executable writers' paths. |

The Pixi prototype phases are separate from [pixel companion Phase 1/2](../pixel-companion/README.md) and the [SVG capability test](../svg-companion/README.md). Reports and all evidence remain recoverable; identical or similarly named measurements can represent different run contexts and have not been deduplicated.
