# SYLF — Security Phase S4: AI Abuse, Uploads, Secrets & Platform Hardening — COMPLETED

**Scope:** AI usage/rate limiting & cost control, AI reward abuse, file-upload
security, secrets/fallback cleanup, git data exposure, Realtime/platform
verification, rate limiting beyond AI, supply-chain hardening.
**Preserved:** S2 RLS/RPC revokes (live-verified intact: anon RPC probe → 401,
`proacl = {postgres=X/postgres}`), S3 cookie-only sessions + headers (CSP
live-verified), custom auth/Prisma/AI provider architecture.

---

## 1. Findings discovered (this phase)

- F1: quota check-then-consume race — parallel chat/planner/compile requests
  could all pass `checkQuota` and run full generations (unbounded spend).
- F2: `/api/quests/evaluate-scope` had NO quota and no rate limit (up to 3
  Gemini generations per request); `POST /api/quests` triggered the same
  evaluator unquota'd.
- F3: no per-IP layer anywhere except the (spoofable-first-hop) waitlist
  limiter; login/register/OTP/verification-email had no throttling.
- F4: AI tool `requiredMinutes` was unclamped in `executeCreateQuest` /
  `executeUpdateQuest` (S1/R4 fix confirmed ABSENT — it was never patched in
  S2/S3), letting one chat message mint ~5M XP.
- F5: study-session settle flood (start→settle cycles exploiting the +60s
  wall-clock grace) had no request-side bound.
- F6: chat upload accepted any size/content with a client-influenced filename
  (`path.join` traversal on writable filesystems).
- F7: fallback secrets `default_cron_secret_for_dev` and
  `sylf-dev-tool-confirmation-secret` were still live; check-deadlines used a
  non-constant-time compare.
- F8: user data (`backups/`, `public/uploads/`, `public/chat_error.log`) was
  still tracked in git HEAD; `repomix-output.md` (3.1 MB) and
  `ai-agent/secret.txt` tracked; dead dump scripts (`backup_db.ts`,
  `backup_script.js`) still present.

## 2. Findings fixed

| # | Fix | Location |
|---|---|---|
| F1 | **Atomic reservation before generation + guarded refund.** `reserveQuota` (guarded upsert, unchanged) now runs BEFORE any LLM call; `releaseQuota` (`used > 0` guard) refunds on failure/timeout/abort. Chat/planner/compile all follow reserve→generate→(keep or refund). Parallel requests can no longer multiply spend — they reserve or 429. | `lib/ai/usage-limiter.ts`, `app/api/system-messages/chat/route.ts`, `app/api/ai-planner/route.ts`, `app/api/subjects/[id]/compile/route.ts` |
| F2 | **`scope` quota feature (20/day, atomic)** on `/api/quests/evaluate-scope` + per-IP window (20/5min) + zod input caps; `POST /api/quests` reserves the same quota and falls back to the deterministic semantic-weight calculator when the quota is exhausted or the AI fails (quest creation never breaks). | `lib/ai/config.ts`, `app/api/quests/evaluate-scope/route.ts`, `app/api/quests/route.ts` |
| F3 | **Server-side rate limiter** (`lib/rate-limit.ts`: Upstash atomic INCR+NX, in-process fallback, hashed keys — raw IPs never stored, Vercel-trusted IP preferred). Applied: login (per-IP 10/min + per-identifier 10/15min), register (5/15min), security OTP send-code (3/10min), verification-email send (3/10min), evaluate-scope (20/5min). | `lib/rate-limit.ts` + 5 routes |
| F4 | **Server-authoritative clamps:** AI-created quest minutes clamped to [15,240] (invalid → 30) in create AND update paths; rewards always recomputed from the clamped value. | `lib/ai/chat-tool-executor.ts` |
| F5 | **Settle flood guard:** ≥6 final settles per rolling 60s per user → 429 (real studying never trips it). Replay is already blocked by the RPC's `rewardsClaimed`/`ALREADY_CLAIMED` idempotency (verified in S2). | `app/api/sessions/route.ts` |
| F6 | **Upload hardening:** 5 MB cap (413), magic-byte content sniffing (JPEG/PNG/GIF/WebP), MIME allowlist, server-generated `up_<ts>_<rand>.<ext>` names (client filename never used as a path component), best-effort persistence (read-only FS just skips the archive — attachment still analyzed), generic errors (no path leakage). Message text capped at 4000 chars. | `lib/upload-security.ts`, `app/api/system-messages/chat/route.ts` |
| F7 | **Fail-closed secrets:** cron routes require `CRON_SECRET` (503/401 when missing; both compare constant-time); `tool-confirmation` throws when no secret; `CRON_SECRET` + `TOOL_CONFIRMATION_SECRET` added to `.env` (generated) and `.env.example` (placeholders). JWT fallback already removed in S3. | `lib/ai/tool-confirmation.ts`, `app/api/cron/daily-briefing/route.ts`, `app/api/quests/check-deadlines/route.ts`, `.env*` |
| F8 | **Git cleanup:** untracked + deleted `backups/`, `public/uploads/*`, `public/chat_error.log`, `repomix-output.md`, `ai-agent/secret.txt`; deleted dead dump/debug scripts (`backup_db.ts`, `backup_script.js`, `scratch-test-login*.js`, `test_gemini.ts`, `test_planner*.ts`, `parse_logs.py`, `test_results.txt`, `prompts_output.txt`, `old_planner*`); `.gitignore` now blocks `backups/`, `backup_*`, `/public/uploads/` (with `.gitignore` keeper), `*.log`, `repomix-output.md`, `scratch/`. Committed locally as `d2cd65f`. | repo |

