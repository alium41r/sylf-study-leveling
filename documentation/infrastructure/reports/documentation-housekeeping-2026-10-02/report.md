# Sylf documentation and repository housekeeping — 2 October 2026

## Outcome and scope

Inspected **464 documentation/report/evidence files**: 139 Markdown files, 2 PDFs (37 pages total), 4 text files, 70 JSON files, 18 logs, 229 PNGs, and 2 reproduction HTML files. This includes 74 starter-template documents and deliberately preserved reference/scratch material. Markdown/text contents, report relationships, JSON shapes, log status, screenshot metadata, references, and file fingerprints were inventoried; this was not a fresh visual/product QA run. Dependencies, generated builds, framework internals, browser-profile caches, and third-party scratch tooling are outside the documentation inventory.

Moved **39 documents**, including **38 root documents** and the loose System Hub audit. Of these, 33 remain historical reports, 3 are archived superseded inputs/audits, and 3 are versioned Planner requirements inputs. Nothing was deleted or merged. All moves used direct filesystem renames. All 39 inputs were untracked at inspection, so they had no Git file history to retain. The existing staged renames/deletions and all unrelated uncommitted changes were preserved; nothing was staged or committed by this pass.

The root retains `README.md`, `AGENTS.md`, and `CLAUDE.md` for project guidance, normal configuration/tooling, and `planner-phase5-corpus-results.json` because an existing test writes that exact path. Reference artwork, eye sheets, login assets, and source/reference screenshot folders remain in their established locations.

## Final organization

```text
documentation/
  README.md
  planner/
    README.md
    specifications/                 versioned design/requirements inputs
    reports/{modes,experience,research-upgrade,frontend}/
    archive/frontend-redesign/
  landing-companion/
    README.md
    reports/
    archive/state-polish-handoff/
    qa/, state-polish/, magical-eyes/, celestial-world/, performance/
  pixel-companion/                   existing contract, reports, phase1/, phase2/
  svg-companion/                     existing capability-report.md, capability-test/
  onboarding/{reports/redesign,archive/pre-redesign}/
  system-hub/reports/2026-10-01/
  subjects/reports/lifecycle/
  performance/                      existing Phase 0 and prototype measurement sets
  design/README.md                   index into the existing design-system/
  runbooks/                         existing owner checklist
  infrastructure/reports/documentation-housekeeping-2026-10-02/
security/audit/                      existing audit series, new navigation index
research/spikes/                    existing scaling report
specifications/features/            existing Focus background standard
design-system/                      existing page design guidance
```

No empty feature categories or generic migrations of good companion structures were introduced. Feature indexes pair reports with their evidence, preserving evidence paths used by executable writers.

## Current/canonical documentation and qualified references

- **Current technical documentation:** the pixel asset contract and Focus background content specification stay at their existing paths. Pixel phase reports remain historical.
- **Project guidance:** the root README now links to the central index; package scripts, environment example, and agent instructions remain project-level entry points.
- **Operational guidance:** the existing owner launch checklist is retained, with a warning in the index to reverify dated external-console status.
- **Scoped design guidance:** existing Dashboard, Goals, Timer, and Study Sanctuary directions are linked without claiming every design statement is a verified current behavior.
- **Qualified/ambiguous design references:** the generated hospitality master is not certified as a Sylf-wide contract. The existing landing design note describes the superseded video renderer and refers to missing `docs/landing-companion-motion-qa.md`; it remains at its established path, with the limitation recorded in the design index.
- **Planner, onboarding, and System Hub:** no comprehensive current prose specification was established. Short indexes identify current source/contracts/tests and relevant history instead of synthesizing new feature specifications from old reports.
- **Starter template:** its architecture, migration doctrine, and onboarding documents remain template references, not Sylf's current implementation authority.

## Moves and historical classification

Every moved file is listed below and in [the move manifest](evidence/moves.json). Basenames and historical content are preserved, apart from necessary document-locator repairs.

