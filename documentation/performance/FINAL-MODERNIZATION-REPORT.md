# Sylf — Final Performance Optimization & Modernization Report

- **Phase 2 & Final Stabilization Report:** [`documentation/performance/reports/2026-11-02-phase-2/report.md`](reports/2026-11-02-phase-2/report.md) ([evidence](reports/2026-11-02-phase-2/evidence/))
- **Phase 1 Report:** [`documentation/performance/reports/2026-11-01-modernization/report.md`](reports/2026-11-01-modernization/report.md) ([evidence](reports/2026-11-01-modernization/evidence/))
- **Historical Audit Baseline (Sept 2026):** [`documentation/performance/phase-0/MASTER-MODERNIZATION-REPORT.md`](phase-0/MASTER-MODERNIZATION-REPORT.md)

---

## 1. Executive Summary

This report documents the complete performance optimization, modernization, real-world verification, and integration pass across the Sylf web and mobile client codebase, anchored against the September 2026 audit ([`documentation/performance/phase-0/MASTER-MODERNIZATION-REPORT.md`](phase-0/MASTER-MODERNIZATION-REPORT.md)) and integrated into the active development branch (`expansion-part-2`).

### Key Measured Outcomes

1. **98%–99.1% Reduction in Live Authenticated JSON Payloads:**
   - Replaced oversized inline `data:image/...;base64,...` strings (`> 1024` chars) in user stats, friends, conversations, conversation detail, and profile dossiers (including restricted profile cards) with compact, content-hashed, authenticated binary media references (`/api/media/user/[id]/[kind]?v=<sha1_12>`, `/api/media/conversation/[id]/avatar?v=<sha1_12>`).
   - Verified live on `next start` against the audit account (`userId: 122 / dark`):
     - **`GET /api/user/stats`:** `142,780` B → **`1,322` B (-99.07%)**
     - **`GET /api/friends`:** `199,772` B → **`4,097` B (-97.95%)**
     - **`GET /api/conversations`:** `492,043` B → **`8,660` B (-98.24%)**
     - **`GET /api/conversations/20`:** `334,570` B → **`4,002` B (-98.80%)**
   - Binary media endpoints enforce `getSession(req)` (including `tokenVersion` and `AuthSession` revocation), bidirectional block checks (`areUsersBlocked`), private profile visibility (`isVisible` + shared conversation membership for `banner`), and group participant membership (`conversationParticipant`), serving `Cache-Control: private, no-cache, must-revalidate` + `Vary: Cookie` + pre-decode `ETag` (`304 Not Modified`) so privacy changes, blocks, and session revocations take effect immediately.

2. **21.4%–45.1% Reduction in Live Authenticated API Latencies:**
   - Reduced sequential database round-trips over the remote Supabase PostgreSQL pooler (~230–250 ms RTT per round-trip):
     - **`GET /api/quests`:** `937.39 ms` → **`514.44 ms` (-45.1%)** by priming a 30s user timezone cache (`primeUserTimezoneCache`) during `getSession(req)`.
     - **`GET /api/friends`:** `2,015.49 ms` → **`1,286.16 ms` (-36.2%, min `1,161.83 ms`)** by parallelizing `selectedCompanionsForUsers` with `[completedRows, activeRows]` and parallelizing `user.findMany` + `BlockedUser` inside `lib/pixel-companion-service.ts`.
     - **`GET /api/user/stats`:** `941.39 ms` → **`683.23 ms` (-27.4%)**.
     - **`GET /api/conversations/20`:** `1,320.69 ms` → **`1,037.57 ms` (-21.4%)** by parallelizing participant, conversation, and message queries and skipping redundant `lastReadAt` write round-trips when already caught up.

