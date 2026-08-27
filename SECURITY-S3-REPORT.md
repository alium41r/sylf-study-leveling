# SYLF — Security Phase S3: Auth, API & Frontend Security Hardening — COMPLETED

**Scope:** auth/session security, API authorization, frontend security
boundaries, social/privacy authorization, security headers, exposed endpoints.
**Not touched (S4):** AI rate-limit/quota architecture, upload/file hardening,
provider spend caps, secrets cleanup, Storage/Realtime hardening, supply chain.
**S2 database/RLS protections:** untouched and intact.

---

## 1. Authentication changes

### OAuth account-takeover fix (CRITICAL → fixed)
- `lib/auth-service.ts` — `handleOAuthSignInOrRegister` now links/signs in via
  an email match **only when `oauthUser.emailVerified === true`**. An unverified
  provider email matching an existing account throws
  (`This <PROVIDER> account's email is not verified…`), and the callback
  redirects to `/login?error=…`. Unverified emails with **no** matching account
  still create a fresh (UNVERIFIED) account.
- `lib/oauth.ts` (GitHub) — removed the `emails[0]` fallback; an email is
  `emailVerified` only when `/user/emails` returns it with `verified=true`
  (primary-verified preferred). The public profile email alone is never
  trusted as verified. Discord's `profile.verified` flag is now actually
  enforced at the linking gate.

### Browser-accessible session JWTs removed (CRITICAL → fixed)
- `lib/auth.ts` — session tokens are now issued/verified with **issuer +
  audience** claims (env-configurable `JWT_ISSUER`/`JWT_AUDIENCE`, defaults
  `sylf`/`sylf-app`) and **fail closed**: `JWT_SECRET` missing ⇒ sign/verify
  throws.
- New `lib/auth-server.ts` — `getSession(req)`: cookie-only (no Bearer
  fallback) + **DB `tokenVersion` check** (real session revocation).
- **No route returns a session JWT in a response body anymore** (login,
  register, onboarding, account PATCH, security PATCH, reset-progress, stats).
  The JWT travels exclusively in the `hunter_token` httpOnly cookie.
- `app/components/AuthProvider.tsx` — `token` removed from the context;
  `localStorage.token` / `user_data` persistence deleted; login/logout are
  cookie-based; logout clears all client caches.
- All ~46 client components and ~45 API route files were swept: no
  `Authorization: Bearer` in the client, no `localStorage` session tokens,
  `attachRealtimeAuth()` (memory-only realtime JWT, cookie-authenticated mint)
  replaces the token-parameter variant. `lib/supabase-browser.ts` no longer
  persists `sylf_realtime_jwt` to localStorage (in-memory cache only).
- `proxy.ts` (edge middleware) validates issuer/audience for UX redirects
  only; real auth enforcement stays server-side in `lib/auth-server`.

### Session revocation (HIGH → fixed)
- `logout-all` bumps `User.tokenVersion` (legacy `REVOKED_SESSIONS` markers
  are cleaned up and never re-created). `getSession` rejects any token whose
  `tokenVersion` differs from the DB value.
- Password change (`user/security`) bumps `tokenVersion` and re-issues a fresh
  cookie token with the new version — all other devices are invalidated.
- Every token issuer includes `tokenVersion` in the payload.

## 2. Authorization changes

- **`/api/backup`** — route **deleted** (unauthenticated DB dump gone; 404
  verified live).
- **Group administration** (`conversations/[id]` PATCH) — rename, avatar
  change, add/remove members now require `conversation.createdBy === userId`
  server-side (403 otherwise).
- **DM privacy** (`conversations` POST) — `allowDirectMessages` enforced:
  PRIVATE → 403; FRIENDS → requires an existing friendship.
- **Friend-request privacy** (`friends/requests` POST) — `allowFriendRequests`
  enforced: PRIVATE → 403; FRIENDS → 403 for non-friends (friends already
  short-circuit).
- **Block enforcement** — `blockUser` now also severs **both** memberships
  from shared non-group conversations, and message POST re-checks blocks
  against every other participant (a stale membership row can no longer bypass
  a block).
- **Mutation membership** — message PATCH/DELETE require current conversation
  membership (+ sender ownership for edits) at mutation time; `friends/[id]`
  DELETE already verified the friendship involves the caller at mutation time.
- **Profile privacy** — `/api/user/[username]` bounds granular settings by
  `profileVisibility` (PRIVATE profiles no longer leak rank/study-hours/online
  via granular defaults) and returns 403 when either party has blocked the
  other; `/api/users/search` excludes blocked users (both directions) and
  PRIVATE profiles. `profile-service` already enforced the restricted stub.

