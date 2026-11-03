import { useState } from "react";
import { Link } from "react-router";
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
  const [errors, setErrors] = useState({});
  const [fileName, setFileName] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // The request is not sent to the backend yet
  // This only validates and shows the confirmation

  function handleSubmit(e) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length === 0) setSubmitted(true);
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
          />
          <div className="ov-bottom-row">
            <input
              id="org-proof"
              name="proof"
              type="file"
              className="ov-file-input"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            />
            <label htmlFor="org-proof" className="ov-upload">
              {fileName || "or upload a file"}
            </label>
            <button type="submit" className="ov-submit">
              Submit Request
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
