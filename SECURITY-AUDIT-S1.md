# SYLF — Supabase Security Phase S1: Read-Only Security Audit & Remediation Plan

**Scope:** SYLF application (`/Users/aliumair/Desktop/sylf`), Supabase project
(`gjkwkdqdoekzllmnsejo`), git history, live database state.
**Method:** read-only. No code, DB, policy, or setting was modified. Live Postgres
was queried with SELECT-only catalog queries; PostgREST was probed (one POST to an
RPC with a nonexistent user id failed on a foreign key — proving execution,
writing nothing). No secret values are reproduced — locations and types only.

---

## 0. Executive summary

SYLF authenticates with its **own HS256 JWT** (not Supabase Auth) and talks to
Supabase Postgres through **Prisma as the `postgres` role** (which bypasses RLS).
Supabase is used for the Postgres database and Realtime (presence +
`postgres_changes`), with the anon key shipped to the browser.

Verified-in-production problems:

1. **CRITICAL — Unauthenticated RPC privilege escalation (live-verified).**
   PostgREST `/rpc/` is exposed, and 8 `SECURITY DEFINER` functions take a
   caller-supplied `p_user_id` with no `auth.uid()` check. Default Postgres
   privileges grant EXECUTE to PUBLIC → **any anonymous attacker with the public
   anon key can call them for any user id**: `start_study_session`,
   `settle_study_session_atomic`, `complete_study_session`, `claim_quest_reward`,
   `claim_session_reward_atomic`, `claim_achievement_reward_atomic`,
   `forge_apex_node_atomic`, `unlock_skill_node_atomic`. Probes returned HTTP 200
   (safe RPC) and a FK violation from `start_study_session` (proving the mutating
   function executed as definer). Result: unlimited XP/currency/achievements/
   skills for the attacker, plus cross-user tampering.
2. **CRITICAL — OAuth account takeover via unverified emails.**
   `handleOAuthSignInOrRegister` links a provider account to any existing user
   with the same email and signs the caller in — without requiring the provider
   email to be verified (GitHub `emails[0]` fallback; Discord's verified flag
   computed but never checked).
3. **CRITICAL — Session JWT delivered to the browser and stored in localStorage**
   (`AuthProvider.tsx`), accepted as Bearer by every API route. The httpOnly
   cookie is decorative; one XSS = full account takeover for 30 days.
4. **CRITICAL — Production user data committed to GitHub.** A DB snapshot
   (`backups/db-snapshot-20260826053547/`: 87 users' emails/usernames/XP/streaks,
   549 AI-chat `SystemMessage` rows, ledgers), 12 user-uploaded attachments
   (`public/uploads/`), and `public/chat_error.log` are tracked and pushed to
   `origin/main` (repo currently private — anonymous access 404s — but data is
   permanently in history).
5. **HIGH — Broken session invalidation.** "Log out of all devices" writes a
   `REVOKED_SESSIONS:*` marker nothing ever reads; `tokenVersion` unused. Revoked
   JWTs stay valid 30 days.
6. **HIGH — Economy inflation through the AI tool chain** (unclamped
   `requiredMinutes` → linear XP → ~5M XP per chat message).
7. **HIGH — Upload path traversal + no size limit** in
   `/api/system-messages/chat`.
8. **HIGH — Quota check-then-consume races** multiply LLM spend; `/api/quests/
   evaluate-scope` has no quota at all (3 Gemini calls/request).
9. **HIGH — `/api/backup` is unauthenticated** and dumps the entire DB (incl.
   password hashes) to the app filesystem.

Good news: no cross-user IDOR in the app's own routes (every mutation derives the
user id server-side); AI tools are backend-scoped; markdown rendering escapes HTML;
no secrets found in client bundles.

---

## 1. Database exposure: tables, RLS, grants (live-verified)