| Original path | Final path | Classification |
| --- | --- | --- |
| `AI_PLANNER_CLASSIC_MODES_COEXISTENCE_REPORT.md` | `documentation/planner/reports/experience/AI_PLANNER_CLASSIC_MODES_COEXISTENCE_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_EXPERIENCE_PHASE_0_ARCHITECTURE_REPORT.md` | `documentation/planner/reports/experience/AI_PLANNER_EXPERIENCE_PHASE_0_ARCHITECTURE_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_EXPERIENCE_PHASE_1_QUICK_PLAN_REPORT.md` | `documentation/planner/reports/experience/AI_PLANNER_EXPERIENCE_PHASE_1_QUICK_PLAN_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_EXPERIENCE_PHASE_2_1_DEEPSEEK_RESEARCH_REPORT.md` | `documentation/planner/reports/experience/AI_PLANNER_EXPERIENCE_PHASE_2_1_DEEPSEEK_RESEARCH_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_EXPERIENCE_PHASE_2_RESEARCH_IMPORT_REPORT.md` | `documentation/planner/reports/experience/AI_PLANNER_EXPERIENCE_PHASE_2_RESEARCH_IMPORT_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_EXPERIENCE_PHASE_3_1_PROVENANCE_CLOSURE_REPORT.md` | `documentation/planner/reports/experience/AI_PLANNER_EXPERIENCE_PHASE_3_1_PROVENANCE_CLOSURE_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_EXPERIENCE_PHASE_3_COMPARISON_PREPAREDNESS_REPORT.md` | `documentation/planner/reports/experience/AI_PLANNER_EXPERIENCE_PHASE_3_COMPARISON_PREPAREDNESS_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_EXPERIENCE_PHASE_4_1_LIVE_VERIFICATION_REPORT.md` | `documentation/planner/reports/experience/AI_PLANNER_EXPERIENCE_PHASE_4_1_LIVE_VERIFICATION_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_EXPERIENCE_PHASE_4_COPILOT_REPORT.md` | `documentation/planner/reports/experience/AI_PLANNER_EXPERIENCE_PHASE_4_COPILOT_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_EXPERIENCE_PHASE_5_FINAL_QUALITY_REPORT.md` | `documentation/planner/reports/experience/AI_PLANNER_EXPERIENCE_PHASE_5_FINAL_QUALITY_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_MODES_PHASE_0_ARCHITECTURE_REPORT.md` | `documentation/planner/reports/modes/AI_PLANNER_MODES_PHASE_0_ARCHITECTURE_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_MODES_PHASE_1_REPORT.md` | `documentation/planner/reports/modes/AI_PLANNER_MODES_PHASE_1_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_MODES_PHASE_2_5_INTELLIGENCE_A1_REPORT.md` | `documentation/planner/reports/modes/AI_PLANNER_MODES_PHASE_2_5_INTELLIGENCE_A1_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_MODES_PHASE_2_REPORT.md` | `documentation/planner/reports/modes/AI_PLANNER_MODES_PHASE_2_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_MODES_PHASE_3_ROADMAP_REPORT.md` | `documentation/planner/reports/modes/AI_PLANNER_MODES_PHASE_3_ROADMAP_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_MODES_PHASE_4_MASTERY_REPORT.md` | `documentation/planner/reports/modes/AI_PLANNER_MODES_PHASE_4_MASTERY_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_MODES_PHASE_5_REPLANNING_REPORT.md` | `documentation/planner/reports/modes/AI_PLANNER_MODES_PHASE_5_REPLANNING_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_MODES_PHASE_6_QUALITY_REPORT.md` | `documentation/planner/reports/modes/AI_PLANNER_MODES_PHASE_6_QUALITY_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_RESEARCH_UPGRADE_PHASE_2_1_BUILD_CLOSURE_REPORT.md` | `documentation/planner/reports/research-upgrade/AI_PLANNER_RESEARCH_UPGRADE_PHASE_2_1_BUILD_CLOSURE_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_RESEARCH_UPGRADE_PHASE_2_REPORT.md` | `documentation/planner/reports/research-upgrade/AI_PLANNER_RESEARCH_UPGRADE_PHASE_2_REPORT.md` | historical-report-or-research |
| `AI_PLANNER_RESEARCH_UPGRADE_PHASE_3_FINAL_REPORT.md` | `documentation/planner/reports/research-upgrade/AI_PLANNER_RESEARCH_UPGRADE_PHASE_3_FINAL_REPORT.md` | historical-report-or-research |
| `CHARACTER_COMPANION_REDESIGN_REPORT.md` | `documentation/landing-companion/reports/CHARACTER_COMPANION_REDESIGN_REPORT.md` | historical-report-or-research |
| `COMPANION_STATE_POLISH_HANDOFF.md` | `documentation/landing-companion/archive/state-polish-handoff/COMPANION_STATE_POLISH_HANDOFF.md` | archived-superseded-input-or-audit |
| `COMPANION_STATE_POLISH_IMPLEMENTATION_REPORT.md` | `documentation/landing-companion/reports/COMPANION_STATE_POLISH_IMPLEMENTATION_REPORT.md` | historical-report-or-research |
| `LANDING_CELESTIAL_WORLD_PASS_REPORT.md` | `documentation/landing-companion/reports/LANDING_CELESTIAL_WORLD_PASS_REPORT.md` | historical-report-or-research |
| `LANDING_COMPANION_HANDOFF_REPORT.md` | `documentation/landing-companion/reports/LANDING_COMPANION_HANDOFF_REPORT.md` | historical-report-or-research |
| `LANDING_COMPANION_MOTION_PASS_REPORT.md` | `documentation/landing-companion/reports/LANDING_COMPANION_MOTION_PASS_REPORT.md` | historical-report-or-research |
| `LANDING_COMPANION_PERFORMANCE_FIX_REPORT.md` | `documentation/landing-companion/reports/LANDING_COMPANION_PERFORMANCE_FIX_REPORT.md` | historical-report-or-research |
| `MAGICAL_EYE_SYSTEM_IMPLEMENTATION_REPORT.md` | `documentation/landing-companion/reports/MAGICAL_EYE_SYSTEM_IMPLEMENTATION_REPORT.md` | historical-report-or-research |
| `ONBOARDING_AUDIT_REPORT.md` | `documentation/onboarding/archive/pre-redesign/ONBOARDING_AUDIT_REPORT.md` | archived-superseded-input-or-audit |
| `ONBOARDING_REDESIGN_REPORT.md` | `documentation/onboarding/reports/redesign/ONBOARDING_REDESIGN_REPORT.md` | historical-report-or-research |
| `PLANNER_FRONTEND_REDESIGN_FINAL_REPORT.md` | `documentation/planner/reports/frontend/PLANNER_FRONTEND_REDESIGN_FINAL_REPORT.md` | historical-report-or-research |
| `PLANNER_FRONTEND_UX_GUIDE_AND_REDESIGN_SPEC.md` | `documentation/planner/archive/frontend-redesign/PLANNER_FRONTEND_UX_GUIDE_AND_REDESIGN_SPEC.md` | archived-superseded-input-or-audit |
| `PLANNER_PLAN_DESIGNER_REPORT.md` | `documentation/planner/reports/frontend/PLANNER_PLAN_DESIGNER_REPORT.md` | historical-report-or-research |
| `SUBJECT_EDIT_DELETE_CROSS_APP_REPORT.md` | `documentation/subjects/reports/lifecycle/SUBJECT_EDIT_DELETE_CROSS_APP_REPORT.md` | historical-report-or-research |
| `Sylf_AI_Planner_Experience_Research_Addendum_v1.0.md` | `documentation/planner/specifications/Sylf_AI_Planner_Experience_Research_Addendum_v1.0.md` | versioned-product-requirements-input |
| `Sylf_AI_Planner_Intelligence_Addendum_v1.0.pdf` | `documentation/planner/specifications/Sylf_AI_Planner_Intelligence_Addendum_v1.0.pdf` | versioned-product-requirements-input |
| `Sylf_AI_Planner_Modes_PRD_260924_003225.pdf` | `documentation/planner/specifications/Sylf_AI_Planner_Modes_PRD_260924_003225.pdf` | versioned-product-requirements-input |
| `documentation/system-hub-audit-2026-10-01.md` | `documentation/system-hub/reports/2026-10-01/system-hub-audit-2026-10-01.md` | historical-report-or-research |

