# Sylf

Sylf is a study, focus, and progression application. The web app is a Next.js 16
App Router project with a Prisma/PostgreSQL backend; a Vite/Capacitor client in
`mobile/` reuses shared screens for Android.

## Stack

- Next.js 16 (App Router), React 19, strict TypeScript
- Tailwind CSS 4 and CSS Modules
- Prisma 7 with ordered PostgreSQL migrations
- Optional Supabase Realtime and Upstash Redis layers with graceful fallbacks
- Vite + Capacitor Android client (`mobile/`, `android/`)

## Repository map

| Path | Contents |
| --- | --- |
| `app/` | Routes, route-local UI, and API handlers. |
| `lib/` | Shared engines, contracts, services, and catalogs. |
| `__tests__/` | Vitest suites grouped by feature area. |
| `prisma/` | `schema.prisma` and ordered migration history (including RPCs/RLS). |
| `public/` | Runtime static assets. |
| `assets/` | Source/design artwork and reference screenshots, not served at runtime. |
| `scripts/` | Build, asset, database, test, verify, security, and QA utilities. See [`scripts/README.md`](scripts/README.md). |
| `config/` | Alternate TypeScript/Vitest/SVGO configuration. See [`config/README.md`](config/README.md). |
| `documentation/` | Current contracts, feature indexes, reports/evidence, security audits, research, specifications, and the design-system reference set. |
| `mobile/`, `android/` | Capacitor client and native Android project; `mobile/dist/` is generated. |
| `tools/ai-agent/` | Independent development agent package, not part of the app build. |
| `archive/` | Dormant source and historical source assets. |

Agent-specific rules live in [`AGENTS.md`](AGENTS.md).

## Getting started

Use Node.js 24.x. `engines.node` selects that major version on Vercel and
`.node-version` pins a compatible local release. Install with `npm ci`.

```bash
cp .env.example .env.local   # fill in the values you need
npm run dev
```

Open <http://localhost:3000>. `.env.example` documents every supported variable;
the app runs with a PostgreSQL `DATABASE_URL`/`DIRECT_URL` and `JWT_SECRET`.
`npm run dev` and `npm run build` regenerate the optional calendar recognition
worker assets before starting.

## Commands

| Purpose | Command |
| --- | --- |
| Development | `npm run dev` |
| Production build / serve | `npm run build` / `npm run start` |
| Tests | `npm run test -- --run [path-filter]` (`npm test` watches) |
| Typecheck | `npx tsc --noEmit`; run `npx next typegen` first on a fresh checkout or after route changes |
| Lint | `npx eslint <changed-files>` |
| Mobile | `npm run mobile:build` / `npm run mobile:verify` |
| Android | `npm run android:sync` / `npm run android:build` |
| Security audit | `npm run audit:secrets` / `npm run audit:models` |
| Planner worker | `npm run planner:worker:build` |
| Disposable PostgreSQL checks | `node scripts/test/test-*.mjs` (Docker required) |

`npm run lint` still invokes the removed `next lint`; use ESLint directly.

## Optional performance layers

Both layers degrade automatically when unconfigured.

### Supabase Realtime — presence and push updates

Presence powers online indicators and `postgres_changes` pushes chat, friendship,
and conversation updates instead of REST polling.

1. Add to `.env.local` (Supabase Dashboard → Settings → API):
   ```
   NEXT_PUBLIC_SUPABASE_URL="https://YOUR-PROJECT-REF.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
   SUPABASE_JWT_SECRET="..."
   ```
2. Run [`scripts/db/supabase-realtime-setup.sql`](scripts/db/supabase-realtime-setup.sql)
   in the Supabase SQL editor.
3. Enable Realtime: Dashboard → Database → Replication.

The app mints a Supabase-format JWT per user via `GET /api/realtime/token`
(`sub` = the app's integer user id), so Realtime authorizes as `authenticated`
even though the app uses its own auth system.

### Upstash Redis — hot-read cache

Absorbs repeated hot reads (rankings, profile dossiers, shop catalog) with short
TTLs:

```
UPSTASH_REDIS_REST_URL="https://your-region.upstash.io"
UPSTASH_REDIS_REST_TOKEN="..."
```

Without these, `lib/redis.ts` falls back to a small in-process LRU cache, so local
development needs no setup.

## Documentation

Start at the [documentation index](documentation/README.md). Current contracts and
feature indexes describe present behavior; dated reports and evidence describe
their own run. Put new reports in
`documentation/<feature>/reports/<task-or-phase>/` with evidence beside them.
