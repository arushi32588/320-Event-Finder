# Event Chat and Cover Photos: Frontend

## Goal

Build this week's two frontend features:

1. **Event messaging.** Each event has a group thread for attendees and the
   organizer. Anyone logged in can also open a private thread with an event's
   organizer.
2. **Cover photo upload.** Organizers upload a real photo for their event
   instead of pasting a link, and the photo shows wherever the event's poster
   shows.

Both match the existing look in `src/theme.css` (poster / bulletin-board
style: ink outlines, hard shadows, paper, marigold and red accents).

## Global decisions

- **Frontend only, mock data layer.** No backend routes exist for either
  feature (`conversations` and `messages` have RLS on and no policies, and
  there is no storage bucket). As with the admin dashboard spec, each feature
  gets one `src/lib/` module whose functions match the planned API one to one
  and are backed by in-memory mock data for now. To connect the backend, a
  teammate swaps each function body for an `api(...)` call. No page or
  component changes.
- **The server decides permissions.** The frontend never works out whether
  the viewer is an event's organizer or allowed into a chat. Responses carry
  `mine`, `isOrganizer`, and 403 errors with messages that are safe to show.
- **Mocks fake a delay** (about 250 ms) so loading states are real and
  testable.
- **Theme tokens only.** No new tokens. New page classes use the `msg-`
  prefix (Messages) and `cp-` (cover photo). Shared button and card styling
  comes from the existing `theme.css` selector lists, extended with the new
  classes.
- **Schema note for the backend.** `public.conversations` is one attendee to
  one organizer per event. A group thread needs a conversation per event
  (e.g. a `kind` column with `attendee_user_id` nullable for groups). The
  contract below is written so either shape can sit behind it.

## Feature 1: Messaging

### API contract

Every chat is a conversation:

```
Conversation = {
  id: string,
  kind: 'group' | 'direct',
  event: { id: string, title: string, startsAt: string | null },
  title: string,                 // event title for group; other person's name for direct
  lastMessage: { body: string, sentAt: string, senderName: string } | null,
}
Message = {
  id: string,
  body: string,                  // 1–2000 chars after trimming
  sentAt: string,                // ISO
  sender: { id: string, name: string, isOrganizer: boolean },
  mine: boolean,
}
```

| Call | Request | Response |
| --- | --- | --- |
| `GET /api/me/conversations` | | `{ conversations: Conversation[] }`, newest activity first |
| `GET /api/conversations/:id` | | `{ conversation, messages: Message[] }`, oldest first; 404 if not a member |
| `POST /api/conversations/:id/messages` | `{ body }` | `{ message }` (201); 400 `{ error, fields: { body } }` if empty or too long |
| `POST /api/events/:id/conversations` | `{ kind }` | `{ conversation }`. Finds or creates. Group without RSVP/organizer: 403 "RSVP to join the group chat." |

### Module: `src/lib/messages.js`

```
listConversations()                    -> Promise<Conversation[]>
getConversation(id)                    -> Promise<{ conversation, messages }>
sendMessage(conversationId, body)      -> Promise<Message>
openEventConversation(event, kind)     -> Promise<Conversation>
```

`openEventConversation` takes the event object (not just the id) so the mock
can name a new thread. The real version only uses `event.id`. Errors are
thrown as `ApiError` (from `api.js`) with the same messages and statuses as
the contract, so pages handle mock and real failures the same way.

Mock data: seeded conversations on sample events 1–3 (the backend's sample
events, so links resolve with no Supabase set up). It includes a busy group
thread with an organizer message, a direct thread where the viewer is the
attendee, and a direct thread where the viewer is the organizer, so both
sides of a DM can be demoed. State lives in module memory and resets on
reload. The mock trusts the event page to gate the group button on RSVP. The
real server enforces it.

### Routes and pages

- `/messages` and `/messages/:conversationId` → `Messages` page, behind
  `RequireAuth`.
