# SYLF — Launch-Day Security Checklist (owner runbook)

Status of every S5 residual item: what I could do from here (done + verified),
and exactly what you must click/paste. Nothing in this checklist changes
application behavior — it closes operational gaps.

---

## NOW — Supabase dashboard (owner, logged in to gjkwkdqdoekzllmnsejo)

### 1. supabase_admin default privileges — OPTIONAL (SQL editor will fail; use the Management API)
**Why the SQL editor fails:** it runs as `postgres`, which is not a member of
`supabase_admin` (verified: `SET ROLE supabase_admin` and
`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` both return 42501).
**Why it's low risk:** all 38 public tables are owned by `postgres`, whose
defaults were locked in S2 (no anon/authenticated grants — re-verified). The
`supabase_admin` defaults only apply to objects supabase_admin itself creates
(platform internals), never your app objects.

**If you want to close it anyway — Management API (runs elevated):**
1. Dashboard → avatar → **Access Tokens** → Generate new token (`sbp_...`).
2. `curl -s -X POST https://api.supabase.com/v1/projects/gjkwkdqdoekzllmnsejo/database/query \
     -H "Authorization: Bearer <PAT>" -H "Content-Type: application/json" \
     -d '{"query":"ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated; ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated; ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;"}'`
3. Verify:
   ```sql
   SELECT defaclrole::regrole::text AS role, defaclobjtype, defaclacl::text
   FROM pg_default_acl
   WHERE defaclrole = (SELECT oid FROM pg_roles WHERE rolname = 'supabase_admin')
     AND defaclnamespace = 'public'::regnamespace;
   -- Expect: no "anon=…" or "authenticated=…" entries.
   ```
4. You may also put the PAT in local `.env` as `SUPABASE_ACCESS_TOKEN`
   (gitignored) so the project's tooling can run it.

**If you prefer to skip it:** acceptable — the risk is covered by postgres
ownership + locked postgres defaults. Just re-run the verification query after
any future dashboard Table Editor creation.

### 2. Disable unused Supabase Auth signups — REQUIRED (confirmed currently OPEN)
I probed `GET /auth/v1/settings` with the anon key: `disable_signup: false`,
meaning anyone can create rows in `auth.users` via `/auth/v1/signup` even
though the app never uses Supabase Auth. Fix:
**Dashboard → Authentication → Sign In / Providers → "Allow new users to sign
up" → OFF.** (Do NOT touch anything else — the app uses its own auth.)

Verify: re-run the probe and expect `disable_signup: true`.

### 3. CORS / allowed origins
**Dashboard → Settings → API → "CORS (Restrict domains)"** — add your Vercel
app origins (e.g. `https://your-app.vercel.app` and your custom domain) and
remove `*`. The app talks to Supabase only via Realtime websockets (not
subject to CORS) and via the server-side Postgres pooler, so this is defense
in depth — nothing breaks if it's restrictive.

### 4. Security Advisor
**Dashboard → Security → Security Advisor** → review + apply. The main
advisor item relevant to you (RLS off on tables) was already addressed by the
S2 migrations; confirm no new findings.

