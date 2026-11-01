PHASE 11 BRIEF — Sylf Backend Audit & Engineering Assessment
GOAL
Conduct a comprehensive, evidence-based audit of Sylf Web's existing backend and its compatibility with Sylf Native.
Identify and resolve relevant defects, security weaknesses, inefficiencies, inconsistencies, and integration blockers.
Produce an accurate, actionable foundation for Phase 12.
CONTEXT
You are the dedicated Phase 11 implementation subagent. The supervising agent handles orchestration only.
Read the latest Stage 2 handoff, Phase 10 report, master plan, architecture documentation, existing backend code, database schema, relevant ADRs, and the Phase 11 requirements.
Sylf Native is a redesigned client for Sylf's existing backend, not a separate product requiring another backend.
AUDIT SCOPE
Thoroughly inspect:
1. Backend architecture

* Next.js API routes, server actions, and shared business logic.
* Supabase authentication, database, storage, and existing RLS policies.
* Prisma usage, SQL migrations, and data-access patterns.
* Dependency boundaries, authorization, ownership, validation, and error handling.
* Opportunities to reuse logic safely between web and native clients.

2. Existing feature systems
Audit the backend supporting authentication, user profiles, Focus sessions, timers, study analytics, goals, XP/progression, quests, achievements, friends, parties, calendar, AI Planner V2, Notes, and the tools represented in the Native Workspace.
Determine what is fully implemented, partially implemented, tested, broken, or only planned.
For each native feature, identify its actual backend owner and integration requirements.
3. Database and performance
Investigate:

* Missing or overly permissive RLS.
* Inefficient queries, N+1 patterns, indexes, unnecessary database round trips, and expensive payloads.
* Unnecessary polling and duplicate requests.
* Slow API routes, unnecessary computation, and repeated serialization.
* Race conditions, transactional integrity, and concurrency.
* Memory and resource leaks.
* Cache correctness and invalidation.
* Unnecessary coupling between frontend and backend modules.

Measure performance where possible. Do not invent benchmarks.
4. Frontend/backend inconsistencies
Examine Home, Focus, Progress, Circle, Workspace, the universal timer dock, and existing tool shells.
Identify mismatches between what the interfaces suggest and what the backend can actually provide.
Assess whether the information shown is genuinely relevant and useful to students.
AUTHORIZED REPAIRS
You have permission to fix confirmed defects and improve performance, security, and maintainability.
Preserve existing behavior wherever it is correct. Make targeted changes rather than speculative large rewrites.
Maintain critical guarantees, particularly authorization, ownership, session accounting, XP integrity, Notes durability, and Planner V2's controlled lifecycle and atomic ApplyService.
Do not weaken protections simply to make integration easier.
Do not make destructive production database changes or access hosted services.
Use disposable local databases and safe tests only.
VERIFICATION
Run appropriate backend tests, security checks, local PostgreSQL/RLS tests, typechecks, lint, and builds.
Reproduce defects before fixing them where practical, and add regression tests.
Distinguish verified behavior from code inspection, assumptions, and work requiring a real hosted environment.
Do not attempt complete native feature integration; that belongs to Phases 12–13.
DONE
Deliver:

1. A comprehensive backend architecture and feature inventory.
2. A Native-to-Web feature compatibility matrix.
3. A security and RLS assessment with evidence.
4. Database and API performance findings.
5. Confirmed bugs and relevant fixes.
6. An explicit list of missing contracts and integration blockers.
7. Tested recommendations prioritized by severity and impact.
8. A Phase 11 report at `documentation/native/reports/phase-11/report.md`.
9. Updated ADRs, master plan, and a self-contained Phase 12 handoff at `documentation/native/handoffs/phase-11.md`.

Ensure Phase 12 can begin from the documented findings without repeating the audit.
Stop at the Phase 11 boundary. Return the results to the supervising agent.
