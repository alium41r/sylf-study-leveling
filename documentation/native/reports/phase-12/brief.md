PHASE 12 BRIEF — Sylf Native Shared Backend Foundation
GOAL
Build a secure, efficient, reliable integration foundation connecting Sylf Native to Sylf Web's existing backend architecture.
Establish reusable infrastructure so Phase 13 can connect actual features without duplicating business logic, creating inconsistent data, or requiring extensive backend rewrites.
CONTEXT
You are the dedicated Phase 12 implementation subagent.
Read the Stage 2 handoff, Phase 11 report and handoff, master plan, approved architecture, relevant ADRs, and actual application code.
Treat Phase 11's verified findings as the starting point. Independently inspect the relevant source code before changing it.
IMPLEMENTATION REQUIREMENTS
1. Shared backend access
Establish a consistent, typed approach for native clients to interact with existing authenticated API routes and shared backend contracts.
Address:

* Authentication and session lifecycle.
* Cross-platform authentication persistence.
* Secure credential and token handling.
* API request handling and validation.
* Errors, cancellation, timeouts, and retry policies.
* Loading, empty, offline, and failed states.
* Data ownership and user isolation.
* Type-safe response mapping and compatibility.

Choose the simplest architecture that fits the existing stack.
Do not place server-only code, Prisma clients, database credentials, or privileged Supabase keys inside native client bundles.
2. Shared data and state
Create a clean foundation for consistent data usage across Home, Workspace, and World.
Prevent duplicate sources of truth for identity, active study sessions, elapsed time, XP, statistics, and other shared state.
Preserve the existing universal timer model and prepare it for synchronization with actual backend sessions.
Make sure timers remain accurate through navigation, backgrounding, and application restarts, without fabricating recorded study time.
Design explicit boundaries between server-authoritative data, local preferences, cached information, and unsaved drafts.
3. Database and security foundation
Implement justified improvements identified in Phase 11:

* RLS and authorization corrections.
* Missing indexes and inefficient query improvements.
* Ownership and validation safeguards.
* Transactional consistency.
* Reliable migrations and rollback planning.
* Safe response and error handling.

Use least-privilege access and test authorization with distinct user identities.
Never bypass RLS using elevated client privileges.
4. Performance and reliability
Optimize the common integration paths.
Prioritize:

* Efficient data fetching.
* Deduplication of requests.
* Appropriate lazy loading.
* Sensible caching and invalidation.
* Minimal startup overhead.
* Avoiding unnecessary rerenders.
* Efficient subscriptions and listener cleanup.
* Reliable handling of network failure and reconnection.
* Consistent state after mutations and navigation.

Avoid introducing unnecessary dependencies or overengineering.
5. Native platform compatibility
Ensure the foundation works with Electron and the existing React Native architecture.
Respect the project's shared-code boundaries and platform adapters.
Preserve the local-first Notes architecture and avoid changing its authoritative storage model prematurely. Advanced Notes integration remains Phase 14.
Keep Sylf World isolated and preserve its existing host lifecycle. Do not implement gameplay.
6. Frontend adjustments
You may update frontend components, adapters, and flows when necessary to make the backend foundation coherent.
Maintain or improve the Aloft design, accessibility, responsiveness, and existing interaction quality.
Do not introduce extensive new user-facing features in this phase.
TESTING
Use the disposable local PostgreSQL environment and approved local development infrastructure.
Test:

* Authentication and authorization boundaries.
* User isolation and RLS.
* API contracts and error handling.
* Session state and persistence.
* Cache behavior and invalidation.
* Request concurrency and cancellation.
* Migration compatibility.
* Electron integration.
* Existing frontend and backend regressions.

Do not access hosted databases, deploy, or perform physical tablet testing.
Where full Supabase authentication or storage behavior cannot be reproduced locally, document the limitation explicitly rather than treating mocks as production verification.
DONE
Deliver:

1. A working shared integration architecture.
2. Secure authentication and API-access foundations.
3. Reusable typed contracts and frontend data adapters.
4. Reliable shared session and state foundations.
5. Justified database and API improvements.
6. Efficient caching, fetching, and error recovery.
7. Passing relevant security, integration, and regression tests.
8. A Phase 12 report at `documentation/native/reports/phase-12/report.md`.
9. Updated architectural documentation and ADRs.
10. A complete Phase 13 handoff at `documentation/native/handoffs/phase-12.md`.

Clearly document what Phase 13 must connect, which contracts are ready, and what remains unverified.
Stop at the Phase 12 boundary. Return the results to the supervising agent.