## 3. Exact files / configuration changed

- `lib/ai/usage-limiter.ts` (reserve/release, scope in usage report),
  `lib/ai/config.ts` (scope quota), `lib/rate-limit.ts` (new),
  `lib/upload-security.ts` (new), `lib/ai/tool-confirmation.ts`,
  `lib/ai/chat-tool-executor.ts`, `lib/supabase-browser.ts` (25min cache),
  `app/api/system-messages/chat/route.ts`,
  `app/api/ai-planner/route.ts`, `app/api/subjects/[id]/compile/route.ts`,
  `app/api/quests/evaluate-scope/route.ts` (rewritten), `app/api/quests/route.ts`,
  `app/api/sessions/route.ts`, `app/api/auth/login/route.ts`,
  `app/api/auth/register/route.ts`, `app/api/user/security/send-code/route.ts`,
  `app/api/auth/verify-email/send/route.ts`,
  `app/api/cron/daily-briefing/route.ts`, `app/api/quests/check-deadlines/route.ts`,
  `app/api/realtime/token/route.ts` (30-min TTL),
  `package.json` (`@faker-js/faker`, `@types/*` → devDependencies;
  `@dicebear/*`, `@tanstack/react-virtual` removed; `audit:secrets` script) +
  lockfile, `supabase.cordis.yml` (pinned `@supabase/mcp-server-supabase@0.11.0`),
  `.gitignore`, `.env`/`.env.example`, `scripts/scan-secrets.mjs` (new).
  Tests: `__tests__/security/s4-quota-upload-rate.test.ts`,
  `__tests__/security/s4-ai-tool-clamps.test.ts`,
  `__tests__/security/s4-settle-guard.test.ts` (new); mock updates in
  `__tests__/subjects/quest-progress-reconciliation.test.ts`,
  `__tests__/ai/{planner-api,e2e-conversation,syllabus-compiler}.test.ts`,
  `vitest.setup.ts` (CRON/TOOL secrets + auth-server shim hardened earlier in S3).

## 4. AI quota/rate-limit design (final state)

- **Reserve-then-generate:** every quota'd feature (chat 10/day, planner 1/week,
  compile 1/day+once-per-subject, scope 20/day) takes its unit through one
  atomic guarded upsert BEFORE any provider call; failures/aborts refund via a
  guarded decrement. Parallel requests either reserve or get 429 — the
  counter can never exceed the limit and spend can never exceed
  `limit × cost-per-request` at any instant.
- **Layering:** per-user quota (primary) + per-IP windows (secondary, hashed,
  trusted-header-first) + input size caps (chat message 4000 chars,
  evaluate-scope zod bounds, upload 5 MB) + provider-side hard caps tracked as
  a dashboard checklist (see §7).
- **Server-authoritative:** quota values, feature names, and limits come only
  from `AI_QUOTAS`; the client's `modelPreference` is an allowlisted UX choice
  that cannot alter any limit.

## 5. Upload-security design (final state)

