# Final Planner V2 Architecture Review

**2 October 2026 — specification review only; no application code implemented.**

Reviewed the [audit](../2026-10-02-end-to-end-audit/AUDIT.md), the complete prior target plan and pre-implementation review, and their reconciled [target architecture](../../PLANNER_TARGET_ARCHITECTURE.md). The target file was absent at the start of this final pass; it has now been written with the required corrections integrated. Readiness below refers to that amended specification.

## 1. Final verdict

**READY FOR IMPLEMENTATION**

The architecture now provides the foundation for a highly capable personal study strategist: flexible advice, relevant context, bounded research, sophisticated educational planning, realistic allocation and selective adaptation over one trustworthy lifecycle. No further architecture-review phase is necessary. The next step is implementation planning/execution, beginning with Phase 0.

This is architecture readiness, not evidence that model quality or production performance has already met the release bar. Those outcomes require the specified held-out evaluation and real database/browser qualification.

## 2. Remaining blockers

None identified after the amendments and adversarial rechecks. Four concrete contradictions caught during this pass were resolved in the specification: research changing an already pinned intent, diagnostic reports implying action consent, client-only pause authority, and long research advice lacking a durable runtime.

## 3. Remaining minor amendments

None required before Phase 0. Processing versus queue deadlines and the default pacing policy have also been clarified. Concrete schema field sizing, migration scripts, worker launch commands and provider configuration are implementation work within the selected architecture.

## 4. Intelligence readiness

The model can reason in prose, compare alternatives, challenge assumptions and retrieve relevant context. Its educational contract expresses priorities, contribution, evidence, uncertainty, activities, useful resources, prerequisites, conditional work and stopping conditions. It receives real capacity before planning and meaningful schedule feedback afterward. Exact dates and execution mutations remain outside model authority.

The adversarial scenarios have explicit routes:

| Situation | Supported reasoning/action |
| --- | --- |
| Study first / papers versus theory | Compare contribution, urgency and evidence; advise without revising anything. |
| Concepts understood, solving poor | Distinguish method selection/application from conceptual gaps; propose useful practice rather than generic relearning. |
| Four days / sacrifice scope | Use assessed importance and capacity, explain omissions and prioritize feasible preparation. |
| Unknown weakness | Retrieve recent evidence, ask one useful diagnostic when consequential, or use a conditional check. |
| Exhaustion / finish earlier | Reconsider useful workload and intensity; preserve learning intervals and explain readiness trade-offs. |
| Only study if necessary | Keep remediation contingent until evidence and explicit action justify scheduling it. |
| Missed three days / suddenly free | Reallocate first; reassess pedagogy when needed. Spare time does not automatically become more work. |
| Two exams | Read competing goals for advice; prepare a joint two-target change only when explicitly requested. |
| “Don’t change it yet” | Answer only. No intent, revision, candidate or Quest mutation. |

There is no architectural guarantee of excellent judgment. Model selection, grounded prompts, evidence quality, estimate calibration and human-scored evaluation determine whether this foundation reaches the intended standard.

## 5. Research readiness

The full identity → gap → retrieval → applicable claims → canonical intent → educational plan flow is specified. Cambridge code/component/cycle, NUST test/programme applicability and uploaded-course assessment sections can be resolved without pretending generic model knowledge is verified research. Material ambiguity requires clarification; sufficiently supported requested research can be adopted without making the student manually transcribe a syllabus.

Targeted PDF sections, late tables, OCR gaps, excerpt support, issuer authenticity and applicability are distinct responsibilities. Requested and resolved intent versions prevent research from rebinding an old attempt to newer student input. Long research-only advice has recoverable zero-target attempts and cannot publish Plan changes. One focused follow-up and shared budgets keep this useful without creating an autonomous research platform.

## 6. UX readiness

The journey is describe → zero to three consequential questions when contextualized → compact review → confirm. Optional controls edit the same intent. Above the fold, the student sees useful effort, finish, approach and the main trade-off; detailed activities, assumptions and sources are progressive. Active Planner retains today/next, remaining effort, milestones, schedule health and advice. Internal strategy/state terminology is not mandatory user configuration.

