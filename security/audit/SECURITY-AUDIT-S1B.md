# SYLF — Security Phase S1B: Vibe Security Cross-Audit (S1 vs vibe-security-skill)

**Method:** read-only. The
[vibe-security-skill](https://github.com/raroque/vibe-security-skill)
(v1.0, `vibe-security/SKILL.md` + 8 reference files) was fetched and applied to
the SYLF codebase, then compared against the Phase S1 audit
(`SECURITY-AUDIT-S1.md`). Nothing was modified. No secret values are printed.

---

## A. Skill application — results per check area

### 1. Secrets & environment (`secrets-and-env.md`)
- **PASS** — No hardcoded API keys/tokens in tracked source. New greps (beyond
  S1): `Bearer <literal>` → 0; `ghp_/AKIA/sk_live/sk_test/xoxb/glpat` → 0;
  `console.log(...token|secret|key|password...)` → 0.
- **PASS** — `NEXT_PUBLIC_` exposure is limited to the Supabase URL + anon key
  (public by design). Client-bundle scan: 0/13 server env names in
  `.next/static` (stale-build caveat; re-verify on fresh prod build).
- **PASS** — `.env*` in `.gitignore` before first commit; no `.env` ever
  tracked; `.env.example` contains placeholders only.
- **FAIL (covered by S1 A4/R9/S1)** — hardcoded *fallback* secrets
  (`lib/auth.ts:21-25`, `user/security/route.ts:8-10`,
  `cron/daily-briefing/route.ts:13`, `lib/ai/tool-confirmation.ts`), and the
  user-data-in-git incident (`backups/`, `public/uploads/`,
  `public/chat_error.log`).
- **Note (LOW)** — `ai-agent/secret.txt` is tracked but contains a benign
  narrative sentence — false positive for a credential; rename/remove to avoid
  inviting real secrets.

### 2. Database access control (`database-security.md`) — the skill's #1 area
- **RLS on every table** → FAIL: 10 public tables without RLS (S1 T2).
- **`USING (true)` policies** → FAIL: `users_select_policy` on `"User"` and
  `acoustic_track_select_policy` are `USING (true)` to public (S1 T1; the skill
  explicitly bans this pattern).
- **Missing WITH CHECK** → FAIL — this dimension was **under-reported in S1**.
  Live policies lacking WITH CHECK on write-capable commands:
  - `users_update_policy` on `"User"` (UPDATE, no WITH CHECK) — combined with
    any future UPDATE grant, a user could modify their own row's **sensitive
    columns**: `sylph`, `level`, `currentXP`, `hp`, `streakDays`,
    `verificationStatus`, `tokenVersion` (and SELECT policy would expose
    `email`/`password`).
  - `convo_write_policy` (ALL, no WITH CHECK) — participant could reassign
    `createdBy` (admin self-promotion) if grants existed.
  - `friend_request_update_delete_policy`, `session_invite_write_policy`
    (no WITH CHECK) — sender/receiver reassignment.
  - Legacy dashboard policies `"Users manage own quests"`, `"Users manage own
    subjects"`, `"Users manage own subject nodes"` (ALL, no WITH CHECK;
    duplicate/overlapping with the newer `*_user_policy` set).
  Today these are masked by the absence of DML grants (REST probes return 403),
  but the skill's rule applies: WITH CHECK must exist so any future grant can't
  enable ownership reassignment/self-escalation.
- **Sensitive fields on user-accessible tables** → FAIL (latent): `User` is the
  profile table users would update; column-level privileges
  (`GRANT UPDATE (cols)`) or a private schema are required before any UPDATE
  grant is ever issued.
- **SECURITY DEFINER functions** → FAIL (matches S1 R1, live-verified): all 18
  functions live in `public`, use `SET search_path = public`, and 8 take a
  caller-supplied `p_user_id` with no identity check; default EXECUTE-to-PUBLIC
  makes them callable by anon via `/rpc/` (verified: HTTP 200 + FK-error proof
  of execution).
- **Storage buckets** → N/A: zero buckets (S1 §6).
- **Forgotten junction/metadata tables** → matches S1 T2 (UserInventory,
  UserQuota, XpLedger, … without RLS).

### 3. Authentication & authorization (`authentication.md`)
- **jwt.verify, not decode** → PASS: `jose` `jwtVerify` verifies signatures; the
  `alg:"none"` attack is rejected by jose's key-match requirement.
- **Validate issuer/audience** → PARTIAL FAIL (new): SYLF tokens carry no `iss`
  and no `aud`; `jwtVerify` checks expiry but nothing validates
  issuer/audience. LOW (single-secret deployment), but add them during the A2
  cookie-only refactor.
- **Middleware is not the auth layer** → PASS: `proxy.ts` is navigation UX only;
  every API route re-verifies (verified across 60+ routes). CVE-2025-29927
  (`x-middleware-subrequest` bypass) is patched in Next.js 16.2.9.
- **Server Actions** → N/A: no `"use server"` files exist (grep: 0).
- **Route handlers authenticate at the top** → PASS with documented exceptions
  (`/api/backup` = S1 S2, `evaluate-scope` = quota-only).
- **Data leakage to client components** → PARTIAL FAIL: login/register/stats/
  onboarding return full user objects + the **session JWT itself** to the client
  (S1 A2/F3). `import 'server-only'` is not used in any `lib/` data module —
  LOW hardening.
- **Token storage** → FAIL (matches S1 F3 CRITICAL): session JWT in
  `localStorage.token` + minted realtime JWT in `localStorage.sylf_realtime_jwt`
  (S1 F2-HIGH). Skill's rule: HttpOnly cookies only.

### 4. Rate limiting & abuse (`rate-limiting.md`)
- **Auth endpoints** → FAIL (S1 A6): login/register/OTP-confirm have no rate
  limiting or lockout; `verify-email/send` and `security/send-code` are
  unthrottled (self-target spam only — LOW).
- **AI API calls** → PARTIAL FAIL: per-user quotas exist (chat 10/day,
  planner 1/week, compile 1/day) but (a) check-then-consume race multiplies
  spend (S1 R3), (b) `evaluate-scope` is unquota'd (S1 R2), (c) **quotas are
  per-user only, with no per-IP layer and no signup friction** — at public
  beta, account farming multiplies the AI budget (new MEDIUM→HIGH-at-launch).
- **Email sending** → PASS-ish: emails only to the caller's own address
  (self-spam, LOW).
- **File processing** → FAIL (S1 R5): unbounded upload size, no MIME allowlist.
- **Rate counters in public tables** → FAIL (latent): `UserQuota` (the quota
  store) lives in the public schema with RLS disabled; covered by S1 T2.
- **Per-IP + per-user combo** → PARTIAL: only the waitlist limiter is IP-based,
  and its `x-forwarded-for` key is spoofable (S1 R10).
- **Provider billing caps** → UNVERIFIED (new): no evidence of hard spending
  caps configured on Gemini/Groq/DeepSeek dashboards. Skill requires them;
  add to dashboard checklist.

### 5. Payments / 6. Mobile → N/A (no payment integration, no mobile app).

### 7. AI / LLM (`ai-integration.md`)
- **Keys server-side only** → PASS (bundle scan clean; all provider calls in
  `lib/ai/providers`).
- **Per-user usage caps** → PASS with caveats (R2/R3 above; quotas are prompt-
  based, not token/cost-based, so magnitude per prompt is unbounded — S1 R8).
- **Prompt injection** → PARTIAL: raw user input is concatenated into the
  system prompt via `contextOverride.instruction` (`chat/route.ts:368-370`) and
  planner `syllabus` — the skill's "BAD" pattern. Impact is self-scoped (no
  cross-user disclosure found), but it is the amplifier behind S1 R4.
  Mitigate by moving overrides into user messages or an allowlisted directive.
