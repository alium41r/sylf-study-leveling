# Sylf — Current State Repository & Architecture Audit

**Date:** 2 November 2026  
**Scope:** Complete repository-wide inspection of source code, build systems, runtime boundaries, database schemas, native integrations, tests, scripts, assets, and documentation.  
**Phase:** Phase 1 (Research, Analysis & Architecture Blueprint — Read-Only Audit)

---

## 1. Executive Assessment

Sylf is a full-stack student study, focus, and progression platform built on **Next.js 16.2.9 (App Router)**, **React 19.2.4**, **strict TypeScript 5**, **Tailwind CSS 4 + CSS Modules**, **Prisma 7.8.0 + PostgreSQL (`pg` adapter)**, and a **Vite 8.3.0 + Capacitor 8.5.1** Android client (`mobile/`, `android/`).

Following the earlier housekeeping passes on **2 October 2026** ([documentation housekeeping](../../infrastructure/reports/documentation-housekeeping-2026-10-02/report.md)) and **19 October 2026** ([repository reorganization](../../infrastructure/reports/2026-10-19-repository-reorganization/report.md)), the repository root, scripts, auxiliary configurations, source artwork, and documentation trees are **substantially cleaner and well-indexed**.

However, our deep static and dependency-graph analysis of **1,581 executable/schema/test files** (`app/`: 560, `lib/`: 434, `__tests__/`: 424, `scripts/`: 77, `prisma/`: 72, `mobile/`: 11, `config/`: 3) reveals that while the **outer shell** of the repository was cleaned up, the **internal module organization inside `lib/`, `app/`, and `__tests__/`** has accumulated structural debt as major subsystems (Planner V1/V2, Sylvie AI, Personal/Shared/External Calendar, Local-First Encrypted Notes, and Pixel Display) scaled rapidly.

### Key Quantitative Findings
- **Root Directory:** 19 files and 19 directories (including VCS/IDE hidden folders). Clean and compliant with framework discovery rules.
- **Cross-Boundary Import Graph:**
  - `app/ -> lib/`: **1,008 imports** (expected application-to-domain flow).
  - `mobile/ -> app/`: **36 imports** (canonical screen and shell reuse).
  - `mobile/ -> lib/`: **6 imports** (transport, timer, catalogs).
  - `app/ <-> mobile/`: **1 bidirectional cycle** (`app/settings/account/services/account-capability.ts` <-> `mobile/src/adapters/account/mobile-account-capability.ts`).
  - `lib/ -> __tests__/`: **3 reverse boundary violations** (`lib/planner/quality/corpus.ts` imports test fixtures from `__tests__/planner/*`).
  - `lib/ -> archive/`: **1 dormant boundary violation** (`lib/shop-items.ts` re-exports from `archive/legacy_catalog/shop-items.legacy.ts`).
  - `lib/ -> app/`: **0 imports** (strictly clean; `lib/` never imports `app/`).
- **Circular Dependencies:** **28 module-level import cycles** in `lib/`, concentrated in three clusters:
  1. `lib/ai/telemetry.ts <-> lib/ai/usage-logger.ts`
  2. `lib/calendar/contracts.ts <-> lib/calendar/recurrence.ts <-> lib/calendar/dates.ts` and `lib/calendar/personal-service.ts <-> {shared-projection, shared-service, notebook-service, external/service, external/security, external/connections}`
  3. `lib/planner/contracts.ts <-> {constraints, exam-policy, capacity, rebalance-policy, mastery-policy, roadmap-policy}`
- **Server-Only Guard Coverage Gap in `lib/`:** Out of **53 files** in `lib/` that directly import `lib/prisma.ts` or `@prisma/client`, **32 files** include `import "server-only"`, while **21 database-backed service modules omit `import "server-only"`**, relying solely on downstream developer vigilance or the mobile Vite regex list (`serverGuardPlugin` in `mobile/vite.config.ts`) to prevent accidental client bundling.
- **Flat Directory Sprawl:**
  - `lib/` contains **72 loose top-level `.ts` files** alongside 9 domain subdirectories (`acoustics`, `ai`, `calculator`, `calendar`, `emails`, `notes`, `pixel-display`, `planner`, `sylvs`).
  - `lib/planner/` contains **47 loose top-level `.ts` files** alongside 9 subdirectories (`comparison`, `copilot`, `designer`, `import`, `intake`, `quality`, `research`, `server`, `v2`).
  - `app/components/` contains **40 loose top-level files** mixing global providers, app shell navigation, feature modals (friends, profile, AI planner), settings primitives, and generic UI controls alongside 7 subdirectories.
  - `__tests__/` contains **14 loose top-level test files** (`focus-backgrounds*.test.ts`, `game-engine.test.ts`, `class-system.test.ts`, etc.) outside its 24 domain folders.

