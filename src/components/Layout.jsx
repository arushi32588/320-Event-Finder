import { NavLink, Outlet } from 'react-router';

export default function Layout() {
  return (
    <>
      <nav aria-label="Main navigation">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/events">Events</NavLink>
        <NavLink to="/login">Login</NavLink>
        <NavLink to="/profile">Profile</NavLink>
      </nav>
      <main><Outlet /></main>
    </>
  );
}
