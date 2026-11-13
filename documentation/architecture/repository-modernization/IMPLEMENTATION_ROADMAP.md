# Sylf — Repository Modernization Implementation Roadmap

**Phase:** 1 — Repository Audit & Architecture Blueprint (Research & Planning Only)  
**Date:** November 2, 2026  
**Scope:** Sequenced multi-phase implementation plan refining Phases 2–6, with explicit objectives, dependencies, validation gates, and completion criteria.

---

## 1. Roadmap Overview

Rather than a disruptive single-pass reorganization, the repository modernization is structured into **five incremental execution phases (Phases 2–6)** ordered by **highest risk-reduction first, lowest churn first**:

```
Phase 2: Boundary Hardening, Cycle Elimination & Tooling Fixes (Zero Structural Moves)
   │
   ▼
Phase 3: lib/ Domain Modularization (72 Flat Files -> 6 Domain Subdirectories + Shims)
   │
   ▼
Phase 4: app/components/ & lib/planner/ Structural Organization
   │
   ▼
Phase 5: Test Suite Consolidation, Legacy Asset Cleanup & Low-Fan-Out Shim Retirement
   │
   ▼
Phase 6: Full-System Verification & Canonical Documentation Synchronization
```

> **Note:** If you prefer the lowest-churn path possible, **Phase 2 + Phase 5 alone** resolve 100% of active boundary bugs, circular dependencies, server-only leaks, test root clutter, and broken scripts with almost zero import path changes across `app/` and `lib/`. Phases 3 and 4 add deep directory ergonomics for `lib/` and `app/components/`.

---

## 2. Detailed Phase Breakdown

### Phase 2 — Boundary Hardening, Cycle Elimination & Tooling Fixes

**Objective:** Eliminate all architectural boundary violations (**A1**, **A2**, **A3**), break all 28 circular dependencies (**A5**), gate unguarded dev routes (**A9**), and repair broken developer scripts (**A10**) before moving any domain files.

- **Prerequisites:** Phase 1 Blueprint approval.
- **Scope of Work:**
  1. **Break `app <-> mobile` cycle (A1):** Extract `AccountCapability` contract and registration hook into `lib/auth/account-capability.ts`; register `MockAccountCapability` and `PreAuthMobileAccountCapability` in `mobile/src/main.tsx`; remove `@/mobile/*` imports from `app/settings/account/services/account-capability.ts`.
  2. **Fix `lib -> __tests__` & `lib -> archive` leaks (A2):** Move shared planner corpus fixtures to `lib/planner/quality/fixtures/` (leaving re-exports in `__tests__/planner/*-fixtures.ts`) and move `shop-items.legacy.ts` into `lib/progression/legacy-shop-items.ts`.
  3. **Close `server-only` gap (A3):** Add `import "server-only";` to the 21 unguarded Prisma-importing modules in `lib/`.
  4. **Break 28 `lib/` circular dependencies (A5):**
     - Decouple `lib/ai/telemetry.ts` $\leftrightarrow$ `lib/ai/usage-logger.ts`.
     - Decouple `lib/calendar/contracts.ts` $\leftrightarrow$ `recurrence.ts` $\leftrightarrow$ `dates.ts`.
     - Extract `lib/calendar/internal/personal-event-helpers.ts` to break the 19 `personal-service.ts` cycles.
     - Decouple `lib/planner/contracts.ts` from policy runtime imports (6 cycles).
  5. **Gate dev/prototype routes (A9):** Add `/sylv-preview` and `/dashboard-design` to `DEV_ONLY_ROUTE_PREFIXES` in `proxy.ts`.
  6. **Repair tooling drift (A10):** Update `package.json` `"lint": "eslint ."`, fix `scripts/build/build-planner-worker.mjs` Node version check and `config/tsconfig.planner-worker.json` resolution, and add `__tests__/security/architecture-boundaries.test.ts` to enforce zero `app/lib -> mobile/__tests__/archive` imports and 100% `server-only` coverage on Prisma modules.
