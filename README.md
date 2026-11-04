# Event Finder

Find local events in Amherst. A React frontend (Vite, React Router) talks to a
Next.js + TypeScript API in [`backend/`](backend/README.md), which stores data in
Supabase.

## Run locally

Use Node.js 20.19+ or 22.12+. The frontend and backend run separately, so use two
terminals.

```sh
cd backend
npm install
cp .env.example .env.local   # add your Supabase URL and anon key
npm run dev
```

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. It forwards `/api/*` requests to the backend on
port 3000. If that port is taken, run the backend on another one and start the
frontend with `API_PROXY_TARGET=http://localhost:3001 npm run dev`.

Without Supabase keys you can still browse sample events, but logging in, saving and
RSVPing need a Supabase project. Run `supabase/schema.sql`, then every file in
`supabase/migrations/` in filename order, in the Supabase SQL editor.

To make someone an admin, set their `users.role` to `admin` in the Supabase table
editor.

## Tests

```sh
npm test                  # frontend
npm --prefix backend test # backend
```

## Test the Supabase schema

`supabase/tests/` checks the rules in `supabase/schema.sql`. The files are
split by area: users, organizers, events, announcements, RSVPs and saved
events, and conversations and messages. They check defaults, duplicates,
required values, a few invalid values, and what happens when a related row
is deleted.

The tests create temporary auth users, so they need the service role key from
Project Settings > API. Put it in `supabase/.env` with `SUPABASE_URL`, then run:

```sh
npm --prefix supabase install
npm run test:schema
```

The tests are skipped when either variable is missing. `npm test` also reads
`supabase/.env.local`, then `backend/.env` and `backend/.env.local`, when a
variable is not already set.

## Routes

- `/`: Home, with filters and search (`/?q=jazz`)
- `/events/:id`: Event details, Save and RSVP
- `/events/new`: Submit an event (logged in)
- `/login`, `/signup`: Log in, create an account
- `/profile`: Profile, saved events, RSVPs and submitted events (logged in)
- `/saved`: Saved events (logged in)
- `/organizer/verify`: Apply to be a verified organizer (logged in)
- `/admin`: Review organizer requests and events (admins)

## Structure

```text
src/
  components/Layout.jsx  Shared navigation and page outlet
  pages/                 Home, Events, Login, Profile, NotFound
  App.jsx                Route definitions
  main.jsx               React entry point and BrowserRouter
  styles.css             Minimal spacing and typography
```

UI design, authentication, event data, and other product features are not
implemented yet. The requirements PDF provides context for future development.

For production hosting, configure a fallback to `index.html` so direct visits
and refreshes on frontend routes work.
