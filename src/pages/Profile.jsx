import { useEffect, useState } from "react";
import { Link } from "react-router";
import ChangePhotoDialog from "../components/ChangePhotoDialog.jsx";
import EventCardGrid from "../components/EventCardGrid.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import "../theme.css";
import "./Profile.css";

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

const submissionStatus = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Not approved",
};

function initials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export default function Profile() {
  const { user, setUser } = useAuth();
  const [lists, setLists] = useState(null);
  const [error, setError] = useState("");
  const [rejectionReason, setRejectionReason] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name ?? "");
  const [nameError, setNameError] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoEvent, setPhotoEvent] = useState(null);

  const isRejected = user.organizerStatus === "rejected";
  const status = organizerStatus[user.organizerStatus];
  const canApply = user.organizerStatus === "none" || isRejected;

  useEffect(() => {
    let current = true;
    Promise.all([
      api("/api/me/saved-events"),
      api("/api/me/rsvps"),
      api("/api/me/events"),
    ])
      .then(([saved, rsvps, submitted]) => {
        if (!current) return;
        setLists({
          saved: saved.events,
          rsvps: rsvps.events,
          submitted: submitted.events,
        });
      })
      .catch((err) => {
        if (current) setError(err.message);
      });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!isRejected) return undefined;
    let current = true;
    api("/api/organizer/verification-request")
      .then((data) => {
        if (current) setRejectionReason(data.request?.rejectionReason ?? null);
      })
      .catch(() => {
        // The status still shows; only the reason is missing.
      });
    return () => {
      current = false;
    };
  }, [isRejected]);

  async function saveName(e) {
    e.preventDefault();
    setSaving(true);
    setNameError("");
    try {
      const { profile } = await api("/api/me/profile", {
        method: "PATCH",
        body: { name },
      });
      setUser(profile);
      setEditing(false);
    } catch (err) {
      setNameError(err.fields?.name ?? err.message);
    } finally {
      setSaving(false);
    }
  }

  const now = new Date();
  const started = (event) => event.startsAt && new Date(event.startsAt) < now;
  const upcoming = lists?.rsvps.filter((event) => !started(event)) ?? [];
  const past = lists?.rsvps.filter(started) ?? [];

  return (
    <div className="pf-page">
      <section className="pf-header">
        <div className="pf-photo" aria-hidden="true">
          {initials(user.name)}
        </div>

        <div className="pf-info">
          <h1 className="pf-name">{user.name}</h1>
          <p className="pf-email">{user.email}</p>

          {status && (
            <p className={`pf-status ${status.className}`}>{status.text}</p>
          )}
          {isRejected && rejectionReason && (
            <p className="pf-prefs">
              <span className="pf-label">Reason:</span> {rejectionReason}
            </p>
          )}

          {editing ? (
            <form className="pf-actions" onSubmit={saveName}>
              <label>
                <span className="pf-label">Name </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={nameError ? "true" : undefined}
                />
              </label>
              <button type="submit" className="pf-btn pf-btn-primary" disabled={saving}>
                Save
              </button>
              <button type="button" className="pf-btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <div className="pf-actions">
              <button type="button" className="pf-btn" onClick={() => { setName(user.name ?? ""); setEditing(true); }}>
                Edit Profile
              </button>
              {canApply && (
                <Link to="/organizer/verify" className="pf-btn pf-btn-primary">
                  {isRejected ? "Apply Again" : "Become an Organizer"}
                </Link>
              )}
            </div>
          )}
          {nameError && <p className="app-error" role="alert">{nameError}</p>}
        </div>
      </section>

      <hr className="pf-divider" />

      {error && <p className="app-error" role="alert">{error}</p>}
      {!error && !lists && <p className="app-message" role="status">Loading…</p>}

      {lists && (
        <>
          <h2 className="pf-section-title">Saved Events</h2>
          {lists.saved.length === 0 ? (
            <p className="pf-empty">You haven't saved any events yet.</p>
          ) : (
            <EventCardGrid events={lists.saved} />
          )}

          <h2 className="pf-section-title">Going</h2>
          {upcoming.length === 0 ? (
            <p className="pf-empty">No upcoming RSVPs.</p>
          ) : (
            <EventCardGrid events={upcoming} />
          )}

          <h2 className="pf-section-title">Past / Attended</h2>
          {past.length === 0 ? (
            <p className="pf-empty">No past events yet.</p>
          ) : (
            <EventCardGrid events={past} past />
          )}

          {lists.submitted.length > 0 && (
            <>
              <h2 className="pf-section-title">Events You Submitted</h2>
              <EventCardGrid
                events={lists.submitted}
                renderExtra={(event) => (
                  <p className="pf-card-meta">{submissionStatus[event.status]}</p>
                )}
                renderActions={(event) => (
                  <button
                    type="button"
                    className="pf-btn"
                    aria-label={`Change photo for ${event.title}`}
                    onClick={() => setPhotoEvent(event)}
                  >
                    Change photo
                  </button>
                )}
              />
            </>
          )}
          {photoEvent && (
            <ChangePhotoDialog event={photoEvent} onClose={() => setPhotoEvent(null)} />
          )}
        </>
      )}
    </div>
  );
}
