# Phase 2 Step 6 interface revision — Changeset 2

Changeset 2 implements literal grounding, recovery of the actual rejected response, accountable review correction/withdrawal, a shorter independent rubric, and the explicitly accepted conversation-to-generation handoff. It builds on [Changeset 1](../2026-10-09-step6-interface-changeset1/README.md). This is an offline technical completion record; Phase 2 educational qualification remains incomplete.

The approved revision plan and intelligence audit are recorded in the parent Codex conversation. The implementation follows the [target architecture](../../PLANNER_TARGET_ARCHITECTURE.md), [current Phase 2 boundaries](../2026-10-03-phase-2/README.md), and [existing Step 5 compiler](../2026-10-03-phase-2/STEP_5.md). Source and regressions establish the changes below. No paid tests, model/configuration experiment, Changeset 3 repair protocol or Phase 3 UI was introduced.

## Implemented boundaries

| Owner | Change | Preserved authority |
| --- | --- | --- |
| [Quality input and validators](../../../../lib/planner/v2/intelligence/quality.ts) | Decode registered JSON and search individual original string values; use a five-question independent rubric; account for every parseable rejected concern | Exact owned refs, literal excerpts, strict selected targets, issue identities, severity rules, original/resolved goals, provenance and complete allocation |
| [Metered provider](../../../../lib/planner/v2/intelligence/provider.ts) | Supply bounded diagnostics and the actual rejected response as explicitly untrusted data to existing fallback | Configured routes, reasoning options, call/output caps, root budget, holdbacks, deadlines, cancellation, accounting and late-usage fencing |
| [Supporting quality schemas](../../../../lib/planner/v2/intelligence/schemas/quality.ts) | Add strict conditional recovery dispositions, bounded pending concerns and accepted recovery receipts | Frozen canonical QualityReport/LearningBlueprint contracts and existing checkpoint lifecycle |
| [Compiler](../../../../lib/planner/v2/server/compiler.ts) | Save pending concerns before fallback, restore them on takeover, retain accepted correction/withdrawal receipts | Existing fresh ownership/context/source checks, reviewed allocation correspondence, one repair and protected publication |
| [Learning compiler](../../../../lib/planner/v2/server/learning.ts), [compact request](../../../../lib/planner/v2/intelligence/blueprint.ts) | Forward the immutable Attempt's explicitly accepted instruction to generation/adaptation and independent review | Canonical goals/exclusions/hard facts, protected work, compact assembly and the existing execution pathway |

### Grounding

The previous `entry.text.includes(excerpt)` searched JSON serialization rather than the source values. Quotes and newlines acquired JSON escapes, while keys and serialized structural fragments could pass as evidence. The registry remains lossless and unchanged in representation; validation now parses that server-owned JSON and searches each individual string value. It does not join fields, match keys/numbers, alter case, normalize Unicode, paraphrase or perform fuzzy matching. Ownership and blocker requirements remain authoritative. Review and verification use the same check.

The review input still contains the original and resolved goals, explicit accepted instruction, raw dated learning/saved checks and provenance, research excerpts/applicability/uncertainty, exclusions, complete scope/phases/dependencies, retained resources, protected execution, original split receipts, workload arithmetic and actual allocation. Existing calendar/path/split factoring remains lossless. Generator explanations remain proposals to inspect; no provider route or generator self-assessment grants approval.

### Rejected response recovery

Each existing fallback receives sanitized deterministic diagnostics plus at most **8 KiB** of rejected model text. Complete small responses are supplied exactly. Larger responses include an exact prefix/suffix with UTF-8-safe code-point boundaries, original byte count and disclosed omissions. Clipped text is never parsed or accepted as an artifact. Model output is explicitly untrusted; it cannot supply consent, hard facts, permissions or instructions. Exception messages and provider diagnostics are not forwarded. Compact generation instructions identify how canonical wrapper/effort diagnostics relate to the compact shape.

Feedback covers schema/semantic rejection, truncation, incomplete finish and missing accounting usage. Usage settlement/unknown-spend accounting and call closure remain in the existing dispatcher. The complete augmented request is reserved before dispatch under the same root and remaining budget. There are no additional routes, mandatory calls, retry loops, deadlines or increased reserves. If recovery does not fit, it fails explicitly.