- Nav gets a **Messages** link when logged in (next to Submit Event).

**`Messages` page** (`src/pages/Messages.jsx` + `Messages.css`)

- Desktop (≥ 760px): two columns. Left is `ConversationList`; right is
  `ChatThread` for the selected id, or an empty card ("Pick a conversation"
  / "No conversations yet: RSVP to an event to join its group chat").
- Phone: one column. `/messages` shows the list. `/messages/:id` shows the
  thread with a "← All messages" back link.
- `ConversationList` (in the page file unless it grows): each row is a
  `NavLink` card showing the title, a sticker ("Group" in marigold, "Direct"
  in pink), the event name and date for direct threads, and the last message
  preview truncated to one line. The active row is lit marigold, like
  pressed Save/RSVP buttons.

**`ChatThread` component** (`src/components/ChatThread.jsx` + `.css`)

- Header: the thread title, a sticker, and a link to the event.
- Message list: `role="log"` with `aria-live="polite"`. Bubbles have the ink
  outline and a 2px hard shadow. Mine sit on the right in marigold; others
  sit on the left in `--surface`. Each shows the sender name (others only)
  and the time. Messages with `isOrganizer` get a tilted **Organizer**
  sticker. Consecutive messages from the same sender within 5 minutes drop
  the repeated name. It scrolls to the bottom on load and when the viewer
  sends a message.
- Composer: a labelled textarea ("Message") and the red primary **Send**
  button. Enter sends; Shift+Enter adds a new line. Send is disabled while
  the text is blank or a send is in flight. Sending adds the message
  straight away as pending (dimmed) and replaces it with the server's
  message. On failure the pending message is removed, the text goes back
  into the box, and the error shows under the composer.
- Polling: while a thread is open it re-fetches every 5 s and replaces the
  list. A failed poll is ignored, and the next one tries again. Polling
  stops on unmount or when the id changes. (Supabase Realtime can replace
  this later behind the same component.)
- States: loading shows `app-message` "Loading conversation…"; a 404 shows
  "This conversation isn't available." with a back link; other errors show
  `app-error`.

### Event page changes (`EventDetails.jsx`)

Below Save/RSVP in the sidebar card, a new row:

- **Group chat**: enabled when `going` is true. When not going, it is
  disabled with the hint "RSVP to join the group chat" (linked by
  `aria-describedby`). Logged-out users are sent to login (same as Save).
- **Message organizer**: always enabled for logged-in users. Logged-out
  users are sent to login.

Clicking either calls `openEventConversation(event, kind)` and navigates to
`/messages/:id`. Errors use the card's existing error line.

## Feature 2: Cover photo upload

### API contract

| Call | Request | Response |
| --- | --- | --- |
| `PUT /api/me/events/:id/image` | multipart, field `image` | `{ imageUrl }`; 400 `{ error }` for bad type/size; 403 if not the submitter |
| `DELETE /api/me/events/:id/image` | | `{ imageUrl: null }` |

Rules: JPEG, PNG or WebP; at most 5 MB. The backend stores the file in
Supabase Storage and sets `events.image_url`. After that, every existing
event response already carries `imageUrl`. `POST /api/me/events` is
unchanged. Upload is a second step after the event exists. Connecting the
real backend also means `api()` must pass a `FormData` body through as-is
(no JSON header); that is part of the backend swap, not this work.

"Organizer" here means the user who submitted the event (any logged-in user
can submit), not only verified organizers.

### Module: `src/lib/eventImages.js`

```
validateImage(file)              -> string | null   // error message, shared with the backend's rules
uploadEventImage(eventId, file)  -> Promise<string> // imageUrl
removeEventImage(eventId)        -> Promise<void>
useEventImageUrl(event)          -> string | null   // hook
```

