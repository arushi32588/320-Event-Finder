import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { sampleImport } from "../data/importedEvents.js";
import "./ImportedEvents.css";

const timeZone = "America/New_York";
const eventDate = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone,
});
const importDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone,
});

const statusLabel = {
  pending: "Needs review",
  approved: "Published",
  rejected: "Hidden",
};

// Admin tab for events pulled in from outside sites (source = 'scraped')
// Uses sample data while the backend endpoint doesn't exist yet (404)

export default function ImportedEvents() {
  const [events, setEvents] = useState([]);
  const [lastImportedAt, setLastImportedAt] = useState(null);
  const [usingSample, setUsingSample] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let current = true;
    api("/api/admin/imported-events")
      .then((data) => {
        if (!current) return;
        setEvents(data.events);
        setLastImportedAt(data.lastImportedAt ?? null);
      })
      .catch((err) => {
        if (!current) return;
        if (err.status === 404) {
          setEvents(sampleImport.events);
          setLastImportedAt(sampleImport.lastImportedAt);
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

  async function runImport() {
    setImporting(true);
    setStatus("");
    try {
      const data = await api("/api/admin/import", { method: "POST" });
      setEvents(data.events);
      setLastImportedAt(data.lastImportedAt ?? new Date().toISOString());
      setStatus(`Import finished: ${data.imported ?? 0} new events.`);
    } catch (err) {
      setStatus(
        err.status === 404
          ? "Import isn't connected to the backend yet."
          : err.message,
      );
    } finally {
      setImporting(false);
    }
  }

  // Imported events are normal events, so they use the same approve/reject endpoints

  async function decide(event, action) {
    const newStatus = action === "approve" ? "approved" : "rejected";
    try {
      if (!usingSample)
        await api(`/api/admin/events/${event.id}/${action}`, {
          method: "POST",
        });
      setEvents((list) =>
        list.map((e) => (e.id === event.id ? { ...e, status: newStatus } : e)),
      );
      setStatus(
        `${action === "approve" ? "Published" : "Hid"} ${event.title}.`,
      );
    } catch (err) {
      setStatus(`Could not update ${event.title}: ${err.message}`);
    }
  }

  const pending = events.filter((e) => e.status === "pending").length;

  return (
    <section className="ad-section ie-section">
      <div className="ie-header">
        <div>
          <h2 className="ad-section-title">Imported Events</h2>
          <p className="ie-summary">
            {events.length} imported • {pending} need review
            {lastImportedAt && (
              <> • Last import: {importDate.format(new Date(lastImportedAt))}</>
            )}
          </p>
        </div>
        <button
          type="button"
          className="ad-review ie-import"
          onClick={runImport}
          disabled={importing}
        >
          {importing ? "Importing…" : "Import now"}
        </button>
      </div>

      {usingSample && (
        <p className="ie-note">
          Showing sample data until the import backend is ready.
        </p>
      )}
      <p className="ad-status" role="status">
        {status}
      </p>

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

      {!loading && !error && events.length === 0 && (
        <p className="ad-empty">
          No imported events yet. Click "Import now" to check for new ones.
        </p>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="ad-list">
          {events.map((event) => (
            <article className="ad-row ie-row" key={event.id}>
              <div className="ad-row-main">
                <div className="ad-row-text">
                  <h3 className="ad-row-name">{event.title}</h3>
                  <p className="ad-row-meta">
                    {[
                      event.startsAt &&
                        eventDate.format(new Date(event.startsAt)),
                      event.location,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </p>
                  <p className="ie-source">
                    From{" "}
                    {event.sourceUrl ? (
                      <a
                        href={event.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {event.sourceName}
                      </a>
                    ) : (
                      event.sourceName
                    )}
                    <span className={`ie-badge ie-badge-${event.status}`}>
                      {statusLabel[event.status] ?? event.status}
                    </span>
                  </p>
                </div>
                {event.status === "pending" && (
                  <div className="ad-row-actions">
                    <button
                      type="button"
                      className="ad-approve"
                      onClick={() => decide(event, "approve")}
                    >
                      Publish
                    </button>
                    <button
                      type="button"
                      className="ad-reject"
                      onClick={() => decide(event, "reject")}
                    >
                      Hide
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