The important risk is presentation discipline: implementing every available field as a visible control would defeat this design. The acceptance matrix explicitly tests effort and review comprehension.

## 7. Lifecycle and data-integrity readiness

Intent versions prevent relabeling old artifacts; Attempts separate runtime from immutable revisions; candidate versus active preserves confirmed execution during failed updates. Consequential dependencies prevent irrelevant staleness while detecting capacity/execution changes. The shared apply transaction, owned references, SQL membership/immutability guards and receipts preserve the strongest current guarantees.

Every important artifact has intent/context/research/attempt provenance, confirmation state, execution lineage and a meaningful diff. Research advice is explicitly read-only even though it uses the queue. All execution writers, including SQL RPCs and zero-second Focus starts, must share coordination; this is a Phase 0 inventory and Phase 1 gate.

## 8. Replanning readiness

Calendar-only updates reuse education. Semantic updates regenerate the affected dependency closure and preserve exact unaffected work. Content equality includes instructions and criteria. Actual history and completed content remain protected; a server-acknowledged pause allows the remaining part of started work to move. Purpose changes use explicit withdrawal/continuation with completion/reward guards.

Joint changes pin both Plans, allocate once and apply atomically. Shared work has one owning Quest; dependent Plans cannot silently lose a hard prerequisite. Diagnostic evidence alone authorizes neither proposal preparation nor execution changes.

## 9. Performance and runtime readiness

Normal call counts, including interpretation when needed, are explicit:

| Request | Normal model calls |
| --- | --- |
| Known-scope new plan | 3; 2 from accepted ready intent |
| Research-backed plan | 4; 3 from accepted assessment identity |
| Ordinary advice | 1; at most 2 with supplemental context |
| Calendar-only change | 1; 0 for structured input |
| Educational replan | 3; 2 from structured accepted change |
| Long research-only advice | 3; 2 from accepted identity |

Interpretation, research, OCR, fallback, adaptation and repair share one budget. Mandatory review cannot be bypassed when budget runs out. Quality failure retains a resumable checkpoint. The PostgreSQL worker is justified by durable recovery; Next request continuation alone would not provide it. Database-time leases, fencing, cancellation, takeover, accounting and supervised deployment are specified.

Under-thirty-second median normal generation is plausible, not demonstrated. Cold research/OCR and repair have separate targets and honest progress. Queue wait is measured, foreground interpretation consumes budget, and takeover cannot reset deadlines.

## 10. Implementation feasibility and complexity

The existing PostgreSQL/Prisma, owned revisions, Quest links, transactions and research adapters provide useful foundations. The substantial risks are duration backfill, SQL/RPC coordination, server-authoritative Focus state, mobile client cutover and worker operations. These require rehearsals and integration tests; none requires another planning architecture.

The retained abstractions earn their cost: immutable intent establishes correspondence; Attempt supplies recovery; quality reports preserve decisions; candidate/active separates proposals from execution; context dependencies establish currentness; the typed change set enables atomic competing-exam updates. Context lookup and assessment profiles are bounded records/functions, not platforms. Conditional work is unscheduled advice. No additional workflow tables, event bus, optimizer or Free/Pro engines are introduced.

## 11. Exact architecture changes still required

None. Required edits have been applied to the target document, including advice/action consent, richer learning evidence, research applicability/adoption, scheduling feedback, contingent work, partial execution, joint goals, shared writer coordination, request budgets, reviewer recovery, worker operations, review hierarchy and held-out/effort measurement.

Additional corrections from this final pass are present: write-once requested/resolved intent binding, zero-target research advice, durable session pause/version, explicit diagnostic consent, shared prerequisite protection, honest processing deadlines and comfortable early completion as the default.

## 12. Recommended first implementation phase

Start Phase 0: inventory every execution writer and supported client; turn the selected contracts into executable schemas/fixtures; establish a real PostgreSQL concurrency harness; map duration/lineage migration; and document supervised worker deployment. Use the audit's systemic failures as regression fixtures. Do not start by replacing forms or tuning prompts. Phase 1 begins only after these gates establish a safe durable/apply foundation.