## Supersession and duplicate review

Three archive moves have explicit implementation successors: the old onboarding audit diagnoses elements removed by the redesign report; the companion handoff proposes the polish recorded in the later implementation report; the Planner frontend UX specification is a pre-implementation design input followed by Plan Designer and the 30 September layout/setup restructure. They contain useful rationale and were not deleted.

The Modes, Experience, adaptive research, and frontend Planner sequences are separate. Phase labels and reconciliation statements establish the sequences; most reports are untracked, and timestamps alone were not used to fabricate order. Coexistence replaces earlier gating claims; research Phase 2.1 replaces the earlier provider approach; later closure reports qualify earlier findings. No separate adaptive research Phase 1 report was found. Earlier phases were retained as distinct history rather than merged into a final report.

SHA-256 comparison found **no byte-identical root companion report matching an existing structured Markdown report**. Reports with similar subjects retain unique content. Identical screenshots, fractional-sampling evidence, typecheck logs, and overlapping measurements were also retained because their task contexts and frozen evidence roles matter.

## References and navigation

Repaired **32 document locators across 16 moved Markdown documents**: report-to-report references, links to relocated Planner PDFs/requirements, the Designer-to-archived-spec reference, companion follow-up/self links, and report self-references. Changes are limited to links/locators. Historical fenced commands, status snapshots, findings, pending checks, and measurement claims were not rewritten to present-day behavior. See [reference repairs](evidence/reference-repairs.json).

