# Sylf production deployment checklist

**Prepared 1 November 2026 from the working tree. Nothing here has been run against a hosted service.** The owner performs every step. Do not treat a local pass as proof of hosted state: the [Stage 3 handoff](../handoffs/stage-3.md) lists what has never run outside this Mac.

## Why this matters

The OAuth takeover flaw (S-1) and seven high-severity defects are fixed only in uncommitted code, so **production still has them until this deploys.** In the old callback, a `link_user_id` cookie alone chose which account a provider attached to. The fix makes the verified session the only authority: a cookie that disagrees with it, or arrives with no session, links nothing and signs nobody in.

**Added 1 November 2026.** [Expansion Part 1](../reports/expansion-part-1/urgent-issues.md) proved further open defects in production code: cosmetics are not checked, messages have no limits, email change needs no password, and stored image addresses are not validated. None is fixed yet, and none blocks this checklist. It also asks you to confirm that a scheduler calls `check-deadlines`, `cron/daily-briefing` and `cron/calendar-sync`, because the repository has none.

## 1. Before touching anything

- [ ] Commit the work. `native/`, `documentation/native/` and **eleven migrations are untracked**, so a deploy from the current commit would ship none of them.
- [ ] Take a hosted database backup, and confirm it can be restored.
- [ ] Confirm which database each environment uses. `.env.local` has a `DATABASE_WORKER_URL` that does not point at this Mac, and it changed at 08:12 on 1 November by something not yet identified.
- [ ] If Antigravity's test run at 10:42 on 1 November used hosted settings, review what it may have touched. Root tests have stale mocks that can reach a real client (finding D-4).
- [ ] Rerun the final local set on the exact commit being deployed.

## 2. Read-only checks on the hosted database

```sql
-- getSession reads these and fails closed, so they must exist.
SELECT column_name FROM information_schema.columns WHERE table_name = 'AuthSession' AND column_name IN ('tokenHash', 'expiresAt');
-- Tables without RLS, to compare with 20261101000000_rls_defense_in_depth.
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
-- Indexes the history does not create. Expect these three at least.
SELECT indexname FROM pg_indexes WHERE indexname IN ('StudySession_userId_startedAt_idx', 'AuthSession_tokenHash_key', 'Quest_userId_status_idx');
-- What is really applied.
SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at DESC NULLS FIRST LIMIT 20;
-- Your own account must be VERIFIED, or ADMIN_EMAILS no longer promotes it.
SELECT id, "isAdmin", "verificationStatus" FROM "User" WHERE email = '<your email>';
```

**Stop if** the first query returns fewer than two columns, or `_prisma_migrations` shows a failed or unfinished row.

## 3. Resolve before migrating

| Item | Why | Decision |
| --- | --- | --- |
| D-2, migration history | Some tables came from `db push`, so the history cannot rebuild the schema from empty | Decide whether to baseline from the hosted schema |
| D-3, `CalendarNote` in `schema.prisma` | It stops the schema building from empty | Fix or confirm |
| `20261020000000_notes_connections` was edited | `BEGIN;` and `COMMIT;` were added after it was written. If it is already applied, its checksum no longer matches | Check `_prisma_migrations`. Do not rerun it. Expect Prisma to report the change, and resolve it deliberately |

## 4. Migration order

Additive and scanned: none drops or rewrites data. The two matches for destructive words in `20261101100000` are rollback notes in comments.

| Order | Migration | Note |
| --- | --- | --- |
| 1 to 8 | `20261025000000` to `20261028000000`, the Planner set | **Not in the Phase 11 and 12 handoffs, and untracked.** Needed by the Planner code in this tree. Apply in filename order |
| 9 | `20261101000000_rls_defense_in_depth` | Not applied anywhere hosted |
| 10 | `20261101100000_native_auth_sessions` | **Must land before the code.** Prisma names these columns, so otherwise `GET /api/user/sessions` fails and a browser sign-in records no device row. Rollback is in the file's header |
| 11 | `20261101110000_open_session_index` | Uses `CONCURRENTLY`. On a large table, build the index by hand first. `db push` would offer to drop it, so do not use `db push` here |

## 5. Deploy

- [ ] Deploy to a preview first, on a non-production database.
- [ ] Set `EXPO_PUBLIC_SYLF_API_ORIGIN` and `SYLF_BACKEND_ORIGIN` for any real native build. Unset, nothing connects.
- [ ] Confirm every variable the code reads exists in each environment. `.env.example` omits many that are in use, including `DATABASE_POOL_URL`, `DATABASE_WORKER_URL`, `ADMIN_EMAILS`, `JWT_ISSUER`, `JWT_AUDIENCE`, the DeepSeek group, OAuth client pairs and the email group. Add them to the example file.
- [ ] Promote to production only after section 6 passes on preview.

## 6. After deploying

| Check | Pass if |
| --- | --- |
| Browser sign-in | It works, and `AuthSession` gains a row |
| OAuth sign-in with a real provider | It completes. **This has never run** |
| Linking with a forged `link_user_id` cookie | It is refused, and nothing is linked |
| `GET /api/user/sessions` | 200 |
| A planned quest and a study session | One session row, rewards once |
| Sylf Native against the deployed origin | Sign-in, one saved session, sign-out |
| Sign out everywhere | The other device ends and says why |

## 7. Then review

- [ ] Review `ConnectedAccount` for links nobody made. S-1 existed in production, and whether it was used cannot be judged from here. Rotate any affected account's sessions by raising its `tokenVersion`.
- [ ] Review what changed for students: a 12-hour credit cap on one session, a password removed when a verified provider claims an account, an unverified admin no longer promoted, group restrictions, and refresh reuse ending a device.

## Open decisions

Password reset (G-4), whether an email change needs a password (S-12), a daily ceiling on credited study (I-2), and Electron's lack of a system proxy. Details are in [Stage 3 handoff §5](../handoffs/stage-3.md#5-for-the-owner-in-order).
