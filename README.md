This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Repository documentation

Start at the [documentation index](documentation/README.md) for current contracts, feature entry points, development reports, and evidence. Historical reports record their own task state; check the linked implementation before using them as current guidance. New reports belong under `documentation/<feature>/reports/<task-or-phase>/`, with evidence beside the report.

## Getting Started

Use Node.js 24.x for local development and Vercel builds. The package's
`engines.node` selects this major version on Vercel; `.node-version` pins a
compatible local release. Install dependencies with `npm ci`.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Performance layers (optional, graceful fallback)

### 1. Supabase Realtime — presence & push updates

Replaces heartbeat/polling with live websocket updates:

- **Presence** — online/offline dots for friends come from a Realtime presence
  channel (instant) instead of the 60s `lastSeenAt` heartbeat window.
- **postgres_changes** — new chat messages, friendship changes and
  conversation updates are pushed to the browser instead of 1s–15s REST polls.

Setup:

1. Add to `.env` (Supabase Dashboard → Settings → API):
   ```
   NEXT_PUBLIC_SUPABASE_URL="https://YOUR-PROJECT-REF.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
   SUPABASE_JWT_SECRET="..."   # the "JWT secret" on the same page
   ```
2. Run `scripts/supabase-realtime-setup.sql` in the Supabase SQL editor
   (adds the tables to the `supabase_realtime` publication + RLS policies).
3. Make sure Realtime is enabled: Dashboard → Database → Replication.

The app mints a Supabase-format JWT per user via `GET /api/realtime/token`
(sub = the app's integer user id), so Realtime authorizes as `authenticated`
even though the app uses its own auth system.

**Without these env vars nothing changes** — the app keeps using REST polling
and DB heartbeats automatically.

### 2. Upstash Redis — hot-read cache

Absorbs repeated hot reads across serverless instances (global rankings,
profile dossiers, shop catalog) with short TTLs:

```
UPSTASH_REDIS_REST_URL="https://your-region.upstash.io"
UPSTASH_REDIS_REST_TOKEN="..."
```

Without these, `lib/redis.ts` falls back to a small in-process LRU cache, so
local development needs zero setup.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
