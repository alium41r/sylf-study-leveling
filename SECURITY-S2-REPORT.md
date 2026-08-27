# SYLF — Security Phase S2: Database / RLS / RPC Authorization Remediation — COMPLETED

**Status:** APPLIED to the live Supabase project (`gjkwkdqdoekzllmnsejo`) and verified.
**Method:** three idempotent Prisma migrations via `npx prisma migrate deploy`
(no `db push`), each first dry-run in a rolled-back transaction against the
live DB. No S3/S4 (app-layer) changes were made.

---

## 1. Migrations created

| Migration | Content |
|---|---|
| `prisma/migrations/20260827000000_s2_security_hardening/migration.sql` | EXECUTE/table/sequence revokes, secure default privileges, guarded SECURITY DEFINER RPCs, dead-RPC drop, RLS on 9 tables, owner policies, WITH CHECK repairs, legacy policy consolidation |
| `prisma/migrations/20260827010000_s2_policy_jwt_semantics/migration.sql` | Rewrites all 47 public-schema identity policies to the custom-JWT semantics (`(auth.jwt() ->> 'sub')::bigint`), because `auth.uid()` casts `sub` to UUID and **errors** for SYLF's integer user ids |
| `prisma/migrations/20260827020000_s2_policy_recursion_fix/migration.sql` | Fixes a 42P17 infinite-recursion in `convo_participant_select_policy` (self-referencing subquery) by making it self-only |

All three are `DROP IF EXISTS` + `CREATE`/`CREATE OR REPLACE` style and idempotent.

## 2. Grants / revokes (applied and verified live)

- `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;`
- `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;`
- `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM service_role;`
- `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;`
- `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;`
- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`
- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;`
- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;`

**Verified:** every one of the 17 remaining public functions now has
`proacl = {postgres=X/postgres}` (owner-only); `has_function_privilege` for
`anon`, `authenticated`, and `service_role` is `false` on all of them; the
`postgres` default ACL no longer grants anything to anon/authenticated on
tables/sequences/functions.
**Residual (dashboard step):** `ALTER DEFAULT PRIVILEGES FOR ROLE
supabase_admin` can only be changed by `supabase_admin` itself (postgres is not
a member) — run the same three revokes for `supabase_admin` in the SQL editor
as that role so dashboard-created objects don't inherit anon grants.

## 3. SECURITY DEFINER functions hardened / removed

| Function | Action |
|---|---|
| `start_study_session` | **Hardened** — S2 identity guard after main `BEGIN`: any caller that is not `postgres`/`supabase_admin` must present a JWT whose `sub` equals `p_user_id` (else `42501`) |
| `settle_study_session_atomic` | Hardened (same guard) |
| `complete_study_session` | Hardened (same guard) |
| `claim_quest_reward` | Hardened (same guard) |
| `claim_achievement_reward_atomic` | Hardened (same guard) — **kept**: it is used by `/api/achievements` with server-catalog amounts |
| `forge_apex_node_atomic` | Hardened (same guard) |
| `unlock_skill_node_atomic` | Hardened (same guard) |
| `claim_session_reward_atomic` | **Dropped** — dead code, caller-supplied reward amounts, zero callers in app/ or lib/ |
| `canonical_*` (5 helpers) | Untouched; now owner-only via the PUBLIC revoke |
| `commit_focus_progression`, `commit_forge_progress`, `purchase_shop_item`, `toggle_equip_item`, `unlock_skill_node` | Untouched (already derive identity from `auth.jwt() ->> 'userId'` / `request.jwt.claim.userId`); now owner-only via the revoke. `commit_focus_progression`, `commit_forge_progress`, `toggle_equip_item`, `unlock_skill_node` are unused by the app — candidates for removal in a later phase |

**Body fidelity proven:** for all 7 hardened functions the live `prosrc` is
byte-identical to the deployed file body plus the exact 9-line guard block
(verified by exact string comparison against the pre-deploy `pg_get_functiondef`
snapshot with the guard excised).

## 4. Tables whose RLS status changed

Enabled (9): `AiUsageLog`, `FloatingRestDay`, `Item`, `UserInventory`,
`UserQuota`, `UserSkillNode`, `UserStats`, `WaitlistEntry`, `XpLedger`.
Unchanged by design: `_prisma_migrations` (Prisma-managed infrastructure
metadata — no external grants exist and none can be re-added through the
revoked defaults; enabling RLS was judged unnecessary and riskier for
Prisma's own bookkeeping).

## 5. Policies added / removed / changed

**Removed:** `users_select_policy` (USING true), `users_update_policy`,
`convo_write_policy`, `friend_request_update_delete_policy`,
`session_invite_write_policy`, legacy `"Users manage own quests"`,
`"Users manage own subjects"`, `"Users manage own subject nodes"` — plus all
pre-existing dashboard policies were dropped-and-recreated with correct
semantics (47 `CREATE POLICY` statements in migration 2).

**Added / repaired (final state):**
- Owner `*_user_policy` (FOR ALL, USING + WITH CHECK, `"userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)`) for: AiInsight, AiMemory, AiUsageLog, AuthSession, BlockedUser, ChatSession, ConnectedAccount, DailyBriefingLog, FloatingRestDay, Goal, HpLedger, InventoryItem, Quest, StudySession, Subject, SylphLedger, SystemMessage, UserAchievement, UserCosmetic, UserInventory, UserPrivacy, UserQuota, UserSkillNode, UserStats, VerificationToken, XpLedger.
- `User`: `users_select_own_policy` (self-only SELECT — replaces USING(true)),
  `users_update_own_policy` (USING + WITH CHECK, self-only), `users_delete_policy`
  (self-only).
