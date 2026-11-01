# ADR 0013 — The Expansion stage

**Status: Proposed, 1 November 2026, for the owner to review. The owner started Part 1 the same day.** The stage itself, its four parts and the rules marked Confirmed come from the owner's roadmap revision brief. The plan is the [Expansion stage](../expansion/README.md), and the evidence is its [feature map](../expansion/feature-map.md).

## The problem

Stage 3 made Native a real client over a small part of the backend: 26 of 155 routes. The roadmap went straight to Notes, ink and the game. A student would have had a beautiful Workspace and World while still needing the web to shape their week, ask for a plan, change a password or message a friend. Those features exist, work, and are what makes Sylf useful every day.

## Decisions

| # | Decision | Status | Why |
| --- | --- | --- | --- |
| 1 | **A Feature Expansion and Experience Redesign stage sits between Phase 13 and Phase 14,** in four sequential parts. | Confirmed (owner) | The owner's brief |
| 2 | **Phases 14 to 17 keep their numbers and scope.** | Confirmed (owner) | The owner's brief |
| 3 | **The new stage has no phase number or stage number. It is "the Expansion stage", Parts 1 to 4,** and Stages 4 and 5 keep theirs. | Proposed | Numbers 1 to 17 and five stages are cited across every report, ADR and handoff. A name adds to the roadmap and makes no old sentence false. A "Phase 13.5" or a renumbered Stage 4 would do both harm and nothing useful |
| 4 | **Stabilization and tablet verification are an entry gate, not part of the stage.** A committed baseline is on that gate. | Confirmed for the gate (owner). Proposed for the list | Over 400 paths are uncommitted, including all of Native and eleven migrations. Building a stage on that is the largest avoidable risk here |
| 5 | **Each part ends with a report, a handoff and a stop,** like a phase. | Proposed, following the Confirmed handoff rule | A fresh session starts after each part, and each part is as large as a phase or more |
| 6 | **Backend defects are fixed by the slice that finds them,** and Part 4 closes what is left. | Confirmed (owner) | The owner's brief |
| 7 | **Polling is narrowed, not banned.** Stage 3's rule "nothing polls" meets `AGENTS.md`'s "preserve polling fallbacks for Supabase Realtime". From now on: Realtime first. A fallback reads only while its surface is seen, at a bounded interval, through the resource store. Nothing polls in the background, and a running session makes no requests of its own. | Proposed | Both rules were right about different things. The old one prevented web's 15 s and 30 s background polling (P-8). The new one keeps features alive when Realtime is unavailable |
| 8 | **Priorities are written down: Must, Should, Later, Stays web.** Part 1 may move anything but a Must. | Proposed, following "useful over quantity" (Confirmed) | Parity with web is not the goal, so a feature has to earn its place |
| 9 | **Shared logic is extracted from web, not copied,** when it is trapped in a component. | Confirmed by `AGENTS.md`, master plan §5.2 | Timer modes are the first case. See [ADR 0015](0015-session-modes-focus-environment-and-parties.md) |
| 10 | **New documents live under `documentation/native/expansion/`,** with reports in `reports/expansion-part-<n>/` and handoffs in `handoffs/expansion-part-<n>.md`, then `handoffs/expansion.md`. | Proposed | One findable home, following the existing layout |

## Rejected

| Option | Why not |
| --- | --- |
| Finish Phase 14 first | The owner placed this stage first. Notes also gets better once Home holds planning and Workspace is purely for study |
| One large part | A fresh session after each part is how this project keeps quality. Four parts give four reviews |
| Parts run in parallel | Home's navigation, `reads.ts` and contracts are shared, so parallel slices would collide |
| Full parity with web | It would rebuild Classic Planner, Modes, admin tools and more for little student value |
| Porting web components | Master plan §7.2 rules it out |

## Consequences

- Phase 14 starts later. Its requirements stay in the [Stage 3 handoff](../handoffs/stage-3.md#7-requirements-for-phase-14) until `handoffs/expansion.md` restates them.
- The next stage handoff after Stage 3 is written at the end of Part 4. Stage 4's stays after Phase 15.
- Web is touched where logic is extracted or a defect is repaired, under `AGENTS.md`'s rules. Its visible behavior does not change unless the owner approves a repair that does.
- Risks R16 to R24 join the [master plan](../master-plan.md#81-major-technical-risks).
- The owner's decisions E-1 to E-14 are in [stage plan §12](../expansion/README.md#12-decisions-for-the-owner).