- **LLM output untrusted** → PASS: rendered via react-markdown (no rehypeRaw,
  URL transform on); tool-call parameters validated server-side per-agent
  allowlists; LLM never builds SQL/shell; tool invocations logged.
- **Never let the LLM construct raw SQL** → PASS (verified: no such path).

### 8. Deployment (`deployment.md`)
- **Debug mode** → PARTIAL: no debug flags in prod config, but a debug artifact
  is publicly served: `public/chat_error.log` (S1 S1-LOW; the skill would class
  this under debug/source exposure). Also `backup_error.txt` is written to cwd
  by `/api/backup` on failure.
- **Source maps** → PASS by default (Next prod builds don't emit source maps
  unless `productionBrowserSourceMaps` is set — keep it unset).
- **`.git` accessibility** → PASS on Vercel (not deployed); if self-hosted ever
  happens, exclude `.git`.
- **Security headers** → FAIL (S1 F10): no CSP/HSTS/X-Frame-Options/
  X-Content-Type-Options/Referrer-Policy anywhere.
- **CORS** → PASS (same-origin app API; Supabase-side CORS unverifiable without
  dashboard — §10 checklist).
- **gitleaks** → recommended (S1 did an equivalent manual scan; add to CI).

### 9. Data access & input validation (`data-access.md`)
- **SQL injection** → PASS: no string-concatenated SQL anywhere.
- **Prisma operator injection** → PASS: no `where: { [computedKey]: ... }`
  patterns (grep: 0); request bodies are zod-parsed or explicitly field-picked
  before reaching Prisma.
