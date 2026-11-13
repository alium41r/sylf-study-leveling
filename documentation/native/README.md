# Sylf Native

Sylf Native is a planned, new tablet-first native application for iPad and Android tablets. It has desktop/laptop as an equal large-screen priority and a later, simplified phone companion. It will be developed inside this repository alongside the unchanged Next.js web app, reusing existing backend systems. It is distinct from the existing Vite/Capacitor client in [`mobile/`](../../mobile/).

**Status (13 November 2026): the repository was consolidated into one committed baseline on `main`; see the [consolidation report](../infrastructure/reports/2026-11-13-repository-consolidation/README.md). The latest Native work (frontend refinement, Notes gallery and quality pass, Home redesign, 10–13 November) is committed and verified on the Mac, not yet on the tablet: start from the [2026-11-12 quality-pass report](reports/2026-11-12-notes-workspace-quality/README.md), the [Home redesign report](reports/2026-11-12-home-redesign/) and the end of the [tablet checklist](handoffs/tablet-checklist.md).** The status below this line is the 1 November record, kept as history.

**Earlier status (1 November 2026): Expansion Part 1 is complete and awaiting the owner's review. No application code changed, nothing is committed or deployed, and Part 2 needs the owner's authorization. Start with the [Part 2 handoff](handoffs/expansion-part-1.md) and the [urgent issues](reports/expansion-part-1/urgent-issues.md).** Stage 3 stays verified on the Mac and, in portrait, on the real tablet on Hermes.