3. **22.2%–29.2% Initial Route JavaScript Reductions Across All Major Routes (Next.js 16.2.9 Production Build):**
   - **`/` (Landing / Home):** `2,044,975` B (`588,926` B gzip) → `1,464,262` B (`421,806` B gzip) — **-567.1 KB raw (-28.4%), -163.2 KB gzip (-28.4%)**
   - **`/dashboard`:** `1,994,640` B (`570,621` B gzip) → `1,456,730` B (`417,685` B gzip) — **-525.3 KB raw (-27.0%), -149.4 KB gzip (-26.8%)**
   - **`/timer`:** `1,991,653` B (`569,375` B gzip) → `1,410,960` B (`402,279` B gzip) — **-567.1 KB raw (-29.2%), -163.2 KB gzip (-29.3%)**
   - **`/focus`:** `2,258,345` B (`638,753` B gzip) → `1,681,813` B (`472,649` B gzip) — **-563.0 KB raw (-25.5%), -162.2 KB gzip (-26.0%)**
   - **`/goals`:** `2,002,192` B (`571,733` B gzip) → `1,430,372` B (`407,534` B gzip) — **-558.4 KB raw (-28.6%), -160.4 KB gzip (-28.7%)**
   - **`/system`:** `2,280,666` B (`648,459` B gzip) → `1,723,029` B (`487,821` B gzip) — **-544.6 KB raw (-24.5%), -156.9 KB gzip (-24.8%)**
   - **`/locker`:** `2,139,820` B (`608,918` B gzip) → `1,603,293` B (`456,314` B gzip) — **-524.0 KB raw (-25.1%), -149.0 KB gzip (-25.1%)**
   - **`/social`:** `2,412,655` B (`673,744` B gzip) → `1,876,598` B (`521,326` B gzip) — **-523.5 KB raw (-22.2%), -148.8 KB gzip (-22.6%)**

4. **React Render & Main-Thread Churn Elimination (`16.7 ms` p50 / `16.7–16.8 ms` p95 Steady-State Smoothness):**
   - **Acoustics 60fps Analyser Broadcast:** Control-only consumers of `useAcoustics()` dropped from **60 re-renders per 60 animation frames** during audio playback to **0 re-renders** (`100%` elimination). Nested `AcousticsProvider` instances pass through to the ancestor context (`1` `/api/acoustics` fetch instead of `2`).
   - **Social Screen 1Hz Full-Tree Re-render:** Removed the 1-second `tick` state from `SocialContent` (1,639 lines) and isolated study timer ticking to `<FriendStudyTimer />`.
   - **Auth Context Stability:** `AuthProvider` deduplicates concurrent `refreshStats()` calls via a single-flight promise per `updateEpoch`, preserves the `user` object reference when `/api/user/stats` is unchanged, and memoizes its `AuthContext.Provider` value.

5. **Client Cache & Realtime Correctness:**
   - **Reactive Stale-While-Revalidate (`onUpdate`) & URL-vs-`storageKey` Invalidation:** `fetchCachedJSON` in `lib/client-data-cache.ts` notifies callers (`useDashboardData`, `SocialScreen`, `PublicProfileModal`, `SystemAIProvider`) when fresh server data differs from the stale snapshot, retains the underlying URL on custom `storageKey` entries so URL-fragment invalidation evicts them, and bumps generation counters on `forceFresh: true`.
   - **Sensitive Cache Isolation & Logout Cleanup:** Blocked `sys-msgs` and `system-messages` from persisting to `localStorage`, added `sessionEpoch` guards before cache writes, and ensured `clearClientCache()` removes `sylf_cached_weekly_quest` and clears in-flight callbacks and cached Realtime JWTs.
   - **Realtime Channel Collision & Cache Bypass:** Fixed `usePostgresChanges` so multiple concurrent hook instances use unique channel names (`db-changes-${id}`) and clean up via `sb.removeChannel(channel)`, and wired `SocialScreen`'s `usePostgresChanges` callback to pass `forceFresh: true`.

---

## 2. Classification of Original September 2026 Audit Findings