- **Validation Gates:**
  - `npx next typegen && npx tsc --noEmit` passes with 0 errors.
  - `npm run lint` passes with 0 errors.
  - `npm run planner:worker:build` succeeds on Node 24.
  - `npm run test -- --run` passes all suites including new `__tests__/security/architecture-boundaries.test.ts`.
  - `npm run mobile:build && npm run mobile:verify` succeeds with zero leaked server or mock tokens.
  - Python/AST cycle detector confirms **0 circular dependencies** in `lib/` and **0 cross-layer leaks**.
- **Completion Criteria:** Clean git commit checkpoint `phase-2-boundaries-and-cycles`.

---

### Phase 3 — `lib/` Domain Modularization (`core`, `auth`, `progression`, `study`, `social`, `workspaces`)

**Objective:** Replace the flat 72-file `lib/*.ts` root (**A4**) with 6 clear, environment-aware domain directories while preserving backward compatibility via thin re-export shims for high-fan-out modules.

- **Prerequisites:** Phase 2 completed and verified.
- **Scope of Work:**
  1. Create `lib/core/{server,client,shared}/`, `lib/auth/`, `lib/progression/`, `lib/study/`, `lib/social/`, and `lib/workspaces/`.
  2. Move the 72 top-level `lib/*.ts` files into their target domain subdirectories in 6 atomic commits (one per domain directory) following Section 3.1 of [`MIGRATION_BLUEPRINT.md`](../../../documentation/architecture/repository-modernization/MIGRATION_BLUEPRINT.md).
  3. Place thin `export *` re-export shims at the 19 high-fan-out `lib/<name>.ts` paths (`prisma.ts`, `auth-server.ts`, `timezone-service.ts`, `auth.ts`, `client-data-cache.ts`, `game-engine.ts`, `focus-background-types.ts`, `api-transport.ts`, `execution-coordination.ts`, `focus-background-client.ts`, `motion.ts`, `study-schedule-service.ts`, `timer-engine.ts`, `shop-items.ts`, `rate-limit.ts`, `session-math.ts`, `subject-service.ts`, `color-utils.ts`, `focus-background-preference.ts`).
  4. Update low-fan-out direct imports (`< 10` importers) across `app/`, `lib/`, and `__tests__/`.
  5. Update `mobile/vite.config.ts` `serverBoundaryGuardPlugin()` to block `/lib/core/server/` and `//server/` paths.
- **Validation Gates:**
  - `npx tsc --noEmit` and `npm run typecheck:engine` pass.
  - `npm run test -- --run` passes all 424 test suites (including `__tests__/pixel-display/boundaries.test.ts`).
  - `npm run build` (Next.js production build) succeeds.
  - `npm run mobile:build && npm run mobile:verify` succeeds.
- **Completion Criteria:** Top-level `lib/` contains only domain subdirectories plus documented high-fan-out shims; checkpoint `phase-3-lib-modularization`.

---

### Phase 4 — `app/components/` & `lib/planner/` Structural Organization

**Objective:** Organize the 40 loose files in `app/components/` (**A6**) and the 49 loose files in `lib/planner/` (**A7**) into clear functional subdirectories.

- **Prerequisites:** Phase 3 completed and verified.
- **Scope of Work:**
  1. **Organize `app/components/`:**
     - Move files into `app/components/{shell,providers,ui,modals,settings-primitives,planner}/` per Section 3.2 of [`MIGRATION_BLUEPRINT.md`](../../../documentation/architecture/repository-modernization/MIGRATION_BLUEPRINT.md).
     - Retain thin re-export shims at `app/components/{AuthProvider,RouteLoading,SettingsContext,ImmersiveModeButton,ThemeProvider,GlobalSystemWrapper,SylfAppShell}.tsx` so `mobile/src/MobileApp.tsx` and 73 route files remain conflict-free.
  2. **Organize `lib/planner/`:**
     - Keep `contracts.ts`, `dates.ts`, `errors.ts`, and `telemetry.ts` at `lib/planner/` root.
     - Group the remaining 45 top-level V1 files into `lib/planner/{client,policies,domain}/` per Section 3.3 of [`MIGRATION_BLUEPRINT.md`](../../../documentation/architecture/repository-modernization/MIGRATION_BLUEPRINT.md).
     - Update `__tests__/planner/client-boundary.test.ts` to cover `lib/planner/client/*`.
