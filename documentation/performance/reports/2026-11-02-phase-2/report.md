# Sylf — Phase 2: Performance Completion & Real-World Verification Report (November 2026)

- **Date:** 2026-11-02
- **Phase 2 Branch:** `sylf_performance_phase_2`
- **Phase 1 Anchor Branch:** `sylf_performance_optimization_modernization` (`3e179f1`)
- **Upstream Baseline:** `expansion-part-2` (`c81df16`)
- **Worktree:** `/Users/aliumair/.gemini/antigravity/worktrees/sylf/sylf_performance_optimization_modernization`
- **Evidence Directory:** `documentation/performance/reports/2026-11-02-phase-2/evidence/{baseline,after}/`

---

## 1. Executive Summary

Phase 2 completes the remaining high-impact performance bottlenecks from the September 2026 audit (`documentation/performance/phase-0/MASTER-MODERNIZATION-REPORT.md`) and validates all optimizations against a live production Next.js server (`next start`), the real PostgreSQL database (including the exact audit account `userId: 122 / dark`), and Headless Google Chrome via the Chrome DevTools Protocol (CDP).

### Key Real-World Measurable Outcomes

1. **98%–99.1% Reduction in Live Authenticated JSON Payloads:**
   - Replaced oversized inline `data:image/...;base64,...` strings (`> 1024` chars) in user stats, friends, conversations, conversation detail, and profile dossiers with compact, content-hashed, authenticated binary media references (`/api/media/user/[id]/[kind]?v=<sha1_12>`, `/api/media/conversation/[id]/avatar?v=<sha1_12>`).
   - Measured live against the production server for audit account `userId: 122` (`dark`):
     - `GET /api/user/stats`: **`142,780 B` → `1,301 B` (-99.09%)**
     - `GET /api/friends`: **`199,772 B` → `4,097 B` (-97.95%)**
     - `GET /api/conversations`: **`492,043 B` → `8,660 B` (-98.24%)**
     - `GET /api/conversations/20`: **`334,570 B` → `4,002 B` (-98.80%)**
   - Binary media endpoints enforce `getSession(req)`, bidirectional block rules (`areUsersBlocked`), conversation membership (`conversationParticipant`), `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=31536000, immutable` on versioned URLs, and strong `ETag` conditional `304 Not Modified` responses.
   - Profile & group customization `PATCH` routes ignore self-echoed `/api/media/...` URLs so saving a bio or group title never overwrites the underlying stored data URL in PostgreSQL.

2. **-25.5% to -28.6% Initial JS Reduction on Heavy Routes (`/focus` and `/goals`):**
   - Created `app/components/LazyMarkdownRenderer.tsx` (`globalThis.__sylfMarkdownRenderer` synchronous fast-path + `React.lazy` + `<Suspense>`) and replaced the last 3 static `MarkdownRenderer` (`katex` + `react-markdown`, ~433 KB chunk) imports in `app/goals/components/GoalsTab.tsx`, `app/focus/components/tools/ScratchpadTool.tsx`, and `app/focus/components/tools/FormulasTool.tsx`.
   - `/focus` initial JS dropped from **`2,205.4 KB` (`623.8 KB` gzip)** in Phase 0 (`2,056.7 KB` in Phase 1) to **`1,642.4 KB` (`461.6 KB` gzip)** (**-20.1% vs Phase 1, -25.5% vs Phase 0**, shedding **563.0 KB raw / 162.2 KB gzip**).
   - `/goals` initial JS dropped from **`1,955.3 KB` (`558.3 KB` gzip)** in Phase 0 (`1,811.2 KB` in Phase 1) to **`1,396.9 KB` (`398.0 KB` gzip)** (**-22.9% vs Phase 1, -28.6% vs Phase 0**, shedding **558.4 KB raw / 160.3 KB gzip**).

3. **Client SWR Cache URL-vs-`storageKey` Invalidation & `forceFresh` Race Hardening (`lib/client-data-cache.ts`):**
   - Fixed Case 3 from `measure-cache.mjs`: `CacheEntry` and `inflightUrls` now retain the request `url` alongside custom `storageKey` keys so URL-based invalidation (`invalidateClientCache("/api/system-messages")`) reliably evicts custom `storageKey` entries (`storageKey: "sys-msgs:42"`) in both memory and `localStorage`.
   - `forceFresh: true` now increments the key's generation counter and cancels any pre-existing in-flight promise so a stale in-flight read cannot resolve or overwrite a forced fresh fetch.
   - `doFetch` notifies `subscribeClientCache` listeners registered under either `cacheKey` (`storageKey`) or `url`.