| Fact | Value |
|---|---|
| App DB role | `postgres` (`rolbypassrls = true`) — the app bypasses RLS by design |
| RLS ENABLED (28) | AcousticTrack, AiInsight, AiMemory, AuthSession, BlockedUser, ChatSession, ConnectedAccount, Conversation, ConversationParticipant, DailyBriefingLog, FriendRequest, Friendship, Goal, HpLedger, InventoryItem, Message, Quest, SessionInvite, StudySession, Subject, SubjectNode, SylphLedger, SystemMessage, User, UserAchievement, UserCosmetic, UserPrivacy, VerificationToken |
| RLS DISABLED (10) | AiUsageLog, FloatingRestDay, Item, UserInventory, UserQuota, UserSkillNode, UserStats, WaitlistEntry, XpLedger, _prisma_migrations |
| anon/authenticated table grants | None for DML (only TRUNCATE/REFERENCES/TRIGGER/MAINTAIN). REST probes: `permission denied for table User` |
| Policies | Present on most RLS-enabled tables, `to public` (anon+authenticated), mostly `"userId" = auth.uid() OR coalesce(auth.jwt()->>'userId')::int` |
| Storage buckets | 0 buckets, 0 policies — Storage unused |
| Realtime publication | Only `public."StudySession"` (+ internal `realtime.messages_*`). The 7 other tables from `scripts/supabase-realtime-setup.sql` were NOT added |
| Views / matviews (public) | none |
| Custom triggers | none |
| Extensions | pgcrypto, pg_stat_statements, plpgsql, supabase_vault, uuid-ossp; pg_graphql NOT installed |
| PostgREST | Reachable; `/rpc/` works for anon (live-verified 200); table reads denied (no grants) |

### Findings — tables

**T1 — CRITICAL (latent): `User` SELECT policy is `USING (true)` for `public`.**
Live policy `users_select_policy` on `"User"` (dashboard-applied; not in any
migration). `User` holds `email`, `password` (bcrypt hash), `tokenVersion`,
`verificationStatus`. Today anon lacks SELECT grants so REST returns 403 — but any
future `GRANT SELECT` instantly exposes the whole table incl. password hashes.
Safest fix: privacy-aware select policy (never email/password/tokenVersion), no
anon grants. Breakage risk: none to the app (reads as `postgres`).

**T2 — MEDIUM: 10 tables without RLS**, incl. private user data (UserStats,
XpLedger, UserQuota, UserInventory, UserSkillNode, FloatingRestDay, AiUsageLog,
WaitlistEntry — waitlist emails are PII). Currently masked by missing grants;
any future grant/publication exposes them with zero policy. Fix: enable RLS +
owner policies; `Item` stays a public catalog (documented INTENTIONAL).
Breakage risk: none to the app; re-test StudySession realtime after changes.

**T3 — INTENTIONAL: app runs as `postgres` with BYPASSRLS.** Documented in the
realtime script. Consequence: any DATABASE_URL leak = full DB access regardless
of RLS. Long-term: least-privilege app role.

**T4 — LOW: policies are `to public` rather than `to authenticated`.** Tighten.

**T5 — MEDIUM: realtime publication only contains StudySession; the live
Message/Conversation policies differ from `scripts/supabase-realtime-setup.sql`
(dashboard-applied, unreviewed set).** Reconcile and version policies in
migrations. Breakage risk: medium if reapplied carelessly.

---

## 2. Authentication

Verified: custom HS256 JWT, 30-day expiry, `hunter_token` httpOnly cookie +
Bearer fallback (`getSession`); bcrypt login; zod register; OAuth with state-CSRF;
email verification 32-byte token, 24h TTL, single-use. Supabase Auth not used.

**A1 — CRITICAL: OAuth link/sign-in trusts unverified provider emails.**
`lib/auth-service.ts:276-330`; `lib/oauth.ts:222-224` (GitHub `|| emails[0]`),
`:295` (Discord). Attacker adds victim's email to their own GitHub account
(unverified) → linked + signed in as victim. Fix: require
`oauthUser.emailVerified === true` to link/sign-in. Breakage: GitHub users with
unverified emails must verify first.

**A2 — CRITICAL: session JWT in localStorage** (`AuthProvider.tsx:88-148`),
returned in JSON bodies (login/register/stats/onboarding), sent as Bearer by ~120
call sites; `lib/auth.ts:90-98` accepts Bearer. XSS → full ATO for 30 days.
Fix: cookie-only browser auth; Bearer restricted to a separate server-to-server
mechanism; add CSP. Breakage: large refactor, do once.