### Review continuity

Only parseable concerns are identified; malformed JSON is not salvaged through heuristic extraction. A bounded scan recognizes review `issues`, verification `newIssues`, and finding-shaped objects even inside malformed root/plan/field wrappers; it does not accept or repair that structure. They accumulate recovery-only concern references, source paths/digests, valid original owner/issue identity where available, and the rejected finding as untrusted data. Identical concerns are deduplicated without erasing distinct concerns. The scan visits at most 4,096 objects/arrays. Diagnostic paths are bounded and disclose clipping; the complete finding and source digest remain intact. The complete pending set is limited to **60 concerns and 16 KiB**, including its transport wrapper; overflow or unretainable malformed data fails closed rather than trimming or changing concerns.

An existing fallback must account for each concern exactly once through one of:

- **CORRECTED:** retain its valid original owner/issue identity and link a returned finding that passes the complete schema, reference and grounding validators.
- **WITHDRAWN:** explicitly explain why the concern is unsupported and quote both original REQUIREMENT/OBSERVATION and PROPOSAL evidence. Rejected claims cannot ground their own withdrawal.

Omitted, duplicate, unsolicited, renamed, unlinked or ungrounded dispositions fail validation. Invalid concerns are never automatically promoted into canonical blockers. A sound plan can pass after an unsupported objection is explicitly withdrawn; warnings, preference and reasonable uncertainty retain their existing meanings.

Pending concerns are saved through the existing compiler checkpoint before another configured dispatch. Takeover receives that set as untrusted recovery data and cannot silently start from an empty review. Failure to save stops recovery. On acceptance, the checkpoint clears pending rejected text and stores only the bounded source metadata and validated dispositions. This adds supporting receipts, with no migration, new lifecycle state or execution owner. Old saved pending input digests are never silently rebound to the new input; correspondence checks continue to fail closed when inputs differ.

### Explicit conversation handoff

`AssistantService.prepare` already saves the human-selected recommendation's exact `change` as `Attempt.acceptedRequest.text`, with owned selected targets and authorization. Generation previously omitted that text. It now receives `acceptedRequest: {text, authorization: "PLAN_ACTION"}` copied from the immutable owned Attempt. Adaptation retains it; independent review/verification receives the same instruction and a REQUIREMENT grounding entry. Repair's existing review context also retains it.

Unaccepted conversation, arbitrary model suggestions and conversation history are not promoted into instructions. Acceptance grants the bounded plan preparation requested through the existing server action; canonical exclusions, resources, hard facts and protected execution still constrain it. No candidate auto-applies.

## Verification and measured complexity

Final technical verification is recorded in [the verification manifest](evidence/verification.json), [unit command/results](evidence/unit-command.json), [static checks](evidence/static-checks.json) and [disposable PostgreSQL gate](evidence/postgres/postgres-harness-run.json).

- **621 unit regressions in 45 files**, zero failures or required skips: frozen contracts, compact assembly, provider/routing/research boundaries, independent quality, literal escapes/Unicode, accountable fallback, persistence failure and current Planner regressions.
- **414 PostgreSQL regressions**, zero failures or required skips: 189 V2 cases in 14 files and 225 current Planner cases in 17 files. They exercise actual durable services, compiled worker supervision, generation/repair/verification, candidate sealing, canonical apply, ownership, cancellation, atomicity and protected execution.
- Isolated Planner and full repository TypeScript checks, scoped ESLint with zero warnings, and the ordinary Node worker build pass.
- The isolated Next production bundle compiles, then fails on the unchanged `app/api/acoustics/route.ts` export `CURATED_SOUNDSCAPES`. [Build evidence](evidence/step6-build.json) records that existing blocker; this report does not claim a fully passing production build.
- [Source preservation](evidence/source-preservation.json) verifies the frozen Phase 0 contracts and unrelated starting-workspace changes. API, Prisma and Phase 1 owners remain unchanged. Only the listed intelligence/compiler owners, regressions, documentation and their generated worker outputs changed.

