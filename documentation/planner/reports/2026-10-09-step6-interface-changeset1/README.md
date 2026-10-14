# Phase 2 Step 6 intelligence interface — Changeset 1

Status: **IMPLEMENTED; OFFLINE REGRESSIONS PASSED**. The isolated production build retains the unchanged Acoustics route-export blocker. Phase 2 educational qualification remains incomplete. No paid calls or Phase 3 work were performed.

## Scope and basis

This implements only the compact blueprint interface and deterministic assembly from the approved revision plan in the task conversation. The [approved architecture, section 8](../../PLANNER_TARGET_ARCHITECTURE.md#8-ai-boundary-and-learningblueprint) assigns educational judgment to AI and identities, validation, allocation and execution to deterministic owners. The [Step 6 boundary investigation](../2026-10-03-phase-2/STEP_6_BOUNDARY_FIXES.md) and [recorded qualification blockers](../2026-10-03-phase-2/STEP_6_BLOCKERS.md) distinguish output-envelope/structured-output failures from educational acceptance. This change reduces avoidable output responsibilities; it does not establish that the model now reasons or reviews reliably.

The frozen canonical blueprint, intent, revision, checkpoint, quality and execution contracts are unchanged. This is a provider transport change within the existing engine, not an architectural redesign. It adds no model stage, persistence entity, educational default, workload floor or call allowance.

## Implemented interface

[The compact response schema](../../../../lib/planner/v2/intelligence/schemas/blueprint-response.ts) derives educational fields and bounds from the existing canonical schema. [The generator and assembler](../../../../lib/planner/v2/intelligence/blueprint.ts) use it for BLUEPRINT and ADAPTATION.

| Responsibility | Compact response | Canonical assembly |
| --- | --- | --- |
| Selected Plan | `planRef` using supplied aliases | Validate the exact selected owner set |
| Blueprint content | `strategy`, `scope`, `activities`, `decisions` directly on each Plan entry | Construct the existing `blueprint` wrapper |
| Policy/version | Supplied in authoritative input; omitted from output | Copy the accepted intent policy and frozen version constant |
| Replacement | One replacement object; no `REVISE` marker | Supply the existing internal replacement decision |
| Effort | Required `[lowMinutes, likelyMinutes, highMinutes]`; phase effort remains optional | Expand values without estimating, rounding or changing them |
| Adaptation | Explicit KEEP/reason or a complete replacement; optional justified recovery reduction | Preserve the existing adaptation and recovery restrictions |
| Identities/receipts | AI chooses local graph aliases; no durable IDs or receipts | Existing owners retain protected identities and compute canonical digests; execution sealing remains downstream |

All educational fields remain available: meaningful phases/readiness criteria, full scope dispositions/contributions/reasons, instructions and criteria, effort uncertainty, ordered priorities, optional/contingent commitments, resource/evidence references, hard/advisory dependencies, split boundaries, day-gap windows, cognitive demand, stage, stopping conditions, assumptions, trade-offs, uncertainty and joint shared prerequisites. No missing educational values or arrays are filled by assembly. Zero work, no phases and unspecified phase effort retain their existing meanings.

The model receives one schema-derived field inventory and its enum/bound descriptions instead of the canonical wrapper instructions and specimen plan. The same educational guidance and policy guidance remain; adaptation guidance is included only for adaptation. Consequential input is unchanged: requested/resolved context, quoted evidence/provenance, calendars, allowlists, retained work, previous proposals, allocator feedback, binding constraints and split receipts. Existing lossless calendar factoring remains intact. Distinct calendar windows and original/resolved intent roles are preserved.

## Validation and execution boundary

The path is compact shape parsing → explicit constants/effort expansion → existing `validateLearningProposal` → retained activity/phase assembly → frozen `LearningBlueprintV2Schema` and reference/readiness validation → existing snapshot/digest construction. The allocator, independent review, publication, ApplyService and Focus integration consume the same canonical artifact as before.

Strict parsing rejects canonical receipts, echoed policy/version, canonical wrapper objects, null placeholders, missing educational fields and scalar reference lists. Canonical validation still rejects invalid effort ordering, graph cycles/unknown references, false scope credit, changed exclusions, invalid contingent checkpoints, protected overwrites and shared-owner defects. The joint 60-new-activity limit and 200 stored activities/500 scope nodes/100 phases per Plan remain authoritative. Oversized requests/artifacts still fail explicitly without trimming education.

Response selection uses the declared KEEP shape or the replacement shape directly, preserving specific Zod field paths for the existing provider diagnostics. This is not the Changeset 2 fallback/recovery redesign. Provider routing, reasoning options, output caps, review reserves, metering, cancellation, stale-context checks, deadlines and retry allowances are unchanged.

The full-artifact REPAIR prompt, response contract and validator remain available to the existing compiler. The repair prompt and existing assembly validator are identical to the starting workspace ([preservation evidence](evidence/repair-preservation.json)). Stored checkpoints already contain canonical blueprints, so no schema migration or reinterpretation of saved work is required. Generation/adaptation do not silently accept legacy output as a compatibility fallback.

## Measured complexity

[The offline comparison](evidence/complexity.json) constructs exact old/new requests with identical consequential inputs and proves equality of the resulting canonical artifacts. These are independent synthetic sizing fixtures, not the 17-case educational acceptance corpus.

| Witness | Input reservation units before → after | Output JSON UTF-8 bytes before → after |
| --- | --- | --- |
| Initial generation, 1 activity | 17,819 → 14,418 (19.09% smaller) | 1,346 → 1,192 (11.44% smaller) |
| Initial generation, 12 activities | 17,819 → 14,418 (19.09% smaller) | 7,035 → 6,408 (8.91% smaller) |
| Initial generation, 60 activities | 17,819 → 14,418 (19.09% smaller) | 31,899 → 29,208 (8.44% smaller) |
| Adaptation, 60 previous activities | 52,731 → 50,740 (3.78% smaller) | 31,899 → 29,208 (8.44% smaller) |

Generation system instructions shrink from 12,129 to 7,491 UTF-8 bytes (38.24%); adaptation instructions are 8,644 bytes (28.73% smaller). Large adaptation inputs still contain the full previous canonical proposal, so their percentage reduction is smaller. The response loses one wrapper nesting level and repeated effort-object property names, while retaining each estimate and educational field.

“Input reservation units” are the existing conservative UTF-8 provider-boundary reservation, including JSON escaping and message overhead. They are not measured model tokens. No latency, paid-token savings, improved educational acceptance or truncation elimination is claimed.

## Verification

[Final verification](evidence/verification.json) records:

- **582 unit tests in 44 files**, zero failures or required skips; 31 new compact-interface tests are included ([results](evidence/units.json), [reproducible command](evidence/unit-command.json)). The existing 500 independent allocator oracle fixtures also pass.
- **409 required PostgreSQL tests**: 184 V2 and 225 existing Planner cases, zero failures or required skips ([harness](evidence/postgres/postgres-harness-run.json), [command/source preparation](evidence/postgres-command.json), [V2 cases](evidence/postgres/postgres-phase1-results.json), [existing cases](evidence/postgres/postgres-current-results.json)). The deliberately opt-in paid-provider test is excluded by the existing credential-free harness, not counted as a required skip. Existing compiler → review → apply, cancellation/takeover, legacy repair/verification, protected execution and 400-Quest publish/read/apply witnesses pass.
- Isolated intelligence and whole-repository TypeScript, compiled ordinary Node worker build and warning-free scoped ESLint pass ([commands/results](evidence/static-checks.json)). PostgreSQL also exercises ordinary Node compiled generation/compiler handlers.
- All **12 frozen contracts** match Phase 0. All **217 existing execution-server, Prisma and API files** are unchanged from the working-tree start. Every pre-existing file is compared against the 4,915-file baseline; unrelated dirty changes and historical evidence are preserved ([source preservation](evidence/source-preservation.json), [baseline hashes](evidence/source-baseline.json)).

The [maximum-envelope database witness](evidence/maximum-postgres.json) records real publication/read/apply with two Plans, 200 activities/500 scope nodes/100 phases per Plan, 400 Quests/links and an explicit oversized model-context rejection before dispatch. These are trusted technical fixtures and do not establish educational quality.

Mapping tests cover all optional capabilities, explicit zero-work decisions, Unicode/quoted instructions, complete scope, retained phases/activities, joint ownership, recovery restrictions and maximum counts; rejection tests exercise both transport and canonical authorities. Provider mocks verify the existing dispatch purpose, output allowance, review holdback and one-call normal generation path. PostgreSQL fixtures emit compact output only for BLUEPRINT/ADAPTATION; review, verification and legacy repair protocols retain their original shapes.

The production build compiles the application bundle, then fails on the pre-existing Acoustics `CURATED_SOUNDSCAPES` route export. The affected route is unchanged from the starting workspace. [Build output](evidence/step6-build.log) and [source-pinned build result](evidence/step6-build.json) preserve that limitation; unrelated routes were not modified.

The database harness runs in a temporary source copy to prevent its maximum-envelope witness from overwriting prior Step 6 evidence. It strips hosted/provider credentials and starts only a disposable PostgreSQL runtime. The first copy lacked the existing archived catalog imported by a route suite; its 170 passed cases and suite-load failure remain in [initial-attempt evidence](evidence/postgres-initial-attempt/postgres-harness-run.json). The import closure was restored in the temporary copy without modifying application code or weakening assertions.

## Changeset 2 handoff

Proceed with the approved review/validation-recovery fixes before paid qualification. Changeset 1 leaves these owners and problems unchanged:

- [Quality grounding](../../../../lib/planner/v2/intelligence/quality.ts): evaluate evidence against original field text, including quotes, escapes and Unicode; retain exact requested/resolved goals, provenance and actual allocation. Verify concrete contradiction, unsupported-assumption and unnecessary-work detection independently of generation.
- [Provider validation recovery](../../../../lib/planner/v2/intelligence/provider.ts): use precise bounded structural diagnostics and the rejected response as authorized by Changeset 2, without losing authoritative context or resetting budget/deadline/usage. Compact shape errors now supply direct transport field paths; canonical validation still reports against the assembled artifact. Account for that distinction in recovery diagnostics. Fallback behavior itself is unchanged.
- [Compiler review orchestration](../../../../lib/planner/v2/server/compiler.ts): preserve independent acceptance, the canonical artifact boundary and durable checkpoint semantics. An empty mock review is technical evidence only.

Keep educational reasoning, compact structured output, independent review and repair as separate controlled diagnostics before the full live corpus. Use this report's offline equivalence/rejection/size evidence as the structured-output baseline. Review diagnostics need independently labelled sound/flawed artifacts rather than relying on the generator's self-assessment. Subsequent repair diagnostics must establish that the named defect resolves without new defects, then verify the resulting allocated canonical artifact before ApplyService. Do not claim the required natural live repair → verification → apply witness from these fixtures.

Changeset 3's bounded repair redesign remains pending. The legacy full-replacement repair path is deliberately retained until that work. No Phase 3 UI, model/configuration experiment, paid test or Phase 2 completion claim is included here.
