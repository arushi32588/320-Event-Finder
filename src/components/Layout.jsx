import { Link, NavLink, Outlet } from "react-router";
import "../theme.css";
import "./Layout.css";

export default function Layout() {
  return (
    <>
      <header className="nav-bar">
        <Link to="/" className="nav-logo">
          EVENT FINDER
        </Link>

        <input
          type="search"
          className="nav-search"
          placeholder="Search events..."
          aria-label="Search events"
        />

        <span className="nav-location">📍 Amherst</span>

        <nav className="nav-links" aria-label="Main navigation">
          <NavLink to="/saved">Saved</NavLink>
          <NavLink to="/profile">Profile</NavLink>
          <Link to="/login" className="nav-login">
            Log in
          </Link>
        </nav>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </>
  );
}
