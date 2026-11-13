# Sylf — Repository Audit & Architecture Modernization Blueprint

> **Consolidation note (13 November 2026).** This is an unadopted, read-only proposal written by another agent on 2 November 2026 in the Antigravity worktree `repository_architecture_audit_blueprint`. It covers the web tree (`app/`, `lib/`, `mobile/`, `__tests__/`) only and does not consider `native/`, which is now Sylf's primary client. None of its phases have been started. Treat its figures as a 2 November snapshot and get the owner's approval before acting on it. See the [consolidation report](../../infrastructure/reports/2026-11-13-repository-consolidation/README.md).

**Status:** Phase 1 Complete (Research, Audit & Blueprint Only — Awaiting Review)  
**Date:** November 2, 2026  

---

## 1. Executive Summary & Core Recommendation

### Does Sylf Need a Major Structural Migration or Targeted Improvements?

**Recommendation: Targeted Modular Monolith Refinement — NOT a major structural migration (`apps/` + `packages/` monorepo or `/src` relocation).**

Our repository-wide static and AST dependency audit of **1,581 code/schema/test files** (`app/`: 560, `lib/`: 434, `__tests__/`: 424, `scripts/`: 77, `prisma/`: 72, `mobile/`: 11, `config/`: 3) established two decisive architectural facts:

1. **Previous Reorganizations Already Cleaned the Root Layout:** The October 2, 2026 and October 19, 2026 reorganization passes already consolidated `assets/`, `scripts/{assets,build,db,dev,qa,security,test,verify}/`, `config/`, `tools/ai-agent/`, and `documentation/`, and untracked generated build outputs (`dist/`, `mobile/dist/`).
2. **A Monorepo (`apps/` + `packages/`) or `/src` Migration Would Cause High-Risk Churn with Zero Architectural Gain:**
   - Sylf Native (`mobile/`) is an adapter-shell Vite/Capacitor client whose [`MobileRouteOutlet.tsx`](../../../mobile/src/components/MobileRouteOutlet.tsx) directly lazy-loads **26 canonical `*Screen.tsx` components** from `@/app/<feature>/components/<Feature>Screen` and shares [`GlobalSystemWrapper`](../../../app/components/GlobalSystemWrapper.tsx) and [`SylfAppShell`](../../../app/components/SylfAppShell.tsx).
   - **65 files** across `__tests__/`, `scripts/`, and `config/` hardcode relative filesystem paths (`path.join(process.cwd(), "app/...")`, `"lib/..."`, `"prisma/..."`).
   - Moving `app/` and `lib/` into `/src` or splitting into `apps/web`, `apps/mobile`, and `packages/ui` would rewrite 2,500+ imports, break git blame and active feature worktrees, and break 65 filesystem assertions without fixing any of Sylf's actual architectural issues.

Instead, all **10 real architectural and maintainability problems (`A1`–`A10`)** live **inside** the module boundaries of `lib/`, `app/components/`, `mobile/`, and `__tests__/`, and can be solved cleanly in place.

---

## 2. Summary of Audited Issues (`A1`–`A10`)

| ID | Severity | Issue Summary | Target Phase |
| --- | --- | --- | --- |
| **A1** | **High** | **`app <-> mobile` Circular Dependency & Mock Leak:** [`app/settings/account/services/account-capability.ts`](../../../app/settings/account/services/account-capability.ts) imports `MockAccountCapability` (`MOCK_STUDENT_USER`) from [`mobile/src/adapters/account/mobile-account-capability.ts`](../../../mobile/src/adapters/account/mobile-account-capability.ts), which imports `AccountCapability` back from `app/`. | Phase 2 |
| **A2** | **High** | **Production `lib/` Importing from `__tests__/` and `archive/`:** [`lib/planner/quality/corpus.ts`](../../../lib/planner/quality/corpus.ts) imports `@/__tests__/planner/*-fixtures`; [`lib/shop-items.ts`](../../../lib/shop-items.ts) imports `@/archive/legacy_catalog/shop-items.legacy`. | Phase 2 |
| **A3** | **High** | **Inconsistent `server-only` Boundary Enforcement in `lib/`:** 21 of 53 files in `lib/` that directly import `lib/prisma.ts` or `@prisma/client` (including `lib/prisma.ts`, `lib/auth-server.ts`, `lib/study-schedule-service.ts`, and `lib/subject-service.ts`) omit `import "server-only"`. | Phase 2 |
| **A4** | **Medium-High** | **Flat `lib/` Root Congestion (72 Loose `.ts` Files):** Server DB singletons, auth helpers, client transport, study timer engines, progression math, and social services sit side-by-side in `lib/*.ts`. | Phase 3 |
| **A5** | **Medium-High** | **28 Circular Dependencies in `lib/`:** 1 in `lib/ai/` (`telemetry <-> usage-logger`), 21 in `lib/calendar/` (`contracts <-> recurrence <-> dates` and `personal-service` hub), and 6 in `lib/planner/` (`contracts <-> policy modules`). | Phase 2 |
| **A6** | **Medium** | **`app/components/` Congestion (40 Loose Files):** App shell, global providers, modals, generic UI primitives, settings primitives, and feature-specific `AiPlannerModal`/`AiPlannerPanel` sit together in one flat folder. | Phase 4 |
| **A7** | **Medium** | **`lib/planner/` Root Sprawl (49 Loose Files):** 49 V1 policy, client, and domain files sit loose at `lib/planner/*.ts` alongside `v2/`, `server/`, `ai/`, and `quality/`. | Phase 4 |
| **A8** | **Low-Medium** | **`__tests__/` Root Sprawl (18 Loose Files):** 12 `focus-backgrounds*.test.ts(x)` files, 3 economy/progression tests, 2 surface tests, and 1 manual QA script (`test_planner_api.ts`) sit at `__tests__/` root instead of their feature test directories. | Phase 5 |
| **A9** | **Low-Medium** | **Unguarded Dev Routes & Legacy Root `sylvs/` Directory:** `/sylv-preview` and `/dashboard-design` are not gated in [`proxy.ts`](../../../proxy.ts); 39 source PNGs sit in root `sylvs/` instead of `assets/sylvs/`. | Phase 2 & 5 |
| **A10** | **Low-Medium** | **Tooling & Script Drift:** `npm run lint` calls removed `next lint`; `npm run planner:worker:build` fails on Node 24 (`build-planner-worker.mjs`) and `@/lib/prisma` alias resolution (`config/tsconfig.planner-worker.json`); `archive/README.md` has stale absolute paths. | Phase 2 & 5 |

