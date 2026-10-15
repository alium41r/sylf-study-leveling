# Sylf documentation

Start with the current contracts and feature indexes below. Reports describe a particular task or measurement run; their completion claims and limitations are historical. Source, tests, schema, and configuration resolve disagreements about the current implementation.

## Current documentation and implementation entry points

| Area | Start here | Role |
| --- | --- | --- |
| Project setup | [Project README](../README.md), [package scripts](../package.json), [environment example](../.env.example), [agent instructions](../AGENTS.md) | Project setup and repository rules; read the installed Next.js guides before code changes. |
| Pixel companion | [Pixel asset contract](pixel-companion/pixel-asset-contract.md), [pixel index](pixel-companion/README.md) | **Current technical contract**; Phase 1/2 reports remain historical. |
| Pixel Display | [Pixel Display contract](pixel-display/pixel-display-contract.md), [Pixel Display index](pixel-display/README.md) | **Current technical contract** for the logical pixel-matrix engine: layer boundaries, bounds contract, runtime, and the candidate presentation values Phase 0 chose. |
| Timer lifecycle | [Timer contract and audit](timer/README.md) | Epoch accounting, immediate local ending, durable recovery, atomic settlement, party timers and deployment evidence. |
| Focus backgrounds | [Content specification](../specifications/features/focus-backgrounds-content-spec.md) | Asset/content standards, retained in the existing specifications directory. |
| Planner and research/search | [Planner index](planner/README.md) | Current source entry points, phase sequences, design inputs, and evidence. No comprehensive current prose specification was established by this pass. |
| Sylvie assistant | [Sylvie runtime contract](sylvie/README.md) | Shared persona, selective Archive retrieval, page context, confirmed tools and existing Planner handoff. |
| Landing, SVG, and companion | [Landing index](landing-companion/README.md), [SVG index](svg-companion/README.md) | Current source entry points and distinct historical rig/capability work. |
| Onboarding | [Onboarding index](onboarding/README.md) | Current implementation entry points and pre-/post-redesign history. |
| Authentication | [Authentication experience](authentication/README.md) | Login/signup owners, responsive SVG floating island and canonical companion, appearance, accessibility, and motion. |
| System Hub | [System Hub index](system-hub/README.md) | Collection, Achievements, and Archive implementation and refresh history. |
| Progression celebrations | [Level-up celebration](progression/reports/level-up-celebration/report.md) | Current owner, detection contract, sequence timing, appearance, and its development-only replay control. |
| Visual design and timers | [Design index](design/README.md) | Existing page directions, with the generic master and outdated landing note explicitly qualified. |
| Launch operations | [Owner checklist](runbooks/LAUNCH-CHECKLIST.md), [security audit index](../security/audit/README.md) | Operational checklist and dated security history; reverify external-console status when using it. |

## Reports, archives, and evidence

- [Planner](planner/README.md): Modes, Experience, adaptive research, and frontend reports; versioned requirements are design inputs rather than proof of present behavior.
- [Landing companion](landing-companion/README.md), [pixel companion](pixel-companion/README.md), and [SVG capability work](svg-companion/README.md): separate development histories and their evidence. Their existing evidence structures are preserved.
- [Pixel Display](pixel-display/README.md): the logical pixel-matrix engine — a fourth companion system, distinct from the raster asset contract and the landing rig above. Its [Phase 0 report](pixel-display/reports/phase-0/report.md) records the foundation and the presentation candidates it produced; its [Phase 1 report](pixel-display/reports/phase-1/report.md) records the hardened runtime, mechanical boundary enforcement and performance baseline; its [Phase 2 report](pixel-display/reports/phase-2/report.md) records the Sylf character as composable pixel content; its [Phase 3 report](pixel-display/reports/phase-3/report.md) records the first production integration, in the dashboard character card. Its [Phase 4 report](pixel-display/reports/phase-4/report.md) records the separable density model and the animation/effects system. Its [Phase 5 report](pixel-display/reports/phase-5/report.md) records the Pixel Asset authoring contract, with an [authoring guide](pixel-display/authoring-guide.md) for developers and agents. Its [Phase 6 report](pixel-display/reports/phase-6/report.md) records the modular character and cosmetics system. Its [Phase 7 report](pixel-display/reports/phase-7/report.md) records the Character Customizer. Its [Phase 8 report](pixel-display/reports/phase-8/report.md) records Pixel Studio, where a scholar draws their own companion, and its [engineering audit](pixel-display/reports/engineering-audit/report.md) records the system-wide review after Phase 8: seven defects fixed with regression tests and the recommendations still awaiting a decision.
- [Onboarding](onboarding/README.md), [System Hub](system-hub/README.md), and [subject lifecycle report](subjects/reports/lifecycle/SUBJECT_EDIT_DELETE_CROSS_APP_REPORT.md): feature history.
- [Level-up celebration](progression/reports/level-up-celebration/report.md): current owner and contract for the level-up celebration, with its verification evidence beside it.
- [Performance](performance/README.md), [security](../security/audit/README.md), and [scaling research](../research/spikes/scaling-research-report.md): dated audits, experiments, and research retained in useful existing locations.
- Archives contain the [pre-redesign onboarding audit](onboarding/archive/pre-redesign/ONBOARDING_AUDIT_REPORT.md), [companion polish handoff](landing-companion/archive/state-polish-handoff/COMPANION_STATE_POLISH_HANDOFF.md), and [Planner frontend design input](planner/archive/frontend-redesign/PLANNER_FRONTEND_UX_GUIDE_AND_REDESIGN_SPEC.md). Their feature indexes explain what followed them.
- [Repository housekeeping report](infrastructure/reports/documentation-housekeeping-2026-10-02/report.md) records the inventory, every move, reference repairs, and validation.

Evidence belongs to its feature/task. Existing `phase1/`, `phase2/`, `capability-test/`, `qa/`, and performance `artifacts/` directories stay in place. Executable writers still use [`.browser-qa/`](../.browser-qa/), [the Planner corpus output](../planner-phase5-corpus-results.json), and some `scratch/` paths; feature indexes identify those exceptions. These outputs can be refreshed and are not immutable snapshots of every report that mentions them.

The [existing source archive](../archive/README.md) includes dormant code and source assets; it is separate from documentation archives. The [Antigravity project template](../antigravity%20project%20template/README.md) is a reusable starter with its own documentation, not Sylf's deployed architecture specification.

## Rules for future documentation

1. Do not place generated reports in the repository root. Use `documentation/<feature>/reports/<task-or-phase>/`.
2. Put QA evidence beside its report, preferably in `evidence/`. Respect established feature evidence directories and executable output paths; repair writers and references before any deliberate migration.
3. Put current behavior in canonical/current documentation; preserve useful existing contract and specification locations and link them here.
4. Historical reports are not automatically the source of truth. Keep task-era findings, commands, and limitations intact.
5. When a feature changes substantially, update its current documentation and preserve older reports as history.
6. Archive superseded material conservatively. Do not delete history merely because newer work exists, and compare contents before treating files as duplicates.
7. Source art, runtime assets, application data, fixtures, and product/source files are not documentation clutter.
8. Keep SVG capability evidence together and preserve pixel Phase 1/2 reports, evidence, and the current pixel asset contract.