- **`$queryRawUnsafe`** → PASS (verified all five sites, all positional
  parameters, fixed SQL text):
  `achievements/route.ts:184`, `skills/unlock/route.ts:80`,
  `subjects/[id]/forge-apex/route.ts:93`, `shop/purchase/route.ts:37,42`,
  plus parameterized `$queryRaw` in `sessions/route.ts`, `friends/route.ts`,
  `quests/[id]/route.ts`. Note: `achievements/route.ts` passes catalog-derived
  reward amounts into `claim_achievement_reward_atomic` — safe today because the
  catalog is a static server file; keep it that way.
- **Mass assignment** → PASS: no `data: req.body` spreads; updates use explicit
  field lists (account, customization, onboarding routes verified).
- **Runtime validation** → PASS mostly: zod at register/account/customization/
  waitlist/study-schedule; LOW: `characterConfig`/`socialLinks`/
  `contextOverride` accept untyped JSON (`z.record(z.string(), z.any())`) —
  self-only, but validate shape if ever rendered richly.
- **Client-controlled game values** → FAIL (matches S1 F9/R4): quest
  `difficulty`/`elapsedSeconds` client-writable; `requiredMinutes` unclamped in
  the AI tool path; settle grace farming. The skill's core principle ("never
  trust the client") — these are the remaining violations.

---

## B. Cross-comparison (requested analysis)

