# Event Finder backend

Next.js (App Router) + TypeScript API. It is API-only: every route lives under
`src/app/api`, and data and accounts live in Supabase.

## Run locally

Use Node.js 20.19+ or 22.12+.

```sh
cd backend
npm install
cp .env.example .env.local   # add your Supabase URL and anon key
npm run dev
```

The API runs at http://localhost:3000.

## Database setup

Run `../supabase/schema.sql`, then the files in `../supabase/migrations/` in
order, in the Supabase SQL editor. The migration adds the event fields the
pages display (description, end time, price, ages, accessibility,
transportation, image), `users.date_of_birth`, and a trigger that creates the
`public.users` row whenever someone signs up.
To make someone an admin, set their `users.role` to `admin`
in the Supabase table editor.

the migrations work whether or not the newer schema.sql changes were already
run. the two 20261122_event_chat files let conversations be group or direct
chats with one group chat per event. messages stay when their sender is deleted
and have to be 1 to 2000 characters. only chat members can read a chat and
members are the event organizer and anyone going. the app sends and lists
messages through the send_event_message and event_chat_messages and
last_event_chat_messages database functions. gallery photos are saved as
storage paths in event_images.image_path.

## Endpoints

| Method | Path                | Returns                                                     |
| ------ | ------------------- | ----------------------------------------------------------- |
| GET    | `/api/health`       | `{ status, timestamp, supabase }`                           |
| GET    | `/api/events`       | `{ events }` (approved events, soonest first)               |
| GET    | `/api/events/:id`   | `{ event }`; 400 for a non-numeric id; 404 if not found      |
| POST   | `/api/auth/signup`  | 201 `{ user, session, needsEmailConfirmation }`; 409 if taken |
| POST   | `/api/auth/login`   | `{ user, session }`; 401 for a wrong email or password      |
| POST   | `/api/auth/refresh` | `{ user, session }` from `{ refreshToken }`; 401 if expired  |
| GET    | `/api/me/profile`   | `{ profile }`; 401 if not logged in                          |
| PATCH  | `/api/me/profile`   | `{ profile }` after updating `{ name }`                      |
| GET    | `/api/me/rsvps`     | `{ events }` the user is going to                            |
| GET, PUT, DELETE | `/api/events/:id/rsvp` | `{ going }`; PUT RSVPs, DELETE cancels      |
| PUT, DELETE | `/api/me/events/:id/image` | `{ imageUrl }`; PUT uploads, DELETE removes the photo |
| GET    | `/api/events/:id/images` | `{ images }` (gallery photos, oldest first)         |
| POST   | `/api/me/events/:id/images` | 201 `{ image }`; 409 if the event has 6 photos   |
| DELETE | `/api/me/events/:id/images/:imageId` | 204 after removing the photo            |
| GET    | `/api/admin/verification-requests` | `{ requests }`; admins only                  |
| POST   | `/api/admin/verification-requests/:id/approve` | `{ request }`; admins only       |
| POST   | `/api/admin/verification-requests/:id/reject`  | `{ request }`; admins only       |
| GET    | `/api/admin/events` | `{ events }` waiting for review; admins only                 |
| POST   | `/api/admin/events/:id/approve` | `{ event }`; admins only                         |
| POST   | `/api/admin/events/:id/reject`  | `{ event }`; admins only                         |

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

The profile has `id`, `email`, `name`, `dateOfBirth`, `role`,
`organizerStatus` (`none`, `pending`, `approved` or `rejected`) and
`organizationName`. Send the login token as `Authorization: Bearer <token>`.

### Organization verification request

Both endpoints need `Authorization: Bearer <access token>`; without a valid
login they return 401. They call the `submit_verification_request` and
`get_my_verification_request` database functions, so run
every file in `../supabase/migrations/` first.

`POST /api/organizer/verification-request` submits an application. Body:

| Field              | Required | Notes                                  |
| ------------------ | -------- | -------------------------------------- |
| `organizationName` | yes      | up to 255 characters                   |
| `description`      | yes      | up to 5000 characters                  |
| `address`          | no       | up to 255 characters                   |
| `website`          | no       | a web address, up to 2048; `https://` is added if missing |
| `contactEmail`     | yes      | a valid email, up to 255 characters    |
| `documentUrl`      | no       | a web address, up to 2048              |

It creates or updates the user's organizer profile (status `pending`) and adds
a pending request, all in one transaction.

- 201 `{ request }` on success.
- 400 `{ error, fields }` with one message per invalid field.
- 409 `{ error }` if the user already has a pending request or is already approved.
- 500 if the database fails.

`GET /api/organizer/verification-request` returns `{ request }` for the user's
latest request, or `{ request: null }` if they never applied. A request is
`{ id, organizationName, description, address, website, contactEmail,
documentUrl, status, rejectionReason, submittedAt, reviewedAt }`, where
`status` is `pending`, `approved` or `rejected`.

### Admin Dashboard

The admin endpoints (Admin Dashboard) need `Authorization: Bearer <token>` from
a user whose `users.role` is `admin`: 401 if not logged in, 403 otherwise.

- The list takes `?status=pending` (the default), `approved`, `rejected` or
  `all`, oldest first. Each request has `id`, `organizationName`, `description`,
  `address`, `website`, `contactEmail`, `documentUrl`, `status`,
  `rejectionReason`, `submittedAt`, `reviewedAt` and
  `applicant: { id, name, email }`.
- Approve marks the request and organizer profile approved and makes the user an
  organizer. Reject marks both rejected and takes an optional `{ reason }` body.
  Both return `{ request: { id, status, rejectionReason, reviewedAt } }`, with
  404 for an unknown id and 409 if the request was already reviewed. Each review
  runs as one database function, so it fully happens or doesn't happen at all.

### Event photos

`PUT /api/me/events/:id/image` takes a multipart form with the photo in the
`image` field. It must be a JPEG, PNG or WebP image of 5 MB or less. The photo
goes into the `event-images` storage bucket and its link is saved as the
event's `imageUrl`, replacing and deleting any earlier photo. `DELETE` clears
it and returns `{ imageUrl: null }`. Both need `Authorization: Bearer <token>`:
400 for a bad file, 401 if not logged in, 403 if you didn't submit the event,
404 if it doesn't exist. Run `../supabase/migrations/20261115_event_images.sql`
first to create the bucket.

Besides the cover photo, an event can have up to 6 gallery photos. `POST
/api/me/events/:id/images` takes the same `image` upload and returns
`{ image: { id, url } }`, with 409 once the event has 6. `DELETE
/api/me/events/:id/images/:imageId` removes one. Both follow the same rules as
the cover photo. `GET /api/events/:id/images` lists them as `{ images }` for
anyone who can see the event. Run
`../supabase/migrations/20261116_event_image_gallery.sql` after the bucket
migration.

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
  app/api/me/profile/route.ts   Profile page
  app/api/me/events/[id]/image/route.ts  Event photo upload and removal
  app/api/me/events/[id]/images/...      Gallery photo upload and removal
  app/api/events/[id]/images/route.ts    Gallery photo list
  data/sample-events.ts         Placeholder events (used until Supabase is configured)
  app/api/admin/...             Admin Dashboard: list, approve, reject
  lib/events.ts                 Event type, filters, Supabase queries
  lib/auth.ts                   Signup/login validation and error handling
  lib/admin.ts                  Admin check, reviewing requests and events
  lib/rsvps.ts                  RSVPs
  lib/supabase.ts               Supabase clients (null until configured)
  lib/profile.ts                Profile info and organizer status
  lib/event-images.ts           Event photo checks and storage
  lib/event-gallery.ts          Gallery photos, up to 6 per event
tests/                          Vitest tests
```
