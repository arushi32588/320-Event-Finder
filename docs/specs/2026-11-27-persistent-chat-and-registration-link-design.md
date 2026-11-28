# Persistent Chat and Registration Link + QR: Frontend

## Goal

This week's frontend work:

1. **Persistent messaging.** The Messages page and event chat buttons talk to
   the real chat backend instead of the in-memory mock, so messages survive a
   reload and are shared between users.
2. **Registration / payment link with a QR code.** An event can carry a link
   to register or pay. The event page shows it as a button plus a QR code
   people can scan with a phone. Organizers can enter the link when they
   submit an event.
3. **Admin "Coming soon" placeholders.** Already removed by the Admin Users /
   Admin Reports PR (#37). This work only confirms none remain.

Everything follows `src/theme.css` (ink outlines, hard shadows, paper,
marigold and red accents). No new theme tokens.

## Global decisions

- **Frontend only.** No backend or Supabase changes in this work.
- **Messaging is group chat only.** The backend in `origin/chat-supabase-store`
  supports one group chat per event (conversation id = event id) and rejects
  `kind: "direct"` with a 400. The frontend drops direct messages to match,
  instead of keeping a half-mocked DM feature.
- **No mock fallback for chat.** "Persistent" means real data, so a missing
  backend shows the normal error states. Messaging works end to end once
  `chat-supabase-store` is merged. That branch's README refers to
  `supabase/migrations/20261122_event_chat.sql` and
  `20261122_event_chat_access.sql`, which are not in the branch, so the
  migrations must land too. This is called out in the PR description.
- **QR codes are generated locally** with the `qrcode` npm package (SVG
  output). No third-party QR service sees event links, and it works offline
  and in tests.
- **The server still decides permissions.** The frontend keeps its existing
  RSVP gate on the Group chat button as a hint only; a 403 from the server is
  shown as-is.

## Feature 1: Persistent messaging

### Contract (from `origin/chat-supabase-store`)

Unchanged shapes from the 2026-11-14 chat spec, with `kind` always `'group'`:

| Call | Request | Response |
| --- | --- | --- |
| `GET /api/me/conversations` | | `{ conversations }`, newest activity first |
| `GET /api/conversations/:id` | | `{ conversation, messages }` oldest first; 404 if not a member |
| `POST /api/conversations/:id/messages` | `{ body }` | 201 `{ message }`; 400 `{ error, fields: { body } }` |
| `POST /api/events/:id/conversations` | `{ kind: 'group' }` | `{ conversation }`; 403 "RSVP to join the group chat." |

### `src/lib/messages.js`

Each function becomes a thin `api(...)` wrapper that unwraps the response:

```
listConversations()               -> GET  /api/me/conversations          -> conversations
getConversation(id)               -> GET  /api/conversations/:id         -> { conversation, messages }
sendMessage(conversationId, body) -> POST /api/conversations/:id/messages -> message
openEventConversation(eventId)    -> POST /api/events/:id/conversations { kind: 'group' } -> conversation
```

- Ids are passed through `encodeURIComponent`.
- `MAX_MESSAGE_LENGTH` (2000) stays exported for the composer's `maxLength`.
- Removed: seed data, `VIEWER`, the fake delay, `resetMockMessages`, and the
  `kind` parameter. `openEventConversation` now takes the event id, since the
  real route only needs that.
- Errors are the `ApiError`s thrown by `api()`, so `ChatThread`'s existing
  handling (`err.fields?.body ?? err.message`, 404 → "This conversation isn't
  available.") works unchanged.

### UI changes

- **EventDetails:** remove the **Message organizer** button. **Group chat**
  stays: locked with the "RSVP to join the group chat." hint until the viewer
  is going, sends logged-out visitors to log in, and on success navigates to
  `/messages/:id`. Server errors (including 403) show on the card's error
  line.
- **Messages page:** empty state becomes "No conversations yet. RSVP to an
  event to join its group chat."
- `ChatThread`, `KindSticker` and the list rows stay as they are. They still
  handle `kind: 'direct'` correctly, so DMs can return later without UI work.

### Tests

- `src/lib/messages.test.js`: rewritten with `mockApi`. Each function hits the
  right method and path, sends the right body, unwraps the response, and
  passes through 400/403/404 errors as `ApiError` with `status` and `fields`.
- `src/pages/Messages.test.jsx`: driven by `mockApi` routes instead of the
  seeded mock. It covers the list order and stickers, the empty state, opening
  a thread with an organizer label, sending (pending then confirmed), a send
  error putting the text back, a 404 thread, and polling picking up new
  messages.
- `src/pages/EventDetails.test.jsx` (chat block): the locked group chat, opening
  the group chat (asserting the POST body `{ kind: 'group' }`), a 403 shown on
  the card, logged-out visitors sent to login, and no Message organizer button.

## Feature 2: Registration / payment link + QR

### Data

- Events gain an optional `registrationUrl: string | null` from
  `GET /api/events/:id`.
- Submit Event sends `registrationUrl` (or omits it when blank) in the
  `POST /api/me/events` body.
- **Backend follow-up (not in this work):** add `events.registration_url TEXT`,
  return it as `registrationUrl` in `toEvent`, and accept and validate it
  (http/https, up to 2048 characters) in `validateEventSubmission`. Until
  then, the backend ignores the field and no event shows the card.

### `RegistrationLink` component (`src/components/RegistrationLink.jsx` + `.css`)

Props: `{ url, price }`. Classes use the `rl-` prefix.

- Renders nothing unless `url` parses as an `http:` or `https:` URL, so a
  `javascript:` or malformed link never reaches an `href` or a QR code.
- The card is an `ed-card`-styled `<section aria-labelledby>` with:
  - Heading: "Register", or "Tickets & payment" when `price` is set and not
    `'Free'`.
  - The site name in small text: "via eventbrite.com" (hostname, `www.`
    stripped).
  - The primary link button: "Register", or "Register & pay" for paid events.
    It has `target="_blank"` and `rel="noopener noreferrer"`, and is styled
    like the red primary buttons.
  - The QR code: `QRCode.toString(url, { type: 'svg', margin: 1 })` is made
    in an effect and shown as `<img src="data:image/svg+xml;utf8,…"
    alt="QR code for the registration link">` at about 160px. It sits on a
    white tile with the ink outline and a hard shadow, so it scans in dark
    themes too. The caption is "Scan to open on your phone". While the QR is
    being generated, an empty tile of the same size holds its place. If
    generation fails, the tile is hidden and the button still works.
- Placement: in the EventDetails sidebar, between the info card and the map
  card.

### Submit Event field

- An optional field `registrationUrl`, labelled "Registration / Payment Link",
  `type="url"`, placeholder `https://…`, placed after Price.
- A client-side check before submit: a non-blank value must parse as http(s).
  Otherwise the field shows "Link must start with http:// or https://." in the
  existing per-field error style, and nothing is sent. Server `fields`
  errors still show the same way.
- A blank value is removed from the request body.

### Tests

- `src/components/RegistrationLink.test.jsx`:
  - It renders nothing for a missing, malformed or `javascript:` URL.
  - Free and paid labels.
  - Link href, target and rel.
  - Shows the hostname.
  - The QR image appears with its alt text and an SVG data URL.
- `EventDetails.test.jsx`: the card appears when `registrationUrl` is set and
  is absent otherwise.
- `Forms.test.jsx` (Submit Event): it sends `registrationUrl` when filled,
  omits it when blank, and blocks the submit with the error message for a
  non-http link.

## Feature 3: Admin placeholders

Search `src/` for admin "Coming soon" text. PR #37 removed the last one, and
`AdminDashboard.test.jsx` already asserts it is gone. No code changes are
expected. Non-admin "coming soon" items (the map, Google login, Home filters,
the verification upload) are out of scope.

## Verification

- `npm test` (full frontend suite) and `npm run build` pass.
- In the browser preview: the event page shows the registration card with a
  scannable QR, with the event response mocked if no backend is set up. The
  Messages page loads against the API, or shows its error state when there's
  no backend.