### 5. Rotate the Supabase anon key
**Dashboard → Settings → API → rotate the anon key** after you've pushed the
new `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel and redeployed (otherwise
Realtime breaks). The anon key has been public since the beginning; rotation
is hygiene.

---

## NOW — Vercel / repo (owner only)

### 6. Verify production environment variables
Vercel → project → Settings → Environment Variables → Production. Confirm all
of these exist (values are yours; never paste them into chat/logs):

| Variable | Notes |
|---|---|
| `DATABASE_URL` | pooler URL |
| `DIRECT_URL` | session-mode (migrations) |
| `JWT_SECRET` | required — app fails closed without it |
| `JWT_ISSUER` / `JWT_AUDIENCE` | optional (defaults `sylf` / `sylf-app`) |
| `CRON_SECRET` | required — cron fails closed without it |
| `TOOL_CONFIRMATION_SECRET` | required — tool confirmation fails closed |
| `SUPABASE_JWT_SECRET` | realtime token minting |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | update after anon-key rotation |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `GROQ_MODEL`, `DEEPSEEK_API_KEY` | providers |
| OAuth: `GOOGLE_*`, `GITHUB_*`, `DISCORD_*` client id/secret | OAuth |
| `SMTP_USER` / `SMTP_PASS` (or `RESEND_API_KEY`) | email |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | rate limits/cache |
| `PRELAUNCH_MODE` | see #7 |

### 7. Set PRELAUNCH_MODE=true
Vercel → project → Settings → Environment Variables → add
`PRELAUNCH_MODE` = `true` for **Production** → Redeploy. Effect (already in
code): `/login` and `/register` redirect to the landing page; registration and
OAuth account creation return 403; the waitlist keeps working. Remove the
variable at launch moment.

### 8. Re-clone after the history rewrite
The repo history was rewritten (old SHAs 6dd46e2… → 62ea4df) and force-pushed.
Any clone that predates the rewrite still contains the (test-only) snapshot
data in its local history. If you (or collaborators) have an old clone,
**discard it and re-clone** from origin:

```bash
rm -rf <old-clone-dir>
git clone https://github.com/alium41r/sylf-study-leveling.git
cd sylf-study-leveling && npm ci
```

Verify your clone is on the new history: `git log --oneline -1` should show
`f1ac402` or newer, and `git rev-list --all --objects | grep -c backups` must
be `0`.

### 9. AI provider spending caps (external consoles — cannot be automated)
- **Google AI Studio / Gemini**: Project → Billing → set a hard monthly budget
  alert (and a spend cap if available for the API key).
- **Groq**: Console → Billing/Usage → set a spend limit on the API key.
- **DeepSeek**: Platform → Billing → set a top-up/usage alert.
These are the backstop to the app-level quotas (chat 10/day, planner 1/week,
compile 1/day, scope 20/day, all atomic-reserved).

---

## THEN — launch verification (owner, after deploy)

I already ran most of these LIVE against the production build + real DB during
S5 (evidence in `SECURITY-S5-REPORT.md`), so these are the 30-minute re-checks
on the deployed site, not first-time investigations.

### 10. Fresh-account testing
1. Register two accounts (A, B) on the deployed site.
2. DevTools → Application → Cookies: confirm `hunter_token` is **httpOnly**
   and NOT visible to JS; confirm **no `token`/`user_data` in localStorage**;
   confirm **no `sylf_realtime_jwt`** in localStorage.
3. Login response body must NOT contain a `token` field.

### 11. Timer testing
1. Start a session, wait 2 min, finalize → correct minutes/XP (no 429).
2. Fire 7 finalize requests within 60s → expect 429 on the 7th (flood guard).
3. Settle the same session twice → second returns alreadyClaimed, no double XP.

### 12. AI testing
1. Chat: message "Explain X in one sentence" ×11 rapidly → the 11th returns
   `DAILY_QUOTA_EXHAUSTED` (reservation holds under concurrency).
2. Chat: "create a quest with requiredMinutes 9999999" → the created quest's
   `requiredMinutes` ≤ 240 (server clamp).
3. Planner: one generation succeeds; a second attempt same week → 429.

### 13. Social testing
1. B sets "only friends" for DMs → A (non-friend) cannot start a DM with B.
2. A blocks B → B's existing DM disappears; B cannot message A; A cannot see
   B in `/users/search`.
3. Non-creator group member tries rename/add-member → 403.

### 14. Upload testing
1. Attach a 6 MB image → 413. Attach a `.png` containing text → 400.
2. Attach a valid image → succeeds; Network tab shows it stored under
   `/uploads/up_<timestamp>_<hex>.png` (never your original filename).

### 15. Final production build/deploy
1. `npm ci && npm run audit:secrets && npx prisma migrate deploy && npx next build`
2. Deploy to Vercel; verify `Strict-Transport-Security`,
   `Content-Security-Policy`, `X-Content-Type-Options: nosniff` on a page
   response (curl -I).
3. Confirm `https://<site>/api/backup` → 404.
4. At launch: delete the `PRELAUNCH_MODE` env var (or set it to `false`) and
   redeploy.

---

## What I already verified (so you don't have to)

- S2: no external EXECUTE on any public function (17/17 owner-only); RLS +
  WITH CHECK + guards live and re-verified in S5.
- S3: cookie-only sessions (live login/register bodies tokenless), headers
  served, GET-logout CSRF closed.
- S4/S5: parallel-quota concurrency (15 req → 9 OK / 6×429), settle flood
  guard, timer clamps, injection refusal + clamps, upload fuzz matrix,
  cross-user battery, rate-limit layering — all against the real system.
- Git: history purge pushed + verified (0 reachable blobs, remote clean).
