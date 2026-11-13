# Sylf — Repository Migration Blueprint

**Phase:** 1 — Repository Audit & Architecture Blueprint (Research & Planning Only)  
**Date:** November 2, 2026  
**Scope:** Complete existing-to-proposed file mapping, boundary refactoring specifications, configuration adjustments, web/native compatibility safeguards, and rollback strategy.

---

## 1. Migration Philosophy & Guardrails

1. **Zero Big-Bang Rewrites:** Every migration phase leaves the repository compiling, passing tests, and deployable.
2. **Shim-First High-Fan-Out Moves:** Modules with $\ge 15$ importers (such as `lib/prisma.ts` [232 importers], `lib/auth-server.ts` [117 importers], `app/components/AuthProvider.tsx` [73 importers], and `lib/timezone-service.ts` [52 importers]) retain thin re-export shims at their legacy `@/lib/<name>` or `@/app/components/<name>` paths during Phases 3–4 so active feature worktrees never suffer mass merge conflicts.
3. **Preserve 65 Hardcoded Filesystem Path Contracts:** Root directories (`app/`, `lib/`, `prisma/`, `mobile/`, `public/`, `assets/`, `scripts/`, `config/`, `__tests__/`, `documentation/`) remain at their exact root locations.
4. **Database & Migration Immutability:** `prisma/schema.prisma` and all 69 ordered folders in `prisma/migrations/` are never moved, renamed, or rewritten for structural aesthetics.

---

## 2. Boundary & Cycle Refactoring Specifications (Phase 2)

Before moving any files, four targeted code-level boundary fixes resolve issues **A1**, **A2**, **A3**, and **A5**.

### 2.1 Breaking the `app <-> mobile` Circular Dependency (Issue A1)

| Current File | Current Problem | Proposed Target & Action |
| --- | --- | --- |
| `app/settings/account/services/account-capability.ts` | Imports `MockAccountCapability` and `PreAuthMobileAccountCapability` from `@/mobile/src/adapters/account/mobile-account-capability`, pulling mobile mock fixtures (`MOCK_STUDENT_USER`) into the Next.js web bundle. | Move contract (`AccountCapability` interface + `registerMobileAccountCapabilities` registry hook + `getAccountCapability` resolver) to `lib/auth/account-capability.ts`. Re-export from `app/settings/account/services/account-capability.ts` for existing callers. |
| `mobile/src/adapters/account/mobile-account-capability.ts` | Imports `AccountCapability` from `app/settings/account/services/account-capability.ts`. | Import `AccountCapability` from `@/lib/auth/account-capability`. |
| `mobile/src/main.tsx` | Does not register account capabilities at bootstrap. | Call `registerMobileAccountCapabilities({ preAuth: new PreAuthMobileAccountCapability(), mock: new MockAccountCapability() })` at mobile startup. |

### 2.2 Eliminating `lib -> __tests__` and `lib -> archive` Leaks (Issue A2)

| Current File | Forbidden Import | Proposed Fix |
| --- | --- | --- |
| `lib/planner/quality/corpus.ts` | `@/__tests__/planner/exam-fixtures`, `@/__tests__/planner/roadmap-fixtures`, `@/__tests__/planner/mastery-fixtures` | Move the fixture definitions to `lib/planner/quality/fixtures/{exam-fixtures,roadmap-fixtures,mastery-fixtures}.ts`. Update `lib/planner/quality/corpus.ts` to import from `./fixtures/*`. Replace `__tests__/planner/{exam,roadmap,mastery}-fixtures.ts` with 1-line `export *` re-exports so all 424 test files continue working unchanged. |
| `lib/shop-items.ts` | `@/archive/legacy_catalog/shop-items.legacy` | Copy active legacy catalog items to `lib/progression/legacy-shop-items.ts` (keeping `archive/legacy_catalog/shop-items.legacy.ts` as historical archive). Update `lib/shop-items.ts` to import from `@/lib/progression/legacy-shop-items`. |

### 2.3 Closing the 21 `server-only` Guards in `lib/` (Issue A3)

