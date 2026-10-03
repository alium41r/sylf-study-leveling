# SYLF ADAPTIVE RESEARCH ENGINE — PHASE 2.1

## BUILD / INTEGRATION VERIFICATION CLOSURE

---

## 1. Current repository state

Inspected before anything was run, as instructed.

| | |
|---|---|
| Running processes | `next dev` (PID 45153) + `next-server` v16.2.9 (PID 45159) listening on **:3000**. No `next build` process. |
| `.next/lock` (the build lock) | **absent** |
| `.next/dev/lock` (the dev lock) | present — held by the running dev server |
| `.next` contents | only `dev/` before the build |
| Working tree | 139 modified, 40 deleted, 10 renamed, 189 untracked — the other agent's refactor is still in progress |
| Root shell chain | `app/layout.tsx`, `AuthProvider.tsx`, `GlobalSystemWrapper.tsx`, `SidebarWrapper.tsx` modified; `SylfAppShell.tsx` untracked-new |
| `app/api/acoustics/route.ts` | **unmodified** (clean in git, dated 2026-09-27 in the index as before) |
| Still being edited concurrently | `app/system/System.module.css`, `SystemScreen.tsx`, `SessionSidebar.tsx` — all written after 14:50 during this round |

Nothing was reverted, cleaned or deleted. No untracked file was removed.

---

## 2. Did the old Next build process still exist?

**No.** The process that blocked the previous three rounds — `next build` PID 37246 — is gone. It has been replaced by a `next dev` server, which is what makes the application reachable again.

## 3. Was `.next/lock` real, stale, or absent?

**Absent — and the previous reading of it needs a correction.**

The lock is not stale and was not manually cleared; there is simply nothing holding it. The reason the build and the dev server can coexist is more specific than "the lock went away":

- `next build` locks **`.next/lock`** (`Lockfile.acquireWithRetriesOrExit(path.join(distDir, 'lock'), 'next build')`).
- `next dev` in this version keeps its artifacts under **`.next/dev/`** and locks **`.next/dev/lock`**.

They are different files. So a running dev server does **not** block a production build in Next 16.2.9, and the earlier conflict was one *build* holding the build lock — not the dev server. That is why `npm run build` succeeded immediately with dev still running, and why `.next` afterwards contains the production output alongside the untouched `.next/dev/`.

## 4. First clean build result

```
npm run build
✓ Compiled successfully in 23.6s
exit 0
```

A full route table followed, with static (`○`) and dynamic (`ƒ`) annotations. **No fix was required to reach it.**

## 5. Did E1068 reproduce?

**No.** The `InvariantError: Expected workStore to be initialized` / `createParamsFromClient` failure did not occur — not on `/_global-error`, not on any prerendered page. The build prerendered all 88 static pages without an error.

## 6. Root cause, if it had reproduced

It did not reproduce, so there was nothing to diagnose and nothing was changed. §12 answers directly whether the shell was ever really broken.

## 7. Did the acoustics route-export failure reproduce?

**No.** `"CURATED_SOUNDSCAPES" is not a valid Route export field` did not appear. `app/api/acoustics/route.ts` still exports the constant alongside its handlers, and the default build does not reject it — the check that produced that message is part of Next's generated route typing, which the webpack path runs and the Turbopack path does not.

## 8. Exact fixes made

**No product code was changed.** Not one line of `app/` or `lib/`.

The only file added is a verification script, `scripts/verify-app-sanity.mjs`, written for §9 and described in §10. It is a test tool, not application code.

I also minted one throwaway QA account with the repository's own `scripts/qa-planner-session.mjs` (user id 1040, `qa-1790502898570@planner.qa`) so the harness could drive the app signed in. That is ordinary test data of the kind the script exists to create.

## 9. Files changed

| File | Change |
|---|---|
| `scripts/verify-app-sanity.mjs` | **new** — integration sanity harness (§10) |
| [AI_PLANNER_RESEARCH_UPGRADE_PHASE_2_1_BUILD_CLOSURE_REPORT.md](AI_PLANNER_RESEARCH_UPGRADE_PHASE_2_1_BUILD_CLOSURE_REPORT.md) | **new** — this report |

Nothing else. `git status` shows no modification attributable to this round; the 139/40/10/189 figures are unchanged from before it started.

---

## 10. Browser navigation sanity (§9)

The existing Chrome/CDP harness in the repository is the Planner QA one, which drives `/system` and measures layout, mobile overflow and accessibility — it does not cover the landing page, the shell or internal navigation. So a small harness was written for exactly the checks §9 lists, reusing the same technique (installed Chrome over CDP, no new dependency).

**It found four defects in itself before it found anything true about the app**, and each is worth recording because every one of them produced a *false* failure:

1. It attached to the browser-level CDP endpoint, which does not implement `Page` or `Runtime`. Fixed by targeting the page from `/json/list`.
2. It asserted on `/planner`, **which is not a route in this repository** — the Planner surface is `/system`. That 404 looked like an integration failure and was a harness bug.
3. It looked for navigation in `a[href^="/"]` elements. This shell renders its navigation as **`<button>`s — there are zero anchors in it** — so "no navigation found" was an assumption, not an observation.
4. It set the session cookie with a `domain` attribute; Chrome rejects that for an IP literal, so the browser was silently **signed out** for the entire first run, which made every auth-dependent page sit in its loading state. It now sets the cookie by URL and reads it back, failing loudly if it did not land.

### Against the production build (`next start`, temporary, port 3101) — 7/7

| Check | Result |
|---|---|
| the public landing page renders | `/` text=3085 links=4 |
| the Planner surface renders | `/system` text=253 links=8 |
| an ordinary authenticated page renders | `/quests` → redirected to `/goals?tab=quests`, text=388 links=8 |
| a second authenticated page renders | `/calendar` text=197 links=8 — scholar dashboard, "Study Calendar · September 2026", month grid and weekday headers |
| the page's own session call succeeds | `GET /api/user/stats` → **200** |
| internal navigation works | `/system` → clicked "Calendar" → `/calendar` text=268 |
| the shell still renders after navigating away and back | `/system` text=249 links=8 |

No redirect loop (URLs stayed where they were put), no blank shell (real content and 8 navigation controls on every authenticated page), and **zero console entries** — no runtime error, no failed request, no non-2xx response.

The temporary server was stopped afterwards; port 3101 is free and the user's dev server on 3000 was never touched.

### Against the running dev server on :3000 — a genuine difference, reported honestly

| Page | dev server |
|---|---|
| `/` | renders fully (3082 chars) |
| `/system` | renders, navigation reachable by button, boot state clears |
| `/quests` | stays on "Loading Quests…" — 58 chars, 0 nav controls |
| `/calendar` | stays on "Loading Calendar…" — 60 chars, 0 nav controls |

I could not make those two routes finish loading in that dev process, and I am not going to claim they are either fine or broken without evidence I do not have. What I *can* say:

- It is **not** an authentication problem: the page's own `GET /api/user/stats` returns **200** from inside the browser, and the same cookie works for `/system`.
- It is **not** a missing-asset problem: every `/_next/static/chunks/*.js` referenced by those pages returns **200**.
- The only browser trace is repeated `WebSocket … /_next/webpack-hmr … ERR_INVALID_HTTP_RESPONSE` — a dev HMR handshake failure, which is a dev-server artifact rather than an application error.
- The **same routes work in the production build**, including `/quests`'s redirect to `/goals?tab=quests`.

The most likely explanation is that this **dev process is in a degraded state**, and it is possible I contributed to that: I ran `npm run build` while it was serving, which wrote production output into `.next/` next to its `.next/dev/`. I did not restart it, because it is the user's server and §3 says not to touch dev servers blindly. **Recommendation: restart `next dev` and re-check those two pages.** If they load after a restart the difference was the dev process; if they do not, it is worth a look — and the production build passing means it is not a blocker for Phase 3.

---

## 11. Final verification

| Check | Result |
|---|---|
| `npm run build` | **PASS** — exit 0, compiled in 23.6 s |
| `npx tsc --noEmit` | clean |
| `npx prisma validate` | valid |
| `npx prisma migrate status` | 58 migrations, **schema up to date** |
| `node scripts/test-planner-postgres.mjs` | **87 files passed, 9 skipped — 1 193 tests passed, 19 skipped** |
| `npm run audit:secrets` | clean |
| `npm run audit:models` | clean |
| `npm run mobile:build` | passed |
| `npm run mobile:verify` | **PASSED** |
| Full repository suite | **2 298 passed, 0 failed, exit 0** with `--maxWorkers=2` (194 files); under default parallelism it flakes — see below |
| Browser sanity (§9) | **7/7** against the production build |

### The full repository suite is not deterministic on this machine

Three consecutive runs failed **three different sets of files**:

| Run | Failures |
|---|---|
| 1 | `focus-backgrounds-cascade-triggers.test.ts` (one test, 79 s) |
| 2 | `planner/mastery-ui.test.tsx`, `planner/planner-workspace.test.tsx` (+1) |
| 3 | `focus-backgrounds-classic-docking.test.tsx`, `focus/focus-party-frontend.test.tsx`, `planner/quick-plan-research.test.tsx`, `timer/study-timer-accuracy.test.ts` |

Every file I checked **passes in isolation** — `focus-backgrounds-cascade-triggers` 4/4 (the failing test took **1.99 s alone** against 79 s under load), `mastery-ui` + `planner-workspace` 14/14 together. The totals also move between runs (2 299 vs 2 231 passed), meaning suites are timing out before they report.