**A3 — HIGH: logout-all is a no-op.** `logout-all/route.ts:43-57` writes
`REVOKED_SESSIONS:<ts>`; nothing reads it; `tokenVersion` unused. Fix: enforce
tokenVersion in `getSession`/proxy; bump on logout-all + password change.

**A4 — HIGH: hardcoded JWT secret fallback** (`lib/auth.ts:21-25`, duplicated in
`user/security/route.ts:8-10`). If JWT_SECRET unset, tokens are forgeable. Fix:
throw at boot when unset. (Set in local `.env`; verify Vercel.)

**A5 — MEDIUM: no password-reset flow exists.** Feature gap; OAuth-only users
who lose provider access can't recover.

**A6 — MEDIUM: login has no rate limiting/lockout;** register echoes raw error
messages; login reveals OAuth-only accounts. Add throttling; generic errors.
(`check-username` availability = INTENTIONAL.)

**A7 — LOW: OTP via `Math.random()`** (`send-code/route.ts:43`); no attempt
counters. Use `crypto.randomInt` + attempt limits.

**A8 — LOW: password change doesn't revoke other sessions** (fold into A3).

**A9 — INTENTIONAL: stateless 30-day JWT, cookie-only logout** (provided A3 fixed
and A2 removed).

**A10 — LOW: OAuth redirect_uri derived from request origin** with no allowlist.
Validate against env allowlist.

---

## 3. Authorization / IDOR (60+ routes, three passes)

**No cross-user IDOR found in the app's own routes.** All mutations derive the
user id from the verified JWT and scope queries (`where: { id, userId }`); RPC
`p_user_id` args always filled with the session user.

**Z1 — HIGH: group-chat "admin" is client-only.** Drawer gates by `createdBy`
(`ChatDetailsDrawer.tsx:69,642`); server PATCH
(`conversations/[id]/route.ts:170-242`) checks only participant+isGroup. Any
member can add/remove anyone incl. the creator. Fix: enforce `createdBy ===
session.userId` server-side for add/remove/rename/avatar.

**Z2 — HIGH: privacy settings not enforced.** `allowDirectMessages` /
`allowFriendRequests` never checked in DM creation / friend-request send. Fix:
403 server-side.

**Z3 — HIGH: blocks don't sever existing DMs.** `block-service.ts:67-84` leaves
ConversationParticipant rows → blocked user keeps full read/write. Fix: remove
both participants on block (or reject reads/writes while blocked).

**Z4 — MEDIUM: message PATCH/DELETE and friends/[id] DELETE lack membership
re-checks** on the mutation path. Tighten where clauses.

**Z5 — MEDIUM: `/api/user/[username]` leaks granular stats on PRIVATE profiles**
(defaults PUBLIC); `/api/users/search` ignores privacy/block. No email leak.

**Z6 — LOW: system-messages POST trusts client sessionId** (all reads
userId-scoped; chat route re-validates ownership).

---

## 4. Secrets

- `.env*` gitignored; no `.env` ever committed (full-history scan). Local `.env`
  contains DATABASE_URL, DIRECT_URL, JWT_SECRET, GEMINI/GROQ/DEEPSEEK keys, OAuth
  client ids/secrets, SMTP creds, Supabase URL/anon key/SUPABASE_JWT_SECRET,
  Upstash URL/token — expected types; verify Vercel also has CRON_SECRET,
  RESEND_API_KEY, PRELAUNCH_MODE, DATABASE_POOL_URL, TOOL_CONFIRMATION_SECRET.
- Client bundle scan: 0/13 key names in `.next/static` (re-verify on fresh
  prod build). `NEXT_PUBLIC_SUPABASE_*` = public by design.
- `ai-agent/secret.txt`: tracked, benign narrative text, not a credential — LOW
  (rename/remove). Old `scaling-research-report.md` revisions mention the word
  `service_role` in prose — LOW.
