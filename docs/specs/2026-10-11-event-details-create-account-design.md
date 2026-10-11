# Event Details + Create Account — Wireframe Pages

Branch: `Adam-Wireframe` (off `frontend-skeleton`)

## Goal

Build the Event Details and Create Account pages following the **layout** of
the team's wireframes: the same elements, in the same order and arrangement.
They are styled as a real product: fluid full-width layout, a restrained
maroon accent, and data-driven content.

Revision 2. Revision 1 was a pixel-exact grey replica. Feedback asked for a
generalized page that fills the screen and uses some color. No new content
sections are added; the content is what the wireframes show.

## Global decisions

- **No new header.** `Layout.jsx`, its nav and `styles.css` are unchanged.
  Pages render under the existing nav.
- **No new nav links.** The pages are reached at `/events/:id` and `/signup`.
- **Background stays white.** A warm off-white page background would mean
  editing the global `styles.css`/`Layout`, which is out of scope. Cards sit on
  white with a light warm border, and the warm off-white is used inside
  placeholders.
- **Theme tokens** live in `src/theme.css` as CSS custom properties, imported
  by both pages. Defining variables does not restyle any other page.

  | Token | Value | Use |
  |---|---|---|
  | `--accent` | `#881C1C` (UMass maroon) | Primary buttons, links, focus ring |
  | `--accent-hover` | `#6E1616` | Primary button hover |
  | `--accent-soft` | `#F6E9E9` | Pressed/selected backgrounds |
  | `--text` | `#1F1A17` | Body text |
  | `--text-muted` | `#6B625C` | Secondary lines |
  | `--border` | `#E7E2DE` | Card and input borders |
  | `--surface-warm` | `#FAF8F6` | Placeholder fills |
  | `--success` | `#2E7D4F` | Verified organizer |

- **Font:** system UI stack
  (`system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`).
- **Scoped styles.** Page CSS classes keep their `ed-` / `ca-` prefixes.

## 1. Event Details: `/events/:id`

Files: `src/pages/EventDetails.jsx`, `src/pages/EventDetails.css`,
`src/data/events.js`, `src/theme.css`

### Layout (same arrangement as the wireframe)

- The container fills the available width up to `max-width: 1200px`, centered.
- "← Back to events" link (accent color) above the content, linking to
  `/events`.
- Two-column grid: main `minmax(0, 2fr)`, sidebar `minmax(280px, 1fr)`,
  `gap: 40px`, top-aligned.
- **Main column**, in wireframe order:
  1. Event image: full column width, `aspect-ratio: 2 / 1` (the wireframe's
     proportion), 12px radius. It shows `event.imageUrl` if present, otherwise
     a soft maroon→rose gradient placeholder.
  2. Title: ~32px bold.
  3. Date line: "Friday, Oct 16 • 7:00 PM – 9:30 PM", 16px, muted.
  4. Place line: "Amherst Town Common • Free • All ages", 16px, muted.
  5. Description: 16px, line-height 1.6, max ~70ch.
- **Sidebar**, in wireframe order:
  1. Info card (white, 1px `--border`, 12px radius, 24px padding):
     "Organizer: …", "✓ Verified organizer" in `--success` (only when
     verified), "Accessibility: …", "Transportation: …". Below them sit the two
     buttons side by side at equal width: **Save Event** (accent outline) and
     **RSVP** (accent fill, white text).
  2. Map card: same card style, ~200px tall, `--surface-warm` fill,
     "Map / location" placeholder label in muted text.
- **Below 800px wide:** a single column, with the sidebar after the main
  column.

### Data and behavior

- `src/data/events.js` exports `events` and `getEventById(id)`. It holds 3
  mock events: the wireframe's Community Outdoor Movie Night (id `1`), plus
  Fall Career Fair and Hack Night from the backend's `sample-events.ts`,
  extended with the wireframe fields. The shape follows the backend
  (`id, title, description, location, startsAt, endsAt, organizer`) plus
  `imageUrl?, price, ages, verified, accessibility?, transportation?`.
- The date line is formatted from `startsAt`/`endsAt` with `Intl`, in the
  `America/New_York` time zone.
- Optional fields (`verified`, `accessibility`, `transportation`, `price`,
  `ages`, `imageUrl`) are omitted from the UI when they are missing.
- An unknown id shows "Event not found" with a link back to `/events`.
- **Save Event** toggles to "Saved" and **RSVP** toggles to "Going"
  (`aria-pressed`; the pressed state uses the accent-soft/accent styles).
  This is local state only, with nothing persisted.

## 2. Create Account: `/signup`

Files: `src/pages/CreateAccount.jsx`, `src/pages/CreateAccount.css`

- Same elements and order as the wireframe: title, Full Name, Email, Date of
  Birth, Password, Confirm Password, terms checkbox, Create Account button,
  "Already have an account? Log in".
- Card: centered, `max-width: 480px`, full width on narrow screens, white,
  1px `--border`, 16px radius, 40px padding.
- Labels: 14px semibold. Inputs: full width, 44px tall, 12px horizontal
  padding, 8px radius, `--border`, accent focus ring. Placeholders are the
  wireframe's text in normal muted grey. Date of Birth stays a text input.
- Checkbox: native, `accent-color: var(--accent)`.
- Create Account button: full width, accent fill, white text, 8px radius,
  hover `--accent-hover`.
- "Log in" is an accent-colored link to `/login`.
- No validation UI and no submission; submit calls `preventDefault()`.

## 3. Routing

`src/App.jsx`: `events/:id` → `EventDetails`, `signup` → `CreateAccount`.
(Already in place.)

## Verification

- `npm run build` succeeds.
- In the browser, check `/events/1`, `/events/2`, `/events/3` and
  `/events/999` (not found), and `/signup`, at desktop width and at about
  375px wide.
- Save/RSVP toggle; the signup fields accept input; the links route correctly.
- `/`, `/events`, `/login`, `/profile` and the 404 page look unchanged.
