# Planner documentation

Reports are task history, including files named `FINAL` or `ARCHITECTURE`. Most were untracked when organized on 2 October 2026, so Git cannot establish their chronology. The sequences below follow explicit phase labels and reconciliation statements in their contents; file timestamps are supporting evidence only.

## Planner V2 target

[Planner V2 target architecture](PLANNER_TARGET_ARCHITECTURE.md) is the decision-complete specification for the proposed redesign, incorporating the audit and pre-implementation review. [Final architecture review](reports/2026-10-02-final-architecture-review/REVIEW.md) records readiness and the first implementation phase. These documents describe the target, not implemented capabilities. [The 2 October audit](reports/2026-10-02-end-to-end-audit/AUDIT.md) remains the primary evidence for the current system's failures and guarantees.

## Current implementation

[Planner V2 Phase 0: Contracts and Evidence](reports/2026-10-02-phase-0/README.md) contains the execution-writer inventory, pure v2 contracts, audit regression fixtures, migration/runtime requirements and reproducible PostgreSQL gate. It does not activate V2 or begin Phase 1.

[Planner V2 Phase 1: Durable Core](reports/2026-10-02-phase-1/README.md) records the implemented intent/attempt/revision persistence, worker recovery, canonical apply, coordinated writers and reviewed duration/lineage adoption. Its gate evidence distinguishes local integrity qualification from repository build blockers and hosted release requirements. Educational intelligence/compiler and the new student workspace remain later phases.

There is no single verified current prose specification. Start with [Planner contracts](../../lib/planner/contracts.ts), [Plan Brief](../../lib/planner/intake/brief.ts), [readiness](../../lib/planner/intake/readiness.ts), and [brief-to-input mapping](../../lib/planner/intake/to-input.ts). Follow [server services](../../lib/planner/server/), [research services](../../lib/planner/research/), [Copilot](../../lib/planner/copilot/), and [Planner routes](../../app/api/planner/).

Frontend entry points are [Classic Planner](../../app/components/AiPlannerPanel.tsx), [Planner workspace](../../app/components/planner/PlannerWorkspace.tsx), [Quick Plan](../../app/components/planner/quick-plan/QuickPlan.tsx), and the [System Planner tab](../../app/system/components/PlannerTab.tsx). See [Planner tests](../../__tests__/planner/) and the [PostgreSQL harness](../../scripts/test-planner-postgres.mjs) for executable contracts. This index does not promote older rollout gates, model choices, quotas, or UI descriptions to current truth.

[Planner V2 Phase 2 progress](reports/2026-10-03-phase-2/README.md) records the ordered intelligence/compiler rebuild. [Step 2](reports/2026-10-03-phase-2/STEP_2.md) implements bounded authoritative model context and shared metered providers. [Step 3](reports/2026-10-03-phase-2/STEP_3.md) implements headless assistant authorization, bounded research/source verification, private documents and atomic adoption. [Step 4](reports/2026-10-03-phase-2/STEP_4.md) implements policy-aware LearningBlueprint generation, deterministic allocation and one bounded educational adaptation. [Step 5](reports/2026-10-03-phase-2/STEP_5.md) implements grounded independent quality, one repair/verification and supervised compiler orchestration into sealed candidates through RevisionService. The existing worker now has educational handlers under its durable-core deployment flag. [Step 6](reports/2026-10-03-phase-2/STEP_6.md) adds the existing generation branch, atomic admission, compiler-to-ApplyService and maximum-envelope technical qualification. [Actual live qualification](reports/2026-10-03-phase-2/LIVE_QUALIFICATION.md) remains an acceptance blocker. The [Phase 2 completion record](reports/2026-10-03-phase-2/COMPLETION.md) states INCOMPLETE and records the exact Phase 3 handoff; no deployment flag or hosted system has changed.

## Development sequences