Add `import "server-only";` at the top of the following 21 server-side modules that directly import `lib/prisma.ts` or `@prisma/client` without a boundary guard (note: `vitest.config.ts` already maps `server-only` to `__tests__/planner/server-only-stub.ts`, so Vitest suites remain unaffected):

1. `lib/achievement-facts.ts`
2. `lib/ai/chat-tool-executor.ts`
3. `lib/ai/context-engine.ts`
4. `lib/ai/daily-briefing-service.ts`
5. `lib/ai/intents/executors.ts`
6. `lib/ai/planning-engine.ts`
7. `lib/ai/usage-limiter.ts`
8. `lib/ai/usage-logger.ts`
9. `lib/auth-admin.ts`
10. `lib/auth-server.ts`
11. `lib/auth-service.ts`
12. `lib/block-service.ts`
13. `lib/cache-service.ts`
14. `lib/db-notification-preferences.ts`
15. `lib/focus-party-service.ts`
16. `lib/pixel-companion-service.ts`
17. `lib/pixel-creation-service.ts`
18. `lib/prisma.ts`
19. `lib/privacy.ts`
20. `lib/profile-service.ts`
21. `lib/study-schedule-service.ts`
22. `lib/subject-service.ts`
23. `lib/timezone-server.ts`

### 2.4 Breaking the 28 Intra-`lib/` Circular Dependencies (Issue A5)

| Cycle Cluster | Participating Files | Cycle-Breaking Refactoring |
| --- | --- | --- |
| **AI Telemetry (1 cycle)** | `lib/ai/telemetry.ts` $\leftrightarrow$ `lib/ai/usage-logger.ts` | Extract shared telemetry payload types (`AiUsageTelemetryEvent`, `AiTelemetrySpan`) into `lib/ai/types.ts` (or `lib/ai/telemetry-types.ts`). Both `telemetry.ts` and `usage-logger.ts` import types from the leaf module. |
| **Calendar Contracts & Recurrence (2 cycles)** | `lib/calendar/contracts.ts` $\leftrightarrow$ `lib/calendar/recurrence.ts` $\leftrightarrow$ `lib/calendar/dates.ts` | Keep `lib/calendar/contracts.ts` strictly declarative (zero runtime helper imports from `recurrence.ts` or `dates.ts`). Move runtime normalization helpers into `dates.ts` and `recurrence.ts`, which import types from `contracts.ts`. |
| **Calendar Personal Service Hub (19 cycles)** | `lib/calendar/personal-service.ts` $\leftrightarrow$ `shared-projection.ts`, `shared-service.ts`, `notebook-service.ts`, `external/service.ts`, `external/security.ts`, `external/connections.ts` | Extract pure row-mappers, DTO validators, and shared query helpers from `personal-service.ts` into `lib/calendar/internal/personal-event-helpers.ts`. Have `shared-projection.ts`, `shared-service.ts`, `notebook-service.ts`, and `external/*` import those helpers from `internal/personal-event-helpers.ts` instead of `personal-service.ts`. |
| **Planner Contracts & Policies (6 cycles)** | `lib/planner/contracts.ts` $\leftrightarrow$ `constraints.ts`, `exam-policy.ts`, `capacity.ts`, `rebalance-policy.ts`, `mastery-policy.ts`, `roadmap-policy.ts` | Keep `lib/planner/contracts.ts` as a pure schema/type/constant leaf module. Replace runtime policy function calls inside `contracts.ts` with pure schema definitions, or move composite contract builders that depend on policy modules into `lib/planner/domain/contract-builders.ts` (re-exported by `contracts.ts` if needed by external callers, while policy files import base types from `lib/planner/schema-types.ts`). |

---

## 3. Exhaustive File Mapping Tables

### 3.1 `lib/` Root (72 Files $\rightarrow$ 6 Domain Subdirectories + Transitional Shims)

All 72 top-level `.ts` files in `lib/` are mapped below into `lib/core/{server,client,shared}/`, `lib/auth/`, `lib/progression/`, `lib/study/`, `lib/social/`, and `lib/workspaces/`.