- **Validation Gates:**
  - `npx tsc --noEmit` and `npx eslint .` pass.
  - `npm run test -- --run __tests__/planner` and full `npm run test -- --run` pass.
  - `npm run build` and `npm run mobile:build && npm run mobile:verify` succeed.
- **Completion Criteria:** Checkpoint `phase-4-components-and-planner`.

---

### Phase 5 — Test Suite Consolidation, Legacy Asset Cleanup & Shim Hygiene

**Objective:** Clean up the 18 loose files at `__tests__/` root (**A8**), consolidate root `sylvs/` into `assets/sylvs/` (**A9**), and clean up stale documentation links (**A10**).

- **Prerequisites:** Phase 2 (can also be executed immediately after Phase 2 or after Phase 4).
- **Scope of Work:**
  1. **Consolidate `__tests__/` root:**
     - Move the 12 `focus-backgrounds*.test.ts(x)` files into `__tests__/focus/`.
     - Move `game-engine.test.ts`, `class-system.test.ts`, and `weekly-streak.test.ts` into `__tests__/economy/`.
     - Move `color-utils.test.ts` and `immersive-mode.test.tsx` into `__tests__/surface/`.
     - Move `test_planner_api.ts` into `scripts/qa/test-planner-api.ts`.
  2. **Consolidate root `sylvs/` into `assets/sylvs/`:**
     - `git mv sylvs assets/sylvs`.
     - Update the 4 referencing files: `scripts/assets/process-sylvs.mjs`, `scripts/assets/process-sylvs-true-8bit.mjs`, `scripts/assets/extract-palettes.mjs`, and `__tests__/pixel-display/assets.test.ts`.
  3. **Fix stale links in `archive/README.md`:** Replace hardcoded `/Users/aliumair/Desktop/sylf/...` paths with relative repository links.
- **Validation Gates:**
  - Zero loose `.test.ts(x)` files remain at the root of `__tests__/`.
  - `npm run test -- --run __tests__/focus __tests__/economy __tests__/surface __tests__/pixel-display/assets.test.ts` passes.
  - Root directory no longer contains `sylvs/`.
- **Completion Criteria:** Checkpoint `phase-5-tests-and-assets`.

---

### Phase 6 — Full-System Verification & Documentation Synchronization

**Objective:** Execute comprehensive end-to-end verification across web, mobile, worker, and database harnesses, and synchronize `AGENTS.md`, `README.md`, `codegraph.json`, and `documentation/README.md`.

- **Prerequisites:** All selected implementation phases completed.
- **Scope of Work:**
  1. Update `AGENTS.md` and `README.md` authority tables and directory maps to reflect new canonical paths in `lib/`, `app/components/`, and `lib/planner/`.
  2. Update `codegraph.json` context definitions so AI agents automatically resolve the new `lib/` domain subdirectories.
  3. Run the complete verification matrix:
     - `npx next typegen && npx tsc --noEmit`
     - `npm run typecheck:engine`
     - `npm run lint`
     - `npm run test -- --run`
     - `npm run build`
     - `npm run mobile:build && npm run mobile:verify`
     - `npm run planner:worker:build`
     - `node scripts/test/test-planner-postgres.mjs` (if Docker is active)
  4. Write the completion report under `documentation/architecture/repository-modernization/FINAL_VERIFICATION_REPORT.md`.
- **Completion Criteria:** All verification gates green, zero regressions, and documentation fully synchronized.