## 3. API routes changed

- Converted from Bearer-token auth to cookie `getSession`: ~45 route files
  (subjects, skills, shop, inventory, goals, quests, sessions, achievements,
  AI endpoints, calendar, user/*, friends/*, conversations/*, messages,
  chats, system-messages, invites, notifications, privacy, heartbeat, …).
  Cron routes keep their CRON_SECRET bearer (by design); `/api/waitlist` and
  `/api/acoustics` stay public by design.
- `/api/realtime/token` — cookie-authenticated; minted token still returned to
  JS (required to attach to the websocket) but held in memory only.

## 4. Frontend security changes

- Session JWT and `user_data` removed from localStorage; realtime JWT in
  memory only.
- `lib/client-data-cache.ts` — daily-briefing/insights/AI-memory endpoints are
  never persisted to localStorage (memory cache only); new
  `clearClientCache()` purges `sylf_cache:*` + scratchpad/notes keys on logout.
- `next.config.ts` — production security headers on all responses (verified
  live):
  - Content-Security-Policy (script-src 'self' 'unsafe-inline' for Next
    inline bootstrap; connect-src adds the Supabase Realtime wss/http origin;
    frame-ancestors 'none'; object-src 'none'; img/font/data allowances)
  - X-Content-Type-Options: nosniff, Referrer-Policy:
    strict-origin-when-cross-origin, X-Frame-Options: DENY, Permissions-Policy
    (camera/mic/geolocation/payment/usb off), HSTS.
- `proxy.ts` — GET-based logout force mechanism (`?force|logout|error` cookie
  clearing) removed; verified live that a valid session cookie is no longer
  cleared by those params (307 → /dashboard, no Set-Cookie).

## 5. JWT hardening

- Issuer + audience added to every signed token and validated on verify.
- `JWT_SECRET` required (fail closed). Wrong-issuer/wrong-audience tokens are
  rejected (regression-tested).

## 6. Tests / attacks performed

- Regression suites added/updated: OAuth verified/unverified/takeover
  (`auth-engine`, `oauth.test.ts` S3 block), cookie-only sessions +
  revocation + issuer/audience rejection (`auth-engine.test.ts`),
  logout-all tokenVersion bump + cookie clear (`danger-zone.test.ts`),
  middleware no-GET-logout (`middleware.test.ts`), group-admin creator-only,
  DM privacy, block severance, block-on-send, membership-on-mutation,
  friend-request privacy (`security/s3-social-authz.test.ts`), no-token-in-body
  assertions (`routes`, `account-settings`, `onboarding`).
- Test harness: global `lib/auth-server` shim in `vitest.setup.ts` so route
  suites exercise cookie sessions with real signed tokens; real revocation
  semantics remain covered by `vi.importActual` in `auth-engine.test.ts`.
- `npx tsc --noEmit` → clean. `npx next build` → success.
- Live verification against the production server:
  1. Security headers present on every response ✓
  2. `/api/backup` → 404 ✓
  3. `/api/user/stats`, `/api/realtime/token` without cookie → 401 ✓
  4. `GET /login?logout=true` / `?force=true` with a valid session cookie →
     307 to /dashboard, **no cookie cleared** ✓ (CSRF vector closed)
  5. `/dashboard` with valid cookie → 200 ✓
- Full suite: **681/684 passing**. The 3 failures are pre-existing and
  unrelated to S3 (2 vision-router unit tests in
  `__tests__/ai/multi-engine-router.test.ts` whose expectations predate recent
  `lib/ai` changes, and 1 planner integration test requiring live provider
  keys) — identical failures existed in the S2-phase baseline.

## 7. Remaining S4 items (intentionally untouched)

- AI rate limits/quota architecture (parallel-consume race, unquota'd
  `evaluate-scope`, per-IP layers, signup friction)
- Upload hardening (`system-messages/chat` filename traversal, size/MIME caps)
- Provider hard spend caps (Gemini/Groq/DeepSeek dashboards)
- Secrets cleanup: fallback secrets in `lib/ai/tool-confirmation.ts` and cron
  fallback (`default_cron_secret_for_dev`), `backups/`/`public/uploads/` git
  history purge, anon-key rotation, `supabase.cordis.yml` pinning
- Realtime publication completion (other social tables), dashboard
  `supabase_admin` default-privilege revokes, Supabase Auth signup disabling
- Login rate limiting / lockout (S3 verification item 2.5 was scoped to
  sessions; brute-force throttling is queued with the rate-limit work)
- Scratchpad/notes persistence is now cleared on logout (kept for UX while
  logged in, documented)

*Nothing in the S2 database/RLS layer was modified during S3.*