| Existing File (`lib/<file>`) | Importers | Proposed Canonical Path | Transitional Shim at `lib/<file>`? | Environment Boundary |
| --- | ---: | --- | --- | --- |
| `prisma.ts` | 232 | `lib/core/server/prisma.ts` | **Yes (Permanent/Long-lived)** | `server-only` |
| `redis.ts` | 4 | `lib/core/server/redis.ts` | Yes | `server-only` |
| `cache-service.ts` | 4 | `lib/core/server/cache-service.ts` | No | `server-only` |
| `rate-limit.ts` | 15 | `lib/core/server/rate-limit.ts` | Yes | `server-only` |
| `email.ts` | 3 | `lib/core/server/email.ts` | No | `server-only` |
| `supabase-storage.ts` | 4 | `lib/core/server/supabase-storage.ts` | No | `server-only` |
| `upload-security.ts` | 5 | `lib/core/server/upload-security.ts` | No | `server-only` |
| `timezone-server.ts` | 10 | `lib/core/server/timezone-server.ts` | Yes | `server-only` |
| `prelaunch.ts` | 2 | `lib/core/server/prelaunch.ts` | No | `server-only` |
| `api-transport.ts` | 29 | `lib/core/client/api-transport.ts` | **Yes** | Client / Shared |
| `client-data-cache.ts` | 42 | `lib/core/client/client-data-cache.ts` | **Yes** | Client / Shared |
| `execution-coordination.ts` | 24 | `lib/core/client/execution-coordination.ts` | **Yes** | Client / Shared |
| `supabase-browser.ts` | 6 | `lib/core/client/supabase-browser.ts` | No | Client |
| `realtime-status.ts` | 4 | `lib/core/client/realtime-status.ts` | No | Client / Shared |
| `scroll-lock.ts` | 5 | `lib/core/client/scroll-lock.ts` | No | Client |
| `motion.ts` | 20 | `lib/core/client/motion.ts` | **Yes** | Client / Shared |
| `immersive-mode.ts` | 4 | `lib/core/client/immersive-mode.ts` | No | Client / Shared |
| `timezone-service.ts` | 52 | `lib/core/shared/timezone-service.ts` | **Yes** | Pure Shared |
| `color-utils.ts` | 12 | `lib/core/shared/color-utils.ts` | Yes | Pure Shared |
| `markdown-math.ts` | 4 | `lib/core/shared/markdown-math.ts` | No | Pure Shared |
| `asset-manifest.ts` | 9 | `lib/core/shared/asset-manifest.ts` | No | Pure Shared |
| `image-dimensions.ts` | 3 | `lib/core/shared/image-dimensions.ts` | No | Pure Shared |
| `auth.ts` | 47 | `lib/auth/auth.ts` | **Yes** | Isomorphic |
| `auth-server.ts` | 117 | `lib/auth/auth-server.ts` | **Yes (Permanent/Long-lived)** | `server-only` |
| `auth-service.ts` | 6 | `lib/auth/auth-service.ts` | No | `server-only` |
| `auth-admin.ts` | 4 | `lib/auth/auth-admin.ts` | No | `server-only` |
| `oauth.ts` | 5 | `lib/auth/oauth.ts` | No | `server-only` |
| `provider-types.ts` | 4 | `lib/auth/provider-types.ts` | No | Pure Shared |
| `scholar-id.ts` | 4 | `lib/auth/scholar-id.ts` | No | Pure Shared |
| `game-engine.ts` | 34 | `lib/progression/game-engine.ts` | **Yes** | Pure Shared |
| `difficulty-engine.ts` | 8 | `lib/progression/difficulty-engine.ts` | No | Pure Shared |
| `session-math.ts` | 14 | `lib/progression/session-math.ts` | Yes | Pure Shared |
| `cognitive-stats.ts` | 11 | `lib/progression/cognitive-stats.ts` | Yes | Pure Shared |
| `character-traits.ts` | 9 | `lib/progression/character-traits.ts` | No | Pure Shared |
| `skill-tree.ts` | 10 | `lib/progression/skill-tree.ts` | Yes | Pure Shared |
| `skill-tree-skeleton.ts` | 4 | `lib/progression/skill-tree-skeleton.ts` | No | Pure Shared |
| `skill-tree-theme.ts` | 3 | `lib/progression/skill-tree-theme.ts` | No | Pure Shared |
| `achievement-facts.ts` | 5 | `lib/progression/achievement-facts.ts` | No | `server-only` |
| `achievement-progress.ts` | 6 | `lib/progression/achievement-progress.ts` | No | Pure Shared |
| `achievements-catalog.ts` | 8 | `lib/progression/achievements-catalog.ts` | No | Pure Shared |
| `shop-items.ts` | 16 | `lib/progression/shop-items.ts` | Yes | Pure Shared |
| `cosmetics-catalog.ts` | 9 | `lib/progression/cosmetics-catalog.ts` | No | Pure Shared |
| `hp-penalty-service.ts` | 4 | `lib/progression/hp-penalty-service.ts` | No | `server-only` |
| `pixel-companion-contract.ts` | 8 | `lib/progression/pixel-companion-contract.ts` | No | Pure Shared |
| `pixel-companion-service.ts` | 5 | `lib/progression/pixel-companion-service.ts` | No | `server-only` |
| `pixel-creation-service.ts` | 6 | `lib/progression/pixel-creation-service.ts` | No | `server-only` |
| `pixel-creations-client.ts` | 5 | `lib/progression/pixel-creations-client.ts` | No | Client / Shared |
| `pixel-display-style.ts` | 7 | `lib/progression/pixel-display-style.ts` | No | Pure Shared |
| `timer-engine.ts` | 16 | `lib/study/timer-engine.ts` | **Yes** | Client / Shared |
| `timer-leader.ts` | 6 | `lib/study/timer-leader.ts` | No | Client / Shared |
| `timer-sync.ts` | 5 | `lib/study/timer-sync.ts` | No | Client / Shared |
| `session-service.ts` | 8 | `lib/study/session-service.ts` | No | `server-only` |
| `study-schedule-service.ts` | 18 | `lib/study/study-schedule-service.ts` | **Yes** | `server-only` |
| `study-schedule-types.ts` | 11 | `lib/study/study-schedule-types.ts` | Yes | Pure Shared |
| `subject-service.ts` | 14 | `lib/study/subject-service.ts` | Yes | `server-only` |
| `study-systems.ts` | 9 | `lib/study/study-systems.ts` | No | Pure Shared |
| `system-collection.ts` | 4 | `lib/study/system-collection.ts` | No | Pure Shared |
| `goal-theme.ts` | 6 | `lib/study/goal-theme.ts` | No | Pure Shared |
| `focus-background-types.ts` | 30 | `lib/study/focus-background-types.ts` | **Yes** | Pure Shared |
| `focus-background-preference.ts` | 12 | `lib/study/focus-background-preference.ts` | Yes | Pure Shared |
| `focus-background-client.ts` | 20 | `lib/study/focus-background-client.ts` | **Yes** | Client / Shared |
| `focus-party-service.ts` | 8 | `lib/social/focus-party-service.ts` | No | `server-only` |
| `focus-party-types.ts` | 9 | `lib/social/focus-party-types.ts` | No | Pure Shared |
| `profile-service.ts` | 7 | `lib/social/profile-service.ts` | No | `server-only` |
| `privacy.ts` | 6 | `lib/social/privacy.ts` | No | `server-only` |
| `privacy-types.ts` | 5 | `lib/social/privacy-types.ts` | No | Pure Shared |
| `block-service.ts` | 4 | `lib/social/block-service.ts` | No | `server-only` |
| `notification-preferences.ts` | 6 | `lib/social/notification-preferences.ts` | No | Pure Shared |
| `db-notification-preferences.ts` | 4 | `lib/social/db-notification-preferences.ts` | No | `server-only` |
| `archive-catalog.ts` | 5 | `lib/workspaces/archive-catalog.ts` | No | Pure Shared |
| `concept-forge.ts` | 4 | `lib/workspaces/concept-forge.ts` | No | Pure Shared |
| `resources.ts` | 6 | `lib/workspaces/resources.ts` | No | Pure Shared |