- Fallback secrets: JWT (A4), `default_cron_secret_for_dev` (`cron/daily-briefing/
  route.ts:13`), tool-confirmation (`lib/ai/tool-confirmation.ts`) — fail closed.

**S1 — CRITICAL: user data committed and pushed to GitHub.** `backups/db-snapshot-
20260826053547/` (14 files; emails/usernames/XP/streaks/ledgers + 549 private AI
chat rows), `public/uploads/` (12 real user attachments), `public/chat_error.log`
— tracked at `origin/main` (`alium41r/sylf-study-leveling`, ancestry verified).
Repo 404s anonymously (private), but history is permanent. Fix: git rm --cached +
gitignore `backups/`, `backup_*`, `public/uploads/`; rewrite history (filter-repo/
BFG) before next push; treat as a data incident; audit who had repo access.

**S2 — HIGH: `/api/backup` unauthenticated full-DB dump** (GET, no auth; dumps 20
models incl. `user` password hashes to app CWD; returns `error.stack`). Delete
the route or require admin secret; write outside the repo. On Vercel the FS write
fails, but reads + stack leak remain.

**S3 — MEDIUM: unpinned `npx -y @supabase/mcp-server-supabase`** in
`supabase.cordis.yml` with SUPABASE_ACCESS_TOKEN from env. Pin version + read-only
scoped token.

**S4 — LOW: `repomix-output.md` (3.1 MB full-source dump) tracked.** Untrack.

---

## 5. API abuse / cost

**R1 — CRITICAL: unauthenticated SECURITY DEFINER RPC execution (live-verified).**
The eight `p_user_id` functions have no `auth.uid()` check and `proacl` NULL
(= PUBLIC EXECUTE). Live probes: safe RPC → 200 anon; `start_study_session`
executed (FK error proves INSERT ran). Attacker (no account): unlimited
XP/currency/achievements/skills; claims other users' rewards; settles their
sessions. Fixes: `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,
anon, authenticated` + grant only to the app role; default-ACL revoke; add
identity checks inside RPCs; drop dead `claim_session_reward_atomic` /
`claim_achievement_reward_atomic` (caller-supplied reward amounts).
Breakage: none for the app (connects as postgres).

**R2 — HIGH: `/api/quests/evaluate-scope` unquota'd, unratelimited** (3 Gemini
calls/request; also triggered by POST /api/quests). Add UserQuota feature + cache.

**R3 — HIGH: quota check-then-consume race** — chat/planner/compile check before
and charge after generation; parallel requests multiply spend; errors/aborts
charge nothing. Fix: reserve before generation (charge-then-refund).

**R4 — HIGH: quest reward inflation via AI tools** —
`chat-tool-executor.ts:461` unclamped `requiredMinutes` → linear XP →
`claim_quest_reward` pays stored values (~5M XP/chat message). Fix: clamp
[15,240] in the executor + recompute rewards in the RPC.

**R5 — HIGH: upload path traversal + unbounded body** (`chat/route.ts:239-247`):
filename = ts + raw `file.name` (spaces only) → `..` traversal; no size/MIME cap;
whole file base64'd into vision prompt. Fix: strict filename allowlist, 5 MB cap,
image MIME allowlist.

**R6 — MEDIUM: XP farming via +60s settle grace** (start→settle cycles mint ~5
XP/sec unbounded). Clamp cycles.

**R7 — MEDIUM: floating-rest-day weekly quota race** (read-then-create; 2 rest
days/week via parallel posts). Guarded upsert on weekKey.

**R8 — MEDIUM: no body size limits on AI endpoints** (planner syllabus, chat
message, evaluate-scope). zod max caps.

**R9 — MEDIUM: cron auth** — `CRON_SECRET || "default_cron_secret_for_dev"` in
daily-briefing (timing-safe compare, public fallback); check-deadlines uses
non-timing-safe compare. Fail closed + constant-time.

**R10 — LOW: waitlist rate limit keyed on spoofable `x-forwarded-for`** (first
value wins). Use platform IP. `check-username`/login timing oracle: INTENTIONAL.

**R11 — LOW: heartbeat writes every 60s/user** — fine at scale; keep batching.

---