---

## 2. Inventory of Existing Repository Structure

### 2.1 Root-Level Layout

| Path | Type | Tracked Count / Size | Role & Assessment |
| --- | --- | --- | --- |
| `app/` | Directory | 560 source files | Next.js 16 App Router pages, route-local components, CSS Modules, and 81 REST API route handlers (`app/api/`). |
| `lib/` | Directory | 434 source files | Shared engines, domain contracts, client/server services, AI routing, and catalogs. |
| `__tests__/` | Directory | 424 test files | Vitest unit, component, boundary, security, and opt-in PostgreSQL/live test suites. |
| `prisma/` | Directory | `schema.prisma` (1,619 lines), `seed.ts`, 69 migrations | Canonical PostgreSQL schema (schema build version `37`), ordered SQL migrations, triggers, RPCs, and RLS policies. |
| `mobile/` | Directory | 11 source files + `index.html` + `vite.config.ts` | Vite + React client wrapper for Capacitor Android; lazy-loads canonical `*Screen` components from `app/`. |
| `android/` | Directory | Gradle project | Capacitor 8 Android native project (`app.sylf.study`). |
| `public/` | Directory | Static runtime assets | Served by Next.js and copied into `mobile/dist/` by Vite (`audio/`, `classes/`, `companions/`, `icons/`, `images/`, `landing/`, `notes-licenses/`, `sprites/`, `calendar-recognition/`). |
| `assets/` | Directory | 16 source art files | Non-runtime branding, Figma design references, and pixel companion source sheets. Cleanly indexed by `assets/README.md`. |
| `sylvs/` | Directory | 39 files | Legacy SVG companion base vectors, metadata JSON, and raster trace inputs. |
| `scripts/` | Directory | 77 script/harness files | Categorized into `assets/`, `build/`, `db/`, `dev/`, `qa/`, `security/`, `test/`, and `verify/`. Indexed by `scripts/README.md`. |
| `config/` | Directory | 8 files | Auxiliary TS, Vitest, and SVGO configs (`tsconfig.pixel-engine.json`, `tsconfig.planner-worker.json`, etc.). Indexed by `config/README.md`. |
| `documentation/` | Directory | ~25 feature/domain folders | Contracts, feature READMEs, phase reports, QA evidence, runbooks, and design references. Indexed by `documentation/README.md`. |
| `tools/` | Directory | `tools/ai-agent/` | Standalone experimental MCP/agent package excluded from web/mobile builds. |
| `archive/` | Directory | Dormant source & sprites | Archived Locker tabs, legacy shop catalog, and reference sprites. |
| `antigravity project template/` | Submodule | Git submodule (`80d4aa2`) | External starter template; not part of Sylf's runtime or architecture. |
| `.browser-qa/` | Directory | Shared QA output | Refreshable browser verification output used by `scripts/verify/*`. |
| `.agents/`, `.claude/`, `.codex/`, `.vscode/` | Directories | Agent/IDE configs | Workspace rules, skills (`sylf-ui-implementation`), and editor settings. |
| Root Config Files | Files | 19 files | `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `proxy.ts`, `prisma.config.ts`, `capacitor.config.ts`, `vitest.config.ts`, `vitest.setup.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `.prettierrc.json`, `.node-version`, `.gitignore`, `.gitmodules`, `.env.example`, `codegraph.json`, `supabase.cordis.yml`, `AGENTS.md`, `CLAUDE.md`, `README.md`. |

---

## 3. Deep-Dive Subsystem & Boundary Audit

### 3.1 Web Application (`app/`) and Route Architecture

