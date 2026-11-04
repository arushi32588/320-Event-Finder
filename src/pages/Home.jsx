import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api } from "../lib/api.js";
import { useSavedEvents } from "../lib/useSavedEvents.js";
import "../theme.css";
import "./Home.css";

const timeZone = "America/New_York";
const dateFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone,
});
const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone,
});
const mainFilters = [
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "free", label: "Free" },
];

// Age, Category and Indoor/Outdoor need database fields that don't exist yet,
// so they're shown as coming soon instead of pretending to filter.
const moreFilters = [
  { id: "age", label: "Age", comingSoon: true },
  { id: "category", label: "Category", comingSoon: true },
  { id: "accessible", label: "Accessible" },
  { id: "indoor", label: "Indoor/Outdoor", comingSoon: true },
];

export default function Home() {
  const [params] = useSearchParams();
  const q = params.get("q")?.trim() ?? "";
  const [active, setActive] = useState([]);
  const [showMore, setShowMore] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { savedIds, toggleSaved, error: saveError } = useSavedEvents();

  const query = new URLSearchParams();
  if (q) query.set("q", q);
  active.forEach((filter) => query.append("filter", filter));
  const queryString = query.toString();

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    api(`/api/events${queryString ? `?${queryString}` : ""}`)
      .then((data) => {
        if (current) setEvents(data.events);
      })
      .catch((err) => {
        if (current) setError(err.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [queryString]);

  function toggle(value) {
    setActive(
      active.includes(value)
        ? active.filter((v) => v !== value)
        : [...active, value],
    );
  }

  return (
    <div className="home-page">
      <section className="home-hero">
        <h1 className="home-title">Discover events happening around you</h1>
        <p className="home-subtitle">
          Browse local events in Amherst and filter by what matters to you.
        </p>
      </section>

      <div className="home-filters" role="group" aria-label="Filter events">
        {mainFilters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className="home-chip"
            aria-pressed={active.includes(filter.id)}
            onClick={() => toggle(filter.id)}
          >
            {filter.label}
          </button>
        ))}
        <button
          type="button"
          className="home-chip home-chip-more"
          aria-expanded={showMore}
          onClick={() => setShowMore(!showMore)}
        >
          More filters {showMore ? "▴" : "▾"}
        </button>
      </div>

      {showMore && (
        <div className="home-filters home-filters-more">
          {moreFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className="home-chip"
              aria-pressed={active.includes(filter.id)}
              disabled={filter.comingSoon}
              title={filter.comingSoon ? "Coming soon" : undefined}
              onClick={() => toggle(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      )}

      <h2 className="home-section-title">
        {q ? `Results for "${q}"` : "Upcoming Events"}
      </h2>

      {saveError && <p className="app-error" role="alert">{saveError}</p>}

      {error ? (
        <p className="app-error" role="alert">{error}</p>
      ) : loading ? (
        <p className="app-message" role="status">Loading events…</p>
      ) : events.length === 0 ? (
        <p className="home-empty">No events match these filters yet.</p>
      ) : (
        <div className="home-grid">
          {events.map((event) => {
            const start = new Date(event.startsAt);
            const isSaved = savedIds.includes(event.id);
            return (
              <article className="home-card" key={event.id}>
                <Link
                  to={`/events/${event.id}`}
                  className="home-card-image"
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  {event.imageUrl && <img src={event.imageUrl} alt="" />}
                </Link>
                <div className="home-card-body">
                  <div className="home-card-text">
                    <h3 className="home-card-title">
                      <Link to={`/events/${event.id}`}>{event.title}</Link>
                    </h3>
                    <p className="home-card-meta">
                      {dateFormat.format(start)} • {timeFormat.format(start)}
                    </p>
                    <p className="home-card-meta">
                      {[event.location, event.price]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                    {event.verified && (
                      <p className="home-card-verified">✓ Verified</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="home-save"
                    aria-pressed={isSaved}
                    onClick={() => toggleSaved(event.id)}
                  >
                    {isSaved ? "Saved" : "Save"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