### 3.2 `app/components/` Root (40 Files $\rightarrow$ 6 Subdirectories + Transitional Shims)

| Existing File (`app/components/<file>`) | Importers | Proposed Canonical Path | Transitional Shim? |
| --- | ---: | --- | --- |
| `GlobalSystemWrapper.tsx` | 3 | `app/components/shell/GlobalSystemWrapper.tsx` | Yes (`app/layout.tsx`, `MobileApp.tsx`) |
| `SylfAppShell.tsx` | 3 | `app/components/shell/SylfAppShell.tsx` | Yes (`app/layout.tsx`, `MobileApp.tsx`) |
| `Sidebar.tsx` | 5 | `app/components/shell/Sidebar.tsx` | No |
| `SidebarWrapper.tsx` | 2 | `app/components/shell/SidebarWrapper.tsx` | No |
| `TopRightBar.tsx` | 3 | `app/components/shell/TopRightBar.tsx` | No |
| `AcousticsDynamicIsland.tsx` | 2 | `app/components/shell/AcousticsDynamicIsland.tsx` | No |
| `TimerSyncWorker.tsx` | 2 | `app/components/shell/TimerSyncWorker.tsx` | No |
| `AuthProvider.tsx` | 73 | `app/components/providers/AuthProvider.tsx` | **Yes (Permanent/Long-lived)** |
| `ThemeProvider.tsx` | 8 | `app/components/providers/ThemeProvider.tsx` | Yes |
| `SettingsContext.tsx` | 12 | `app/components/providers/SettingsContext.tsx` | Yes |
| `AcousticsContext.tsx` | 9 | `app/components/providers/AcousticsContext.tsx` | Yes |
| `CustomAudioContext.tsx` | 7 | `app/components/providers/CustomAudioContext.tsx` | No |
| `ImmersiveModeContext.tsx` | 7 | `app/components/providers/ImmersiveModeContext.tsx` | No |
| `LevelUpProvider.tsx` | 5 | `app/components/providers/LevelUpProvider.tsx` | No |
| `ProfileModalContext.tsx` | 6 | `app/components/providers/ProfileModalContext.tsx` | No |
| `RouteLoading.tsx` | 23 | `app/components/ui/RouteLoading.tsx` | **Yes** |
| `ImmersiveModeButton.tsx` | 10 | `app/components/ui/ImmersiveModeButton.tsx` | **Yes** |
| `UserAvatar.tsx` | 9 | `app/components/ui/UserAvatar.tsx` | Yes |
| `ToggleSwitch.tsx` | 6 | `app/components/ui/ToggleSwitch.tsx` | No |
| `CustomDatePicker.tsx` | 5 | `app/components/ui/CustomDatePicker.tsx` | No |
| `MarkdownRenderer.tsx` + `.module.css` | 6 | `app/components/ui/MarkdownRenderer.tsx` + `.module.css` | No |
| `OAuthButtons.tsx` | 3 | `app/components/ui/OAuthButtons.tsx` | No |
| `PasswordStrengthMeter.tsx` | 3 | `app/components/ui/PasswordStrengthMeter.tsx` | No |
| `ConfirmationModal.tsx` | 8 | `app/components/modals/ConfirmationModal.tsx` | No |
| `AddFriendModal.tsx` | 3 | `app/components/modals/AddFriendModal.tsx` | No |
| `FriendRequestsModal.tsx` | 3 | `app/components/modals/FriendRequestsModal.tsx` | No |
| `PublicProfileModal.tsx` | 3 | `app/components/modals/PublicProfileModal.tsx` | No |
| `LevelUpOverlay.tsx` + `.module.css` | 3 | `app/components/modals/LevelUpOverlay.tsx` + `.module.css` | No |
| `SessionEndToast.tsx` | 2 | `app/components/modals/SessionEndToast.tsx` | No |
| `SessionInviteToast.tsx` | 2 | `app/components/modals/SessionInviteToast.tsx` | No |
| `SettingsPanel.tsx` + `.module.css` | 4 | `app/components/settings-primitives/SettingsPanel.tsx` + `.module.css` | No |
| `SettingsRow.tsx` | 6 | `app/components/settings-primitives/SettingsRow.tsx` | No |
| `SettingsRowGroup.tsx` | 6 | `app/components/settings-primitives/SettingsRowGroup.tsx` | No |
| `SettingsSectionCard.tsx` | 6 | `app/components/settings-primitives/SettingsSectionCard.tsx` | No |
| `BackToSettings.tsx` | 5 | `app/components/settings-primitives/BackToSettings.tsx` | No |
| `AiPlannerModal.tsx` | 4 | `app/components/planner/AiPlannerModal.tsx` | No |
| `AiPlannerPanel.tsx` | 3 | `app/components/planner/AiPlannerPanel.tsx` | No |