- `Conversation`: `convo_select_policy` (participant), `conversation_insert_creator`
  (WITH CHECK createdBy=self), `conversation_update_creator` (USING participant-or-
  creator, WITH CHECK creator-only), `conversation_delete_participant`
  (participant-or-creator).
- `ConversationParticipant`: `convo_participant_select_policy` (**self-only** —
  breaks the 42P17 recursion), `convo_participant_write_policy` (self, WITH CHECK).
- `Message`: `message_insert_policy` (sender=self), `message_select_policy`
  (conversation member).
- `Friendship`: write (self + WITH CHECK), select (either side).
- `FriendRequest`: insert (sender=self), select/update/delete (either side;
  UPDATE carries WITH CHECK so `senderId`/`receiverId` cannot be reassigned).
- `SessionInvite`: select/update/delete (either side; UPDATE carries WITH CHECK).
- `SubjectNode`: `subject_node_user_policy` (ownership resolved through
  `Subject.userId`, USING + WITH CHECK).
- Catalogs kept intentionally public: `acoustic_track_select_policy`,
  `item_select_public_catalog` (SELECT USING true).
- `WaitlistEntry`: RLS enabled, **no policies** (PII block-all for external
  roles; the app API reaches it as postgres).

## 6. Attack tests performed (reproduce → fix → re-run)

| # | Test | Before S2 | After S2 |
|---|---|---|---|
| 1 | anon PostgREST `/rpc/start_study_session` (bogus id) | HTTP 409 FK error (function EXECUTED as definer) | **HTTP 401 permission denied** |
| 2 | anon PostgREST `/rpc/settle_study_session_atomic` | exposed | **401** |
| 3 | anon PostgREST `/rpc/complete_study_session` | exposed | **401** |
| 4 | anon PostgREST `/rpc/claim_quest_reward` | exposed | **401** |
| 5 | anon PostgREST `/rpc/claim_session_reward_atomic` | exposed | **404 PGRST202 (dropped)** |
| 6 | anon PostgREST `/rpc/claim_achievement_reward_atomic` | exposed | **401** |
| 7 | anon PostgREST `/rpc/forge_apex_node_atomic` | exposed | **401** |
| 8 | anon PostgREST `/rpc/unlock_skill_node_atomic` | exposed | **401** |
| 9 | anon PostgREST `/rpc/canonical_required_xp` (was HTTP 200) | 200 | **401** |
| 10 | anon SQL `SET ROLE anon; SELECT start_study_session(...)` | executed | **42501 permission denied** |
| 11 | EXECUTE sweep via `has_function_privilege` (anon + authenticated, all 17 fns) | leaked via PUBLIC | **0 leaks** |
| 12 | App path: `postgres` calls guarded `start_study_session` in txn (rolled back) | n/a | **works** (session id returned) |
| 13 | User A SELECT sees own row only (RLS, temp grants) | n/a | **1 own / 0 others** |
| 14 | User A UPDATE another user's `sylph` | n/a | **0 rows** (USING blocks) |
| 15 | User A INSERT new `User` row / `UserStats` for B | n/a | **blocked** (WITH CHECK / sequence) |
| 16 | WaitlistEntry visibility with temp SELECT grant | n/a | **0 rows** (RLS, no policies) |
| 17 | Item catalog visibility | n/a | **69 rows** (intentional public catalog) |
| 18 | FriendRequest: A updates own row (party) / reassigns senderId→B | n/a | **1 row allowed / 42501 WITH CHECK** |
| 19 | Conversation: participant selects convo+messages, creator renames, insert createdBy=B | n/a | **allowed / allowed / 42501 WITH CHECK** |
| 20 | Policy recursion on ConversationParticipant | 42P17 on evaluation | **no recursion** (self-only policy) |