| Sequence | Reports in reading order | Relationship |
| --- | --- | --- |
| Modes foundation | [0 architecture](reports/modes/AI_PLANNER_MODES_PHASE_0_ARCHITECTURE_REPORT.md), [1](reports/modes/AI_PLANNER_MODES_PHASE_1_REPORT.md), [2](reports/modes/AI_PLANNER_MODES_PHASE_2_REPORT.md), [2.5 intelligence A1](reports/modes/AI_PLANNER_MODES_PHASE_2_5_INTELLIGENCE_A1_REPORT.md), [3 roadmap](reports/modes/AI_PLANNER_MODES_PHASE_3_ROADMAP_REPORT.md), [4 mastery](reports/modes/AI_PLANNER_MODES_PHASE_4_MASTERY_REPORT.md), [5 replanning](reports/modes/AI_PLANNER_MODES_PHASE_5_REPLANNING_REPORT.md), [6 quality](reports/modes/AI_PLANNER_MODES_PHASE_6_QUALITY_REPORT.md) | Distinct implementation phases; Phase 0 is an architecture snapshot, not a current contract. |
| Experience upgrade | [0 architecture](reports/experience/AI_PLANNER_EXPERIENCE_PHASE_0_ARCHITECTURE_REPORT.md), [1 Quick Plan](reports/experience/AI_PLANNER_EXPERIENCE_PHASE_1_QUICK_PLAN_REPORT.md), [Classic/Modes coexistence](reports/experience/AI_PLANNER_CLASSIC_MODES_COEXISTENCE_REPORT.md), [2 import/research](reports/experience/AI_PLANNER_EXPERIENCE_PHASE_2_RESEARCH_IMPORT_REPORT.md), [2.1 DeepSeek/search](reports/experience/AI_PLANNER_EXPERIENCE_PHASE_2_1_DEEPSEEK_RESEARCH_REPORT.md), [3 comparison/preparedness](reports/experience/AI_PLANNER_EXPERIENCE_PHASE_3_COMPARISON_PREPAREDNESS_REPORT.md), [3.1 provenance](reports/experience/AI_PLANNER_EXPERIENCE_PHASE_3_1_PROVENANCE_CLOSURE_REPORT.md), [4 Copilot](reports/experience/AI_PLANNER_EXPERIENCE_PHASE_4_COPILOT_REPORT.md), [4.1 live verification](reports/experience/AI_PLANNER_EXPERIENCE_PHASE_4_1_LIVE_VERIFICATION_REPORT.md), [5 quality](reports/experience/AI_PLANNER_EXPERIENCE_PHASE_5_FINAL_QUALITY_REPORT.md) | Coexistence explicitly replaces Phase 1's gating/navigation claims; 2.1 changes the earlier research provider; 3.1 and 4.1 close specific gaps. Phase 5 preserves unique findings and its device-QA limitation. |
| Adaptive research upgrade | [2 engine](reports/research-upgrade/AI_PLANNER_RESEARCH_UPGRADE_PHASE_2_REPORT.md), [2.1 build closure](reports/research-upgrade/AI_PLANNER_RESEARCH_UPGRADE_PHASE_2_1_BUILD_CLOSURE_REPORT.md), [3 final](reports/research-upgrade/AI_PLANNER_RESEARCH_UPGRADE_PHASE_3_FINAL_REPORT.md) | These reports describe extension and later closure of an existing Phase 1 baseline. No separate upgrade Phase 1 report was found; no chronology is invented for it. |
| Frontend/setup work | [Plan Designer](reports/frontend/PLANNER_PLAN_DESIGNER_REPORT.md), [30 September frontend restructure](reports/frontend/PLANNER_FRONTEND_REDESIGN_FINAL_REPORT.md) | Designer capability and later layout/setup implementation are separate reports, not duplicate finals. |

None of these sequences was merged or deleted. Later closure reports qualify earlier claims, while each phase retains its original reasoning and results.

## Versioned requirements and archived design input

- [Modes PRD v1.0](specifications/Sylf_AI_Planner_Modes_PRD_260924_003225.pdf): draft product/design requirements dated 24 September 2026.
- [Intelligence Addendum v1.0](specifications/Sylf_AI_Planner_Intelligence_Addendum_v1.0.pdf): additive draft requirements dated 25 September 2026.
- [Experience & Research Addendum v1.0](specifications/Sylf_AI_Planner_Experience_Research_Addendum_v1.0.md): requirements/implementation input dated 26 September 2026, additive to the earlier foundation.
- [Archived frontend UX guide/redesign specification](archive/frontend-redesign/PLANNER_FRONTEND_UX_GUIDE_AND_REDESIGN_SPEC.md): pre-implementation diagnosis and proposed design. The Designer report read this input; the 30 September report documents a subsequent setup/layout restructure. Keep the proposals for rationale, and check implementation before applying them.

These versioned inputs are neither disposable output nor verified descriptions of every current feature.

## Evidence and functional locations

| Evidence | Associated work and location rule |
| --- | --- |
| [Browser QA](../../.browser-qa/), [results](../../.browser-qa/results.json), [app sanity](../../.browser-qa/app-sanity.json) | Experience/adaptive research and later sanity work share this refreshable output. Writers remain in [Planner browser verification](../../scripts/verify-planner-browser.mjs) and [app sanity verification](../../scripts/verify-app-sanity.mjs). Onboarding and appearance captures are also present. |
| [Phase 5 corpus JSON](../../planner-phase5-corpus-results.json) | Generated by [interpretation corpus tests](../../__tests__/planner/interpretation-corpus.test.ts). It remains at the writer's functional root path. |
| [Planner/research corpus and measurements](../performance/phase-0/artifacts/) | `plan-designer-corpus.json`, `research-planner-corpus.json`, `research-thinking-cost.json`, and `research-fetch-concurrency.json` are produced by existing tests there. Preserved and indexed rather than migrated. |
| [Mastery smoke](../../scratch/mastery-provider-smoke.json), [rebalance smoke](../../scratch/rebalance-provider-smoke.json) | Existing opt-in test output paths in ignored `scratch/`; retained for reproduction. |
| [PRD extraction](../../scratch/PRD.txt), [addendum extraction](../../scratch/ADDENDUM.txt) | Existing PDF text extracts retained in place. The original PDFs above are the versioned design documents. |

New task reports belong in `documentation/planner/reports/<task-or-phase>/`, with that run's evidence beside them. Do not assume refreshable shared output proves the exact state of an older report.