## 6. Supabase platform features

- Storage: no buckets → nothing exposed (unused/INTENTIONAL).
- Realtime: publication = StudySession only; owner-or-friend policy correct for
  the minted JWT (`sub` claim). Presence channel `presence:global` exposes online
  user ids (LOW/INTENTIONAL). Other social tables simply not configured (T5).
- RPCs: R1 is the exposure. Enabling RLS on remaining tables would NOT fix R1
  (SECURITY DEFINER bypasses RLS); the app needs no RLS (postgres). The fixes
  that matter: REVOKE EXECUTE, remove `to public` policies, RLS the 10 remaining
  tables (future-proofing).
- Views/triggers/webhooks: none custom. pg_graphql: off.
- Not verifiable without a Management API token: pgrst.db_schemas (assume
  public), CORS/origins, Auth redirect URLs, Supabase Auth signups (unused —
  recommend disabling), realtime channel auth, dashboard advisors.
- Statement timeouts present: anon=3s, authenticated=8s.

---

## 7. Frontend security

- F3 (CRITICAL localStorage JWT), F1 (HIGH client-only group admin), F2 (HIGH
  realtime JWT in localStorage) — see §2/§3.
- **F10 — MEDIUM: no CSP/security headers**; `typescript.ignoreBuildErrors: true`
  (`next.config.ts:4-9`). Add strict CSP + headers; re-enable type checks.
- **F7 — MEDIUM: SWR/localStorage cache persists quests/friends/briefings/
  AI-insights** (`lib/client-data-cache.ts`); not cleared on logout (shared-device
  data replay). Purge on logout; don't cache briefings/insights.
- **F8 — MEDIUM: scratchpad drafts + AI notes unencrypted in localStorage.**
- **F9 — MEDIUM: logout-CSRF** — GET `/login?logout|force|error` clears the
  cookie (SameSite=Lax sends cookies on top-level cross-site GET). Use the
  existing POST `/api/auth/logout`.
- LOW: calculator `new Function` self-XSS (`math-engine.ts:263-276`, whitelist
  allows letters/dots → `sin.constructor.constructor(...)`); dev-mode AI panel
  gated by `?dev=true` (own data only — document or remove); cookie-name mismatch
  (`system_token` vs `hunter_token`) in one dead clear.
- INTENTIONAL/verified safe: MarkdownRenderer (react-markdown v10, no rehypeRaw,
  URL transform on); no user-input dangerouslySetInnerHTML; URL-param ids
  re-checked server-side; realtime token via header, never URL/logged.

---

## 8. AI-specific security

- LLM cannot choose userIds ✓ (executor passes session userId; no tool accepts a
  userId from the model; all `lib/ai/**` Prisma calls userId-scoped).
- Tool authorization backend-controlled ✓ (per-agent allowlists, handoff
  allowlist, iteration caps, executor-side validation).
- Prompt injection: user content concatenated into prompts; effects self-scoped
  (no cross-user disclosure found) — but that's exactly what powers R4. Treat
  model-suggested IDs as untrusted (already re-validated ✓).
- AI routes all Bearer-authenticated ✓. Quotas: chat 10/day, planner 1/week,
  compile 1/day+once-per-subject — races R3, evaluate-scope unquota'd R2.
- Cron: R9. Chat path: R5 upload issues. Provider path: per-attempt timeouts +
  cascade + client-abort ✓.

---

## 9. Supply chain

- CRITICAL: user data in git (S1).
- MEDIUM: unpinned `npx -y` (S3); sprite scripts fetch from
  habitica-assets.s3.amazonaws.com + a signed backblaze.pixellab.ai URL with no
  checksums and commit binaries; `ignoreBuildErrors: true`.
- LOW: `@faker-js/faker` in prod deps; `@dicebear/*`, `@tanstack/react-virtual`,
  `@types/*` unused/misplaced; `postinstall: prisma generate` (normal, keep);
  lockfile install-script packages are the usual set (prisma engines, sharp,
  esbuild, protobufjs, fsevents, @google/genai, unrs-resolver) — nothing
  anomalous; dead files to prune (`old_planner*`, `archive/`, `scratch/`,
  `repomix-output.md`, `parse_logs.py`, `test_*.ts`, `scratch-test-login*.js`);
  `ai-agent/agent.ts` local demo with unvalidated readFile tool (INTENTIONAL).
