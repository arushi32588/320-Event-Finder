# Admin Dashboard — Wireframe Page

Branch: `Adam-Wireframe`

## Goal

Build the Admin Dashboard page following the **layout** of the team's
wireframe: a page title, a sidebar with five sections, and two lists,
"Pending Organizer Requests" and "Pending Event Approvals". Each row has
Review and Approve buttons. The page is styled the same way as Event Details,
Create Account and Home: white background, maroon accent, light-bordered cards.
The wireframe's dark grid background comes from the drawing tool and is not
part of the design.

## Global decisions

- **No new header and no nav link.** The page renders under the existing
  `Layout.jsx` nav and is reached at `/admin`. `Layout.jsx` and `styles.css`
  are unchanged.
- **Theme tokens** come from `src/theme.css`. No new tokens are added.
- **Scoped styles.** All page classes use the `ad-` prefix.
- **Local state only.** Nothing is persisted. The admin API on the
  `backend-admin-dashboard` branch needs a bearer token from an admin user, and
  the frontend has no auth session yet. The mock data is shaped so wiring it up
  later is a straight swap.

## Data: `src/data/admin.js`

- `organizerRequests`: 3 pending requests in the backend `VerificationRequest`
  shape:
  `{ id, organizationName, description, address, website, contactEmail,
  documentUrl, status: 'pending', rejectionReason: null, submittedAt,
  reviewedAt: null, applicant: { id, name, email } }`.
- `pendingEvents`: 3 submitted events in the existing event shape
  (`src/data/events.js`):
  `{ id, title, description, location, startsAt, endsAt, organizer, price,
  ages, accessibility? }`.
- Optional fields (`address`, `website`, `documentUrl`, `accessibility`, …) are
  left out of the UI when missing. At least one mock item omits a field so this
  gets tested.

## Layout: `src/pages/AdminDashboard.jsx`, `AdminDashboard.css`

- The container is `max-width: 1200px`, centered, with `padding: 40px 0 56px`
  (the same as Home).
- **Title block.** The wireframe's header box becomes an `h1` reading "Admin
  Dashboard" (32px bold), followed by a muted 17px subtitle: "Review organizer
  applications and event submissions."
- **Two-column grid.** The sidebar is `240px` and the content is
  `minmax(0, 1fr)`, with `gap: 40px`, top-aligned, and 28px below the title.
- **Sidebar.** A `nav` (`aria-label="Admin sections"`) inside a white card
  (1px `--border`, 12px radius, 12px padding). It holds five full-width
  buttons: Overview, Organizer Requests, Event Approvals, Users, Reports. They
  are left-aligned, 44px tall, with an 8px radius and a transparent background.
  Hovering shows `--surface-warm`. The active item gets `aria-current="page"`
  with an `--accent-soft` background, `--accent` text and weight 600. The focus
  ring is the accent outline.
- **Sections.** Each section has an `h2` (24px bold), then a status line, then
  a vertical stack of row cards with a 16px gap. Sections are 44px apart.
- **Row card.** White, 1px `--border`, 12px radius, `18px 24px` padding.
  - **Left side:** a name as an `h3` (17px bold), then a muted 14px meta line.
    - Organizer meta: "Applicant name • applicant email".
    - Event meta: "Organizer • Fri, Oct 16 • 7:00 PM • Location", formatted
      with `Intl` in `America/New_York` (the same approach as Home).
  - **Right side:** two buttons, 40px tall with an 8px radius and weight 600.
    **Review** is a maroon outline; it reads "Hide details" while expanded.
    **Approve** is a maroon fill that turns `--accent-hover` on hover.
  - **Expanded panel.** It sits below a 1px `--border` divider inside the same
    card. It holds a `dl` of label/value pairs (muted labels, 15px).
    - Organizer: Description, Address, Website (link, new tab), Contact email,
      Verification document (link "View document", new tab), Submitted (date).
    - Event: When (full date and time range, as on Event Details),
      Description, Price, Ages, Accessibility.
    - Below the `dl` is a **Reject** button: a neutral outline
      (`--border-strong` border, `--text` color, white background) that shows
      a `--surface-warm` background on hover.
- **Empty state.** Dashed `--border-strong` box, `--surface-warm` fill, muted
  centered text (like `home-empty`): "No pending organizer requests." or
  "No pending events."
- **Users / Reports.** The section `h2` followed by the same dashed box with
  "Coming soon."
- **Below 800px wide:**
  - The grid becomes a single column.
  - The sidebar card's buttons become a wrapping row of auto-width buttons.
  - Row cards stack, with the buttons below the text.

## Behavior

- **Tabs.** State is `view`, which can be `overview`, `organizers`, `events`,
  `users` or `reports`. The default is `overview`.
  - Overview renders both pending sections.
  - `organizers` and `events` each render only their own section.
  - `users` and `reports` render the coming-soon card.
  - Pending lists and expanded rows survive tab switches, because the state
    lives in the page component.
- **Review** toggles the row's expanded panel and has `aria-expanded` and
  `aria-controls` pointing at the panel. Several rows can be open at once.
- **Approve / Reject** remove the row from its pending list. A single
  `role="status"` line in that section then reads "Approved <name>." or
  "Rejected <name>." (`<name>` is the organization name or event title). The
  line is replaced by the next action in that section. There is no undo.
- When a list empties, its empty state shows in place of the rows.

## Routing

`src/App.jsx`: `admin` → `AdminDashboard`.

## Testing: `src/pages/AdminDashboard.test.jsx`

These run in Vitest with Testing Library, like the existing page tests:

- Overview shows both headings and all six rows with their meta lines.
- Approve removes the organizer row and shows "Approved <name>."
- Review expands the details (`aria-expanded` true, details visible). Clicking
  "Hide details" collapses it.
- Reject inside the expanded panel removes the row and shows
  "Rejected <name>."
- An optional field missing from a mock item is not rendered.
- The Organizer Requests tab shows only that section and has
  `aria-current="page"`. Event Approvals shows only events.
- Users shows "Coming soon."
- Approving every event shows "No pending events."

## Verification

- `npm test` and `npm run build` pass.
- In the browser, check `/admin` at desktop width and at about 375px. Click
  through every tab, Review/Hide, Approve and Reject.
- The other pages look unchanged.