`app/` serves dual roles in Sylf:
1. **Next.js App Router Entrypoint:** Defines URL segments (`page.tsx`, `layout.tsx`, `loading.tsx`), middleware/proxy (`proxy.ts`), and 81 API endpoints (`app/api/**/route.ts`).
2. **Canonical Screen Library for Web & Mobile:** Because `mobile/src/components/MobileRouteOutlet.tsx` lazy-loads screen components directly from `@/app/<feature>/components/<Feature>Screen`, `app/` is not merely a web-only routing layer—it is the shared UI layer for both platforms.

#### Structural Strengths in `app/`
- **Screen Extraction Pattern:** Major routes (`dashboard`, `focus`, `timer`, `social`, `locker`, `system`, `goals`, `quests`, `calendar`, `notes`, `shop`, and 15 `settings/*` subroutes) cleanly separate a thin Next.js `page.tsx` from a reusable `<Feature>Screen.tsx` component inside `app/<feature>/components/`.
- **System Shell Composition:** `app/layout.tsx` -> `ThemeProvider` -> `AuthProvider` -> `GlobalSystemWrapper` -> `SylfAppShell` is mirrored in `mobile/src/MobileApp.tsx`, guaranteeing consistent appearance tokens, audio contexts, level-up overlays, and timer sync across web and mobile.

#### Structural Weaknesses & Inconsistencies in `app/`
1. **`app/components/` Congestion (40 top-level files):**
   - Mixes **core shell & providers** (`AuthProvider.tsx`, `ThemeProvider.tsx`, `GlobalSystemWrapper.tsx`, `SylfAppShell.tsx`, `Sidebar.tsx`, `SidebarWrapper.tsx`, `TopRightBar.tsx`, `TimerSyncWorker.tsx`) with **domain-specific components** (`AddFriendModal.tsx`, `FriendRequestsModal.tsx`, `PublicProfileModal.tsx`, `ProfileModalContext.tsx`, `AiPlannerModal.tsx`, `AiPlannerPanel.tsx`, `AcousticsContext.tsx`, `AcousticsDynamicIsland.tsx`, `CustomAudioContext.tsx`, `SessionEndToast.tsx`, `SessionInviteToast.tsx`, `SettingsContext.tsx`, `SettingsPanel.tsx`, `SettingsRow.tsx`, `SettingsRowGroup.tsx`, `SettingsSectionCard.tsx`) and **reusable UI primitives** (`ConfirmationModal.tsx`, `CustomDatePicker.tsx`, `MarkdownRenderer.tsx`, `PasswordStrengthMeter.tsx`, `RouteLoading.tsx`, `ToggleSwitch.tsx`, `UserAvatar.tsx`).
   - Meanwhile, other features have subdirectories inside `app/components/` (`auth/`, `Calendar/`, `companion/`, `icons/`, `landing/`, `planner/`, `system/`). Notice the casing inconsistency: `app/components/Calendar/StudyCalendar.tsx` (capital `C`) vs `app/calendar/` (lowercase `c`).
2. **Duplicate / Legacy / Experimental Route Surfaces in `app/`:**
   - `app/studio/backgrounds/page.tsx` is a 1-line re-export of `app/admin/background-studio/page.tsx`.
   - `app/inventory/page.tsx` and `app/shop/page.tsx` both mount `ShopScreen`.
   - `app/companion-prototype/page.tsx` and `app/dev/pixel-display/page.tsx` both immediately redirect to `/locker?tab=identity&view=pixel-studio`, yet `companion-prototype` is still referenced by 6 verification scripts and 3 UI components (`TopRightBar.tsx`, `SettingsPanel.tsx`, `SidebarWrapper.tsx`).
   - `app/sylv-preview/page.tsx` (403 lines) is an unguarded Phase 1 workbench for the retired vector `lib/sylvs` system (`Documentation/pixel-display/README.md` notes built-in characters and vector/raster comparison routes were retired in favor of Pixel Display, though `sylvs/` tests remain). Furthermore, `/sylv-preview` and `/dashboard-design` are not listed in `DEV_ONLY_ROUTE_PREFIXES` or `PROTECTED_ROUTES` in `proxy.ts`.
   - `app/dashboard/` contains three domain-logic files (`pixel-companion-adapter.ts`, `pixel-cosmetic-registry.ts`, `pixel-modular-character.ts`) directly at the route root rather than in `app/dashboard/components/` or `lib/pixel-display/`. Note that `__tests__/pixel-display/boundaries.test.ts` explicitly asserts the exact path `app/dashboard/pixel-companion-adapter.ts`.
