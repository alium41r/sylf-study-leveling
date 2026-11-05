# Expansion Part 5 — live progress (frontend completeness)

Owner brief, 5 November 2026: make Sylf Native feel complete. Work in this worktree (`expansion-part-3`), inspect the running apps, real local data, no hosted changes, no deploy, stop after Part 5 for review.

## How to run both apps against a LOCAL disposable backend

```bash
# 1. backend + Next dev (Web) on 3111, disposable Postgres in Docker
DATABASE_URL=postgresql://localhost/none DIRECT_URL=postgresql://localhost/none DATABASE_WORKER_URL=postgresql://localhost/none UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= node scripts/test/run-backend-local.mjs --serve --dev --port 3111
# 2. seed users, subjects, quests, friends (alice@local.test / a-long-enough-password, plus bob, cara, dev)
node scripts/dev/seed-local.mjs
# 3. backfill a month of study history (needs the container name from `docker ps`)
scripts/dev/backfill-local.sh sylf-backend-<id> sylf_backend_<id>
# 4. Native web export, then the browser host on 3200 (real backend proxy, token never reaches the page)
cd native && npm run build:web && cd .. && node scripts/dev/native-live-host.mjs --port 3200 --backend http://127.0.0.1:3111
```
Native: http://127.0.0.1:3200/?space=home&home=today (Web: http://127.0.0.1:3111, sign in as alice). `scripts/dev/api.mjs <path>` probes an API as alice. Check script used while editing: typecheck + ESLint + boundaries (`native/`).

## Done so far (all committed and pushed)
- Progress Overview: broken 30-day chart fixed (bars had zero width), real bar charts for the week and month (`shell/charts/Bars.tsx`), **weekly focus quest** (`/api/quests/weekly`) on Overview and Today, meters use sensible segment units.
- Today: status line (level, XP, streak, Sylph), real "What's ahead" list, weekly quest card.
- Quests and goals: redesigned (subject colour stripe, XP, Study button, goal cards with days left and progress).
- Calendar: Week view has a quest lane and week navigation; **natural-language events** ("Lab tomorrow at 3pm") with a preview, through `lib/calendar/quick-add` (added to `@sylf/shared`; boundary audit taught that a field named `document` is not the DOM).
- **Public profile sheet** (`shell/profile/`) opened from Circle, Standing, Find people and party rooms; server-applied privacy and permissions; HP never shown.
- Circle: avatar rows.

## Next (in order)
Sylvie hub (conversation history and continue) · Stats view with charts · Messages polish · Focus page polish · phone and tablet checks of every page · verification (unit, integration, live Electron stage, a new Part 5 live stage) · feature-parity report with screenshots · handoff.

## Honest exceptions (documented, not hidden)
Notes, PDFs and Resource Shelf are Phase 14. Shop, Locker items and avatar gear need the pixel avatar renderer and belong to World (Phase 15). Skill nodes and constellations are later. AI Planner live flow needs Planner V2 flags and a provider (E-6).
