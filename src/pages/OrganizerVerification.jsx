import { useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import "../theme.css";
import "./OrganizerVerification.css";

// Fields in the wireframes order
const fields = [
  {
    id: "org-name",
    name: "organizationName",
    label: "Organization Name",
    type: "text",
    required: true,
    autoComplete: "organization",
  },
  {
    id: "org-description",
    name: "description",
    label: "Organization Description",
    type: "textarea",
    required: true,
  },
  {
    id: "org-address",
    name: "address",
    label: "Organization Address",
    type: "text",
    autoComplete: "street-address",
  },
  {
    id: "org-website",
    name: "website",
    label: "Website or Social Media",
    type: "text",
    placeholder: "instagram.com/yourorg or https://…",
  },
  {
    id: "org-email",
    name: "contactEmail",
    label: "Contact Email",
    type: "email",
    required: true,
    placeholder: "contact@yourorg.org",
    autoComplete: "email",
  },
];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(values) {
  const errors = {};
  for (const field of fields) {
    if (field.required && !values[field.name]?.trim()) {
      errors[field.name] = `${field.label} is required.`;
    }
  }
  if (
    values.contactEmail?.trim() &&
    !emailPattern.test(values.contactEmail.trim())
  ) {
    errors.contactEmail = "Enter a valid email address.";
  }
  return errors;
}

export default function OrganizerVerification() {
  const { refreshUser } = useAuth();
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const found = validate(values);
    setErrors(found);
    setMessage("");
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await api("/api/organizer/verification-request", {
        method: "POST",
        body: {
          organizationName: values.organizationName,
          description: values.description,
          address: values.address,
          website: values.website,
          contactEmail: values.contactEmail,
          documentUrl: values.proofLink,
        },
      });
      setSubmitted(true);
      // Updates the status shown on the profile; a failure here is harmless.
      refreshUser().catch(() => {});
    } catch (err) {
      const { documentUrl, ...fields } = err.fields ?? {};
      setErrors({ ...fields, proofLink: documentUrl });
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="ov-page">
        <div className="ov-card ov-success" role="status">
          <h1 className="ov-title">Request sent!</h1>
          <p className="ov-subtitle">
            An admin will review your organization. You can check your status on
            your profile.
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
      <h1 className="ov-title">Become a Verified Organizer</h1>
      <p className="ov-subtitle">
        Submit information about your organization. An admin will review your
        request before you can publish events.
      </p>

      {message && <p className="app-error" role="alert">{message}</p>}

      <form className="ov-card" onSubmit={handleSubmit} noValidate>
        {fields.map((field) => {
          const error = errors[field.name];
          const props = {
            id: field.id,
            name: field.name,
            placeholder: field.placeholder,
            autoComplete: field.autoComplete,
            "aria-invalid": error ? "true" : undefined,
            "aria-describedby": error ? `${field.id}-error` : undefined,
          };
          return (
            <div className="ov-field" key={field.id}>
              <label htmlFor={field.id}>
                {field.label}
                {field.required && (
                  <span className="ov-required" aria-hidden="true">
                    {" "}
                    *
                  </span>
                )}
              </label>
              {field.type === "textarea" ? (
                <textarea {...props} rows={4} />
              ) : (
                <input {...props} type={field.type} />
              )}
              {error && (
                <p className="ov-error" id={`${field.id}-error`}>
                  {error}
                </p>
              )}
            </div>
          );
        })}

        <div className="ov-field">
          <label htmlFor="org-proof-link">Supporting Proof (optional)</label>
          <input
            id="org-proof-link"
            name="proofLink"
            type="url"
            placeholder="Paste a link (Google Drive, website…)"
            aria-invalid={errors.proofLink ? "true" : undefined}
          />
          {errors.proofLink && <p className="ov-error">{errors.proofLink}</p>}
          <div className="ov-bottom-row">
            {/* File uploads need Supabase Storage set up; links work for now. */}
            <span className="ov-upload" aria-disabled="true" title="Coming soon">
              File upload coming soon
            </span>
            <button type="submit" className="ov-submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