[Exact reviewer instruction measurements](evidence/reviewer-complexity.json) show REVIEW **7,142 → 4,071 UTF-8 bytes (43.0% smaller)** and VERIFICATION **7,935 → 4,609 bytes (41.9% smaller)**. These are runtime system-instruction bytes, not measured provider tokens. Output caps remain 4,096. Normal review output retains its existing shape; conditional recovery adds only the needed concern dispositions. No consequential input was removed to achieve these reductions. [Compact interface measurements](evidence/compact-complexity.json) and [maximum serialization evidence](evidence/serialization.json) retain Changeset 1's separate structural baseline.

The PostgreSQL harness uses a private source copy, strips hosted/provider credentials and starts a disposable local database. Its existing maximum-envelope writer runs inside that copy, preserving prior reports. Earlier 414-case runs passed; final recovery safeguards and a schema-consistent reviewer example were followed by a complete pinned gate. [Initial evidence](evidence/postgres-initial-attempt/postgres/postgres-harness-run.json) is retained. [Final snapshot](evidence/postgres-source-snapshot.json) and correspondence checks identify the tested source. One test callback type annotation was added after that gate; [source/emission correspondence](evidence/postgres-test-type-correspondence.json) verifies that its runtime behavior is unchanged. Final unit/type gates also cover the separate labelled reviewer fixtures; no historical gate writer was changed.

## Independent diagnostic boundary

[The labelled fixtures](../../../../__tests__/planner-v2/intelligence/review-fixtures.ts) provide **12 fixed candidates**: four serious defects, four sound plans, two preferences and two reasonable uncertainties. Expected labels are assigned separately from provider responses and stay outside the review request; no human adjudication or live-model evaluation is claimed. Cases include unavailable authentic work, excluded/unnecessary prerequisites, inadequate performance criteria, excess repetition, self-created givens, valid alternative checks, honest resource alternatives and supported learning before independent performance. They do not derive from or specialize to the existing 17 live cases.

[Diagnostic observations](evidence/review-diagnostics.json) confirm strict grounded blockers for the four labelled defects, no blockers for the four sound plans, advisory preferences and nonblocking uncertainty. Scripted adapters supply the findings: these results verify the independent review boundary and classification/recovery mechanics, **not the current model's educational accuracy**. False objections are also exercised separately: empty fallback is rejected, grounded correction retains identity, and grounded withdrawal permits a sound plan to pass without repair.

Headless PostgreSQL tests exercise actual assistant recommendation → explicit preparation → immutable Attempt → compact generation → allocation → independent review → sealed canonical revisions for **one and two selected owners**. The exact accepted recommendation, including quotations, a newline and Unicode, reaches both model-facing stages and the canonical activity instructions. Before explicit preparation there is no Attempt; before ApplyService there is no Quest. The foreground call transfers once, and the two normal planning calls bring the shared count to three. Existing stale/forged target and unaccepted-advice regressions remain included. A separate takeover fixture proves saved concerns survive without renewing the original root deadline.

## Changeset 3 handoff

Changeset 2 is ready for the approved minimal repair work; Phase 2 and live educational acceptance are still open.

1. Keep the compact generation interface, literal grounding, accountable recovery, full consequential review input and accepted-instruction handoff as the diagnostic baseline.
2. Implement the approved bounded repair response for affected educational objects. Keep AI responsible for the educational fix and deterministic code responsible for assembly/reference validation. Do not add a second reasoning stage, another repair, educational defaults, generic patch machinery or relaxed validators.
3. Revalidate the complete resulting canonical candidate, then deterministically reallocate and independently verify the original exact issues plus any new consequential defects. Retain the existing saved-response, source/identity/context correspondence, holdback and publication guarantees.
4. Run isolated repair diagnostics on separately labelled defects and sound-plan controls before repeating full qualification. Demonstrate defect resolution without collateral educational loss or new workload. Measure input/output size, spend and latency separately from educational acceptance.

When paid diagnostics are explicitly authorized, evaluate reasoning, compact structured output, independent review and repair separately on frozen inputs/configuration. Reuse the labelled reviewer controls without revealing labels, record false blockers/missed defects and adjudicated withdrawals, then proceed to the full corpus only after these boundaries are reliable. The required natural live repair → verification → canonical apply witness remains outstanding; deterministic fixtures do not substitute for it. No Changeset 3 implementation, paid run, release or Phase 3 start occurred here.
