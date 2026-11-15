import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../lib/auth.jsx";
import "../theme.css";
import "./Layout.css";

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const urlSearch = params.get("q") ?? "";
  const [search, setSearch] = useState(urlSearch);
  const [lastUrlSearch, setLastUrlSearch] = useState(urlSearch);

  // Keep the box in step when the URL changes, like the browser's back button.
  if (urlSearch !== lastUrlSearch) {
    setLastUrlSearch(urlSearch);
    setSearch(urlSearch);
  }

  function handleSearch(e) {
    e.preventDefault();
    const q = search.trim();
    navigate(q ? `/?q=${encodeURIComponent(q)}` : "/");
  }

  async function handleLogout() {
    await signOut();
    navigate("/");
  }

  return (
    <>
      <header className="nav-bar">
        <Link to="/" className="nav-logo">
          <span className="nav-logo-mark" aria-hidden="true">✶</span>
          Event Finder
        </Link>

        <form role="search" onSubmit={handleSearch}>
          <input
            type="search"
            className="nav-search"
            placeholder="Search events..."
            aria-label="Search events"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <span className="nav-location">Amherst, MA</span>

        <nav className="nav-links" aria-label="Main navigation">
          <NavLink to="/saved">Saved</NavLink>
          <NavLink to="/profile">Profile</NavLink>
          {user && <NavLink to="/messages">Messages</NavLink>}
          {user && <NavLink to="/events/new">Submit Event</NavLink>}
          {user?.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
          {user ? (
            <button type="button" className="nav-login nav-logout" onClick={handleLogout}>
              Log out
            </button>
          ) : (
            <Link to="/login" className="nav-login">
              Log in
            </Link>
          )}
        </nav>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <footer className="app-footer">
        <strong>Event Finder ✶</strong>
        <span>Made by Team BlueBird</span>
      </footer>
    </>
  );
}
