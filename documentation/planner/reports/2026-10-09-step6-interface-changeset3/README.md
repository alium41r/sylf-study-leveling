# Phase 2 Step 6 interface revision — Changeset 3

Changeset 3 replaces full-proposal AI repair with bounded educational corrections assembled by the existing compiler. It builds on [Changeset 1](../2026-10-09-step6-interface-changeset1/README.md) and [Changeset 2](../2026-10-09-step6-interface-changeset2/README.md). Phase 2 live educational qualification remains incomplete; this is an offline technical implementation record.

The approved Astra audit and three-changeset revision plan are in the parent Codex conversation, **Improve AI planner plan quality**. The [approved architecture](../../PLANNER_TARGET_ARCHITECTURE.md#8-ai-boundary-and-learningblueprint) and [Step 5 compiler](../2026-10-03-phase-2/STEP_5.md) retain authority over responsibilities and execution. This change adds no planning engine, lifecycle state, mandatory model call, repair opportunity, educational default, database entity or Phase 3 UI.

## Implemented contract and assembly

| Owner | Implemented behavior |
| --- | --- |
| [Supporting repair transport](../../../../lib/planner/v2/intelligence/schemas/repair-response.ts) | Strict `{corrections:[...]}`; 1–60 typed corrections, at most 32 KiB. Each names the selected `planRef`, original `issueIds` and an educational reason. Activities/phases reuse the compact effort tuples and canonical educational field bounds. |
| [Blueprint assembly](../../../../lib/planner/v2/intelligence/blueprint.ts) | Determine owned affected objects and relationships, copy the complete original candidate, apply only explicit corrections, and invoke the existing full `validateLearningProposal` authority. Recompute canonical digests without estimating or filling educational values. |
| [Compiler](../../../../lib/planner/v2/server/compiler.ts) | Use the existing one-repair dispatcher, save the accepted bounded response, assemble/revalidate on recovery, rerun split expansion/allocation/forecasting and independently verify before sealing. |
| [Quality](../../../../lib/planner/v2/intelligence/quality.ts) | Verification explicitly inspects remaining serious defects, including previously missed defects and introduced regressions, as well as every exact original issue. Grounding, accountable fallback and canonical report validation remain unchanged. |
| [Checkpoint support](../../../../lib/planner/v2/intelligence/schemas/quality.ts) | Record the server-owned `TARGETED_V1` repair interpretation alongside the existing digests/receipts. Frozen contracts and checkpoint lifecycle remain unchanged. |

The AI can replace/remove an existing affected activity or phase, add a necessary activity/phase using a supplied unused local alias, replace an owned scope disposition, replace strategy fields or decisions, correct the checkpoint/trade-off explanation, and explicitly add/remove a related shared dependency. Strategy replacements exclude policy and phases; those structural constants and unaffected arrays are preserved. There are no arbitrary JSON paths, model-authored UUIDs, execution commands, scope inventions, silent removals or horizon/recovery adjustments.

Every named blocker must be represented by an actual correction. Echoed objects, duplicate changes, unknown issues, renamed identities, unrelated objects and unowned references fail validation. Initial authority covers the named objects and their direct educational relationships. A necessary dependency correction may propagate through existing dependency links **only through activities explicitly corrected for the same issue**. Unchanged activities and shared scope/phase membership cannot bridge authority. The reason for changing a related object remains an AI educational judgment for independent verification; structural connectedness does not prove necessity.

Additions use deterministic unused aliases supplied with the request and must serve the named issue. An added phase must be referenced by corrected education. Shared edges retain distinct selected owners and one prerequisite owner. Removal does not automatically delete or invent dependent education: the AI must explicitly correct affected references, and the full canonical graph/resource/readiness/protection validators reject dangling or false relationships.

Untouched educational objects retain their original content and order; replacements retain their position and additions append. The canonical selected owner set, scope, retained phases/activities, policy, accepted instruction, provenance, constraints and original allocation context remain complete. All consequential repair context is retained rather than summarized away. The legacy full-artifact instruction/contract exports remain available for existing matched interface measurements; the active compiler repair path never requests or accepts that full-proposal response.

## Splits, protected execution and durable recovery

A split correction addresses the original complete parent task recorded in its receipt. Individual delivery pieces cannot be independently replaced or removed. A protected or retained piece protects the whole family. Unaffected families and receipts survive unchanged. For a changed parent, assembly removes its old unexecuted pieces, rebinds the existing delivery references to the owned parent, then invokes the existing split expansion to derive delivery aliases, cumulative criteria and conserved effort/minutes. Related reference rebinding is deterministic delivery assembly; the AI does not fabricate segment instructions or identities. Retained execution and owned carried shared edges are checked again after that rebinding.

The compiler revalidates the entire assembled candidate, expands declared boundaries, reruns actual deterministic allocation and recomputes forecasts. It checks the resulting verification request against the previously reserved allowance. An infeasible repair retains its accepted education and allocation failure; excessive verification growth retains the repaired allocation without publication or a further model stage. The 8,192 repair and 4,096 verification output caps, root accounting, reservations, reasoning/routing configuration, deadlines, cancellation, lease fencing and single-repair counter are unchanged.

`REPAIR_ACCEPTED` still stores the bounded response and digest before deterministic work. Takeover revalidates and assembles that saved response without redispatching repair. A dispatched repair whose response was lost cannot be silently repeated. Only an explicitly linked new root can retry it under the existing recovery rules.

Legacy pending/accepted repair checkpoints remain schema-readable but **fail explicitly before dispatch/assembly under the new interpretation**. An explicitly linked retry returns their original grounded blocked review to the existing repair admission path, then records `TARGETED_V1`. Already repaired/verifying legacy checkpoints retain their canonical interpretation and existing independent verification path. No stored full proposal is silently treated as corrections, and no migration or budget renewal on ordinary takeover was introduced.

## Verification and measurements

[The verification manifest](evidence/verification.json) collects the final gates, [unit command](evidence/unit-command.json), [static checks](evidence/static-checks.json), [PostgreSQL source snapshot](evidence/postgres-source-snapshot.json) and [source preservation](evidence/source-preservation.json).

- **651 unit tests in 46 files**, including 30 targeted-repair controls: exact untouched-content preservation, complete canonical validation, related dependency chains, removals/dangling references, alias ownership, scope/readiness, protected phases/activities, split parents, joint sharing and matched request measurements.
- **420 required PostgreSQL tests**: 195 V2 cases in 14 files plus 225 current Planner cases in 17 files. The compiler exercises targeted repair → actual reallocation → exact independent verification → sealed candidate, one/two selected owners, saved-response takeover, lost repair/verification handling, linked legacy recovery, actual running Quest identity preservation and rejection of new/previously missed blockers. Existing canonical apply, concurrency, rollback, cancellation, stale context and maximum-envelope guarantees remain in the gate.
- Isolated and full TypeScript, scoped zero-warning ESLint and ordinary Node worker compilation pass. The isolated Next production bundle compiles; its full build remains blocked by the unchanged Acoustics route's `CURATED_SOUNDSCAPES` export. [Build evidence](evidence/step6-build.json) does not claim a fully passing production build.
- All 12 frozen Phase 0 contracts, provider policy/budgets, Phase 1 execution owners, Prisma, API routes and unrelated starting changes are preserved. Generated worker files correspond to the changed intelligence/compiler owners.

[Matched measurements](evidence/repair-complexity.json) exercise the actual compiler request builder with the same complete review context and one corrected criterion. They compare the former full response with the targeted response without paid dispatches:

| Existing activities | Input reservation units before → after | Response JSON UTF-8 bytes before → after |
| --- | --- | --- |
| 1 | 21,217 → 16,993 | 1,370 → 668 |
| 12 | 29,986 → 25,762 | 7,059 → 668 |
| 60 | 68,697 → 64,473 | 31,923 → 668 |

Repair system instructions shrink from **12,508 to 2,196 UTF-8 bytes (82.4%)**. Reservation units are the unchanged conservative provider accounting, not actual model tokens. No paid-token, latency, truncation or educational-acceptance improvement is claimed. A large complete context can still exceed the unchanged root/verification budgets; targeted output does not guarantee that every maximum-size proposal can afford repair.

The disposable PostgreSQL harness runs from a pinned private source copy, excludes hosted/provider credentials, and preserves historical evidence writers inside that copy. An initial run found one fixture that generated an already-corrected plan and therefore never reached its intended repair rejection; that fixture was corrected. Earlier evidence is retained beside the final gate. Source correspondence identifies the exact tested implementation and any unit-only differences; it does not relabel older results as final-source evidence.

## Diagnostic handoff and limitations

[Four separately labelled repair controls](evidence/repair-diagnostics.json) correct recall-only performance, unavailable unit data, invented assessment weighting and compulsory work after success using explicit givens, actions, checks and stopping behavior. They preserve unrelated education and fit the existing verification allowance. Scripted verification exercises grounding, correspondence and publication mechanics; it does **not** establish the production model's educational judgment or constitute independent human adjudication. Existing unresolved-issue tests and the added previously missed defect witness show that correcting the named criterion alone cannot authorize publication.

No paid live tests or Phase 3 work occurred. Next, freeze this source/configuration and follow Astra's already approved controlled diagnostic protocol: eight reasoning packets; the matched structured-output comparison; twelve fixed independently labelled reviewer candidates; four repair/verification cases; and the capacity-sensitivity controls. Keep labels hidden, measure actual tokens/finish reason/latency separately from conservative reservations, and adjudicate disputed severe defects independently. The proposed 64-dispatch diagnostic ceiling is subject to separate paid-test authorization, not an allowance added to production.

Resume the unchanged full qualification corpus and fresh confirmation cases only after the relevant diagnostic boundaries pass. The independently accepted **natural live repair → verification → canonical apply** witness remains outstanding. Replay and deterministic controls cannot substitute for that witness or justify starting Phase 3.