`lib/upload-security.ts`: `validateUpload(file, buffer)` → size ≤ 5 MB →
magic-byte sniff → allowlist → server-generated name. The chat route buffers
the body, validates, then best-effort persists (safe on read-only
filesystems); the AI still receives the image in-request. The original
client filename is dead on arrival; `/uploads/` names contain only
`up_<timestamp>_<hex>.<ext>`; errors are generic. `public/uploads/` is
gitignored (keeper file committed) so new uploads can never re-enter git.

## 6. Secret/configuration cleanup

No fallback secrets remain (grep-verified). Cron/tool-confirmation/JWT all
fail closed. Production env checklist for Vercel: `JWT_SECRET`,
`JWT_ISSUER`/`JWT_AUDIENCE` (or defaults), `CRON_SECRET`,
`TOOL_CONFIRMATION_SECRET`, `SUPABASE_JWT_SECRET`, `DATABASE_URL`/
`DIRECT_URL`, provider keys. Client bundle re-scanned: **0** secret key names
in `.next/static` after the S4 build.

## 7. Realtime / platform changes

- Realtime publication verified unchanged: only `public."StudySession"`
  (owner-or-friend RLS) — no expansion made; the other social tables remain
  unpubliished (REST polling continues to cover them).
- Minted realtime JWT: memory-only (S3), TTL reduced 60 → **30 minutes**
  (client cache 25 min), cookie-authenticated minting — cannot be persisted
  or used across users (sub-bound, RLS-checked).
- Live probes: anon PostgREST RPC still 401 (S2 intact); CSP headers still
  served (S3 intact); `prisma migrate status` → 35 migrations, **up to date**.
- Remaining dashboard items (cannot be reached from here — documented):
  `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` revokes (S2 note),
  CORS/redirect-URL review, disable unused Supabase Auth signups, provider
  hard spend caps (Gemini/Groq/DeepSeek consoles), Security Advisor run.

## 8. Git / data-exposure status

- Working tree: sensitive artifacts **removed and untracked**; `.gitignore`
  prevents recurrence; commit `d2cd65f` records the removal (not pushed).
- **History rewrite still outstanding (decision needed):** the user data in
  commit `7e35f94` (`backups/db-snapshot-*`, `public/uploads/*`) remains in
  git history on `origin/main` (private repo). Recommended remediation:
  `git-filter-repo --path backups --path public/uploads --path
  public/chat_error.log --invert-paths` on a fresh clone, then
  `git push --force --all --tags` with all collaborators' clones re-cloned.
  Consequences: rewritten SHAs, force-push required, anyone with an old clone
  still holds the data, GitHub caches/forks may retain blobs. This is the
  single highest-priority follow-up and should be executed deliberately —
  it was NOT performed during S4 to avoid destroying history without sign-off.
- `scan-secrets.mjs` (`npm run audit:secrets`) scans git-tracked files: **0
  matches** post-cleanup.

## 9. Security tests and attack results

- New: 20 S4 regression tests (reservation success/exhaustion/refund-guard,
  upload magic-bytes/size/traversal-safe names, rate-limit window + IP
  hashing, cron fail-closed ×2, tool-confirmation fail-closed, AI tool
  minute clamps (1M→240, 0.5→15, NaN→30), settle flood guard 429 + pass-through).
- Full suite: **701/704** — the 3 failures are the pre-existing AI-suite ones
  (2 vision-router unit tests predating recent `lib/ai` changes; 1 planner
  integration test needing live provider keys), unchanged from the S2/S3
  baseline.
- `tsc --noEmit` clean; production `next build` succeeds; `prisma migrate
  status` up to date; bundle secret scan clean; live probes pass
  (evaluate-scope 401, CSP present, anon RPC 401).

## 10. Remaining S5 adversarial-verification items

- History rewrite execution + GitHub blob purging + user notification
  (requires owner decision — plan above).
- Dashboard: supabase_admin default-privilege revokes, CORS/origins, Auth
  signup disabling, provider hard spend caps, Security Advisor.
- Adversarial re-test of the reservation logic under true concurrency
  (multi-process) and of the settle grace at the DB layer (the RPC's +60s
  grace itself is S2-owned DB logic — consider an RPC-level minimum-age guard
  as a follow-up).
- Pen-test pass: prompt-injection attempts against the tool executor under the
  new clamps; upload fuzzing with polyglot files; rate-limit bypass attempts
  via header spoofing on self-hosted setups.
- `user/sessions` device-token-hash reads the raw Authorization header as a
  fallback (not an auth gate) — clean up in S5.