All checks that needed temporary grants were run inside `BEGIN … ROLLBACK`
transactions — the production grant state (anon/authenticated: **zero**
privileges) is unchanged by the tests and was re-verified afterwards.

## 7. Legitimate-flow verification

- Prisma path proven: guarded RPC executed as `postgres` inside a transaction
  (returned a session row, rolled back).
- `npx vitest run`: 635/638 pass. The 3 failures are pre-existing and unrelated
  to S2: two unit tests in `__tests__/ai/multi-engine-router.test.ts` expecting
  a different vision-primary provider (lib/ai changed outside this phase), and
  one planner integration test that requires live AI provider credentials.
  All DB-dependent tests (achievements, danger-zone, sessions) pass.
- New static regression suite: `__tests__/security/s2-db-hardening.test.ts`
  (30 tests) pins the migration invariants — **30/30 pass**.

## 8. Remaining risks → S3/S4 (explicitly out of scope here)

1. **App layer (S3/S4):** localStorage session JWT + JSON-body tokens (F3),
   OAuth unverified-email linking (A1), logout-all no-op (A3), group-admin
   server checks (Z1), block/DM privacy enforcement (Z2/Z3), AI quota races +
   unquota'd evaluate-scope (R2/R3/R4), upload path traversal (R5), login rate
   limiting (A6), CSP/security headers (F10), `/api/backup` (S2 of audit S1 —
   naming collision with this phase; still open).
2. **Dashboard steps:** run the same `ALTER DEFAULT PRIVILEGES … FOR ROLE
   supabase_admin` revokes as `supabase_admin`; consider rotating the anon key
   (it has been public); disable unused Supabase Auth signups.
3. **Standing rules going forward:** never grant table/column privileges to
   anon/authenticated on `User` (protected columns: sylph, level, currentXP,
   hp, streakDays, verificationStatus, tokenVersion, password — RLS cannot do
   column-level checks); new functions are now safe-by-default via the revoked
   default ACL, but keep adding the identity guard to any new
   `p_user_id`-taking SECURITY DEFINER function.
4. **Noted, not exploitable today:** with hypothetical future grants, RLS on
   `StudySession` checks only `userId` (a malicious questId FK is rejected by
   the guarded settle/start RPCs, not by RLS); `conversation_update_creator`
   relies on `createdBy` WITH CHECK plus the no-grants rule (column-level
   protection for `createdBy` would be the belt-and-braces fix if UPDATE grants
   are ever issued); Realtime publication still contains only `StudySession`
   (unchanged).

## 9. Files touched

- `prisma/migrations/20260827000000_s2_security_hardening/migration.sql` (new)
- `prisma/migrations/20260827010000_s2_policy_jwt_semantics/migration.sql` (new)
- `prisma/migrations/20260827020000_s2_policy_recursion_fix/migration.sql` (new)
- `__tests__/security/s2-db-hardening.test.ts` (new regression suite)
- `scratch/s2/` — generators, before/after snapshots, verification scripts
  (audit trail; not part of the app)

**S2 is complete: the live anonymous RPC privilege-escalation path is closed
and independently verified; RLS/WITH CHECK/privilege issues from S1 are
remediated; the Prisma/postgres application path is proven intact.**
