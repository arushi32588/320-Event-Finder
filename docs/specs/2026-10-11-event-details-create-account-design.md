# Event Details + Create Account — Wireframe Pages

Branch: `Adam-Wireframe` (off `frontend-skeleton`)

## Goal

Build the Event Details and Create Account pages as React components that
replicate the team's draw.io wireframes exactly. Nothing is added that the
wireframes do not show, and nothing shown is changed.

## Global decisions

- **No new header.** `Layout.jsx` and its nav are unchanged. Event Details
  renders under the existing nav, not the wireframe's EVENT FINDER bar.
- **No new nav links.** The pages are reached by URL: `/events/:id` and
  `/signup`.
- **Desktop only.** Fixed widths taken from the wireframes. No mobile layout.
- **Look.** Helvetica/Arial, black text, light grey fills, thin grey borders.
  No accent colors, shadows, hover effects or transitions.
- **Scoped styles.** Each page has its own CSS file, and every class is
  prefixed (`ed-`, `ca-`) so the styles don't leak into other pages.
- **No behavior beyond the drawing.** No validation messages, no toggled
  button states, no submission.

## 1. Event Details: `/events/:id`

Files: `src/pages/EventDetails.jsx`, `src/pages/EventDetails.css`

Sizes are measured from the 1062px-wide wireframe.

| Element | Spec |
|---|---|
| Back link | "← Back to events", ~13px, plain black text, links to `/events` |
| Layout | Two columns: left 611px, gap 49px, right 331px. Columns top-aligned 30px below the back link |
| Event image | 611×300 box, light grey fill, 1px grey border, "EVENT IMAGE" centered, ~20px uppercase |
| Title | "Community Outdoor Movie Night", bold, ~28px, ~22px below the image |
| Date line | "Friday, Oct 16 • 7:00 PM – 9:30 PM", ~14px |
| Place line | "Amherst Town Common • Free • All ages", ~14px |
| Description | ~13px, ~45px gap above it, wraps within the left column |
| Info box | 331×271, white, 1px dark grey border, square corners. Four lines at ~13px, 27px left inset: "Organizer: Amherst Community Group", "✓ Verified organizer", "Accessibility: Wheelchair accessible", "Transportation: Bus / Walk / Parking" |
| Buttons | Inside the info box, side by side, each ~141×42 with ~5px radius. **Save Event**: white fill, dark border, normal weight. **RSVP**: grey fill, dark border, bold |
| Map | 331×191 box, 30px below the info box, light grey fill, 1px grey border, "MAP / LOCATION" centered, ~16px uppercase |

**Data:** one mock event object at the top of the page component, holding the
exact wireframe values. The page renders that object for any `:id`.

**Buttons:** real `<button type="button">` elements with no click behavior.

## 2. Create Account: `/signup`

Files: `src/pages/CreateAccount.jsx`, `src/pages/CreateAccount.css`

Sizes are measured from the 532px-wide wireframe.

| Element | Spec |
|---|---|
| Card | 532px wide, centered horizontally, white, 1px grey border, ~60px corner radius |
| Title | "Create your account", bold, ~26px, centered |
| Labels | Full Name, Email, Date of Birth, Password, Confirm Password. Bold, ~12px, left-aligned with the inputs |
| Inputs | 421×40, 1px grey border, ~6px radius, ~13px text. **Placeholder inset ~2px, matching the wireframe exactly.** Vertical rhythm: ~90px from one field group to the next |
| Placeholders | "User Full Name", "you@example.com", "MM / DD / YYYY", "••••••••", "••••••••" |
| Input types | `text`, `email`, `text` for date of birth (not the native date picker, which would look different), `password`, `password` |
| Terms | Small square checkbox, then "I agree to the Terms of Service and Privacy Policy", ~12px |
| Create button | 421×46, grey fill, 1px dark border, ~6px radius, bold ~14px "Create Account" |
| Footer | "Already have an account? Log in", centered, ~12px. "Log in" is a link to `/login` styled identically to the surrounding text |

**Behavior:** fields accept input and the checkbox toggles. The form's submit
handler calls `preventDefault()` and does nothing else. No validation UI.

## 3. Routing

`src/App.jsx` gets two routes inside the existing `Layout` route:

- `events/:id` → `EventDetails`
- `signup` → `CreateAccount`

No other files change.

## Verification

- `npm run build` succeeds.
- Run `npm run dev`, open `/events/1` and `/signup` in the browser, and
  compare screenshots side by side with the wireframe PNGs. Check element
  positions, sizes, text and colors.
- Confirm `/`, `/events`, `/login`, `/profile` and the 404 page look unchanged.