### 3.3 `lib/planner/` Root (49 Loose Files $\rightarrow$ 3 Structured Subgroups + Root Entrypoints)

To preserve `__tests__/planner/client-boundary.test.ts` and `AGENTS.md` contract references, `lib/planner/contracts.ts`, `lib/planner/errors.ts`, `lib/planner/dates.ts`, and `lib/planner/telemetry.ts` remain at `lib/planner/` root alongside existing subdirectories (`ai/`, `quality/`, `server/`, `v2/`), while the remaining 45 loose V1 files are organized into `lib/planner/client/`, `lib/planner/policies/`, and `lib/planner/domain/`:

| Target Subgroup | Files Moved from `lib/planner/` Root |
| --- | --- |
| **Retained at `lib/planner/` Root (4 files)** | `contracts.ts` (canonical contract authority), `dates.ts`, `errors.ts`, `telemetry.ts` |
| **`lib/planner/client/` (13 files)** | `client.ts`, `transport.ts`, `coverage-client.ts`, `edit-client.ts`, `exam-client.ts`, `friction-client.ts`, `mastery-client.ts`, `preferences-client.ts`, `rebalance-client.ts`, `reoffer-client.ts`, `retrieval-client.ts`, `roadmap-client.ts`, `stretch-client.ts` |
| **`lib/planner/policies/` (20 files)** | `capacity.ts`, `constraints.ts`, `draft-rules.ts`, `exam-fields.ts`, `exam-policy.ts`, `expansion-fields.ts`, `expansion-policy.ts`, `friction-fields.ts`, `mastery-fields.ts`, `mastery-policy.ts`, `preference-fields.ts`, `priority.ts`, `rebalance-fields.ts`, `rebalance-mode-rules.ts`, `rebalance-policy.ts`, `rebalance-scope.ts`, `roadmap-fields.ts`, `roadmap-policy.ts`, `scope-topic.ts`, `smart-setup.ts` |
| **`lib/planner/domain/` (12 files)** | `coverage.ts`, `done.ts`, `intake-telemetry.ts`, `load.ts`, `mastery-progress.ts`, `planner-role.ts`, `preparedness.ts`, `preparedness-matrix.ts`, `reoffer.ts`, `retrieval.ts`, `roadmap-progress.ts`, `semantic.ts` |

