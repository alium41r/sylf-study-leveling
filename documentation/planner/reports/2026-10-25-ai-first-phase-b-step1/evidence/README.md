# Phase B Step 1 evidence

`verification.json` records the final commands/outcomes; `regression-resolution.json` accounts for all 32 retained failure names; `preservation.json` compares the task-start working tree and retained execution/provider authorities.

- `final-postgres/`: authoritative final full V2 and legacy PostgreSQL results, actual migration/guard checks, runtime and source hashes. No required skips or source drift are permitted.
- `postgres/`: earlier full green 226 V2 / 225 legacy run before the additional pre-V2 snapshot reader regression. Kept as its own run.
- `pre-final-reader-check/`: full green 227 V2 / 225 legacy run before legacy-core digest hardening and the mixed-worker claim guard. `before-claim-guard/` retains the next isolated run; its tests passed but its source-pin gate correctly detected edits made during execution. Neither replaces the final source-pinned gate.
- `stabilized-baseline/`: intermediate fixture-only run, 217 V2 passes / one remaining Sunday-capacity fixture failure. Source edits during this isolated run are recorded, so its source-pin status is not a final qualification claim.
- `first-versioned-run/`: intermediate 224 V2 passes / one foundation fixture rejected by the new v2 legacy-meter barrier. The final fixture uses synthetic historical receipt setup; runtime role admission remains closed.
- Unit/typecheck/lint/worker/import/build logs: final local Node 24 qualification. Intermediate runner results remain visible; they do not supersede the final source-pinned gate.

The runner copies source and historical evidence writers into a temporary workspace, strips hosted/provider credentials and uses a disposable loopback PostgreSQL cluster. Paid provider qualification is excluded. It preserves original Phase A evidence and does not alter hosted data.
