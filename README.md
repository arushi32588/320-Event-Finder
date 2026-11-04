# Event Finder

**Find your next good time.** Event Finder brings local concerts, markets, meetups and workshops into one place, so people stop hearing about events the day after they happen. Anyone can browse and filter what's on, and verified organizers build trust in what's listed.

![Event Finder homepage, with a "Find your next good time" headline, filters, and a grid of upcoming event cards](docs/images/homepage.png)

## Features

**For everyone**

- Browse upcoming events, with search and filters for Today, This Week, Free and Accessible
- See event details, including price, ages, accessibility and transportation

**With an account**

- Save events and RSVP, then find them on your profile
- Submit events for review
- Apply to become a verified organizer, and apply again if a request is rejected

**For admins**

- Approve or reject organizer applications, with an optional reason
- Approve or reject submitted events

Access rules are enforced in the database with row-level security, so users can't approve their own events or give themselves extra permissions.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, React Router, Vite |
| Backend | Next.js 16 (API routes), TypeScript |
| Database and accounts | Supabase (PostgreSQL, Auth, row-level security) |
| Testing | Vitest, Testing Library, Node test runner |

```text
Browser (React + Vite)  ->  API (Next.js, /api/*)  ->  Supabase (database and auth)
```

## Getting started

### Prerequisites

- Node.js 20.19+ or 22.12+
- A [Supabase](https://supabase.com) project, unless you only want to browse sample events

### 1. Set up the database

In the Supabase SQL editor, run `supabase/schema.sql`, then every file in `supabase/migrations/` in filename order.

### 2. Start the backend

```sh
cd backend
npm install
cp .env.example .env.local
npm run dev
```

Add your project's URL and publishable (anon) key to `backend/.env.local`. Never use the secret or `service_role` key here, because it bypasses row-level security.

| Variable | Where to find it |
| --- | --- |
| `SUPABASE_URL` | Supabase dashboard, Project Settings > API |
| `SUPABASE_ANON_KEY` | Supabase dashboard, Project Settings > API |

Without these, the API serves sample events, and account features return "not configured".

### 3. Start the frontend

In a second terminal, from the repository root:

```sh
npm install
npm run dev
```

Open the URL Vite prints. It forwards `/api/*` requests to the backend on port 3000. If that port is taken, run the backend on another one and point the frontend at it:

```sh
API_PROXY_TARGET=http://localhost:3001 npm run dev
```

### 4. Create an admin (optional)

Sign up in the app, then set that user's `role` to `admin` in the Supabase `users` table.

## Testing

```sh
npm test                   # frontend
npm --prefix backend test  # backend API
```

The frontend and backend tests use fake API and Supabase clients, so they need no credentials.

The database tests in `supabase/tests/` run against a real Supabase project and create temporary users, so they need the service role key. Put `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `supabase/.env`, then run:

```sh
npm --prefix supabase install
npm run test:schema
```

They're skipped if those variables are missing. Use a development project, and never commit that key.

## Project structure

```text
.
├── src/                 React frontend
│   ├── components/      Layout and event posters
│   ├── lib/             API client and login state
│   └── pages/           One component and stylesheet per page
├── backend/             Next.js API
│   ├── src/app/api/     Routes
│   ├── src/lib/         Business logic and Supabase queries
│   └── tests/           API tests
├── supabase/
│   ├── schema.sql       Base tables
│   ├── migrations/      Later changes, run in filename order
│   └── tests/           Database tests
└── docs/                Design specs and images
```

The API endpoints are documented in the [backend README](backend/README.md).

## Pages

| Route | Page | Access |
| --- | --- | --- |
| `/` | Home, with filters and search (`/?q=jazz`) | Everyone |
| `/events/:id` | Event details, Save and RSVP | Everyone |
| `/login`, `/signup` | Log in, create an account | Everyone |
| `/profile` | Profile, saved events, RSVPs, submitted events | Logged in |
| `/saved` | Saved events | Logged in |
| `/events/new` | Submit an event | Logged in |
| `/organizer/verify` | Apply to be a verified organizer | Logged in |
| `/admin` | Review organizer requests and events | Admins |

## Project status

Event Finder is in active development and isn't deployed yet.

**Planned:**

- Event map
- Google sign-in and password reset
- File uploads for organizer verification
- Age, category and indoor/outdoor filters
- Hiding past events from Home
- Messaging between attendees and organizers
- Admin user management and reports

**For deployment:** the `/api` proxy only runs in development, and the frontend calls relative `/api` paths. Production hosting has to serve the frontend and API from the same origin, or forward `/api` to the backend. It also needs to fall back to `index.html` so direct visits to frontend routes work.

## Team

Built by Team BlueBird: Adam Lubomirski, Arushi Agrawal (manager), Aryaman Goenka, Edelson Garcia, Kaustubha Vohra, Mariia Palamarchuk, Rudra Patel and Urvi Gupta.
