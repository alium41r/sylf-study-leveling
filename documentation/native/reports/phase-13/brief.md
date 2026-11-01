PHASE 13 BRIEF — Sylf Native Core Feature Integration
GOAL
Transform Sylf Native from a polished frontend prototype into a genuinely useful, backend-connected student productivity application.
Integrate its primary features with Sylf's existing backend, reuse established business logic, fix inconsistencies, and deliver reliable end-to-end study workflows.
The experience should feel like one cohesive product, not a collection of disconnected pages and tools.
CONTEXT
You are the dedicated Phase 13 implementation subagent.
Read the Stage 2 handoff, Phase 11 and 12 reports and handoffs, master plan, design documentation, backend compatibility matrix, and current implementation.
Use Phase 12's shared integration foundation.
Preserve existing security, local-first, persistence, and frontend architectural decisions.
IMPLEMENTATION PRIORITIES
1. Authentication and user experience
Integrate supported authentication, account data, and user-specific application state.
Ensure each user sees only their own information, with correctly handled login, logout, expired sessions, and account changes.
Frontend data must come from real sources where integration is implemented. Never present fabricated sample data as genuine activity.
2. Home — useful daily productivity
Connect Today, Focus, Circle, and Progress to existing backend capabilities.
Today
Present a meaningful view of the student's day, including relevant objectives, planned activities, upcoming work, and practical actions.
Prioritize what the student needs next rather than filling the page with decorative information.
Focus
Integrate real study-session controls, subject or task context, session history, and the existing Focus capabilities.
Make studying straightforward, reliable, and distraction-free.
Circle
Connect supported friends, presence, and study-party capabilities.
Show only information the backend actually provides. Avoid inventing friend activities, schedules, or social features.
Progress
Integrate existing XP, levels, achievements, study analytics, streaks, and relevant subject statistics.
Use accurate, understandable information that helps students evaluate their learning habits.
Avoid misleading metrics or gamification that overwhelms actual productivity.
3. Universal timer and session consistency
This is a critical integration requirement.
The universal timer dock, Home Focus timer, and Workspace Timer must all reflect one authoritative active study session.
Starting a session from any entry point should immediately synchronize with the others.
Support accurate:

* Starting, pausing, resuming, and ending sessions.
* Elapsed-time calculation and duration accounting.
* Subject/task association where supported.
* Session persistence and recovery.
* Backend session recording.
* Correct XP and progression updates.
* Duplicate-session prevention.
* Error and reconnect handling.

Do not award XP or record study time for unverified activity.
Use the established timer engine and session backend instead of creating a separate native study-session system.
Switching Spaces must never reset the session.
World gameplay must not silently accrue study time. Preserve the approved study-session guard before entry.
4. Workspace — functional student tools
Connect existing Workspace shells to their appropriate backend functionality.
Prioritize the tools that can provide meaningful value using the existing systems:

* Planner and calendar data and supported actions.
* Notes and PDF access where compatible with the existing architecture.
* Calculator and timer.
* Study resources and supported attachments.
* Sylvie AI and supported assistant interactions.
* Audio and other available productivity utilities.

Respect feature maturity.
AI Planner V2: Preserve its existing Research → Strategy → Scheduling → Review lifecycle, permission boundaries, accounting, validation, and atomic ApplyService. Do not replace it with a simpler imitation. Use an honest integration state if an end-to-end workflow is not yet verified.
Notes: Preserve local-first persistence, authored content, and synchronization safeguards. Do not prematurely replace the specialized Notes integration planned for Phase 14.
For features that require substantial later-phase work, provide a useful, honest limited integration rather than claiming the full system is complete.
Keep Workspace's finite canvas, multitasking, multiple tool instances, and saved layouts functional.
5. World lobby integration
Connect supported existing identity, progression, and cosmetic information to the World lobby.
Do not implement Sylf World gameplay, islands, terrain, characters, or game-engine systems.
Keep the approved artwork and independent sky appearance.
Preserve the World host contract, resource isolation, exit handling, and session guard.
6. Product quality
Evaluate every major interface from the perspective of an actual student.
Ask:

* Is this information useful and relevant here?
* Can the user understand what to do next?
* Does the action work?
* Is the displayed information accurate?
* Is the workflow unnecessarily complicated?
* Does the layout make important content easy to find?

You may remove redundant presentation, improve organization, simplify workflows, and update frontend code where justified.
Preserve or improve the existing Aloft design and all six themes.
Do not replace polished interfaces with generic dashboards or forms.
The aim is usefulness, clarity, speed, and thoughtful interaction.
7. Performance, consistency, and security
Investigate and resolve relevant integration defects.
Focus on:

* API and database latency.
* Redundant requests and unnecessary polling.
* Cache and state synchronization.
* Excessive rerenders.
* Lazy loading and memory usage.
* Authenticated data isolation.
* Concurrent mutations.
* Recovery from failure and interruption.
* No duplicated or inconsistent sessions.
* Correct XP and accounting.
* Reliable state after switching Spaces or restarting.

Use measurements and tests to justify optimizations.
Maintain ownership checks, RLS, transaction boundaries, and server-authoritative validation.
VERIFICATION
Run the appropriate unit, integration, database, security, Electron, build, and regression tests.
Test complete journeys where the available local infrastructure permits, including:

1. Authenticate and load the student's data.
2. View meaningful Home information.
3. Start studying from Home or the dock.
4. Move into Workspace while the same timer continues.
5. Interact with available connected tools.
6. Return to Focus with the correct session still active.
7. End the session and verify correct persisted results and progression.
8. Navigate to World while respecting the active-session rule.
9. Restart or recover from interruptions without corrupting state.

Test empty accounts, multiple distinct users, expired sessions, failed requests, and offline/reconnection scenarios.
For anything requiring unavailable hosted infrastructure or real AI provider calls, document the limitation and do not fabricate success.
Mac only. No tablet testing, hosted database changes, production deployment, or unauthorized external costs.
DONE
Deliver:

1. An integrated, useful Sylf Native application within the approved Phase 13 scope.
2. Functional core study workflows connected to existing backend systems.
3. Reliable shared timer and study-session integration.
4. Meaningful Home, Focus, Progress, Circle, and Workspace functionality.
5. Honest integration states for advanced features reserved for later phases.
6. Secure authentication, user isolation, and correctly enforced data ownership.
7. Improved performance and reliable error recovery.
8. Passing relevant available tests with documented evidence.
9. A Phase 13 report at `documentation/native/reports/phase-13/report.md`.
10. Updated documentation, compatibility matrices, and ADRs.
11. A comprehensive Stage 3 backend handoff at `documentation/native/handoffs/stage-3.md`.
12. A prioritized list of unresolved issues and deferred advanced functionality.
13. A consolidated Samsung tablet verification checklist covering Phases 7–13.

The final handoff must explain what is genuinely implemented and verified, what remains partially integrated, and what requires device or external-service testing.
Do not hide failures or claim unverified functionality is complete.
Stop after Phase 13. Return the completed work and final report to the supervising agent. Do not start Phase 14.