*Note:* `lib/planner/client.ts` can remain as a thin barrel re-exporting `./client/index` if external callers import `@/lib/planner/client`.

### 3.4 `__tests__/` Root (18 Loose Files $\rightarrow$ Existing Feature Test Directories)

| Existing File (`__tests__/<file>`) | Proposed Destination |
| --- | --- |
| `focus-backgrounds.test.ts` | `__tests__/focus/focus-backgrounds.test.ts` |
| `focus-backgrounds-anime-layout.test.ts` | `__tests__/focus/focus-backgrounds-anime-layout.test.ts` |
| `focus-backgrounds-cascade-triggers.test.ts` | `__tests__/focus/focus-backgrounds-cascade-triggers.test.ts` |
| `focus-backgrounds-classic-docking.test.tsx` | `__tests__/focus/focus-backgrounds-classic-docking.test.tsx` |
| `focus-backgrounds-engine.test.ts` | `__tests__/focus/focus-backgrounds-engine.test.ts` |
| `focus-backgrounds-fantasy-layout.test.tsx` | `__tests__/focus/focus-backgrounds-fantasy-layout.test.tsx` |
| `focus-backgrounds-landscape-layout.test.tsx` | `__tests__/focus/focus-backgrounds-landscape-layout.test.tsx` |
| `focus-backgrounds-layout-preview-and-docking.test.tsx` | `__tests__/focus/focus-backgrounds-layout-preview-and-docking.test.tsx` |
| `focus-backgrounds-phase6-polish.test.tsx` | `__tests__/focus/focus-backgrounds-phase6-polish.test.tsx` |
| `focus-backgrounds-preference-source.test.ts` | `__tests__/focus/focus-backgrounds-preference-source.test.ts` |
| `focus-backgrounds-server-preference.test.ts` | `__tests__/focus/focus-backgrounds-server-preference.test.ts` |
| `focus-backgrounds-user-library.test.ts` | `__tests__/focus/focus-backgrounds-user-library.test.ts` |
| `game-engine.test.ts` | `__tests__/economy/game-engine.test.ts` |
| `class-system.test.ts` | `__tests__/economy/class-system.test.ts` |
| `weekly-streak.test.ts` | `__tests__/economy/weekly-streak.test.ts` |
| `color-utils.test.ts` | `__tests__/surface/color-utils.test.ts` |
| `immersive-mode.test.tsx` | `__tests__/surface/immersive-mode.test.tsx` |
| `test_planner_api.ts` (manual QA script, not a Vitest file) | `scripts/qa/test-planner-api.ts` |