Mock: uploads store `URL.createObjectURL(file)` in a module map keyed by
event id (revoking the previous URL), and notify subscribers. They last
while navigating in the app, not after a reload.
`useEventImageUrl` uses `useSyncExternalStore` over that map and returns
the uploaded URL, falling back to `event.imageUrl`. The real version simply
returns `event.imageUrl`. Removing an image records `null` so the generated
poster shows again even if the event had an `imageUrl`.

### Components

**`CoverPhotoPicker`** (`src/components/CoverPhotoPicker.jsx` + `.css`):
a controlled field `{ file, onChange(file | null), previewEvent, error }`.

- Empty: a dashed ink-outlined drop zone, "Drop a photo here or **browse**",
  with "JPEG, PNG or WebP, up to 5 MB" underneath. It wraps a visually
  hidden `<input type="file" accept="image/jpeg,image/png,image/webp">`,
  so keyboard and screen readers use the real input. Drag-over lights the
  zone marigold.
- Chosen: a preview in a real `EventPoster` (using `previewEvent` with the
  object URL as `imageUrl`), so the date ticket and stickers show over the
  photo. It has **Replace** and **Remove** buttons.
- Validation runs on pick or drop through `validateImage`. Errors show
  below in the `ov-error` style with `aria-invalid` on the zone, e.g.
  "That file is 8.2 MB. Photos can be up to 5 MB." / "Use a JPEG, PNG or
  WebP image."

**`EventPoster`**: reads `useEventImageUrl(event)` instead of
`event.imageUrl`. No other change; it already crops with `object-fit:
cover`.

### Submit Event changes

- The "Image Link" URL field is replaced by **Cover photo**
  (`CoverPhotoPicker`), placed after Description. Its preview uses the
  current title and start time from the form.
- On submit: `POST /api/me/events` (unchanged, no `imageUrl`). If a photo
  was chosen, `uploadEventImage(event.id, file)` runs next. The button reads
  "Uploading photo…" during the second step.
- If the upload fails, the event is still submitted. The success screen
  adds: "Your event was submitted, but the photo didn't upload. You can add
  it from your profile."

### Profile changes

- Under each card in **Events You Submitted**, a **Change photo** button
  (`pf-btn`) opens a `<dialog>` with `CoverPhotoPicker`, **Save** and
  **Cancel**. If the event has a photo, the dialog also offers **Remove
  photo**. Saving calls `uploadEventImage` / `removeEventImage`, closes the
  dialog, and the card's poster updates through the hook.
- The button sits outside the card's `<Link>` (a button inside a link is
  invalid). `EventCardGrid` gets a `renderActions(event)` prop rendered
  after the link inside a wrapper that keeps the current grid layout.

## Testing

Vitest + Testing Library, in the style of the existing `*.test.jsx`, using
`renderPage` / `mockApi` from `src/test/api.jsx` for real routes and
`vi.mock` for the two mock modules where a page test needs to control them.

- `messages.test.js`: list order, send validation (blank / too long →
  `ApiError` 400 with `fields.body`), find-or-create returns the same
  thread.
- `Messages.test.jsx`: list renders with stickers; selecting opens the
  thread; sending shows pending then the confirmed message; a failed send
  restores the text and shows the error; 404 thread state; empty list state.
- `EventDetails.test.jsx` (extend): Group chat disabled with hint until
  RSVP; Message organizer navigates to `/messages/:id`; logged out goes to
  login.
- `eventImages.test.js`: `validateImage` type and size rules; upload →
  hook returns the URL; remove → hook returns null.
- `SubmitEvent` (in `Forms.test.jsx`): wrong type and oversized errors;
  preview then remove; submit runs create then upload in order; upload
  failure shows the partial-success message.
- `Profile.test.jsx` (extend): Change photo opens the dialog; saving calls
  upload.

Then a check in the browser preview at desktop and phone widths.

## Out of scope

Backend routes, RLS policies, storage bucket and schema changes; unread
counts and notifications; editing or deleting messages; image galleries;
client-side resizing or cropping.