---

## 3. Major Architectural Decisions

| Decision | Selected Approach | Rejected Alternatives | Why Selected |
| --- | --- | --- | --- |
| **Root Repository Topology** | **Preserve Root Modular Monolith** (`app/`, `lib/`, `mobile/`, `prisma/`, `__tests__/`, `scripts/`, `config/`, `assets/`, `public/`, `documentation/`) | `apps/*` + `packages/*` Turborepo monorepo; `/src` directory migration | Preserves 26 shared screen imports in `mobile/`, 65 hardcoded filesystem path checks in tests/scripts, Next.js 16 + Prisma workflows, and git history across active branches. |
| **Cross-Platform Adapter Contract (`app` vs `mobile`)** | **Dependency Inversion via `lib/auth/account-capability.ts`** | Allowing `app/` to import `@/mobile/*`; duplicating screens for mobile | Eliminates the `app <-> mobile` cycle and prevents mobile mock fixtures (`MOCK_STUDENT_USER`) from entering the Next.js production web bundle. |
| **`lib/` Internal Organization** | **6 Domain Subdirectories (`core/{server,client,shared}`, `auth`, `progression`, `study`, `social`, `workspaces`) + High-Fan-Out Re-Export Shims** | Leaving 72 flat files in `lib/`; moving all 72 files without shims (breaking 1,000+ imports at once) | Gives AI coding agents deterministic domain folders and explicit `server`/`client`/`shared` boundaries while avoiding merge conflicts on high-fan-out modules (`lib/prisma.ts` [232], `lib/auth-server.ts` [117]). |
| **Server/Client Boundary Protection** | **100% `import "server-only"` on DB/Server `lib/` Modules + Automated Vitest Architecture Test** | Relying solely on developer convention or `mobile/vite.config.ts` | Guarantees compile-time failure in both Next.js and Vite if any client component or shared mobile screen transitively imports a Prisma-backed module. |

---

## 4. Blueprint Document Index

1. **[`CURRENT_STATE_AUDIT.md`](../../../documentation/architecture/repository-modernization/CURRENT_STATE_AUDIT.md)**  
   Complete quantitative inventory of the repository, AST dependency matrix, web/native integration trace, database/migration review, and detailed evidence for findings `A1`–`A10`.
2. **[`PROPOSED_ARCHITECTURE.md`](../../../documentation/architecture/repository-modernization/PROPOSED_ARCHITECTURE.md)**  
   Objective evaluation of 4 architectural paradigms, full target directory tree, strict 6-layer dependency DAG rules, feature placement conventions, and AI-agent navigation optimizations.
3. **[`MIGRATION_BLUEPRINT.md`](../../../documentation/architecture/repository-modernization/MIGRATION_BLUEPRINT.md)**  
   Exhaustive file-by-file mapping tables for all 72 `lib/*.ts` files, 40 `app/components/*` files, 49 `lib/planner/*` files, and 18 `__tests__/*` root files, plus boundary/cycle refactoring specs, config updates, risk matrix, and git rollback strategy.
4. **[`IMPLEMENTATION_ROADMAP.md`](../../../documentation/architecture/repository-modernization/IMPLEMENTATION_ROADMAP.md)**  
   Sequenced execution plan across Phases 2–6 with prerequisites, scope, validation commands, and completion checkpoints.
