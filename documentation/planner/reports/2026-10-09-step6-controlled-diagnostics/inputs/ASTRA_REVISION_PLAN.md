<!-- Verbatim assistant final from Codex chat 01a11ebd-2e61-7f52-b651-b5dba3819c09; original precedes Changesets 1–3. Historical evidence, not a new implementation claim. -->
**Keep this inside Phase 2 Step 6: three dependency-ordered changesets, followed by bounded diagnostics.** Preserve the normal path:

**Accepted intent → AI blueprint → deterministic allocation → independent review → candidate → canonical apply**, with the existing optional adaptation and single repair/verification path.

The revision should simplify model responsibilities without creating another planning engine or adding mandatory model calls.

**1. Simplify the model-facing blueprint contract and deterministic assembly.**

Affected owners: [blueprint.ts](/Users/aliumair/Desktop/sylf/lib/planner/v2/intelligence/blueprint.ts), [context.ts](/Users/aliumair/Desktop/sylf/lib/planner/v2/intelligence/context.ts), supporting intelligence schemas and [learning.ts](/Users/aliumair/Desktop/sylf/lib/planner/v2/server/learning.ts).

Introduce one compact internal response format that assembles into the existing canonical `LearningBlueprint`. Keep frozen persistence/execution contracts unchanged.

- AI supplies educational decisions: approach, priorities, scope dispositions, activities, effort, criteria, dependencies, meaningful split boundaries and uncertainty.
- Server supplies structural constants, accepted policy, identity bindings, digests and retained content.
- Remove duplicate schema explanations and repeated context. Provide one authoritative response specification plus concise policy guidance.
- Include adaptation-specific instructions only during adaptation.
- Preserve complete consequential facts, source provenance, exclusions and protected work. Compression must not silently summarize away requirements.
- Avoid multiple independently authored versions of the same decision. Keep genuinely different concepts separate—for example, successful completion versus stopping at a timebox.
- Preserve zero work, one integrated activity, empty phases, deferred scope and early completion as valid educational choices.

Do not introduce default educational estimates, automatic scope dispositions or mechanically generated practice. Missing substantive decisions must remain validation failures.

**Completion criteria:** existing canonical validators still reject invalid references, omitted scope, unsupported readiness credit and protected-work changes. Mapping tests demonstrate preservation of educational content, joint ownership and split semantics. Matched request measurements show lower transport size without lost facts; no arbitrary percentage reduction is required.

**2. Correct grounding, validation recovery and review behavior.**

Depends on the response boundary from changeset 1.

Affected owners: [quality.ts](/Users/aliumair/Desktop/sylf/lib/planner/v2/intelligence/quality.ts), [provider.ts](/Users/aliumair/Desktop/sylf/lib/planner/v2/intelligence/provider.ts), supporting quality schemas and provider/reviewer tests.

Make three focused corrections:

- **Ground actual values.** Match excerpts against the underlying referenced strings, rather than their JSON-escaped representation. Preserve exact ownership and literal correspondence; do not add fuzzy quotation matching.
- **Make correction address the failed response.** The existing fallback should receive bounded rejected content as explicitly untrusted data, alongside precise validation diagnostics. It remains charged against the same call budget. Truncated or unusable output must not be silently salvaged.
- **Preserve review continuity.** For parseable rejected reviews, account for every proposed finding through correction or an explicit, grounded withdrawal. A finding must not disappear merely because its citation was malformed. Invalid findings do not automatically become accepted blockers.

Reduce the reviewer’s rubric to a small set of educational questions: Does this meet the accepted goal? Is the work necessary and proportionate? Are prerequisites/resources available? Are instructions and success criteria achievable and correct? Are uncertainty and allocation represented honestly?

Keep original intent, raw evidence and the complete final candidate available. Generator explanations remain claims to inspect. Avoid requiring long narratives of passed checks.

Also verify the conversation handoff: any selected recommendation that should influence planning must appear in accepted intent or an explicitly accepted instruction field. Do not silently promote conversation text into authority.

**Completion criteria:** quotation/newline regressions pass; fabricated excerpts still fail; malformed review recovery cannot silently erase parseable concerns; invalid output remains unconfirmable. A headless conversation-to-generation test proves accepted educational instructions survive the handoff.

**3. Make the single repair smaller and verify the complete result.**

Depends on changesets 1 and 2.

Affected owners: [compiler.ts](/Users/aliumair/Desktop/sylf/lib/planner/v2/server/compiler.ts), blueprint assembly, quality verification and existing checkpoint support.

Replace mandatory full-proposal regeneration with a small, typed repair response:

- Replace affected educational objects and explicitly identify necessary additions/removals.
- Copy untouched proposal objects deterministically.
- Use owned aliases; reject arbitrary JSON paths, execution identities and changes to retained/protected work.
- Preserve split lineage through existing parent/receipt information, then rerun split expansion and allocation.
- Allow the AI to make the smallest *sufficient* educational correction. Do not constrain it to cosmetic edits when a dependency or criterion also needs changing.

Keep this inside the current compiler. No generic patch framework, new workflow table or separate repair engine is needed.

After assembly, run the existing full structural/reference/protection checks and allocation. Verification must resolve every named issue and inspect the final candidate for other severe defects—including previously missed defects, not only newly introduced ones.

