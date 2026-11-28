import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { sampleUsers } from "../data/adminUsers.js";
import "./AdminUsers.css";

const joinedDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

const roleFilters = [
  { value: "all", label: "All roles" },
  { value: "attendee", label: "Attendees" },
  { value: "organizer", label: "Organizers" },
  { value: "admin", label: "Admins" },
];

const roleLabel = { attendee: "Attendee", organizer: "Organizer", admin: "Admin" };

const organizerLabel = {
  pending: "Organizer request pending",
  rejected: "Organizer request not approved",
};

// Admin tab listing every user, with search and a role filter
// Uses sample data while the backend endpoint doesn't exist yet (404)

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [usingSample, setUsingSample] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");

  useEffect(() => {
    let current = true;
    api("/api/admin/users")
      .then((data) => {
        if (current) setUsers(data.users);
      })
      .catch((err) => {
        if (!current) return;
        if (err.status === 404) {
          setUsers(sampleUsers);
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

  const query = search.trim().toLowerCase();
  const shown = users.filter(
    (u) =>
      (role === "all" || u.role === role) &&
      (!query ||
        u.name?.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query)),
  );

  return (
    <section className="ad-section au-section">
      <h2 className="ad-section-title">Users</h2>
      <p className="au-summary">
        {users.length} {users.length === 1 ? "user" : "users"}
      </p>

      {usingSample && (
        <p className="au-note">
          Showing sample data until the users backend is ready.
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

      {!loading && !error && (
        <>
          <div className="au-controls">
            <label className="au-field">
              <span className="au-label">Search users</span>
              <input
                type="search"
                placeholder="Name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="au-field">
              <span className="au-label">Filter by role</span>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {roleFilters.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {users.length === 0 ? (
            <p className="ad-empty">No users yet.</p>
          ) : shown.length === 0 ? (
            <p className="ad-empty">No users match your search.</p>
          ) : (
            <div className="ad-list">
              {shown.map((u) => (
                <article className="ad-row au-row" key={u.id}>
                  <div className="ad-row-main">
                    <div className="ad-row-text">
                      <h3 className="ad-row-name">{u.name}</h3>
                      <p className="ad-row-meta">
                        {[
                          u.email,
                          u.joinedAt &&
                            `Joined ${joinedDate.format(new Date(u.joinedAt))}`,
                        ]
                          .filter(Boolean)
                          .join(" • ")}
                      </p>
                    </div>
                    <div className="au-badges">
                      <span className={`au-badge au-badge-${u.role}`}>
                        {roleLabel[u.role] ?? u.role}
                      </span>
                      {organizerLabel[u.organizerStatus] && (
                        <span className="au-badge au-badge-status">
                          {organizerLabel[u.organizerStatus]}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}