Every finding from [`documentation/performance/phase-0/MASTER-MODERNIZATION-REPORT.md`](phase-0/MASTER-MODERNIZATION-REPORT.md) was audited against the codebase and classified below:

| ID | Original Finding (Sept 2026 Audit) | Status | Supporting Evidence & Resolution Details |
| --- | --- | --- | --- |
| **F-01** | **Acoustics 60fps Context Broadcast (`AcousticsContext.tsx`)**: `setFrequencyData(bars)` called inside `requestAnimationFrame` re-renders the provider and all `useAcoustics()` consumers 60 times/sec during playback; nested `AcousticsProvider` on `/focus` fetched `/api/acoustics` twice. | **Fixed** | Removed `frequencyData` from `AcousticsProvider` React state in `app/components/AcousticsContext.tsx`. Added `subscribeToFrequency`, opt-in `useAcoustics({ subscribeFrequency: true })`, and ancestor passthrough when nested. Verified in `__tests__/performance/modernization-regressions.test.tsx`. |
| **F-02** | **Focus Party Realtime Subscription Churn (`useFocusPartyRealtime.ts`)**: `options.onEvent` in `useEffect` dependency array caused `removeChannel` + re-subscribe on every parent render. | **Already Resolved** | Inspected `app/hooks/useFocusPartyRealtime.ts`: `onEventRef` is already used to hold `options?.onEvent` outside the `useEffect` dependency list. |
| **F-03** | **Client Data Cache Stale-While-Revalidate Silently Drops Background Updates & URL-vs-`storageKey` Invalidation (`lib/client-data-cache.ts`)**: Background SWR refreshes never notified callers, and `invalidateClientCache(urlFragment)` missed custom `storageKey` entries. | **Fixed** | Added `onUpdate?: (data: T) => void`, `subscribeClientCache`, `readCachedJSON`, URL retention on `CacheEntry`/`inflightUrls`, and generation-counter cancellation on `forceFresh: true` in `lib/client-data-cache.ts`. Verified in `__tests__/performance/modernization-regressions.test.tsx`. |
| **F-04** | **Private System Chat Transcripts Persisted to `localStorage` & Incomplete Logout Cache Cleanup (`lib/client-data-cache.ts`)**: `storageKey: "sys-msgs-..."` bypassed `NO_PERSIST_FRAGMENTS`, and `sylf_cached_weekly_quest` survived `clearClientCache()`. | **Fixed** | Added `"sys-msgs"` and `"system-messages"` to `NO_PERSIST_FRAGMENTS`, added a `sessionEpoch` check before `memoryCache`/`writeStorage` commit in `doFetch`, and removed `sylf_cached_weekly_quest` in `clearClientCache()`. |
| **F-05** | **Global Shell & Heavy Routes Eagerly Bundle Modals, Katex, & Markdown (`GlobalSystemWrapper.tsx`, `Sidebar.tsx`, `SystemAIProvider.tsx`, `GoalsTab.tsx`, `ScratchpadTool.tsx`, `FormulasTool.tsx`)**: Heavy overlays and `MarkdownRenderer` (`katex` + `react-markdown`) were synchronously imported into startup bundles. | **Fixed** | Dynamically imported global modals/toasts in `GlobalSystemWrapper.tsx` (gating authenticated agents on `Boolean(user)`), `AiPlannerModal` in `SystemAIProvider.tsx`, and `MarkdownRenderer` via `LazyMarkdownRenderer.tsx` across `Sidebar.tsx`, `ChatText.tsx`, `MessageItem.tsx`, `GoalsTab.tsx`, `ScratchpadTool.tsx`, and `FormulasTool.tsx`. Reduced initial JS across all major routes by **523 KB – 567 KB raw (-22.2% to -29.2%)**. |
| **F-06** | **Authenticated Bootstrap Waterfall & Redundant `/api/user/stats` / `getSession` / Timezone Queries (`AuthProvider.tsx`, `Sidebar.tsx`, `lib/auth-server.ts`, `lib/timezone-server.ts`)**: Concurrent callers triggered duplicate `/api/user/stats` requests, and backend routes re-queried `User.timezone` after `getSession`. | **Fixed** | Added single-flight `refreshStats()` deduplication and structural identity preservation in `AuthProvider.tsx`, `WeakMap<Request, Promise<...>>` deduplication in `getSession(req)`, and 30s timezone cache priming (`primeUserTimezoneCache`) in `lib/timezone-server.ts`. |
| **F-07** | **Duplicate Notification Polling & Effect Dependency Churn in `Sidebar.tsx`**: `Sidebar` was rendered for desktop and mobile, its `useEffect` depended on `[user, refreshStats]`, and it polled `/api/notifications` when hidden. | **Fixed** | Stabilized `Sidebar.tsx` notification effect dependencies to `[userId, mobile]` using `refreshStatsRef`, added module-level single-flight deduplication (`fetchNotificationsSingleFlight`), skipped the background interval inside the duplicate `mobile` drawer instance, and paused polling when hidden. |
| **F-08** | **Scroll-Lock Reference Counter Fragility & Raw `document.body.style.overflow` Overwrites (`lib/scroll-lock.ts`, `PublicProfileModal.tsx`, `ModernChatPage`)**: Unlock closures in `lockPageScroll()` were not per-instance idempotent, and modals mutated `document.body.style.overflow` directly. | **Fixed** | Made each `lockPageScroll()` unlock closure idempotent (`let released = false`) and restored prior inline `overflow` styles in `lib/scroll-lock.ts`. Wired `lockPageScroll()` into `PublicProfileModal.tsx` and `app/social/chat/[conversationId]/page.tsx`. |
| **F-09** | **`PublicProfileModal` Fast-Switch Race Condition (`PublicProfileModal.tsx`)**: Opening profile A then quickly switching to profile B allowed a slower response for A to overwrite B's state. | **Fixed** | Added `let cancelled = false` cleanup guard and `onUpdate` guard in `PublicProfileModal.tsx`'s profile fetch `useEffect`. |
| **F-10** | **`SocialScreen` 1-Second Full-Tree Re-render, Duplicate Mount Fetch Wave, & Realtime Cache Masking (`SocialScreen.tsx`)**: `SocialContent` ran a 1s `setTick` state update whenever the current user was studying and let `usePostgresChanges` read stale cached lists. | **Fixed** | Removed `tick` state from `SocialContent` and reused `<FriendStudyTimer />`; separated initial mount fetch from the polling interval `useEffect`; gated polling slowdown strictly on `pushConnected`; and passed `forceFresh = true` from `usePostgresChanges`. |
| **F-11** | **Supabase Realtime Shared Channel Collision & Token Stampede (`usePostgresChanges.ts`, `lib/supabase-browser.ts`)**: `usePostgresChanges` hardcoded `sb.channel("db-changes")` and concurrent callers triggered parallel `/api/realtime/token` fetches. | **Fixed** | Assigned unique channel names (`db-changes-${++nextChannelInstanceId}`) per `usePostgresChanges` instance, stored `onEvent` in `onEventRef`, cleaned up via `sb.removeChannel(channel)`, and added single-flight `inflightJwt` deduplication + logout cleanup in `lib/supabase-browser.ts`. |
| **F-12** | **Direct Message Chat Polling Bug, Unmemoized `MessageItem`, Sequential DB Round-Trips, & N+1 Block Checks (`app/social/chat/[conversationId]/page.tsx`, `MessageItem.tsx`, `app/api/conversations/[id]/route.ts`, `app/api/friends/route.ts`)**: Empty conversations never polled, `MessageItem` re-rendered on every keystroke, `POST /api/conversations/[id]/messages` ran an N+1 block loop, and `GET /api/friends` / `GET /api/conversations/[id]` ran 4–6 sequential DB round-trips. | **Fixed** | Wrapped `MessageItem` in `React.memo`; tracked `hasInitialLoadedRef` so empty chats poll `?after=0`; fixed cursor pagination ordering (`orderBy: { id: "desc" }`); batched block checks via `areAnyUsersBlocked`; and parallelized DB queries in `GET /api/friends`, `lib/pixel-companion-service.ts`, and `GET /api/conversations/[id]`. |
| **F-13** | **Oversized Inline Base64 Images in JSON Payloads & `lib/profile-service.ts` Cache TTL Mismatch**: `stats` (143 KB), `friends` (200 KB), `conversations` (492 KB), and `conversations/[id]` (335 KB) embedded raw base64 `avatarUrl` / `bannerUrl` strings on every call. | **Fixed** | Added `lib/user-media.ts`, `/api/media/user/[id]/[kind]`, and `/api/media/conversation/[id]/avatar` with full session/block/privacy/membership checks and `private, no-cache, must-revalidate` + `ETag` (`304 Not Modified`), reducing combined payloads by **98.46%** (`1.14 MB` → `17.6 KB`). Aligned `unstable_cache` TTL (`60s`) in `lib/profile-service.ts`. |
| **F-14** | **System Companion / Sylvie Video & Asset Delivery**: Early Sept 2026 audit noted large unoptimized companion video assets before the Pixel Companion and SVG Companion architectures landed. | **Obsolete / Already Resolved** | The codebase migrated companion rendering to the lightweight deterministic Pixel Companion (`app/components/companion/`) and optimized SVG/WebM assets. |
| **F-15** | **Next.js Production Build Heap Exhaustion (`package.json`)**: Running `npm run build` (`next build`) or `npx tsc --noEmit` on the 1,086-file TypeScript codebase hit V8's default ~2 GB heap limit. | **Fixed** | Updated `package.json` `"build"` script to `NODE_OPTIONS="--max-old-space-size=4096" next build`. |
| **F-16** | **Large Static Media Assets in `public/` (3D Avatars, Landing Screenshots, Audio OGGs, ONNX WASM Runtime)**: `public/` contains ~157.6 MB of static assets. | **Deferred (Non-Blocking)** | Web routes only fetch the active user's selected asset on demand; converting static `.png` paths in `public/` would alter hardcoded asset URLs across DB seeds and cosmetic catalogs. |

