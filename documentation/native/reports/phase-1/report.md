# Sylf Native — Phase 1 report: Product Vision and Master Plan

**30 October 2026.** This report covers research and documentation only. No code, dependencies, configuration or repository structure changed. The deliverable is the [master vision and development plan](../../master-plan.md).

## Method

The plan was built from the Sylf Native brief and the 17-phase roadmap. It was checked against the current repository:

- [Documentation index](../../../README.md), [`AGENTS.md`](../../../../AGENTS.md) and the project README.
- The [Study Workspaces master plan](../../../workspaces/master-plan-october-2026.md).
- The Notes [architecture contract](../../../notes/architecture-contract.md), [ink contract](../../../notes/ink.md) and [Phase 6 report](../../../notes/reports/phase-6/report.md).
- The [timer](../../../timer/README.md), [Sylvie](../../../sylvie/README.md) and [design](../../../design/README.md) indexes.
- [`lib/auth-server.ts`](../../../../lib/auth-server.ts), [`lib/api-transport.ts`](../../../../lib/api-transport.ts), the [`mobile/`](../../../../mobile/) Capacitor client and its Vite server guard, and `capacitor.config.ts`.
- The Prisma model list and migration count, the API route count, and the `lib/` subsystem layout.

The import graph and browser-global usage of about 40 shared `lib/` modules were inspected to classify their portability. This was a static check. Runtime behavior on a native JS engine was not tested.

## Understanding of the vision

Sylf Native is a premium, large-screen-first study ecosystem in three Spaces:

- **Home** is the everyday personal command center: a compact rail with Today, Focus, Circle and Progress, plus a persistent study session.
- **Workspace** is a canvas-first environment where a Dock-like Command Center launches and arranges many simultaneous tools (Notes, PDFs, Whiteboard, Planner, Calendar, Timer, Sylvie, Calculator, Audio, Resources) in Focus, Split and Assistant layouts. Sessions restore, and pen and keyboard input feel native.
- **World** is an isolated, immersive fantasy sandbox game with its own identity, fed by Sylf's server-settled progression and economy.

A single top-left Spaces switcher joins the three. Each Space keeps its own navigation, and World's save-and-leave flow takes priority over the switcher.

The approach is frontend first: a fully navigable, polished template app (Milestone 1) comes before backend integration. The backend is reused rather than rebuilt, the web app stays unchanged, and each phase is approved before the next.

## Important repository observations

1. **"Workspace" already means something else.** The October Study Workspaces plan defines a workspace as a persistent study *context* (subject, goal, tasks, Resource Shelf, session) that orchestrates Notes, Timer and Sylvie. Sylf Native's Workspace is a *Space* (environment and window manager). The plan proposes treating them as layers: the Space opens saved Study Workspace contexts. It flags naming and confirmation as open question W1.
2. **Authentication is cookie-only by design.** `getSession` accepts only cookies with tokenVersion revocation, and the bearer fallback was removed in security work S3. [`api-transport.ts`](../../../../lib/api-transport.ts) has an unused `getAuthHeader` hook. A native client therefore needs a reviewed native session model, which is a backend change across ~148 route handlers (risk R1).
3. **Much of the domain logic is already portable.** The progression engines, timezone service, calculator, color/appearance generation, catalogs, planner contracts, Notes format/DAG/ink modules and the Pixel Display engine import no DOM, server or framework code.
4. **The hardest reuse gaps are at the platform edges.** The Notes repository is bound to IndexedDB/Dexie, the vault to WebCrypto, rich text to BlockNote/ProseMirror, PDFs to pdf.js, ink capture to Pointer Events, audio to Web Audio and the timer journal to localStorage and Web Locks. Each needs a native adapter, held to the existing format and durability contracts. The Notes contract already anticipates native SQLite/file adapters with a shared conformance suite.
5. **Physical device qualification has never been done.** Notes Phase 6 explicitly lists Apple Pencil, S Pen, palm rejection, iPadOS/Android WebView and thermal behavior as unqualified gates. This supports making pen and rich-text spikes central to Phase 2.
6. **A Capacitor client and Android project already exist, but no iOS project.** `mobile/` (WebView, `appId app.sylf.study`) reuses web screens. Sylf Native must not disturb it. Its future, the shared app identifier and the folder naming (`mobile/` is taken) are open question C1.
7. **The root package is the Next.js app.** It has React 19.2.4 and no workspaces configuration, and 148 routes plus the tests import shared code through `@/`. Introducing a native package and shared packages without changing web imports or React resolution is a Phase 2/3 design problem (risk R10).
8. **There is no game engine in the repository.** The ledgers (`XpLedger`, `SylphLedger`, `HpLedger`), inventory, cosmetics, `PixelCreation` and the Pixel Display engine are the natural integration and identity base for World.
9. **Design reference material has known limitations.** The design index qualifies the generic design-system master, so Phase 4 should establish Sylf Native's identity deliberately. It should inherit the semantic appearance model (light/dark, custom accent/background) rather than a fixed palette.

## Recommendations for Phase 2

1. **Decide desktop strategy first (D1/D2).** It changes which platforms the UI stack must target and therefore the framework evaluation itself.
2. **Run the risky spikes early and in parallel.** These are native ink producing `sylf-ink/1` with web-matching geometry (R2), the rich-text editor approach (R3), PDF annotation parity (R4), and Yjs plus SQLite on the native JS engine (R5/R7). They decide feasibility more than any framework benchmark.
3. **Evaluate frameworks against Sylf's actual constraints, not general popularity.** Include at least React Native + Expo, Flutter, and native SwiftUI/Compose, scored against the budgets and criteria in the master plan's §5.3 and §9.2. TypeScript logic reuse favors React Native but is not decisive alone.
4. **Prototype the multitasking window manager** inside OS split-screen and Stage Manager, including pen, canvas and OS edge gesture conflicts.
5. **Shortlist World engines on isolation, size and memory.** Do not finalize before Phase 15. Phase 9 needs only a placeholder viewport behind an engine-agnostic host interface.
6. **Sketch native authentication feasibility** with the security model in mind. Leave implementation to Phases 11–12.
7. **Propose the monorepo layout** that leaves the web app's imports and build untouched, and name the native and phone folders.
8. **Measure on physical devices** (a recent iPad, a base iPad, a mid-range and a low-end Android tablet) and store the evidence beside the Phase 2 report.

## Decisions requested before Phase 2

- Approve the master plan's proposed defaults, or redirect them. The most consequential are W1 (Workspace naming and relationship), G1 (World during an active session), H1 (Locker and Shop moving to World) and P1 (phone companion in the same binary).
- Confirm the reference device set and whether physical devices are available for Phase 2 spikes.
- Confirm where temporary Phase 2 spike code may live.

**Phase 1 was approved on 30 October 2026.** The decisions requested above remain open for Phase 2 to resolve or for the owner to confirm.