4. **Request-Scoped Auth Deduplication & Provider/Public-Route Cleanup:**
   - `getSession(req)` in `lib/auth-server.ts` now deduplicates concurrent in-flight lookups on the same `Request` instance via a `WeakMap<Request, Promise<AuthTokenPayload | null>>` while preserving full `tokenVersion` and `AuthSession` revocation checks on every request.
   - `AcousticsProvider` in `app/components/AcousticsContext.tsx` now detects an ancestor `AcousticsContext` and passes through children when nested (eliminating the duplicate `AcousticsProvider` mount and duplicate `GET /api/acoustics` request in `FocusScreen.tsx`).
   - `GlobalSystemWrapper.tsx` now gates `<CalendarReminderAgent />`, `<AcousticsDynamicIsland />`, `<SessionInviteToast />`, and `<SessionEndToast />` on `Boolean(user)` so unauthenticated visits to `/`, `/login`, and `/register` do not hydrate or execute authenticated background agents.
   - `GET /api/notifications` (`app/api/notifications/route.ts`) now returns HTTP `503` instead of `200 []` on transient database errors so `fetchCachedJSON` preserves the user's last known notifications rather than caching an empty array.

---

## 2. Measured Before / After Evidence

### 2.1 Live Production Server API Payload Comparison (`userId: 122 / dark`)

Source artifacts:
- Baseline: `documentation/performance/phase-0/artifacts/payloads-20260914.json`
- After (Live `next start` + PostgreSQL): `documentation/performance/reports/2026-11-02-phase-2/evidence/after/live-runtime-verification.json`

| Endpoint | Phase 0 Baseline (`decodedBytes`) | Phase 2 Live (`decodedBytes`) | Bytes Saved | Reduction |
| --- | ---: | ---: | ---: | ---: |
| `GET /api/user/stats` | `142,780 B` (`139.4 KB`) | **`1,301 B` (`1.27 KB`)** | `-141,479 B` | **-99.09%** |
| `GET /api/friends` | `199,772 B` (`195.1 KB`) | **`4,097 B` (`4.00 KB`)** | `-195,675 B` | **-97.95%** |
| `GET /api/conversations` | `492,043 B` (`480.5 KB`) | **`8,660 B` (`8.46 KB`)** | `-483,383 B` | **-98.24%** |
| `GET /api/conversations/[id]` | `334,570 B` (`326.7 KB`) | **`4,002 B` (`3.91 KB`)** | `-330,568 B` | **-98.80%** |
| **Combined Social + Stats Payloads** | **`1,169,165 B` (`1.14 MB`)** | **`18,060 B` (`17.6 KB`)** | **`-1,151,105 B`** | **-98.46%** |

#### Live Media Endpoint Verification (`GET /api/media/user/122/banner?v=b2cfcf09f604`)
- **Initial Authenticated Request:** `200 OK`, `Content-Type: image/webp`, `91,474 B` binary (down from `121,991 B` base64), `ETag: "b2cfcf09f604"`, `Cache-Control: private, max-age=31536000, immutable`
- **Conditional Revalidation (`If-None-Match: "b2cfcf09f604"`):** `304 Not Modified` (`0 B` body)
- **Unauthenticated Request:** `401 Unauthorized` (`6.66 ms` cold, `2.07 ms` warm median)

---

### 2.2 Production Route JavaScript Bundle Sizes (Phase 0 vs Phase 1 vs Phase 2)

Source artifacts:
- Phase 0 Baseline: `documentation/performance/reports/2026-11-01-modernization/evidence/baseline/bundle-assets.json`
- Phase 1 After: `documentation/performance/reports/2026-11-01-modernization/evidence/after/bundle-assets.json`
- Phase 2 After: `documentation/performance/reports/2026-11-02-phase-2/evidence/after/bundle-assets.json`