---

## 3. Before & After Performance Measurements

### 3.1 Static Route JavaScript Bundle Sizes (Production Build)

- Baseline evidence: [`reports/2026-11-01-modernization/evidence/baseline/bundle-assets.json`](reports/2026-11-01-modernization/evidence/baseline/bundle-assets.json)
- Final post-optimization evidence: [`reports/2026-11-02-phase-2/evidence/after/bundle-assets.json`](reports/2026-11-02-phase-2/evidence/after/bundle-assets.json)

| Route | Before Raw JS (Bytes) | Final Raw JS (Bytes) | Raw Delta | Before Gzip (Bytes) | Final Gzip (Bytes) | Gzip Delta | Chunks (Before → Final) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| `/` | `2,044,975` | `1,464,262` | **-580,713 B (-28.4%)** | `588,926` | `421,806` | **-167,120 B (-28.4%)** | `23 → 21` |
| `/dashboard` | `1,994,640` | `1,456,730` | **-537,910 B (-27.0%)** | `570,621` | `417,685` | **-152,936 B (-26.8%)** | `23 → 22` |
| `/timer` | `1,991,653` | `1,410,960` | **-580,693 B (-29.2%)** | `569,375` | `402,279` | **-167,096 B (-29.3%)** | `23 → 21` |
| `/focus` | `2,258,345` | `1,681,813` | **-576,532 B (-25.5%)** | `638,753` | `472,649` | **-166,104 B (-26.0%)** | `24 → 22` |
| `/goals` | `2,002,192` | `1,430,372` | **-571,820 B (-28.6%)** | `571,733` | `407,534` | **-164,199 B (-28.7%)** | `23 → 21` |
| `/system` | `2,280,666` | `1,723,029` | **-557,637 B (-24.5%)** | `648,459` | `487,821` | **-160,638 B (-24.8%)** | `23 → 21` |
| `/locker` | `2,139,820` | `1,603,293` | **-536,527 B (-25.1%)** | `608,918` | `456,314` | **-152,604 B (-25.1%)** | `23 → 22` |
| `/social` | `2,412,655` | `1,876,598` | **-536,057 B (-22.2%)** | `673,744` | `521,326` | **-152,418 B (-22.6%)** | `26 → 25` |