| Document | Role |
| --- | --- |
| [Frontend refinement](reports/2026-11-10-frontend-refinement/README.md) | Home layout and account gate, Workspace arrangements, Notes, audio and verification |
| [Notes gallery refinement](reports/2026-11-10-notes-gallery/README.md) | Responsive library and folder navigation, document thumbnails, paper styles and verification |
| [Workspace visual audit](reports/2026-11-11-workspace-visual-audit/README.md) | Canvas, layouts, eight tools, compact controls and packaged Electron evidence |
| [Notes and Workspace quality pass](reports/2026-11-12-notes-workspace-quality/README.md) | Eraser and pen input fixes, live zoom badge, writing toolbar and eraser settings; verified on the Mac, not yet on the tablet |
| [Master vision and development plan](master-plan.md) | Product vision, the three Spaces, navigation and Command Center, platform strategy, architecture direction, reusable systems, risks and open questions, and the Phase 2 handoff. Statements are labelled Confirmed, Proposed or Open. |
| [Phase 1 report](reports/phase-1/report.md) | How the plan was established, repository observations and recommendations for Phase 2. |
| [ADR 0001: technology stack](decisions/0001-technology-stack.md) | Accepted stack and platform architecture, with rejected alternatives. |
| [Phase 2 report](reports/phase-2/report.md) | Technology decision evidence: framework comparison, feasibility experiments on the M1 Mac and Galaxy Tab S9 FE, compatibility audit, risks, and the Phase 3 handoff. |
| [ADR 0002: native workspace foundation](decisions/0002-native-workspace-foundation.md) | Workspace layout, shared-code and client/server boundaries, adapters, Electron security, CNG and deferrals. |
| [Phase 3 report](reports/phase-3/report.md) | Foundation build, verification results (typecheck, lint, tests, audits, Electron self-test, Android smoke), limitations. |
| [Stage 1 handoff](handoffs/stage-1.md) | Self-contained summary of Phases 1–3 and the Phase 4 requirements. |
| [ADR 0003: design system and theme engine](decisions/0003-design-system-and-theme-engine.md) | Aloft philosophy, theme axes, solved colors, typography, preferences, motion and the dependencies added. |
| [Phase 4 report](reports/phase-4/report.md) | Design system build, Electron and tablet verification (numbers, screenshots), defects found, limitations. |
| [Design system guide](design/README.md) and [component reference](design/components.md) | The current contract for Sylf Native's visual language, theme engine and components. |
| [Phase 4 handoff](handoffs/phase-4.md) | Phase 4 state, decisions, and how to use the design system. |
| [ADR 0004: global Spaces shell](decisions/0004-global-spaces-shell.md) | The switcher, state and unloading decisions, and the Student and Scholar naming note. |
| [Spaces shell guide](spaces/README.md) | The current contract for global navigation, restoration, World's flow and development tools. |
| [Phase 5 report](reports/phase-5/report.md) | Spaces build, tablet and Electron verification, memory investigation, visual QA. |
| [Phase 5 handoff](handoffs/phase-5.md) | Phase 5 state, decisions, and instructions for Phase 6. |
| [ADR 0005: Home interface template](decisions/0005-home-interface-template.md) | The rail, mounting, data and backend compatibility decisions. |
| [Home guide](home/README.md) | The current contract for Home: rail, destinations, restoration, the backend map, memory rules. |
| [Phase 6 report](reports/phase-6/report.md) | Home build, Electron and tablet verification, memory measurements, accessibility checks, regression testing. |
| [Phase 6 handoff](handoffs/phase-6.md) | Phase 6 state, decisions, and instructions for Phase 7. |
| [ADR 0006: Workspace canvas and windows](decisions/0006-workspace-canvas-and-windows.md) | The canvas, camera, windows, presets, suspension and input decisions, including W1 to W5. |
| [Workspace guide](workspace/README.md) | The current contract for Workspace: canvas, windows, layouts, the backend map, restoration, performance rules. |
| [Phase 7 report](reports/phase-7/report.md) | Workspace foundation checkpoint: canvas, Command Center, tool shells, Electron verification. |
| [Phase 8 report](reports/phase-8/report.md) | Multitasking build, Electron verification, performance, R15 and scrolling investigations, what stays unverified. |
| [Phase 8 handoff](handoffs/phase-8.md) | Phases 7 and 8 state, decisions, and the deferred tablet checklist, which is still current. |
| [ADR 0007: World lobby and host](decisions/0007-world-lobby-and-host.md) | The lobby, authored art, solved interface, host contract, failure paths, isolation, and G1 to G4. |
| [World guide](world/README.md) | The current contract for World: lobby, appearance, skies, host, isolation, the backend map, performance rules. |
| [Phase 9 report](reports/phase-9/report.md) | Lobby and host build, Electron verification, performance, what stays unverified. |
| [Phase 9 handoff](handoffs/phase-9.md) | Phase 9 state, decisions, and the prerequisites for Phase 10. |
| [ADR 0008: the one study session and the Universal Timer Dock](decisions/0008-study-session-and-timer-dock.md) | The session, its backend map, the dock, World's safeguards, shortcuts and what was checked. |
| [ADR 0009: native authentication](decisions/0009-native-authentication.md) | Proposed design for R1: tokens, revocation parity, Electron and React Native storage. |
| [ADR 0010: sessions before sign-in](decisions/0010-session-ownership-before-sign-in.md) | Proposed owner of a study session made with nobody signed in. |
| [Phase 11 handoff](handoffs/phase-11.md) | Backend audit results, what changed, the disposable backend harness, and the Phase 12 requirements. |
| [ADR 0011: the shared backend foundation](decisions/0011-shared-backend-foundation.md) | Proposed decisions behind the typed client, cached reads, connectivity and the kinds of data. |
| [Backend guide](backend/README.md) | The current contract for how Sylf Native reaches the backend: using it, states, authentication, small reads, the timer, platforms, and what is not proven. |
| [Phase 12 report](reports/phase-12/report.md) | Foundation build, test results by category, security, performance, what stays unverified. |
| [Part 2 handoff](handoffs/expansion-part-1.md) | **Start here.** State after Part 1, the owner's decisions, first steps, proved contracts, rules, open issues |
| [Urgent issues](reports/expansion-part-1/urgent-issues.md) | Production defects and owner actions that should not wait for the roadmap |
| [Expansion Part 1 report](reports/expansion-part-1/report.md) | Audit method, questions closed, earlier findings rechecked, architecture, performance, security, UX, dependencies, roadmap |
| [Blueprint](expansion/blueprint.md) | The redesign of every surface: structure, states, motion, new components |
| [Recovery baseline](reports/expansion-part-1/recovery-baseline.md) | What was captured, how it was proved, and its limits |
| [ADR 0016: Realtime, streaming and remote media](decisions/0016-realtime-streaming-and-remote-media.md) | Proposed: where Realtime lives, `expo/fetch`, approved image hosts |
| [Expansion stage plan](expansion/README.md) | The stage between Phase 13 and Phase 14: target structure, architecture rules, part order, quality gates, risks, the owner's decisions |
| [Feature map](expansion/feature-map.md) | Web against Native, feature by feature, implemented, partial or missing, with evidence and new findings |
| Part briefs: [1](expansion/part-1-audit-and-blueprint.md), [2](expansion/part-2-study-progression-personalization.md), [3](expansion/part-3-social-sylvie-planner.md), [4](expansion/part-4-integration-polish.md) | Self-contained briefs for each part: scope, files, tests, risks, completion criteria |
| [ADR 0013: the Expansion stage](decisions/0013-expansion-stage.md) | Proposed: where the stage sits, how it is numbered, the entry gate, narrowing the polling rule |
| [ADR 0014: Home hub and Workspace scope](decisions/0014-home-hub-and-workspace-scope.md) | Home holds planning, Workspace holds studying, and how the tools leave. Partly Confirmed |
| [ADR 0015: session modes, Focus environment and parties](decisions/0015-session-modes-focus-environment-and-parties.md) | One session across everything the stage adds. Partly Confirmed |
| [Stage 3 handoff](handoffs/stage-3.md) | Phases 11 to 13, the connected architecture, what is verified and partial, the owner's operations in order, and the Phase 14 requirements |
| [ADR 0012: the connected app](decisions/0012-connected-app.md) | Proposed decisions behind the account gate, the session bridge, and what shows when |
| [Phase 13 report](reports/phase-13/report.md) | Integration, the student journey, test results by category, and unresolved issues |
| [Phase 14 report](reports/phase-14/report.md) and [handoff](handoffs/phase-14.md) | Notes, PDFs, Whiteboard, Resources and saved layouts; verified in Electron and on the tablet. Read before Phase 15. |
| [Tablet checklist](handoffs/tablet-checklist.md) | Everything waiting for a device, Phases 7 to 13, most important first |
| [Phase 12 handoff](handoffs/phase-12.md) | What is ready, what to connect, what remains unverified, the harness. |
| [Phase 10 report](reports/phase-10/report.md) | Dock and session build, cross-Space review, responsive and performance measurements, unresolved issues. |
| [Stage 2 handoff](handoffs/stage-2.md) | Phases 4 to 10, the final architecture, product decisions, risks, and instructions for Phase 11. |
| [Tablet checklist](handoffs/tablet-checklist.md) | The consolidated Samsung tablet verification list for Phases 7 to 10. Nothing in it runs without the owner's authorization. |