| Route | Phase 0 Baseline JS (Gzip) | Phase 1 JS | Phase 2 JS (Gzip) | Phase 2 vs Phase 1 | Total vs Phase 0 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/` (Landing) | `1,997.0 KB` (`575.1 KB`) | `1,429.4 KB` | **`1,429.9 KB` (`411.9 KB`)** | `0.0%` | **-28.4%** |
| `/dashboard` | `1,947.9 KB` (`557.2 KB`) | `1,422.0 KB` | **`1,422.6 KB` (`407.9 KB`)** | `0.0%` | **-27.0%** |
| `/timer` | `1,945.0 KB` (`556.0 KB`) | `1,377.3 KB` | **`1,377.9 KB` (`392.9 KB`)** | `0.0%` | **-29.2%** |
| `/focus` | `2,205.4 KB` (`623.8 KB`) | `2,056.7 KB` | **`1,642.4 KB` (`461.6 KB`)** | **-20.1%** | **-25.5%** |
| `/goals` | `1,955.3 KB` (`558.3 KB`) | `1,811.2 KB` | **`1,396.9 KB` (`398.0 KB`)** | **-22.9%** | **-28.6%** |
| `/system` | `2,227.2 KB` (`633.3 KB`) | `1,682.1 KB` | **`1,682.6 KB` (`476.4 KB`)** | `0.0%` | **-24.5%** |
| `/social` | `2,356.1 KB` (`658.0 KB`) | `1,832.0 KB` | **`1,832.6 KB` (`509.1 KB`)** | `0.0%` | **-22.2%** |
| `/locker` | `2,089.7 KB` (`594.6 KB`) | `1,565.1 KB` | **`1,565.7 KB` (`445.6 KB`)** | `0.0%` | **-25.1%** |

---

### 2.3 Real Browser Verification (Headless Google Chrome via CDP on Production Server)

Source artifact: `documentation/performance/reports/2026-11-02-phase-2/evidence/after/live-runtime-verification.json`

| Route | Session Mode | `domInteractive` | `domContentLoaded` | First Contentful Paint (`FCP`) | `loadEventEnd` | Video Requests | `rAF` Frame p50 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | Guest (Cold) | `1,250.0 ms` | `1,250.2 ms` | `1,244.0 ms` | `2,033.0 ms` | `0` | `16.7 ms` |
| `/login` | Guest (Cold) | `34.9 ms` | `34.9 ms` | `76.0 ms` | `78.3 ms` | `0` | `16.7 ms` |
| `/dashboard` | Authenticated (Cold) | `339.7 ms` | `339.7 ms` | `340.0 ms` | `395.9 ms` | `0` | `16.7 ms` |
| `/dashboard` | Authenticated (Warm) | `28.5 ms` | `28.5 ms` | `76.0 ms` | `64.2 ms` | `0` | `16.7 ms` |
| `/focus` | Authenticated | `27.3 ms` | `27.4 ms` | `48.0 ms` | `75.9 ms` | `0` | `16.7 ms` |
| `/goals` | Authenticated | `27.7 ms` | `27.7 ms` | `44.0 ms` | `220.1 ms` | `0` | `16.7 ms` |
| `/social` | Authenticated | `32.5 ms` | `32.7 ms` | `92.0 ms` | `80.7 ms` | `0` | `16.7 ms` |
| `/system` | Authenticated | `24.6 ms` | `24.8 ms` | `64.0 ms` | `76.2 ms` | `0` | `16.7 ms` |
| `/locker` | Authenticated | `452.6 ms` | `452.6 ms` | `452.0 ms` | `480.3 ms` | `0` | `16.7 ms` |
| `/notes` | Authenticated | `293.8 ms` | `293.8 ms` | `292.0 ms` | `992.0 ms` | `0` | `16.7 ms` |

---

## 3. Verification & Quality Gates

- **TypeScript (`npx next typegen && NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit`):** Passed with **0 errors**.
- **ESLint (`npx eslint <changed-files>`):** Passed with **0 errors** across all new and modified Phase 2 files.
- **Production Next.js Build (`npm run build`):** Compiled and prerendered cleanly (`100/100` static pages + dynamic API routes including `/api/media/user/[id]/[kind]` and `/api/media/conversation/[id]/avatar`).
- **Mobile Build & Integrity Check (`npm run mobile:build && npm run mobile:verify`):** Built in `4.06s`; `verify-mobile-bundle` **PASSED** (`FAIL-CLOSED`, zero server-only symbols or secrets in `mobile/dist`).
- **Automated Test Suite (`npx vitest run`):** All unit, integration, and performance regression tests in `__tests__/performance/modernization-regressions.test.tsx` (8 tests) and across the repository passed with **0 failures**.
