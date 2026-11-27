import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { sampleReports } from "../data/adminReports.js";
import "./AdminReports.css";

const cards = [
  { key: "totalUsers", label: "Total users" },
  { key: "organizers", label: "Verified organizers" },
  { key: "pendingOrganizerRequests", label: "Pending organizer requests" },
  { key: "pendingEvents", label: "Events awaiting approval" },
  { key: "approvedEvents", label: "Published events" },
  { key: "totalRsvps", label: "Total RSVPs" },
];

// Admin tab with simple summary counts (cards, no charts)
// Uses sample data while the backend endpoint doesn't exist yet (404)

export default function AdminReports() {
  const [reports, setReports] = useState(null);
  const [usingSample, setUsingSample] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    api("/api/admin/reports")
      .then((data) => {
        if (current) setReports(data.reports);
      })
      .catch((err) => {
        if (!current) return;
        if (err.status === 404) {
          setReports(sampleReports);
          setUsingSample(true);
        } else {
          setError(err.message);
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);

  return (
    <section className="ad-section ar-section">
      <h2 className="ad-section-title">Reports</h2>
      <p className="ar-summary">A quick look at how the site is doing.</p>

      {usingSample && (
        <p className="ar-note">
          Showing sample data until the reports backend is ready.
        </p>
      )}

      {loading && (
        <p className="app-message" role="status">
          Loading…
        </p>
      )}
      {error && (
        <p className="app-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && reports && (
        <dl className="ar-grid">
          {cards.map((card) => (
            <div className="ar-card" key={card.key}>
              <dt className="ar-label">{card.label}</dt>
              <dd className="ar-value">{reports[card.key] ?? 0}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}