import { Link } from "react-router";
import { events } from "../data/events.js";
import { currentUser } from "../data/user.js";
import "../theme.css";
import "./Profile.css";

const timeZone = "America/New_York";
const dateFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone,
});

// What the organizer area shows for each verification status

const organizerStatus = {
  pending: {
    className: "pf-status-pending",
    text: "Organizer request pending review",
  },
  approved: { className: "pf-status-approved", text: "✓ Verified organizer" },
  rejected: {
    className: "pf-status-rejected",
    text: "Organizer request not approved",
  },
};

function initials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

// user defaults to the mock user so the page works before backend is connected

export default function Profile({ user = currentUser }) {
  const saved = events.filter((event) => user.savedEventIds.includes(event.id));
  const status = organizerStatus[user.organizerStatus];
  const canApply = !user.organizerStatus || user.organizerStatus === "rejected";

  return (
    <div className="pf-page">
      <section className="pf-header">
        <div className="pf-photo" aria-hidden="true">
          {initials(user.name)}
        </div>

        <div className="pf-info">
          <h1 className="pf-name">{user.name}</h1>
          <p className="pf-email">{user.email}</p>
          {user.preferences.length > 0 && (
            <p className="pf-prefs">
              <span className="pf-label">Preferences:</span>{" "}
              {user.preferences.join(" • ")}
            </p>
          )}

          {status && (
            <p className={`pf-status ${status.className}`}>{status.text}</p>
          )}

          <div className="pf-actions">
            {/* Editing is not implemented yet; the button only renders the wireframe. */}
            <button type="button" className="pf-btn">
              Edit Profile
            </button>
            {canApply && (
              <Link to="/organizer/verify" className="pf-btn pf-btn-primary">
                {user.organizerStatus === "rejected"
                  ? "Apply Again"
                  : "Become an Organizer"}
              </Link>
            )}
          </div>
        </div>
      </section>

      <hr className="pf-divider" />

      <h2 className="pf-section-title">Saved Events</h2>
      {saved.length === 0 ? (
        <p className="pf-empty">You haven't saved any events yet.</p>
      ) : (
        <div className="pf-grid">
          {saved.map((event) => (
            <Link to={`/events/${event.id}`} className="pf-card" key={event.id}>
              <div className="pf-card-image" aria-hidden="true" />
              <div className="pf-card-body">
                <h3 className="pf-card-title">{event.title}</h3>
                <p className="pf-card-meta">
                  {dateFormat.format(new Date(event.startsAt))} •{" "}
                  {event.location}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <h2 className="pf-section-title">Past / Attended</h2>
      {user.pastEvents.length === 0 ? (
        <p className="pf-empty">No past events yet.</p>
      ) : (
        <div className="pf-grid">
          {user.pastEvents.map((event) => (
            <article className="pf-card pf-card-past" key={event.id}>
              <div className="pf-card-body">
                <h3 className="pf-card-title">{event.title}</h3>
                <p className="pf-card-meta">
                  {dateFormat.format(new Date(event.startsAt))} •{" "}
                  {event.location}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