### 3.5 Root `sylvs/` & Unguarded Dev/Prototype Routes (Issue A9)

| Existing Location | Action | Files Requiring Path Updates |
| --- | --- | --- |
| `sylvs/` (39 source PNGs at repository root) | Move to `assets/sylvs/` so root contains zero raw asset folders. | 1. `scripts/assets/process-sylvs.mjs` (`path.join( ROOT, 'assets/sylvs' )`)<br>2. `scripts/assets/process-sylvs-true-8bit.mjs`<br>3. `scripts/assets/extract-palettes.mjs`<br>4. `__tests__/pixel-display/assets.test.ts` |
| `app/sylv-preview/page.tsx` | Add `/sylv-preview` to `DEV_ONLY_ROUTE_PREFIXES` in `proxy.ts` (alongside `/companion-prototype` and `/studio/backgrounds`). | `proxy.ts` |
| `app/dashboard-design/page.tsx` | Add `/dashboard-design` to `DEV_ONLY_ROUTE_PREFIXES` in `proxy.ts`. | `proxy.ts` |

### 3.6 Directories & Files Explicitly Preserved Unchanged

The following directories and files must **not** be moved or renamed:
- `app/<route>/page.tsx` and `app/api/<route>/route.ts` (all production URL and API contracts)
- `app/<feature>/components/<Feature>Screen.tsx` (all 26 canonical screen paths consumed by `mobile/src/components/MobileRouteOutlet.tsx`)
- `lib/ai/`, `lib/calendar/`, `lib/notes/`, `lib/acoustics/`, `lib/security/`, `lib/supabase/` (already well-scoped domain directories)
- `prisma/schema.prisma` and `prisma/migrations/*`
- `public/*`, `assets/*`, `scripts/*`, `config/*`, `mobile/*`, `android/*`, `tools/ai-agent/*`, `documentation/*`

---

## 4. Configuration & Tooling Changes Required

### 4.1 `package.json`
- **Fix broken `lint` script (Issue A10):**
  - Current: `"lint": "next lint"` (fails on Next.js 16 because `next lint` was removed).
  - Proposed: `"lint": "eslint ."`

### 4.2 `config/tsconfig.planner-worker.json` & `scripts/build/build-planner-worker.mjs`
- **Fix standalone worker build (Issue A10):**
  - Update `scripts/build/build-planner-worker.mjs` to support Node 24+ (`process.versions.node` major $\ge 22$) or invoke `npx tsc -p config/tsconfig.planner-worker.json` consistently.
  - Ensure `config/tsconfig.planner-worker.json` resolves `@/*` paths cleanly or decouple `lib/ai/usage-logger.ts` from top-level `@/lib/prisma` import when running in standalone worker mode.