3. **Hook Dispersion:**
   - Shared hooks live in `app/hooks/` (`useDashboardData.ts`, `useDebounce.ts`, `useFocusPartyRealtime.ts`, `useHeartbeat.ts`, `usePostgresChanges.ts`, `useRealtimePresence.ts`), while feature hooks live in `app/focus/hooks/` (`useFocusBackground.ts`, `useFocusEyeComfort.ts`, `useScreenWakeLock.ts`, `useTimerLeadership.ts`, `useToolWindowManager.ts`), `app/calendar/components/` (`useCalendarPreferences.ts`, `useCalendarWorkspace.ts`), `app/components/planner/` (`useExamCapabilities.ts`), and `app/settings/components/` (`useSystemAppearance.ts`).

---

### 3.2 Shared Logic & Backend Services (`lib/`)

`lib/` contains 434 files and is the heart of Sylf's domain logic. However, its organization has diverged into two contrasting patterns:

1. **Structured Domain Subdirectories (9 directories, 362 files):**
   - `lib/planner/` (160+ files across V1 and `v2/`)
   - `lib/ai/` (68 files: router, orchestrator, providers, intents, cheap-answers, `planner/`, `sylvie/`)
   - `lib/pixel-display/` (45+ files: `engine/`, `renderers/`, `react/`, `content/`)
   - `lib/calendar/` (30 files: contracts, recurrence, ink, recognition worker, `external/`)
   - `lib/notes/` (28 files: local CRDT/Dexie engine, vault, pack, ink, `server/`)
   - `lib/sylvs/` (9 files: legacy SVG rig)
   - `lib/acoustics/` (2 files), `lib/calculator/` (1 file), `lib/emails/` (1 file)

2. **Flat Root Sprawl in `lib/` (72 loose `.ts` files):**
   All 72 files sit directly at `lib/<name>.ts`, mixing **five distinct architectural layers**:
   - **Database & Infrastructure Singletons (Server-Only):** `prisma.ts`, `redis.ts`, `supabase-storage.ts`, `rate-limit.ts`, `email.ts`, `upload-security.ts`, `execution-coordination.ts`.
   - **Authentication & Security (Mixed Client/Edge/Server):** `auth.ts` (Edge-safe JWT for `proxy.ts`), `auth-server.ts` (cookie + Prisma session verification, imported 117 times), `auth-admin.ts` (admin guard), `auth-service.ts` (login/register service), `oauth.ts`, `prelaunch.ts`.
   - **Client Transport & Browser Infrastructure:** `api-transport.ts` (web/mobile URL & fetch wrapper), `client-data-cache.ts` (SWR client cache + epoch invalidation), `supabase-browser.ts`, `realtime-status.ts`, `scroll-lock.ts`, `motion.ts`, `color-utils.ts`, `markdown-math.ts`, `image-dimensions.ts`, `immersive-mode.ts`.
   - **Server Domain Services (Prisma-backed):** `study-schedule-service.ts`, `subject-service.ts`, `session-service.ts`, `focus-party-service.ts`, `pixel-companion-service.ts`, `pixel-creation-service.ts`, `profile-service.ts`, `block-service.ts`, `cache-service.ts`, `hp-penalty-service.ts`, `db-notification-preferences.ts`, `achievement-facts.ts`, `timezone-server.ts`.
   - **Pure Domain Engines, Contracts & Catalogs (Client-Safe):** `timer-engine.ts`, `timer-leader.ts`, `timer-sync.ts`, `game-engine.ts`, `difficulty-engine.ts`, `session-math.ts`, `cognitive-stats.ts`, `skill-tree.ts`, `skill-tree-skeleton.ts`, `skill-tree-theme.ts`, `achievements-catalog.ts`, `achievement-progress.ts`, `archive-catalog.ts`, `cosmetics-catalog.ts`, `character-traits.ts`, `shop-items.ts`, `concept-forge.ts`, `system-collection.ts`, `study-systems.ts`, `study-schedule-types.ts`, `focus-background-types.ts`, `focus-background-preference.ts`, `focus-background-client.ts`, `focus-party-types.ts`, `pixel-companion-contract.ts`, `pixel-creations-client.ts`, `pixel-display-style.ts`, `privacy.ts`, `privacy-types.ts`, `provider-types.ts`, `notification-preferences.ts`, `goal-theme.ts`, `resources.ts`, `scholar-id.ts`, `timezone-service.ts`, `asset-manifest.ts`.

