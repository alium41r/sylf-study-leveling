# Planner Phase C qualification tools

Current preparation: [corrected C01 report](../../../documentation/planner/reports/2026-10-28-phase-c-c01-corrected-preparation/README.md), [protocol](../../../documentation/planner/reports/2026-10-28-phase-c-c01-corrected-preparation/PROTOCOL.md) and [fresh approval request](../../../documentation/planner/reports/2026-10-28-phase-c-c01-corrected-preparation/APPROVAL_REQUEST.md). **This correction phase authorizes no paid calls.** Use Node 24.x from `.node-version`.

The original bank/manifest, `prepare.mjs`, original preparation fixture and [first live evidence](../../../documentation/planner/reports/2026-10-28-phase-c-c01-live/README.md) are historical. Do not overwrite them or rerun their consumed authorization. Current callers still reuse their shared funding/metadata helpers and the existing durable services; there is no second Planner lifecycle or scheduler.

## Unpaid preparation

- `preflight.mjs --private-output /private/tmp/new-receipt.json`: only authenticated GET `/models` and `/user/balance` at the fixed official origin, with redirects/retries/foreign endpoints blocked. Private account data stays mode-0600 outside the repository. No generation, Search or Fetch call is a preflight probe.
- `c01-profile.mjs`: explicit Monday-zero named-week assertions for the corrected dated packet; rejects the old encoding and changed hard scope/deadlines/permissions. `checkFreshFunding` rejects reused profiles, stale metadata or insufficient balance after the prior unknown reserve.
- `c01-calendar.ts`: assertions over actual existing Calendar reads, canonical availability, capacity and the joint allocation witness. This audits correspondence; it does not calculate a replacement schedule.
- `node --test scripts/qa/planner-phase-c/{preparation,execution-guard,c01-corrected}.test.mjs`: no-network metadata, input, financial and operator-control tests.
- `node scripts/qa/planner-phase-c/run-c01.mjs REHEARSE --output documentation/planner/reports/<new-evidence>`: five scripted cases through genuine disposable PostgreSQL, actual Research/compiler, capacity, strategy/translation/review and publication/Apply. Includes refinement, expired-review stopping, in-flight operator cancellation and provider failure. The child receives no provider/hosted credentials and blocks external fetching. Individual modes are SCRIPTED, REFINEMENT, LONG_REVIEW, CANCEL_IN_FLIGHT and PROVIDER_FAILURE.
- `node scripts/test/test-planner-ai-first-foundation.mjs --native-bin /absolute/postgres/bin --evidence-dir documentation/planner/reports/<new-evidence>`: complete retained PostgreSQL bank in its established isolated source copy. Keep sleep prevention active. Do not extend test/lease/root deadlines to pass a gate.
- `node scripts/qa/planner-phase-c/freeze-c01.mjs`: requires the complete unpaid verification/source pins, then writes one immutable corrected manifest with `approved:false`. No execution flags or provider imports exist in this command. Preserve old manifests; do not silently replace a prepared date/source version.

## A separately approved future run

The existing runner's LIVE mode is locked behind the corrected profile, matching prepared/source/input hashes, a fresh private single-use human authorization, sufficient fresh official metadata/balance, explicit acknowledgment of prior uncertain spending and a private key capsule. Old C01 authorization is rejected. Preparation is not permission to invoke it. After approval, use the actual network-enabled shell context whose authenticated GET preflight passed; restricted-shell DNS success is not assumed. Do not change routing, TLS, production configuration or accounts to work around delivery failures.

HIGH reasoning, complete context/text retention, 65,536 completion tokens and downstream escrow remain fixed by the reviewed resource proposal. Meter/worker/root accounting, source/currentness, cancellation and publication/Apply remain the existing authorities. No retries after uncertain dispatch. Retain unknown usage/cost rather than reporting zero. No paid tools/OCR/Search/Fetch, alternate provider or paid judge is included.

The runner publishes `control.json`. Request the exact run's cancellation without locating a database:

```sh
node scripts/qa/planner-phase-c/operator-control.mjs cancel /absolute/run-output "Concrete stopping reason"
```

Run/root identity and reason are required; the request cannot be overwritten. The journey polls it and cancels through AttemptService. SIGINT/SIGTERM request the same stop or a stop before admission. Keep the process alive to retain the final response/accounting observation and allow disposable cleanup. Operator cancellation remains distinct from a later transport abort, and does not fabricate final billing usage.

For a successful LIVE candidate, inspect `journey.json` and `inspection-required.json` before writing the matching `operator-decision.json` with APPLY or SKIP, runId, attemptId and reason. Only existing ApplyService may materialize the exact reviewed ChangeSet in the disposable database; replay is checked. A stale/unsafe candidate must be rejected or skipped. Models never confirm. No real student's workspace is changed.

Pin normalized dates, exact source/prompt/visible response/financial artifacts and complete issue history before cleanup. Do not retain credentials or hidden reasoning. Rehearsal success is technical evidence only; the future actual complete result still needs independent evaluation under the unchanged rubric, with absent facets left unobserved and no consistency or human-expert claim.
