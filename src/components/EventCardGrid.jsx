import { Link } from "react-router";
import EventPoster from "./EventPoster.jsx";
import "../pages/Profile.css";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "America/New_York",
});

// The small event cards used on the Profile and Saved pages.
export default function EventCardGrid({ events, past = false, renderExtra }) {
  return (
    <div className="pf-grid">
      {events.map((event) => (
        <Link
          to={`/events/${event.id}`}
          className={past ? "pf-card pf-card-past" : "pf-card"}
          key={event.id}
        >
          <div className="pf-card-image">
            <EventPoster event={event} muted={past} />
          </div>
          <div className="pf-card-body">
            <h3 className="pf-card-title">{event.title}</h3>
            <p className="pf-card-meta">
              {[event.startsAt && dateFormat.format(new Date(event.startsAt)), event.location]
                .filter(Boolean)
                .join(" • ")}
            </p>
            {renderExtra?.(event)}
          </div>
        </Link>
      ))}
    </div>
  );
}
