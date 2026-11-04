import { useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api.js";
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
  { name: "imageUrl", label: "Image Link", type: "url", placeholder: "https://…" },
  { name: "organizerName", label: "Organizer Name", type: "text" },
];

// datetime-local gives local time with no zone; the backend needs an exact moment.
function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

export default function SubmitEvent() {
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setSubmitting(true);
    setErrors({});
    setMessage("");
    try {
      const { event } = await api("/api/me/events", {
        method: "POST",
        body: { ...values, startsAt: toIso(values.startsAt), endsAt: toIso(values.endsAt) },
      });
      setSubmitted(event);
    } catch (err) {
      setErrors(err.fields ?? {});
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="ov-page">
        <div className="ov-card ov-success" role="status">
          <h1 className="ov-title">Event submitted!</h1>
          <p className="ov-subtitle">
            An admin will review {submitted.title}. It appears on the site once approved, and you can
            check its status on your profile.
          </p>
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

      <form className="ov-card" onSubmit={handleSubmit} noValidate>
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
            <div className="ov-field" key={field.name}>
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
          );
        })}
        <div className="ov-bottom-row">
          <button type="submit" className="ov-submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Event"}
          </button>
        </div>
      </form>
    </div>
  );
}