- No dynamic remote code, no child_process/vm/variable-import vectors.

---

## 10. Security configuration — dashboard checklist

Live-verified above (RLS/grant/policy state, publication, buckets none, pg_graphql
off, timeouts). Requires dashboard access:
1. REVOKE EXECUTE defaults (R1); rotate anon key after fix.
2. Supabase Auth unused by app — disable signups/restrict; review redirect URLs.
3. CORS: restrict to app domains.
4. Realtime: private channels; confirm StudySession-only publication.
5. Run Security Advisor; reconcile dashboard policies (T5).
6. Long-term: non-`postgres` app role (T3).

---

## Prioritized Security Remediation Plan (S1)

### P0 — this week (active/verified exploit paths)

| # | Action | Kills | Breakage risk |
|---|---|---|---|
| 1 | REVOKE EXECUTE on public functions from PUBLIC/anon/authenticated + default-ACL revoke + drop dead reward RPCs | R1 | None (app = postgres) |
| 2 | Gate OAuth link/sign-in on emailVerified; fix GitHub email picker | A1 | Unverified-email GitHub users must verify |
| 3 | Stop returning session JWT in bodies; cookie-only browser auth; remove localStorage.token | A2/F3 | One coordinated refactor |
| 4 | Purge backups/uploads/chat_error.log from history (filter-repo); gitignore; incident triage | S1 | History rewrite coordination |
| 5 | Delete or admin-protect /api/backup | S2 | None |
| 6 | Enforce group-admin server-side in conversations/[id] PATCH | Z1 | None (UI already creator-only) |
| 7 | Enforce block + DM/friend-request privacy settings server-side | Z2, Z3 | Behavioral, expected |
| 8 | Clamp requiredMinutes in chat tools + recompute rewards server-side | R4 | None |
| 9 | Sanitize upload filename; cap size; allowlist MIME | R5 | None |
| 10 | Reserve quota before generation (charge-then-refund) | R3 | Refund logic needed |
| 11 | Quota + rate-limit evaluate-scope | R2 | None |
| 12 | Remove secret fallbacks (fail closed); verify Vercel env set | A4, R9 | None when env set |

### P1 — next sprint

- Enforce session revocation (tokenVersion / REVOKED_SESSIONS read) (A3, A8).
- RLS the 10 remaining tables + owner policies; replace users_select_policy
  USING true; policy roles → authenticated (T1, T2, T4).
- Login rate limiting + lockout; generic errors (A6).
- CSP + security headers; re-enable type-checked builds (F10).
- Realtime JWT memory-only, shorter TTL (F2-HIGH).
- Clear SWR cache on logout; stop caching briefings/insights (F7).
- Message PATCH/DELETE + friends/[id] DELETE re-checks (Z4); privacy-granular
  profile API (Z5).
- Cron secrets constant-time, no defaults (R9); remove GET logout force-bypass
  (F9).

### P2 — hardening backlog

- Password-reset flow (A5); OTP crypto + attempt limits (A7).
- XP grace farming clamp (R6); floating-rest-day guarded upsert (R7); body caps
  (R8); cosmetics ownership check.
- Calculator parser (F6); dev-mode panel decision.
- Reconcile live policies with supabase-realtime-setup.sql; version in migrations
  (T5); decide the other 7 realtime tables.
- Supply-chain hygiene (pin npx, checksum CDN assets, prune deps/files, untrack
  repomix-output.md, handle secret.txt).
- OAuth redirect origin allowlist (A10).
- Dashboard checklist (§10) incl. anon-key rotation after P0-1.

### P3 — strategic

- Least-privilege DB role (T3).
- Backups to encrypted object storage outside the repo.
- Security regression tests in CI (route auth matrix, EXECUTE-revocation check,
  no-JWT-in-body lint, bundle env scan).

*S1 prepared read-only; nothing modified. Secret values intentionally omitted.*