#### Why This Flat `lib/` Sprawl Hurts AI Agents and Maintainability
When an AI coding agent or developer inspects `lib/`, it cannot tell from the path whether `lib/privacy.ts` or `lib/study-schedule-service.ts` is safe to import in a shared React component or whether doing so will break `npm run mobile:build` by pulling `@prisma/client` into the client bundle. Indeed, `lib/study-schedule-types.ts` had to be created specifically because importing `lib/study-schedule-service.ts` into client components broke the mobile build guard.

---

### 3.3 Planner V1 (`lib/planner/`, `lib/ai/planner/`) vs. Planner V2 (`lib/planner/v2/`)

Planner is the largest and most complex subsystem in Sylf. A critical finding of our audit is the **active coexistence of three generations of planning code**:

1. **Classic AI Planner (`lib/ai/planning-engine.ts`, `lib/ai/orchestrator.ts`, `app/api/ai-planner/route.ts`, `app/components/AiPlannerPanel.tsx`, `app/components/AiPlannerModal.tsx`):**
   - The original single-prompt quest generator, retained via the Classic/Modes coexistence layer.
2. **Planner V1 Modes & Experience (`lib/planner/*.ts`, `lib/planner/{server,intake,research,import,copilot,designer,comparison,quality}/`, `lib/ai/planner/*.ts`, `app/api/planner/**`, `app/components/planner/**`):**
   - Implements Exam, Roadmap, and Mastery modes, Quick Plan intake (`PlannerIntakeSession`), Plan Designer, Copilot, DeepSeek/web research, PDF outline import, and revision materialization (`PlannerPlan`, `PlannerRevision`, `PlannerQuestLink`).
   - `lib/planner/` has **47 top-level files** mixing field definitions (`*-fields.ts`), policies (`*-policy.ts`), client fetchers (`*-client.ts`), and math helpers.
3. **Planner V2 Durable Core & Compiler (`lib/planner/v2/{contracts,intelligence,server}/`, `lib/planner/v2/main.ts`, `lib/planner/v2/session-client.ts`):**
   - Built across Phase 0, Phase 1, and Phase 2 Steps 1–6 (October 2026).
   - Owns `PlannerIntentVersion` and `PlannerAttempt`, the standalone background worker (`npm run planner:worker:build` -> `dist/planner-worker/main.js`), and **authoritative study session & timer settlement** (`lib/planner/v2/server/sessions.ts`, `lib/planner/v2/server/settlement.ts`, `lib/planner/v2/session-client.ts`).
   - **Crucial Cross-Domain Coupling:** Even though Planner V2's educational UI workspace (Phase 3) has not yet replaced the V1 UI, **Sylf's production Timer and Session lifecycle (`app/api/sessions/route.ts`, `lib/timer-sync.ts`) already depends on `lib/planner/v2/server/sessions.ts`, `lib/planner/v2/server/settlement.ts`, and `lib/planner/v2/session-client.ts`**!
   - **Worker Build Defect Recorded in Audit:** `config/tsconfig.planner-worker.json` sets `"rootDir": "../lib"` and compiles `lib/planner/v2/**` to CommonJS without path-alias rewriting. As noted in the 19 October reorganization report, `lib/ai/usage-logger.ts` uses `@/lib/prisma`, causing `tsc -p config/tsconfig.planner-worker.json` to fail on `@/` path resolution—and `scripts/build/build-planner-worker.mjs` also hardcodes `if (Number(process.versions.node.split(".")[0]) !== 26) throw new Error(...)` while `package.json` specifies `"node": "24.x"`.

---

### 3.4 Mobile & Native Architecture (`mobile/`, `android/`, `capacitor.config.ts`)

