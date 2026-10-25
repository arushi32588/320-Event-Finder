# Event Finder backend

Next.js (App Router) + TypeScript API, per the team tech stack. It is API-only
for now: every route lives under `src/app/api`. Supabase is wired in but
optional until the database schema is built.

## Run locally

Use Node.js 20.19+ or 22.12+.

```sh
cd backend
npm install
cp .env.example .env.local   # optional: add Supabase URL + anon key
npm run dev
```

The API runs at http://localhost:3000.

## Endpoints

| Method | Path                | Returns                                         |
| ------ | ------------------- | ----------------------------------------------- |
| GET    | `/api/health`       | `{ status, timestamp, supabase }`               |
| GET    | `/api/events`       | `{ events }`, optional `?q=` text search        |
| GET    | `/api/events/:id`   | `{ event }`, or 404 `{ error }`                 |

`/api/events` serves placeholder data from `src/data/sample-events.ts` until
the Supabase `events` table exists. Then swap it for a query through
`getSupabase()` in `src/lib/supabase.ts`.

## Using it from the frontend

The Vite dev server proxies `/api/*` to port 3000, so with both servers
running the React app can call `fetch('/api/events')` directly.

## Structure

```text
src/
  app/api/health/route.ts       Health check
  app/api/events/route.ts       Event list + search
  app/api/events/[id]/route.ts  Single event
  data/sample-events.ts         Placeholder events and Event type
  lib/supabase.ts               Shared Supabase client (null until configured)
```
