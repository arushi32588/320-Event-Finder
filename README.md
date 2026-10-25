# Event Finder

Basic React frontend skeleton using Vite and React Router. Each page contains
only a heading and a "page working" message, with shared navigation links.

The backend is a separate Next.js + TypeScript API in [`backend/`](backend/README.md).
Run it alongside the frontend; Vite proxies `/api/*` requests to it on port 3000.

## Run locally

Use Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite.

```sh
npm run build
npm run preview
```

## Routes

- `/`: Home
- `/events`: Events
- `/login`: Login
- `/profile`: Profile
- Unknown URLs: 404 page

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