### B1. Issues S1 missed (caught by the skill pass)
| # | Finding | Severity | Where |
|---|---|---|---|
| N1 | **Missing WITH CHECK on user-writable policies** (incl. `users_update_policy` → self-update of `sylph`/`level`/`verificationStatus`/`tokenVersion`; `convo_write_policy` → `createdBy` reassignment; friend-request/invite sender reassignment; 3 legacy overlapping policies) | HIGH (latent) | live `pg_policies` (dashboard-applied) |
| N2 | JWT has no issuer/audience claims and none are validated | LOW | `lib/auth.ts` |
| N3 | AI quota is per-user only; no per-IP layer, no signup friction → account-farming multiplier at public beta | MEDIUM (→HIGH at launch) | `lib/ai/usage-limiter.ts`, `register/route.ts` |
| N4 | No provider-side hard spend caps verified (Gemini/Groq/DeepSeek dashboards) | MEDIUM (operational) | external |
| N5 | `import 'server-only'` absent in data/auth lib modules | LOW | `lib/*` |
| N6 | `UserQuota` (rate/quota store) in public schema without RLS — skill's "don't store rate counters in public tables" rule | LOW (latent; part of S1 T2) | live DB |
| N7 | `verify-email/send` + `security/send-code` unthrottled (self-target spam) | LOW | two routes |
| N8 | Debug artifact served publicly (`public/chat_error.log`) — deployment/debug class (S1 had it only as repo hygiene) | LOW | `public/` |
| N9 | `contextOverride.instruction` concatenates raw user text into the system prompt (skill's "BAD" pattern; self-scoped) | LOW-MEDIUM | `chat/route.ts:368-370` |
| N10 | Untyped JSON fields (`characterConfig`, `socialLinks`) — shape unvalidated | LOW | `profile/customization/route.ts` |

### B2. Issues the skill missed that S1 found
| S1 finding | Why the skill misses it |
|---|---|
| R1 — live-verified anon RPC execution via default PUBLIC EXECUTE (not just "SECURITY DEFINER is dangerous") | Skill names SECURITY DEFINER risk but not the **default EXECUTE grant** / anon-key RPC probing / live verification |
| S1 — full DB snapshot + user uploads committed to git history | Skill covers secrets, not user-data dumps; no git-history data-exposure rule |
| A1 — OAuth unverified-email account linking | Skill's auth ref has no OAuth-linking section |
| A3 — logout-all revocation marker never read | Not in skill |
| R4 — AI-tool-driven economy inflation (tool → createQuest → claimReward pipeline) | Skill covers prompt injection generally, not tool-mediated business-logic abuse |
| Z2/Z3 — privacy settings + block enforcement missing in DMs | Not in skill (RLS-only focus) |
| R3 — quota check-then-consume parallel race | Skill says "have limits", not the race pattern |
| R5 — upload path traversal + unbounded vision-token cost | Skill's file-processing bullet is generic |
| S2 — unauthenticated `/api/backup` DB-dump endpoint | Not in skill |
| F2 — minted realtime JWT cached in localStorage | Skill covers auth tokens generally, not secondary minted tokens |
| F9 — logout-CSRF via GET force-bypass | Not in skill |
| R6 — XP grace farming via settle clamp | Not in skill |

### B3. Duplicate findings (both found; skill wording ↔ S1 id)
| Skill check | S1 id |
|---|---|
| `USING (true)` policies | T1 |
| RLS disabled tables / forgotten junction tables | T2 |
| SECURITY DEFINER in public schema, callable via REST | R1 |
| Tokens in localStorage | F3 (A2) |
| Hardcoded secrets / fallback secrets | A4, R9, S3 |
| Missing security headers | F10 |
| AI API cost abuse / no caps | R2, R3, R8 |
| Secrets committed to git | S1 |
| Client-controlled quest fields | F9 |
| File upload without limits | R5 |
| Login rate limiting | A6 |
| `.env` handling | §4 (PASS in both) |

### B4. False positives / intentional behavior (skill-flagged patterns that are NOT issues here)
1. **`ai-agent/secret.txt`** — tracked, but a 46-byte narrative sentence, not a
   credential. Remove anyway (invites future mistakes).
2. **`service_role` matches in old `scaling-research-report.md` revisions** —
   prose mentions of the role concept, no key values.
3. **`dangerouslySetInnerHTML` in `settings/archive/page.tsx:420`** — static CSS
   string, no user input.
4. **`check-username` account enumeration** — deliberate UX feature.
5. **`public/uploads` serving** — currently the intended attachment feature;
   still must be hardened (S1 R5 + auth-gating) rather than removed.
6. **`postinstall: prisma generate`** — normal Prisma practice (keep).
7. **Waitlist email "already registered" response** — intentional idempotency
   UX; LOW enumeration accepted.
8. **Middleware-only protection** — NOT present: every API route re-checks auth
   (skill's concern does not apply).
9. **Storage bucket policies** — N/A (no buckets). **Payments/mobile** — N/A.

### B5. New critical/high-risk issues from S1B
- **No new CRITICAL beyond S1's five.** S1's R1 (unauthenticated RPC execution)
  remains the top issue; the skill independently confirms the same class.
- **One new HIGH (latent): N1** — missing WITH CHECK + sensitive columns on
  `User`/`Conversation` write policies. It is dormant only because DML grants
  don't exist; it becomes exploitable the moment any grant is added (e.g. a
  Supabase advisor auto-fix or dashboard policy edit) — fix it together with P0-1.
- **One new launch-blocking MEDIUM: N3** — per-user-only AI quotas + open
  registration = budget-draining account farming at public beta; pair quota with
  per-IP limiting, signup friction (email verification gate, CAPTCHA), and
  provider hard caps (N4).

---

## C. Consolidated prioritized remediation (S1 + S1B)

Legend: 🚨 = must fix before public beta. S1 ids in parentheses.

### P0 — before public beta (active or gate-blocking)
1. 🚨 **Revoke RPC EXECUTE** from PUBLIC/anon/authenticated; grant only to the
   app role; add default-ACL revoke; drop `claim_session_reward_atomic` /
   `claim_achievement_reward_atomic` (caller-supplied amounts). **(R1)**
2. 🚨 **Fix OAuth linking** — require `emailVerified`; fix GitHub `emails[0]`
   fallback. **(A1)**
3. 🚨 **Remove session JWT from localStorage/JSON bodies** — cookie-only browser
   sessions; server-to-server Bearer with a separate secret. **(A2/F3)**
4. 🚨 **Purge committed user data from git** — `backups/`, `public/uploads/`,
   `public/chat_error.log`; history rewrite; gitignore `backup_*`; incident
   triage. **(S1)**
5. 🚨 **Delete or admin-protect `/api/backup`.** **(S2)**
6. 🚨 **Add WITH CHECK to all write policies + column-level protection for
   `User`** (no UPDATE grants; if ever granted, exclude
   sylph/level/currentXP/hp/streakDays/verificationStatus/tokenVersion/
   password); replace `users_select_policy` `USING (true)`; consolidate/remove
   the 3 legacy overlapping policies. **(T1 + N1)**
7. 🚨 **Enforce group-admin + block + DM/friend-request privacy server-side.**
   **(Z1, Z2, Z3)**
8. 🚨 **Clamp `requiredMinutes` in AI tools; recompute rewards in RPC.** **(R4)**
9. 🚨 **Sanitize upload filename; 5 MB cap; image MIME allowlist.** **(R5)**
10. 🚨 **Reserve quota before generation (charge-then-refund).** **(R3)**
11. 🚨 **Quota + rate-limit `/api/quests/evaluate-scope`.** **(R2)**
12. 🚨 **Remove all secret fallbacks (fail closed); verify Vercel env.** **(A4,
    R9)**
13. 🚨 **AI abuse guardrails before open registration (N3/N4):** per-IP + per-
    user limits, email-verification gate for AI features, provider hard spend
    caps (Gemini/Groq/DeepSeek dashboards).

### P1 — next sprint (correctness)
- Enforce session revocation (tokenVersion / read REVOKED_SESSIONS); bump on
  logout-all + password change. **(A3, A8)**
- RLS the 10 remaining tables + owner policies; policy roles → authenticated.
  **(T2, T4)**
- Login rate limiting + lockout; generic errors; add iss/aud to JWTs. **(A6, N2)**
- CSP + security headers; re-enable type-checked builds. **(F10)**
- Realtime JWT memory-only, shorter TTL. **(F2-HIGH)**
- Clear SWR cache on logout; stop caching briefings/insights. **(F7)**
- Message PATCH/DELETE + friends/[id] DELETE re-checks; privacy-granular profile
  API. **(Z4, Z5)**
- Cron secrets constant-time, no defaults; remove GET logout force-bypass.
  **(R9, F9)**
- Move `contextOverride` out of the system prompt (user message or allowlisted
  directive). **(N9)**

### P2 — hardening backlog
- Password-reset flow (A5); OTP via crypto + attempt limits (A7).
- XP grace farming clamp (R6); floating-rest-day guarded upsert (R7); body caps
  (R8); cosmetics ownership check.
- Calculator parser (F6); dev-mode panel decision; `import 'server-only'` in
  `lib/` (N5); validate characterConfig/socialLinks shape (N10).
- Reconcile live policies with `supabase-realtime-setup.sql`; version policies
  in migrations (T5); decide the remaining 7 realtime tables.
- Supply-chain hygiene: pin `npx` versions, checksum CDN assets, prune dead
  deps/files, untrack `repomix-output.md`, handle `secret.txt` (S3, S4, §9 S1).
- OAuth redirect origin allowlist (A10); throttle verify-email/send-code (N7);
  remove served `chat_error.log` (N8).
- Supabase dashboard checklist (S1 §10) incl. anon-key rotation after P0-1;
  disable unused Supabase Auth signups.

### P3 — strategic
- Least-privilege DB role instead of `postgres` (T3).
- Backups to encrypted object storage outside the repo.
- CI security regressions: route-auth matrix, EXECUTE-revocation check, no-JWT-
  in-body lint, bundle env scan, gitleaks.

---

## D. Verdict for public beta

**Not ready to open registration** until P0 items 1–13 are complete. The two
exploits that end the product (R1 unauthenticated RPC economy control; A1 OAuth
account takeover) are live today and require only the public anon key — which is
already in the shipped bundle. Everything else is defense-in-depth, hygiene, or
scale protection, and can follow in P1/P2.

*S1B prepared read-only; nothing modified. Secret values intentionally omitted.*