Sylf's mobile architecture is a **shared-screen single-package adapter pattern** (not a separate monorepo app):
- `mobile/vite.config.ts` bundles `mobile/index.html` + `mobile/src/main.tsx` into `mobile/dist/`, resolving `@` to the repository root and aliasing `next/navigation`, `next/link`, and `next/image` to shims in `mobile/src/adapters/navigation/`.
- `mobile/src/MobileApp.tsx` mounts the exact same `ThemeProvider`, `AuthProvider`, `GlobalSystemWrapper`, and `SylfAppShell` as `app/layout.tsx`.
- `mobile/src/components/MobileRouteOutlet.tsx` lazy-loads 26 canonical screen components from `@/app/**/components/*Screen`.
- **Security & Boundary Enforcement:**
  - `serverGuardPlugin()` in `mobile/vite.config.ts` blocks 14 regex patterns (`@prisma/client`, `/lib/prisma`, `/lib/auth-server`, `server-only`, etc.) at Rollup resolution time.
  - `scripts/verify/verify-mobile-bundle.mjs` scans `mobile/dist/` for 13 forbidden server/secret strings and verifies `.mock-manifest.json` is fail-closed (`mockEnabled: false`) in production builds.
- **Architectural Flaw Identified:**
  - `app/settings/account/services/account-capability.ts` directly imports `MockAccountCapability` and `PreAuthMobileAccountCapability` from `@/mobile/src/adapters/account/mobile-account-capability`, while `mobile-account-capability.ts` imports `AccountCapability` from `@/app/settings/account/services/account-capability`. This creates an **`app/ <-> mobile/` circular dependency** where the Next.js web build compiles `mobile/src/adapters/account/mobile-account-capability.ts` (and transitively `mobile/src/adapters/api/mock-api.ts`) into the web bundle!

---

### 3.5 Sylf Notes (`lib/notes/`, `app/notes/`, `app/api/notes/`) & Study Workspaces

- **Current State:** Phases 1–4 of Sylf Notes are implemented cleanly in `lib/notes/` (24 client-safe modules for BlockNote v0.56.0, Yjs 13 CRDTs, Dexie IndexedDB journal/outbox, WebCrypto vault, `.sylfnote` ZIP pack, and vector ink controller/renderer, plus 4 server modules under `lib/notes/server/` for Google Drive OAuth/broker).
- **Build Coupling:** `npm run build` and `npm run mobile:build` run `scripts/build/build-notes-notices.mjs` (`prebuild`), which walks `node_modules/@blocknote/*` to emit MPL-2.0 notices and `blocknote-0.56.0-source.zip` into `public/notes-licenses/`.
- **Future Direction (`documentation/workspaces/master-plan-october-2026.md`):** Study Workspaces will orchestrate **Sylf Notes (documents)** + **Sylf Workspaces (environment/Resource Shelf)** + **Sylf Sessions (timer/progression)** without duplicating ownership. Currently, `lib/resources.ts` is a tiny 5-importer file at the root of `lib/`; there is no dedicated `lib/workspaces/` domain boundary prepared yet.

---

### 3.6 Personal, Shared & External Calendar (`lib/calendar/`, `app/calendar/`, `app/api/calendar/`)

- **Current State:** Phases 1–6 are implemented in `lib/calendar/` (21 root files + 9 files in `lib/calendar/external/`), `app/calendar/components/` (22 files), and `app/components/Calendar/StudyCalendar.tsx`.
- **Build Coupling:** `predev`, `prebuild`, and `premobile:build` execute `scripts/build/build-calendar-recognition.mjs`, which bundles `lib/calendar/recognition.worker.ts` and copies ONNX Runtime Web WASM binaries into `public/calendar-recognition/`.
- **Architectural Issues Identified:**
  1. **Internal Circular Dependencies (10 cycles):** `lib/calendar/contracts.ts` imports `normalizeRecurrence` from `./recurrence`, which imports `./dates` and `./contracts`. Even more significantly, `lib/calendar/personal-service.ts` is a hub that imports from `shared-projection.ts`, `notebook-service.ts`, and `external/service.ts`, all of which import helpers/types back from `personal-service.ts`.
  2. **Split UI Ownership:** `app/components/Calendar/StudyCalendar.tsx` sits inside `app/components/Calendar/` (the only PascalCase folder in `app/components/`) and wraps `app/calendar/components/CalendarWorkspace.tsx`.