Version any changed supporting response/checkpoint interpretation. Old pending artifacts must either remain readable under their original interpretation or fail explicitly; never reinterpret them silently.

**Completion criteria:** unchanged objects remain identical; modified content is fully revalidated; unresolved or new blockers prevent publication; split/joint/protected-work cases pass. Existing crash recovery, fencing, replay and lost-repair guarantees still pass. Representative repair-plus-verification requests fit existing reservations and deadlines, or fail explicitly with their artifacts retained.

**Run the following diagnostics before another full qualification attempt.**

Prepare the cases, judgments, configuration and thresholds before calling a model. Use fresh domains and learner situations, not rewrites of the 17 existing cases. Existing failures remain regression material.

Pin model, effective thinking/sampling settings, caps, source facts and prompt versions. Change one factor within each comparison. A diagnostic prose response is never executable and adds no production stage.

| Diagnostic | Controlled comparison | Proposed completion criterion |
|---|---|---|
| **Educational reasoning** | Eight fresh intent packets spanning the four policies; ask for a concise educational strategy without compiler serialization. Use identical authoritative facts. | Independently assess goal correspondence, educational usefulness/proportion and evidence/uncertainty. A usable result scores at least 4/5 on each dimension and has no severe defect. Failure identifies a reasoning/configuration problem before serialization. |
| **Structured output** | Run the same packets through the current and compact interfaces under identical settings. Judge educational content separately from parsing. | Compact responses pass strict validation on the first attempt for all eight packets; educational quality meets the same rubric. Record every fallback rather than counting recovered output as first-pass success. |
| **Independent review** | Twelve fixed candidates: four with serious defects, four sound plans, four preference/uncertainty cases. Hide labels from the reviewer. | Detect all four serious defects with valid grounds; falsely block none of the sound plans; distinguish preference/uncertainty from concrete violations. |
| **Repair and verification** | Four fixed defective proposals with independently validated findings; one repair and one verification each. | All named defects resolved, no serious defect remaining or introduced, untouched content preserved, and complete path within existing limits. |
| **Capacity sensitivity** | Two goals × two availability levels × two samples, with other facts unchanged. | No unsupported extra committed work. Evaluate educational contribution and within-condition variation; do not require identical minute estimates. |

These are **small diagnostic entry gates, not statistical proof of production reliability**. Use anchored judgments—“4” means useful without substantive correction—and blind variant labels. Have a second independent assessor adjudicate serious failures and disputed blockers.

The initial protocol requires 52 primary dispatches if every arm runs. Set a **64-dispatch ceiling including fallbacks**, subject to separate paid-test authorization. Stop an uninformative arm when its failure is established; continue useful independent diagnostics within the ceiling. Do not expand the experiment through ad hoc retries.

Interpret results explicitly:

- Good educational prose, poor structured output → simplify transport/assembly further.
- Poor educational content in both formats → investigate the tested model/configuration; more schema instructions are unlikely to help.
- Good generation, unreliable fixed-candidate review → reviewer qualification remains the blocker.
- Good diagnosis, failed repair → repair boundary or available budget remains the blocker.

If diagnostic cases influence subsequent tuning, classify them as development cases and reserve fresh confirmation cases. Do not describe them as held out afterward.

**Efficiency work should initially be measurement-led.**

Record per stage: actual input/output tokens, reserved input units, finish reason, visible output size, latency, fallback count and terminal outcome. Record reasoning-token counts only where the provider exposes them; do not infer exact counts from text length.

First measure whether context reduction and bounded repair make the path affordable. The current conservative reservation method stays authoritative during that test.

| Classification | Scope |
|---|---|
| **Necessary within this revision** | Compact model boundary; grounding correction; meaningful validation recovery; reviewer calibration; bounded repair; complete-result verification; effective-setting telemetry; conversation handoff verification. |
| **Optional, evidence-dependent** | Provider-enforced schemas, a validated tokenizer-based reservation estimator, alternative reasoning settings, different reviewer routing. Evaluate only when a specific remaining failure justifies them. |
| **Separate explicit policy/contract decision** | Changing production model/reasoning policy, budget ceilings, reservation authority or output allowances. These are not automatically architecture redesigns. |
| **Architectural change requiring approval** | Changing frozen educational/execution semantics, adding mandatory reasoning stages or repair loops, weakening independent review, or creating another lifecycle/execution pathway. None is proposed here. |

Provider-enforced structure can improve formatting; it cannot substitute for educational evaluation. A different reviewer model might improve error detection, but should not become a mandatory expense without comparative evidence.

**Full qualification resumes only after the relevant diagnostic gates pass on one frozen source/configuration snapshot.**

Then run:

- The unchanged 17-case corpus plus fresh confirmation cases.
- The independently accepted **natural repair → exact verification → canonical apply** witness.
- Required unit, PostgreSQL, typecheck, lint and worker/build checks appropriate to the touched systems, preserving all Phase 1 guarantees.
- Separate reporting of educational acceptance, technical completion, usage and latency.

Replayed defects qualify diagnostic behavior; they do not satisfy the natural live repair witness. If no qualifying witness occurs within the agreed run budget, leave that gate open rather than repeatedly generating until a favorable example appears.

The immediate implementation deliverable should be **changeset 1’s compact contract and mapping tests**, followed by recovery/review and repair. Phase 3 stays paused until Step 6’s existing acceptance requirements are met. No implementation or paid tests have been performed for this plan.