### 4.3 `mobile/vite.config.ts`
- **Extend `serverBoundaryGuardPlugin()`:**
  - Currently blocks `next/headers`, `next/cookies`, `next/cache`, `server-only`, `@prisma/client`, and `/lib/prisma(\.ts)?$/`.
  - Add `/lib/core/server/` and `//server/` directory pattern matching so any accidental import of a server module from a shared screen fails at `npm run mobile:build` compile time with an explicit file-and-importer error message.

### 4.4 Boundary Enforcement Tests (`__tests__/`)
- **`__tests__/planner/client-boundary.test.ts`:**
  - Expand `CLIENT_SURFACE_FILES` to include `lib/planner/client/` files once moved in Phase 4.
- **`__tests__/pixel-display/boundaries.test.ts`:**
  - Verify path references remain valid after `lib/progression/pixel-*` moves (or retain shims if referenced by literal path).
- **New `__tests__/security/architecture-boundaries.test.ts` (added in Phase 2):**
  - Assert that:
    1. Zero files in `app/` or `lib/` import from `@/mobile/`.
    2. Zero files in `app/` or `lib/` import from `@/__tests__/` or `@/archive/`.
    3. Every file in `lib/` that imports `@/lib/prisma`, `@/lib/core/server/prisma`, or `@prisma/client` includes `import "server-only"`.

---

## 5. Risks, Compatibility & Mitigation Matrix

| Risk Area | Specific Failure Mode | Mitigation & Verification |
| --- | --- | --- |
| **Mobile Capacitor Bundle (`mobile/`)** | Moving a module or adding `import "server-only"` to a file that is transitively imported by one of the 26 shared screens in `MobileRouteOutlet.tsx` could break the Vite build. | Before adding `import "server-only"` to each of the 21 `lib/` files, verify zero client/mobile reachability via AST graph and run `npm run mobile:build && npm run mobile:verify`. (Our Phase 1 AST trace confirmed none of those 21 Prisma-importing files are imported by client components without an existing bug.) |
| **Relative Imports in Moved Test Files** | Moving the 15 loose `__tests__/*.test.ts(x)` files one level deeper (`__tests__/focus/`, `__tests__/economy/`, `__tests__/surface/`) will break relative imports like `../lib/...` or `./helpers/...` if any exist. | Inspect and convert any relative `../` imports in those 15 test files to `@/lib/...` or `@/app/...` path aliases during `git mv`. |
| **Hardcoded Filesystem Reads in Tests** | Tests like `__tests__/focus-backgrounds-phase6-polish.test.tsx` or `__tests__/pixel-display/boundaries.test.ts` use `fs.readFileSync(path.join(process.cwd(), ...))`. | Keep transitional files or update exact `path.join` literals in lockstep with any file move; run full `npm run test -- --run` immediately after each move batch. |
| **Git Blame & Active Branch Conflicts** | Moving 72 `lib/` files and 40 `app/components/` files in one giant commit makes `git log --follow` noisy and risks merge conflicts. | Execute moves in dedicated, pure-`git mv` commits per domain subgroup, and retain thin re-export shims at high-fan-out paths (`lib/prisma.ts`, `lib/auth-server.ts`, `app/components/AuthProvider.tsx`, etc.). |

---

## 6. Git Isolation & Rollback Strategy

1. **Branch / Worktree Isolation:** Each implementation phase (Phases 2–6) runs on a clean git branch or worktree with an explicit baseline tag/commit before starting.
2. **Atomic Commits by Sub-Step:**
   - Separate **pure `git mv` + re-export shim** commits from **import-path rewrite** commits so Git rename detection (`git status` / `git log --follow`) maintains $>90\%$ similarity index.
3. **Checkpoint Validation Gate:**
   - After every sub-step, run:
     ```bash
     npx next typegen && npx tsc --noEmit
     npx eslint .
     npm run test -- --run
     npm run mobile:build && npm run mobile:verify
     ```
4. **Instant Rollback Procedure:**
   - Because zero database schemas (`prisma/schema.prisma`) or migrations (`prisma/migrations/`) are altered by this architecture modernization, any phase or sub-step can be rolled back instantaneously with `git revert <commit>` or `git reset --hard <checkpoint-sha>` without database state drift.