That pattern — different tests each time, all green alone, live-database and timer tests affected — is contention on a loaded machine (a dev server, repeated full-suite runs and Chrome all running), not a defect in the code. It is also the same class of flake this repository already carried: earlier work in this project widened a load-sensitive wait from 5 s to 20 s for exactly this reason. **The Planner suite — the one that covers Phase 2 — is deterministic and green at 1 193 tests, run repeatedly.**

**And the contention explanation is confirmed, not merely plausible.** The same suite with parallelism reduced to two workers:

```
npx vitest run --maxWorkers=2
Test Files  194 passed | 21 skipped (215)
Tests       2298 passed | 191 skipped (2489)
exit 0
```

**Zero failures.** The entire repository is green when the suite is not oversubscribed, which makes the per-run failure sets a property of how the suite is being run on this machine rather than anything in the code — Phase 2's or anyone else's.

---

## 12. Is Phase 2 now fully closed?

**Yes.** The single outstanding item — `npm run build` — passes, and it passed without a single change to product code. All twelve Phase 2 deliverables were already implemented and verified; the build gate that was blocking closure is now satisfied.

## 13. Blockers before Phase 3

**None from Phase 2.** Three things to be aware of, none of which block Phase 3:

1. **The dev server on :3000 appears degraded** — `/quests` and `/calendar` do not finish loading in it, while the same routes work in the production build. Restart it (§10). I may have contributed to this by building into `.next/` while it ran.
2. **The repository test suite is flaky under load** on this machine (§11). Run it with reduced parallelism, or accept a small per-run failure set and verify any failure in isolation.
3. **`app/api/acoustics/route.ts` still exports a non-route symbol.** It does not fail the default build, but it will fail any build path that runs Next's generated route typing (the webpack path did, before). Moving `CURATED_SOUNDSCAPES` into a small module is a two-minute cleanup that removes a latent trap — deliberately **not** done here, because §5 makes it conditional on the build reporting it and the build is clean.

---

## Appendix — explicit answers

**Does `npm run build` now pass?**
Yes. Exit 0, `✓ Compiled successfully in 23.6s`, full route table.

**Did E1068 reproduce?**
No. Not on `/_global-error`, not on any of the 88 prerendered pages.

**Was the root shell actually broken, or was the previous state transient/concurrent?**
**Transient and concurrent.** Nothing in the shell needed changing — the build passes on the tree exactly as the other agent left it, with `app/layout.tsx` and the `AuthProvider`/`GlobalSystemWrapper`/`SidebarWrapper`/`SylfAppShell` chain untouched. The earlier E1068 arose while that chain was mid-refactor and while a wedged build held the lock; once the refactor settled and the stuck process exited, the fault went with them. The repository had also been left in a state (139 modified / 40 deleted / 10 renamed / 189 untracked) where no partial-revert experiment was valid, which is why the previous round could not attribute it — that constraint has not changed, but it no longer matters because there is nothing to attribute.

**Was `CURATED_SOUNDSCAPES` moved out of the route module?**
**No**, and deliberately not. The failure never reproduced under the default build, and §5 makes the fix conditional on it appearing. It remains a latent issue for the webpack build path (§13).

**Are authenticated/internal pages working?**
**Yes, in the production build** — 7/7 checks, including `/quests` redirecting correctly to `/goals?tab=quests` and `/calendar` rendering its month grid, with 8 navigation controls per page and zero console output. In the **dev** process on :3000, `/` and `/system` work while `/quests` and `/calendar` do not finish loading; that is reported in full in §10 rather than smoothed over.

**Did any Phase 2 research production code need modification?**
**No.** `selection.ts`, `evidence.ts`, `coverage.ts`, `agent.ts`, `CandidatePool`, the follow-up round, provider fallback, bounds, prompts and cache are all exactly as Phase 2 left them. Nothing in §6 was touched, and no external API quota was spent, since §8 makes the live verification conditional on production code changing — it did not, so the completed DeepSeek/Serper verification stands.

**Did any companion work get reverted or overwritten?**
**No.** The companion/shell work is untouched: `SylfAppShell.tsx` and the modified providers are as the other agent left them, and `app/system/*` continued to be edited during this round. The one file this round added is a verification script.

**Are all Phase 2 verification gates now green?**
**Yes, all of them.** TypeScript, Prisma validation, migration status, the Planner PostgreSQL suite (1 193 tests), secrets and model audits, mobile build and verify, the production build, the browser integration sanity (7/7), and the **full repository suite — 2 298 tests, zero failures** when run with reduced parallelism. Under default parallelism the suite flakes on this loaded machine (§11); the same suite at `--maxWorkers=2` is completely green, so this is not a Phase 2 result and not an outstanding gate.

**Is it safe to begin Research Phase 3?**
**Yes.** The Phase 2 stop gate is met and the item that was blocking it is closed. The three items in §13 are hygiene, not prerequisites, and none of them touches research code.
