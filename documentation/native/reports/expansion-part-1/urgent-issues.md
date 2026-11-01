# Expansion Part 1 — Urgent issues

**1 November 2026. For the owner, separate from the plan.** These need a decision or action sooner than the roadmap would reach them. **Part 1 changed no application code and touched no hosted service, so every issue below is still open.** Each was proved on a disposable local server, or read in source where the table says so. Whether any was used in production cannot be judged from here.

Proof is in [`evidence/`](evidence/). Accounts and values there are fixtures.

## Summary

| # | Severity | Issue | Who acts | Proof |
| --- | --- | --- | --- | --- |
| U-1 | **Critical** | Production keeps the OAuth takeover flaw and the other fixed defects until deployed | Owner | Stage 3 |
| U-2 | **High** | Anyone can wear any cosmetic or any title text, for free | Fix on approval | Request |
| U-3 | **High** | Chat accepts a 1,000,000-character message, and 40 messages in a third of a second | Fix on approval | Request |
| U-4 | **High** | Changing an email needs no password, and nothing tells the old address | Decision, then fix | Request |
| U-5 | **High if nothing external runs them** | No scheduler for overdue quests, briefings or calendar sync exists in the repository | Owner checks | Source |
| U-6 | **Medium** | Stored image addresses are not checked, and are served to other people | Fix on approval | Request |
| U-7 | **Medium** | A solo session can run during a party, and party time appears not to reach a student's record | Decision | Request and source |
| U-8 | **Medium** | The overdue-quest job loads every open quest with its full user row | With U-5 | Source |
| U-9 | **Medium** | All work is still uncommitted, on one disk, and the env files are not backed up | Owner | Measured |

## U-1. Production still has the fixed defects

Already reported, and the most serious item here. S-1 allowed account takeover through an unsigned cookie, and the fix exists only in uncommitted code. Follow the [deployment checklist](../../backend/deployment-checklist.md). **This should not wait for the Expansion stage.**

## U-2. Cosmetics and titles are not checked against ownership

`POST /api/cosmetics` and `PATCH /api/profile/customization` write what they are given. Neither asks whether the person owns it. `inventory/equip` does check.

**Proved.** A new account with nothing bought set `activeTitle: "Emperor"` and made-up frame, aura and name color values. All four were saved and served back. See `unbought cosmetics now active` in [`contract-probe.json`](evidence/contract-probe.json).

**Why it matters.** Anything sold for Sylph can be had for free, which undermines the economy World depends on. `activeTitle` is free text with no length limit, shown to others, so someone could display a title such as a staff role.

**Recommended.** Check each value against `UserCosmetic`, inventory and the catalog in both routes, in one shared function. Find out what existing rows hold first, so nobody loses something they legitimately have. Native must not build on these routes until this is fixed.

## U-3. Messages have no size or rate limit

`POST /api/conversations/[id]/messages` needs only non-empty content.

**Proved.** A message of 1,000,000 characters was accepted and stored. 40 messages sent in sequence were all accepted in 337 ms. Each goes to every participant on every read.

The Phase 11 report rated this Low (S-17). **It is High:** one account can bloat the table, and every member's next read. Only 14 of 155 routes use the rate limiter. Conversations, friend requests, invites and profile updates have none.

**Recommended.** A length limit, using the web composer's own, and per-account rate limits on the social write routes. Web must show the same refusal.

## U-4. Email change needs no password

`PATCH /api/user/account` changes the address on a valid session alone.

**Proved.** See `change email with no password`. The old address is not told. Deleting an account and resetting progress use a code sent to the *current* address, so an attacker holding a session could redirect those too.

Phase 11 rated this Medium (S-12) as a product decision. **Treat it as High, and fix it before any password reset ships,** because a reset would turn a stolen session into a permanent takeover.

**Recommended.** Require the password, or a code to the current address, and notify the old address.

## U-5. No scheduler is visible for three server jobs

`GET /api/quests/check-deadlines`, `/api/cron/daily-briefing` and `/api/cron/calendar-sync` need something to call them. The repository has no `vercel.json` and no workflows. Only a helper script exists, and the docs say to schedule them.

**If nothing external calls them,** overdue quests never fail and their HP penalty never applies, no daily briefing is written, and connected calendars sync only when someone reads their calendar.

**Action.** Check the hosted scheduler. I did not look, because Part 1 stays away from hosted services.

## U-6. Stored image addresses are not validated

`bannerUrl`, `avatarUrl` and a group's `avatarUrl` accept any string.

**Proved.** `javascript:alert(1)` and `http://attacker.invalid/track.png` were stored and served to a friend, and to a group's members.

**Read in source.** Web uses them as `<img src>`, so the `javascript:` value does not execute there. But `avatarUrl` makes every viewer's device request an address its owner chose, which reveals IP addresses and when a profile was viewed.

**Recommended.** Accept only Sylf's own storage. Native will load no image from an unapproved host, whatever the server says.

## U-7. Solo and party sessions overlap, and party time may not count

**Proved.** With a member `FOCUSING` in a party, `POST /api/sessions` still answered 201 with a running solo session. See [`contract-probe-overlap.json`](evidence/contract-probe-overlap.json).

**Read in source, not run to settlement.** `leave_focus_session` banks time on `FocusSessionMember` only, and touches no `StudySession`, total or ledger. `lib/achievement-facts.ts` is the only other reader found. So time in a party seems not to reach study hours, XP or streaks. The Codex says "your own recorded effort contributes to your progress", which is unclear.

**Why it matters.** The owner wants one session system, and studying with friends should not feel like it counts for less. **Decision E-13:** should party time count, and if so through which owner? The answer changes Part 3 slice D. [ADR 0015](../../decisions/0015-session-modes-focus-environment-and-parties.md) decision 12 stops Native from overlapping them, but only the server can stop another client.

## U-8. The overdue job is unbounded

`check-deadlines` selects every `PENDING`, `ACTIVE` or `IN_PROGRESS` quest for all users, each with `include: { user: true }`, then filters in JavaScript. On Phase 11's seed of 61,500 quests that is a large read of full user rows, including password hashes, into one process. Rework it when U-5 is settled.

## U-9. Recovery position

A [recovery baseline](recovery-baseline.md) now exists and has been rehearsed, but it is on the same disk as the repository. Commit when you are ready, copy the baseline to an external drive, and back up `.env`, `.env.local` and `tools/ai-agent/.env` somewhere encrypted. **Part 2 must not change application code on an uncommitted tree.**

## Carried from Stage 3, still unexplained

`.env.local` changed at 08:12 on 1 November, and what Antigravity's 10:42 test run connected to is unknown. Both are in the [verification report](../stage-3-verification/report.md).