Created 10 useful README/index files:
- `documentation/README.md`
- `documentation/design/README.md`
- `documentation/landing-companion/README.md`
- `documentation/onboarding/README.md`
- `documentation/performance/README.md`
- `documentation/pixel-companion/README.md`
- `documentation/planner/README.md`
- `documentation/svg-companion/README.md`
- `documentation/system-hub/README.md`
- `security/audit/README.md`

Updated the root `README.md` with the documentation entry point and placement rule. Existing pixel/SVG reports, contracts, evidence, manifests, audits, validation, logs, and screenshots were not edited.

## Preserved ambiguity, functional evidence, and large files

- `.browser-qa/` remains the shared, refreshable output of Planner and app-sanity scripts. Reports/indexes link it without pretending each historical run has an immutable copy; existing onboarding captures remain there.
- The root Planner corpus JSON remains because `__tests__/planner/interpretation-corpus.test.ts` writes it. Existing Planner/research corpus/measurement tests continue to write into `documentation/performance/phase-0/artifacts/`; provider smoke tests retain their ignored `scratch/` outputs.
- `scratch/PRD.txt` and `scratch/ADDENDUM.txt` are extraction companions to the original PDFs. They are preserved without treating extraction differences as proof of duplicate originals.
- `scratch/motion-qa/` contains a reproduction harness and captures; scratch source/test sprites, source backups, and the Antigravity starter remain in place. Session/cookie material in ignored scratch is not promoted to documentation or version control. Existing evidence logs also remain subject to the repository's `*.log` ignore rule; this pass did not change that rule or stage files.
- Source/reference images in the root, `landing screenshots/`, and `login design/` have no established report association that justifies a migration. They are preserved; product/public art is untouched.
- Larger files retained for future storage consideration include `scratch/test_lummi.png` (8.78 MB, purpose ambiguous), landing source screenshots (up to 6.00 MB), the pixel Phase 2 browser results (~678 KB), SVG pixel regression results (~675 KB), Lighthouse JSON (~556 KB), frontend inventories (~350–360 KB), and SVG browser results (~302 KB). Large size alone did not justify deletion or relocation.
- Build caches and browser-profile caches were not treated as documentation or cleaned. Older missing template targets and the missing historical landing QA note were recorded rather than given invented replacements.

## Git summary and preservation verification

Task-specific changes are 39 filesystem renames, 32 locator repairs in 16 moved reports, 10 new README/index files, the root README navigation addition, and this report with 5 JSON evidence files. Existing unrelated source diffs and staged operations remain unchanged. Untracked inputs mean `git diff --stat` cannot by itself show these moves; [the inventory](evidence/inventory.json) records original/final paths and hashes.

All **2,354 pre-existing non-cache files** were accounted for: 2,337 remain byte-identical, and the only 17 changed contents are the root README plus the 16 reports with documented locator repairs. This includes **1,344 product/source/asset/test/script files unchanged** and **104 pre-existing pixel/SVG documentation/evidence files unchanged**. The original staged paths, modes, blob IDs, and stages are identical at verification (`git ls-files --stage` comparison). No source, executable script/test, configuration, source/runtime asset, or product behavior change was introduced.

Specifically: application behavior was not intentionally changed; SVG companion behavior, pixel Phase 1/2 implementation, pixel source/runtime assets, Planner functionality, and unrelated features were untouched. No feature refactor occurred.

## Validation

[Validation results](evidence/validation.json) record local Markdown targets/anchors, old paths, root cleanliness, file accounting, hashes, and the Git index. [Protected integrity evidence](evidence/protected-integrity.json) records each existing pixel/SVG document/evidence hash.

The final validation checks **150 Markdown documents and 474 local links/anchors** in scope, including the starter template. There are **zero newly broken links**, no stale absolute moved-document paths, no remaining old move paths, and no root feature reports. Three missing links predate this task and are confined to the starter template: two references to its missing `design-system/MASTER.md`, and one reference to its missing `src/lib/db/supabase.ts`. They were not repaired with guessed targets. The historical landing QA note is a pre-existing missing plain-text reference, documented above.

No existing lightweight documentation validator was found. A temporary read-only path/hash validator was used without adding executable code to the repository. The root README passes scoped `git diff --check`. Application tests, TypeScript, lint, builds, and browser/evidence writers were not run because no executable path or code changed; running writers would refresh historical evidence unnecessarily.

**Future report rule:** put new task reports in `documentation/<feature>/reports/<task-or-phase>/`, with QA evidence beside the report in `evidence/`; preserve established companion/evidence conventions and keep current contracts distinct from history.
