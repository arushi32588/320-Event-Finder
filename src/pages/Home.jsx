import { useState } from "react";
import { Link } from "react-router";
import { events } from "../data/events.js";
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
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone });

const mainFilters = [
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "free", label: "Free" },
];

const moreFilters = ["Age", "Category", "Accessible", "Indoor/Outdoor"];

function matchesFilter(event, filterId) {
  const start = new Date(event.startsAt);
  const now = new Date();
  if (filterId === "today") return dayKey.format(start) === dayKey.format(now);
  if (filterId === "week") {
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return start >= now && start <= weekFromNow;
  }
  if (filterId === "free") return event.price === "Free";
  return true;
}

export default function Home() {
  const [active, setActive] = useState([]);
  const [showMore, setShowMore] = useState(false);
  const [saved, setSaved] = useState([]);

  function toggle(list, setList, value) {
    setList(
      list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
    );
  }

  const visible = events.filter((event) =>
    active.every((f) => matchesFilter(event, f)),
  );

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
            onClick={() => toggle(active, setActive, filter.id)}
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
          {moreFilters.map((label) => (
            <button key={label} type="button" className="home-chip">
              {label}
            </button>
          ))}
        </div>
      )}

      <h2 className="home-section-title">Upcoming Events</h2>

      {visible.length === 0 ? (
        <p className="home-empty">No events match these filters yet.</p>
      ) : (
        <div className="home-grid">
          {visible.map((event) => {
            const start = new Date(event.startsAt);
            const isSaved = saved.includes(event.id);
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
                    onClick={() => toggle(saved, setSaved, event.id)}
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