---

### 3.7 Companion Systems (4 Generations in the Repository)

As documented in `documentation/README.md`, Sylf has evolved through four companion systems, and remnants of all four remain in the file tree:
1. **Landing SVG Companion (Active):** `app/components/landing/companion/` + `app/components/landing/journey/`. Powers the public landing page and the authenticated floating Sylvie quick-chat companion.
2. **Pixel Display Engine (Active Canonical In-App Companion):** `lib/pixel-display/{engine,renderers,react,content}/`, `app/components/companion/`, `app/dashboard/pixel-*`, `app/locker/components/{identity,studio}/`. Enforced by strict mechanical boundary tests (`__tests__/pixel-display/boundaries.test.ts` and `config/tsconfig.pixel-engine.json`).
3. **Layered Raster Pixel Companion (Historical / Retired Product Path, Retained Asset Pipeline):** `lib/pixel-companion-contract.ts`, `assets/pixel-companion/`, `scripts/assets/*pixel-companion*.mjs`, `__tests__/landing/pixel-companion-layering.test.tsx`.
4. **Vector `sylvs` Workbench (Historical / Retired Product Path, Retained in Tree):** `sylvs/` (root directory with 39 files), `lib/sylvs/` (9 files), `app/sylv-preview/page.tsx`, `scripts/assets/{optimize-sylv-svgs,pipeline-vectorize-sylvs,render-comparison}.mjs`, `__tests__/sylvs/`.

---

### 3.8 Database Schema & Migrations (`prisma/`)

- `prisma/schema.prisma` contains **55 models** and **15 enums** across 1,619 lines, with **69 ordered SQL migrations** in `prisma/migrations/`.
- **Strengths:**
  - Single source of truth for schema (`prisma/schema.prisma`) and connection pooling (`lib/prisma.ts`, `SCHEMA_BUILD_VERSION = 37`).
  - Extensive PostgreSQL-level integrity: atomic RPCs for session settlement, XP/Sylph/HP ledgers, skill unlocks, row-level security (RLS) policies, and `tsvector` triggers.
- **Concerns & Constraints:**
  - **Historical Migration Bootstrap Gap:** As documented in `scripts/test/test-planner-postgres.mjs` and `scripts/test/test-timer-postgres.mjs`, the early August 2026 migrations have a missing-enum bootstrap gap when replayed from an empty database, so the disposable PostgreSQL test harnesses synthesize a baseline via `prisma migrate diff` and then layer later migrations on top. Consequently, **existing migration directory names and `prisma/migrations/` paths must never be renamed or reordered**, as 14 test harnesses in `scripts/test/` hardcode exact migration folder names.
  - **Legacy Duplicate Models:** `User` vs `UserStats` (both track `level`, `xp`/`currentXP`, and the 5 cognitive stats), and `InventoryItem` vs `UserInventory` + `Item`. These are actively synchronized by PostgreSQL RPCs and must be preserved at the schema level.

---

### 3.9 Testing, Scripts & Verification Harnesses (`__tests__/`, `scripts/`, `config/`)

- **Test Organization (`__tests__/`):**
  - 424 test files across 24 subdirectories, plus 14 loose `*.test.ts(x)` files at the root of `__tests__/`, plus `__tests__/test_planner_api.ts` (a loose manual script inside `__tests__/`).
  - **65 files across `__tests__/`, `scripts/`, and `config/` contain hardcoded filesystem path literals** (e.g., `readFileSync("lib/planner/server/...")`, `join(ROOT, "app", "dashboard", "pixel-companion-adapter.ts")`).
  - Moving any file referenced by `__tests__/pixel-display/boundaries.test.ts` or `__tests__/planner/client-boundary.test.ts` without updating or preserving its contract will immediately break architectural verification suites.
