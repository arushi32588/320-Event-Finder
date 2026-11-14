import { Fragment, useState } from "react";
import { Link } from "react-router";
import CoverPhotoPicker from "../components/CoverPhotoPicker.jsx";
import { api } from "../lib/api.js";
import { uploadEventImage } from "../lib/eventImages.js";
import "../theme.css";
import "./OrganizerVerification.css";

const fields = [
  { name: "title", label: "Event Name", type: "text", required: true },
  { name: "startsAt", label: "Starts", type: "datetime-local", required: true },
  { name: "endsAt", label: "Ends", type: "datetime-local" },
  { name: "location", label: "Location", type: "text" },
  { name: "description", label: "Description", type: "textarea" },
  { name: "price", label: "Price", type: "text", placeholder: "Free, or an amount like 12.50" },
  { name: "ages", label: "Age Range", type: "text", placeholder: "All ages, 18+…" },
  { name: "accessibility", label: "Accessibility", type: "text", placeholder: "Wheelchair accessible…" },
  { name: "transportation", label: "Transportation", type: "text", placeholder: "Bus / Walk / Parking" },
  { name: "organizerName", label: "Organizer Name", type: "text" },
];

// datetime-local gives local time with no zone; the backend needs an exact moment.
function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

export default function SubmitEvent() {
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState(null); // null, "event" or "photo"
  const [submitted, setSubmitted] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState({ startsAt: "", price: "" });

  // The photo preview shows the date ticket and Free sticker as they'll appear.
  function handleFormChange(e) {
    const { name, value } = e.target;
    if (name === "startsAt" || name === "price") setPreview((old) => ({ ...old, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setPhase("event");
    setErrors({});
    setMessage("");
    let event;
    try {
      ({ event } = await api("/api/me/events", {
        method: "POST",
        body: { ...values, startsAt: toIso(values.startsAt), endsAt: toIso(values.endsAt) },
      }));
    } catch (err) {
      setErrors(err.fields ?? {});
      setMessage(err.message);
      setPhase(null);
      return;
    }

    // The event exists now, so a failed photo upload doesn't undo it.
    let photoFailed = false;
    if (photo) {
      setPhase("photo");
      try {
        await uploadEventImage(event.id, photo);
      } catch {
        photoFailed = true;
      }
    }
    setPhase(null);
    setSubmitted({ event, photoFailed });
  }

  let startsAt = null;
  try {
    startsAt = toIso(preview.startsAt);
  } catch {
    // Half-typed dates have no preview date yet.
  }
  const previewEvent = {
    id: "new",
    startsAt,
    price: preview.price.trim().toLowerCase() === "free" ? "Free" : null,
  };

  if (submitted) {
    return (
      <div className="ov-page">
        <div className="ov-card ov-success" role="status">
          <h1 className="ov-title">Event submitted!</h1>
          <p className="ov-subtitle">
            An admin will review {submitted.event.title}. It appears on the site once approved, and you can
            check its status on your profile.
          </p>
          {submitted.photoFailed && (
            <p className="app-error" role="alert">
              Your event was submitted, but the photo didn't upload. You can add it from your profile.
            </p>
          )}
          <Link to="/profile" className="ov-submit ov-link-button">
            Back to Profile
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ov-page">
      <h1 className="ov-title">Submit an Event</h1>
      <p className="ov-subtitle">An admin will review your event before it appears on the site.</p>

      {message && <p className="app-error" role="alert">{message}</p>}

      <form className="ov-card" onSubmit={handleSubmit} onChange={handleFormChange} noValidate>
        {fields.map((field) => {
          const id = `event-${field.name}`;
          const error = errors[field.name];
          const props = {
            id,
            name: field.name,
            placeholder: field.placeholder,
            "aria-invalid": error ? "true" : undefined,
            "aria-describedby": error ? `${id}-error` : undefined,
          };
          return (
            <Fragment key={field.name}>
              <div className="ov-field">
                <label htmlFor={id}>
                  {field.label}
                  {field.required && <span className="ov-required" aria-hidden="true"> *</span>}
                </label>
                {field.type === "textarea" ? (
                  <textarea {...props} rows={4} />
                ) : (
                  <input {...props} type={field.type} />
                )}
                {error && <p className="ov-error" id={`${id}-error`}>{error}</p>}
              </div>
              {field.name === "description" && (
                <div className="ov-field">
                  <CoverPhotoPicker id="event-photo" file={photo} onChange={setPhoto} previewEvent={previewEvent} />
                </div>
              )}
            </Fragment>
          );
        })}
        <div className="ov-bottom-row">
          <button type="submit" className="ov-submit" disabled={phase !== null}>
            {phase === "photo" ? "Uploading photo…" : phase === "event" ? "Submitting…" : "Submit Event"}
          </button>
        </div>
      </form>
    </div>
  );
}
