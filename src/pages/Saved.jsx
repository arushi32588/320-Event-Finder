import { useEffect, useState } from "react";
import { Link } from "react-router";
import EventCardGrid from "../components/EventCardGrid.jsx";
import { api } from "../lib/api.js";
import "../theme.css";
import "./Profile.css";

export default function Saved() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    api("/api/me/saved-events")
      .then((data) => {
        if (current) setEvents(data.events);
      })
      .catch((err) => {
        if (current) setError(err.message);
      });
    return () => {
      current = false;
    };
  }, []);

  return (
    <div className="pf-page">
      <h1 className="pf-section-title">Saved Events</h1>
      {error && <p className="app-error" role="alert">{error}</p>}
      {!error && events === null && <p className="app-message" role="status">Loading…</p>}
      {events?.length === 0 && (
        <p className="pf-empty">
          You haven't saved any events yet. <Link to="/">Browse events</Link>
        </p>
      )}
      {events?.length > 0 && <EventCardGrid events={events} />}
    </div>
  );
}