### 3.2 Live API Payloads, Latencies, React Render, & Smoothness Metrics

| Metric / Scenario | Before | Final | Improvement |
| --- | ---: | ---: | --- |
| Combined JSON payloads (`stats` + `friends` + `conversations` + `conversations/[id]`) | `1,169,165 B` (`1.14 MB`) | `18,081 B` (`17.7 KB`) | **-98.45% (`-1.15 MB` per full social/shell cycle)** |
| `GET /api/friends` warm median latency (remote Supabase DB) | `2,015.49 ms` | `1,286.16 ms` (`1,161.83 ms` min) | **-36.2% (`-729 ms`, 6 → 3–4 sequential DB RTTs)** |
| `GET /api/quests` warm median latency (remote Supabase DB) | `937.39 ms` | `514.44 ms` (`508.21 ms` min) | **-45.1% (`-423 ms`, timezone primed in `getSession`)** |
| `GET /api/user/stats` warm median latency (remote Supabase DB) | `941.39 ms` | `683.23 ms` (`683.06 ms` min) | **-27.4% (`-258 ms`)** |
| `GET /api/conversations/[id]` warm median latency (remote Supabase DB) | `1,320.69 ms` | `1,037.57 ms` (`1,025.61 ms` min) | **-21.4% (`-283 ms`, 4 → 2 sequential DB RTTs)** |
| `useAcoustics()` control-only consumer re-renders across 60 analyser frames (1s playback) | `60` | `0` | **-100% (0 RAF re-renders for non-visualizer consumers)** |
| `SocialContent` (1,639-line component) re-renders per minute while current user is studying | `60` (1Hz `tick` state) | `0` | **-100% (isolated to leaf `<FriendStudyTimer />`)** |
| Steady-state 60-frame `rAF` frame interval across `/dashboard`, `/focus`, `/goals`, `/social`, `/system`, `/locker`, `/notes` | Up to `33.4 ms` p95 | `16.7 ms` p50 / `16.7–16.8 ms` p95 | **60 fps steady-state with `0` long tasks** |

---

## 4. Verification & Final Verdict

- **TypeScript Typecheck (`npx next typegen && NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit`):** **PASSED** (0 errors).
- **ESLint (`npx eslint <changed-files>`):** **PASSED** (0 errors across all new and modified performance modernization files).
- **Next.js Production Build (`npm run build`):** **PASSED** (all 100 static/dynamic routes compiled and prerendered cleanly).
- **Mobile Vite Build & Bundle Audit (`npm run mobile:build && npm run mobile:verify`):** **PASSED** (`verify-mobile-bundle: PASSED. Zero server-only symbols or secrets found in mobile/dist`).
- **Full Vitest Repository Suite (`npx vitest run`):** **PASSED** (**378 test files passed, 35 opt-in live/DB test files skipped, 0 failed — 4,481 tests passed, 300 skipped**).
- **Final Verdict:** **COMPLETE & READY FOR PRODUCTION.** All actionable performance findings from the September 2026 audit and subsequent Phase 1 / Phase 2 inspections have been resolved, verified against a live production server and Headless Chrome CDP, covered by automated regression tests in `__tests__/performance/modernization-regressions.test.tsx`, and merged cleanly into the active development branch (`expansion-part-2`).