- **Known Pre-Existing Issues Confirmed During Audit:**
  1. `package.json` `"lint": "next lint"` calls the removed Next.js 16 subcommand (documented in `AGENTS.md`).
  2. `scripts/build/build-planner-worker.mjs` checks for Node major `26` while `package.json` pins `"node": "24.x"`, and `config/tsconfig.planner-worker.json` fails on `@/lib/prisma` in `lib/ai/usage-logger.ts`.
  3. `archive/README.md` contains hardcoded `/Users/aliumair/Desktop/sylf/...` paths from an older machine checkout.
  4. `lib/planner/quality/corpus.ts` (a production `lib/` module) imports test fixtures from `@/__tests__/planner/{exam,roadmap,mastery}-fixtures`.

---

## 4. Summary of Architectural Issues to Solve

| ID | Category | Issue Description | Severity | Impact on AI Agents & Developers |
| --- | --- | --- | --- | --- |
| **A1** | **Boundary Leak (`app <-> mobile`)** | `app/settings/account/services/account-capability.ts` imports `mobile/src/adapters/account/mobile-account-capability.ts`, pulling mobile mock adapters into the web bundle and creating a circular dependency. | **High** | Violates unidirectional platform dependency (`mobile -> app -> lib`) and bundles mock user fixtures into web code. |
| **A2** | **Boundary Leak (`lib -> __tests__` & `archive`)** | `lib/planner/quality/corpus.ts` imports `@/__tests__/planner/*-fixtures`; `lib/shop-items.ts` imports `@/archive/legacy_catalog/shop-items.legacy`. | **High** | Production `lib/` code depends on test and archive directories. |
| **A3** | **Missing `server-only` Guards in `lib/`** | 21 of 53 Prisma-importing files in `lib/` lack `import "server-only"`. | **High** | Accidental import into a shared client screen passes Next.js typecheck or only fails late in `mobile:build`. |
| **A4** | **Flat `lib/` Root (72 loose files)** | 72 files at `lib/*.ts` mix server-only DB services, Edge JWT helpers, browser caches, and pure math/game engines without visual or structural separation. | **High** | Forces AI agents to read file contents to know if a module is client-safe, server-only, or domain-specific. |
| **A5** | **Circular Dependencies in `lib/` (28 cycles)** | Cycles in `lib/calendar/` (`personal-service.ts` hub & `contracts.ts`), `lib/planner/` (`contracts.ts` <-> policies), and `lib/ai/` (`telemetry.ts` <-> `usage-logger.ts`). | **Medium** | Complicates bundler tree-shaking, isolated unit testing, and worker compilation. |
| **A6** | **`app/components/` Congestion (40 loose files)** | Core app shell, context providers, feature modals, settings primitives, and generic UI widgets are mixed in one flat folder; `Calendar/` uses inconsistent PascalCase. | **Medium** | Hard to distinguish global shell authorities from feature-local modals or reusable UI primitives. |
| **A7** | **`lib/planner/` Root Sprawl (47 loose files)** | V1 Exam/Roadmap/Mastery policies, fields, client helpers, and math utilities sit flat in `lib/planner/` beside 9 subdirectories. | **Medium** | High cognitive load when navigating between Planner V1 and `lib/planner/v2/`. |
| **A8** | **Loose Root Tests in `__tests__/` (15 files)** | 12 `focus-backgrounds-*.test.ts(x)` files, `game-engine.test.ts`, `class-system.test.ts`, `color-utils.test.ts`, `immersive-mode.test.tsx`, `weekly-streak.test.ts`, and `test_planner_api.ts` sit at `__tests__/` root. | **Low** | Inconsistent test discovery when running domain-scoped Vitest commands (e.g., `vitest run __tests__/focus`). |
| **A9** | **Unguarded / Redundant Dev & Legacy Routes** | `app/sylv-preview` and `app/dashboard-design` are not guarded by `DEV_ONLY_ROUTE_PREFIXES` in `proxy.ts`; `app/studio/backgrounds` duplicates `app/admin/background-studio`; root `sylvs/` sits outside `assets/` or `archive/`. | **Low** | Exposes development workbenches in production routing and clutters top-level route/root discovery. |
| **A10** | **Tooling & Config Drift** | `npm run lint` uses removed `next lint`; `build-planner-worker.mjs` pins Node 26 vs `package.json` Node 24 and `tsconfig.planner-worker.json` lacks `@/*` path resolution. | **Medium** | Standard npm lifecycle scripts (`npm run lint`, `npm run planner:worker:build`) fail out of the box. |
