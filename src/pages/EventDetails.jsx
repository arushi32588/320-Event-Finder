import { useState } from "react";
import { Link, useParams } from "react-router";
import { getEventById } from "../data/events.js";
import "../theme.css";
import "./EventDetails.css";

const timeZone = "America/New_York";
const dateFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone,
});
const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone,
});

// "Friday, Oct 16 • 7:00 PM – 9:30 PM"
function formatWhen(startsAt, endsAt) {
  const start = new Date(startsAt);
  const times = endsAt
    ? `${timeFormat.format(start)} – ${timeFormat.format(new Date(endsAt))}`
    : timeFormat.format(start);
  return `${dateFormat.format(start)} • ${times}`;
}

export default function EventDetails() {
  const { id } = useParams();
  const event = getEventById(id);

  if (!event) {
    return (
      <div className="ed-page">
        <h1 className="ed-title">Event not found</h1>
        <Link className="ed-back" to="/">
          ← Back to events
        </Link>
      </div>
    );
  }

  // Keyed by id so Save/RSVP state resets when switching events.
  return <EventDetailsContent key={event.id} event={event} />;
}

function EventDetailsContent({ event }) {
  const [saved, setSaved] = useState(false);
  const [going, setGoing] = useState(false);
  const where = [event.location, event.price, event.ages]
    .filter(Boolean)
    .join(" • ");

  return (
    <div className="ed-page">
      <Link className="ed-back" to="/">
        ← Back to events
      </Link>

      <div className="ed-columns">
        <div className="ed-main">
          {event.imageUrl ? (
            <img className="ed-image" src={event.imageUrl} alt="" />
          ) : (
            <div className="ed-image" aria-hidden="true" />
          )}
          <h1 className="ed-title">{event.title}</h1>
          <p className="ed-when">{formatWhen(event.startsAt, event.endsAt)}</p>
          <p className="ed-where">{where}</p>
          <p className="ed-description">{event.description}</p>
        </div>

        <aside className="ed-side">
          <div className="ed-card ed-info">
            <p>
              <span className="ed-label">Organizer:</span> {event.organizer}
            </p>
            {event.verified && (
              <p className="ed-verified">✓ Verified organizer</p>
            )}
            {event.accessibility && (
              <p>
                <span className="ed-label">Accessibility:</span>{" "}
                {event.accessibility}
              </p>
            )}
            {event.transportation && (
              <p>
                <span className="ed-label">Transportation:</span>{" "}
                {event.transportation}
              </p>
            )}
            <div className="ed-actions">
              <button
                type="button"
                className="ed-save"
                aria-pressed={saved}
                onClick={() => setSaved(!saved)}
              >
                {saved ? "Saved" : "Save Event"}
              </button>
              <button
                type="button"
                className="ed-rsvp"
                aria-pressed={going}
                onClick={() => setGoing(!going)}
              >
                {going ? "Going" : "RSVP"}
              </button>
            </div>
          </div>
          <div className="ed-card ed-map">Map / location</div>
        </aside>
      </div>
    </div>
  );
}
