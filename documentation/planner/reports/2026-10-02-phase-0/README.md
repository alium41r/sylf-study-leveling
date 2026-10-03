# Planner V2 Phase 0: Contracts and Evidence

Scope: freeze the [approved target architecture](../../PLANNER_TARGET_ARCHITECTURE.md) using the [final review](../2026-10-02-final-architecture-review/REVIEW.md) and [end-to-end audit](../2026-10-02-end-to-end-audit/AUDIT.md). No product cutover, UI replacement, prompt tuning, worker deployment or Phase 1 features occur here.

## Deliverables

| Evidence/contract | Location |
| --- | --- |
| Versioned pure executable contracts | [contract index](/Users/aliumair/Desktop/sylf/lib/planner/v2/contracts/index.ts), [contract specification](CONTRACTS.md) |
| Execution writer/source/client/SQL inventory | [writer report](EXECUTION_WRITERS.md), [machine inventory](execution-writers.json) |
| Duration/lineage adoption and migration dependencies | [migration map](MIGRATION_MAP.md) |
| Worker packaging, lease/fence, budgets and recovery requirements | [runtime contract](WORKER_RUNTIME.md) |
| Genuine PostgreSQL baseline/concurrency runner | [harness specification](POSTGRES_HARNESS.md) |
| All 34 audit findings plus normalized regression inputs | [versioned fixtures](fixtures/audit-regressions.v2.json) |
| Contract/evidence test assertions | [pure tests](/Users/aliumair/Desktop/sylf/__tests__/planner-v2/contracts), [audit evidence tests](/Users/aliumair/Desktop/sylf/__tests__/planner-v2/evidence) |
| Reproducible aggregate gate result | [gate evidence](evidence/phase0-gate.json), [contract results](evidence/contract-results.json), [database run](evidence/postgres-harness-run.json) |

## Run the gate

```sh
node scripts/verify-planner-v2-phase0.mjs
node scripts/verify-planner-v2-phase0.mjs --native-bin /absolute/path/to/postgres/bin
```

Requires repository dependencies and a working Docker daemon or native PostgreSQL binaries. The measured native runtime is temporarily available at `/private/tmp/sylf-planner-phase0-runtime/package/native/bin`; its provenance is recorded in [runtime evidence](evidence/native-runtime-provenance.json). The command accepts no hosted database URL, removes provider/database environment settings from child processes and creates/destroys its own loopback cluster. It fails if required contract/database tests skip or disappear. There is no “skip database” option.

The gate checks authoritative reference hashes, inventory/source correspondence, all pure contract/evidence tests, isolated Phase 0 TypeScript, targeted ESLint, runner syntax and genuine PostgreSQL suites. Results overwrite the evidence as PASSED or FAILED; do not rely on an older success after source drift. Required PG tests have an explicit `.postgres.ts` suffix so ordinary unit discovery cannot accidentally skip them through optional-environment logic. The dedicated PG configuration fails outside its disposable harness.

## Phase 0 gate assessment

| Approved gate | Evidence and boundary |
| --- | --- |
| All execution writers and migration dependencies mapped | 36 behavior groups; 105 ORM sites; 21 effective SQL signatures; 65 routes; 98 runtime SQL call sites; 38 raw SQL/operator sites; 771 pinned current source files. Includes Classic, chat, generic Quest/Goal/calendar, academic edits, cron, timer/RPCs, party transitions, progression/rewards, reset/erasure and shared mobile clients. Mechanical scan limits and live-catalog verification are explicit. |
| Concrete/versioned invariants and migration mapping reviewed | Pure v2 schemas/predicates and root runtime limits; parent/requested/resolved/base correspondence; immutable semantic spec; remaining-estimate basis; all-writer lock/version requirements; legacy duration conflict/invalid/open-session classification and staged cutover. Independent contract review caught fence-loss, started-timebox, exclusion, research-version and serialization-headroom cases; these were resolved before qualification. |
| Audit failures exist as regression fixtures | All A01–A34 retain their original evidence level, register line and pinned audit hash; 12 normalized scenarios distinguish actual observations, synthetic counterexamples and future output/browser expectations. Contracts test the new boundary where appropriate. Schema validity does not claim to fix excessive pedagogy or substitute for later human evaluation. |
| Real PostgreSQL harness runs without required skips | 14 actual current SQL/separate-backend assertions and 225 existing assertions across all 17 required database suites. Zero required skips/failures. The sole exclusion is an explicitly named optional live-provider experiment; no provider credentials are supplied. Current SQL and genuine transaction prerequisites are tested, not invented V2 services. |
| Worker hosting/recovery concrete | One supervised compiled Node worker, no second broker; exact concurrency/admission/pool/lease/fence/deadline/cancellation/checkpoint/accounting/shutdown values and staging recovery drills. The worker is not implemented or deployed in Phase 0. |
| No product cutover | All code is under new contract/test/harness paths. Production app, DB schema/migrations, UI, prompts and dependencies remain untouched by this phase. Existing unrelated dirty changes remain in place. |

The measured status and exact assertion totals are authoritative in `evidence/phase0-gate.json`. A successful run satisfies **Phase 0 only**. Phase 1 has not started.

## Important qualifications before Phase 1/release

The current historical migration chain has a documented missing-enum bootstrap gap. The disposable runner uses a current audited schema bootstrap followed by actual security/Planner SQL; it is not a claim that a fresh production migration chain deploys cleanly. Rehearse the actual migration ledger/catalog on a disposable copy before introducing V2 migrations. Do not edit historical migrations or touch hosted data to make a local report look clean.

The whole-repository typecheck currently reports unrelated generated Next route-export errors in Acoustics and Quests. [Recorded check evidence](evidence/postgres-harness-checks.json) preserves them; the isolated Phase 0 typecheck must pass. Those routes are not changed by Phase 0.

Deployed grants/function owners, actual supported Android release builds and live transport, hosted rollback/backfill, complete V2 worker/apply crash tests, browser acceptance, provider latency and pedagogical benchmarks remain their approved later gates. Source inventory identifies the current web/shared-mobile code and build metadata; it cannot invent the versions installed on student devices. No mock/client fixture counts as hosted/mobile integrity evidence.

Implementation must begin with the durable core and **all** coordinated writers, including SQL RPCs and zero-second Focus start. Do not begin Phase 1 automatically from this report. Do not start with UI replacement, prompt patches or separate mode engines.