Related direction: the [Study Workspaces master plan](../workspaces/master-plan-october-2026.md) defines Notes/Workspace/Session ownership. Its relationship to the native Workspace Space is W1 in the master plan, built to its proposed default.

Phase reports belong in `reports/phase-<n>/`, with evidence beside them. Executed source snapshots go in `evidence/executed-sources/` (excluded from the root TypeScript program). Architecture decisions are numbered records in [`decisions/`](decisions/).

## Stage handoffs

**Confirmed (30 October 2026).** A fresh coding-agent session starts after every development stage, so each stage ends with a comprehensive, self-contained handoff in [`handoffs/`](handoffs/). A handoff preserves finalized decisions, architecture, completed work, relevant file paths, test results, outstanding issues and instructions for the next stage. The next agent must be able to continue from repository documentation alone, without chat history.

| Stage | Ends after | Handoff covers | Status |
| --- | --- | --- | --- |
| 1 — Vision, Research and Architecture | Phase 3 | Phases 1–3 and the Phase 4 requirements | [Written](handoffs/stage-1.md), 30 October 2026 |
| 2 — Frontend Templates and Navigation | Phase 10 | Phases 4–10 and the Phase 11 requirements | [Written](handoffs/stage-2.md), 31 October 2026 |
| 3 — Backend Integration | Phase 13 | Phases 11–13 and the Phase 14 requirements | [Written](handoffs/stage-3.md), 1 November 2026 |
| Expansion — Feature Expansion and Experience Redesign | Part 4 | Parts 1–4 and the restated Phase 14 requirements. Each part has its own handoff first | [Part 1's written](handoffs/expansion-part-1.md), 1 November 2026. See the [stage plan](expansion/README.md#13-handoffs-and-documents) |
| 4 — Advanced Feature Development | Phase 15 | Phases 14–15 and the Phase 16 requirements | Phase 14's [handoff to Phase 15](handoffs/phase-14.md) written 5 November 2026 ([report](reports/phase-14/report.md), [ADR 0018](decisions/0018-local-first-notes-on-native.md)) |
| 5 — Verification and Release | Phase 17 | Release state | Not started |

The master plan, decision records and phase reports are kept current as development progresses; a handoff summarizes and links them rather than replacing them.
