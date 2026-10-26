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

## Database setup

Run `../supabase/schema.sql`, then the files in `../supabase/migrations/` in
order, in the Supabase SQL editor. The migration adds the event fields the
pages display (description, end time, price, ages, accessibility,
transportation, image), `users.date_of_birth`, and a trigger that creates the
`public.users` row whenever someone signs up.

## Endpoints

| Method | Path                | Returns                                                     |
| ------ | ------------------- | ----------------------------------------------------------- |
| GET    | `/api/health`       | `{ status, timestamp, supabase }`                           |
| GET    | `/api/events`       | `{ events }` (approved events, soonest first)               |
| GET    | `/api/events/:id`   | `{ event }`; 400 for a non-numeric id; 404 if not found      |
| POST   | `/api/auth/signup`  | 201 `{ user, session, needsEmailConfirmation }`; 409 if taken |
| POST   | `/api/auth/login`   | `{ user, session }`; 401 for a wrong email or password      |

`/api/events` query parameters (Home page):

- `q`: text search over title and description (max 100 characters)
- `filter`: `today`, `week`, `free`, `accessible`. Repeat it or comma-separate
  it (`?filter=free&filter=week` or `?filter=free,week`); every filter given
  must match. "Today" is the current day in Amherst (America/New_York);
  "week" is the next 7 days.

Each event has the fields the frontend renders: `id`, `title`, `description`,
`location`, `startsAt`, `endsAt`, `organizer`, `verified`, `price` (`'Free'`
or e.g. `'$12.50'`), `ages`, `accessibility`, `transportation`, `imageUrl`.

Signup body: `{ name, email, dateOfBirth, password, confirmPassword,
acceptedTerms }`. `dateOfBirth` is `MM / DD / YYYY` (as typed in the form) or
`YYYY-MM-DD`; passwords are 8-72 characters. Login body: `{ email, password }`.
Invalid input returns 400 `{ error, fields }`, with one message per field.

Without Supabase configured, the event endpoints serve the placeholder data in
`src/data/sample-events.ts` and the auth endpoints return 503.

## Tests

```sh
npm test
```

Tests live in `tests/` and use Vitest. They replace the Supabase client with
a fake (`tests/helpers/fake-supabase.ts`), so they never touch a real database.

## Using it from the frontend

The Vite dev server proxies `/api/*` to port 3000, so with both servers
running the React app can call `fetch('/api/events')` directly.

## Structure

```text
src/
  app/api/health/route.ts       Health check
  app/api/events/route.ts       Event list + search
  app/api/events/[id]/route.ts  Single event
  app/api/auth/signup/route.ts  Create account
  app/api/auth/login/route.ts   Log in
  data/sample-events.ts         Placeholder events (used until Supabase is configured)
  lib/events.ts                 Event type, filters, Supabase queries
  lib/auth.ts                   Signup/login validation and error handling
  lib/supabase.ts               Supabase clients (null until configured)
tests/                          Vitest tests
```
