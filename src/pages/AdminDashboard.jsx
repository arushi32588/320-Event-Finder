import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import '../theme.css';
import './AdminDashboard.css';

const timeZone = 'America/New_York';
const shortDate = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone });
const longDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone });
const submittedDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone });
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone });

const views = [
  { id: 'overview', label: 'Overview' },
  { id: 'organizers', label: 'Organizer Requests' },
  { id: 'events', label: 'Event Approvals' },
  { id: 'users', label: 'Users' },
  { id: 'reports', label: 'Reports' },
];

// "Friday, Nov 13 • 6:00 PM – 8:00 PM"
function formatWhen(startsAt, endsAt) {
  const start = new Date(startsAt);
  const times = endsAt
    ? `${timeFormat.format(start)} – ${timeFormat.format(new Date(endsAt))}`
    : timeFormat.format(start);
  return `${longDate.format(start)} • ${times}`;
}

function organizerRow(request) {
  return {
    key: `org-${request.id}`,
    canGiveReason: true,
    name: request.organizationName,
    meta: [request.applicant.name, request.applicant.email].filter(Boolean).join(' • '),
    details: [
      ['Description', request.description],
      ['Address', request.address],
      ['Website', request.website && (
        <a href={request.website} target="_blank" rel="noreferrer">{request.website}</a>
      )],
      ['Contact email', request.contactEmail],
      ['Verification document', request.documentUrl && (
        <a href={request.documentUrl} target="_blank" rel="noreferrer">View document</a>
      )],
      ['Submitted', submittedDate.format(new Date(request.submittedAt))],
    ],
  };
}

function eventRow(event) {
  const start = new Date(event.startsAt);
  return {
    key: `event-${event.id}`,
    name: event.title,
    meta: [event.organizer, shortDate.format(start), timeFormat.format(start), event.location]
      .filter(Boolean)
      .join(' • '),
    details: [
      ['When', formatWhen(event.startsAt, event.endsAt)],
      ['Description', event.description],
      ['Price', event.price],
      ['Ages', event.ages],
      ['Accessibility', event.accessibility],
    ],
  };
}

export default function AdminDashboard() {
  const { user } = useAuth();
  if (user?.role !== 'admin') {
    return (
      <div className="ad-page">
        <h1 className="ad-title">Admin Dashboard</h1>
        <p className="app-error" role="alert">Only admins can view this page.</p>
      </div>
    );
  }
  return <AdminContent />;
}

function AdminContent() {
  const [view, setView] = useState('overview');
  const [requests, setRequests] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expanded, setExpanded] = useState([]);
  const [requestStatus, setRequestStatus] = useState('');
  const [eventStatus, setEventStatus] = useState('');

  useEffect(() => {
    let current = true;
    Promise.all([api('/api/admin/verification-requests'), api('/api/admin/events')])
      .then(([requestData, eventData]) => {
        if (!current) return;
        setRequests(requestData.requests);
        setEvents(eventData.events);
      })
      .catch((err) => {
        if (current) setLoadError(err.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);

  function toggleExpanded(key) {
    setExpanded(expanded.includes(key) ? expanded.filter((k) => k !== key) : [...expanded, key]);
  }

  // A row only leaves the list once the server has saved the decision. If it was
  // already reviewed by another admin it leaves too, since there's nothing to do.
  async function decideRequest(request, decision, reason) {
    const action = decision === 'Approved' ? 'approve' : 'reject';
    try {
      await api(`/api/admin/verification-requests/${request.id}/${action}`, {
        method: 'POST',
        body: action === 'reject' && reason ? { reason } : undefined,
      });
      setRequests((list) => list.filter((r) => r.id !== request.id));
      setRequestStatus(`${decision} ${request.organizationName}.`);
    } catch (err) {
      if (err.status === 409) setRequests((list) => list.filter((r) => r.id !== request.id));
      setRequestStatus(`Could not update ${request.organizationName}: ${err.message}`);
    }
  }

  async function decideEvent(event, decision) {
    const action = decision === 'Approved' ? 'approve' : 'reject';
    try {
      await api(`/api/admin/events/${event.id}/${action}`, { method: 'POST' });
      setEvents((list) => list.filter((e) => e.id !== event.id));
      setEventStatus(`${decision} ${event.title}.`);
    } catch (err) {
      if (err.status === 409) setEvents((list) => list.filter((e) => e.id !== event.id));
      setEventStatus(`Could not update ${event.title}: ${err.message}`);
    }
  }

  const current = views.find((v) => v.id === view);

  return (
    <div className="ad-page">
      <h1 className="ad-title">Admin Dashboard</h1>
      <p className="ad-subtitle">Review organizer applications and event submissions.</p>

      <div className="ad-columns">
        <nav className="ad-sidebar" aria-label="Admin sections">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              className="ad-nav-item"
              aria-current={view === v.id ? 'page' : undefined}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </nav>

        <div className="ad-content">
          {loadError && <p className="app-error" role="alert">{loadError}</p>}
          {loading && <p className="app-message" role="status">Loading…</p>}

          {!loading && !loadError && (view === 'overview' || view === 'organizers') && (
            <ReviewSection
              title="Pending Organizer Requests"
              emptyText="No pending organizer requests."
              status={requestStatus}
              items={requests}
              toRow={organizerRow}
              expanded={expanded}
              onToggle={toggleExpanded}
              onDecide={decideRequest}
            />
          )}

          {!loading && !loadError && (view === 'overview' || view === 'events') && (
            <ReviewSection
              title="Pending Event Approvals"
              emptyText="No pending events."
              status={eventStatus}
              items={events}
              toRow={eventRow}
              expanded={expanded}
              onToggle={toggleExpanded}
              onDecide={decideEvent}
            />
          )}

          {(view === 'users' || view === 'reports') && (
            <section className="ad-section">
              <h2 className="ad-section-title">{current.label}</h2>
              <p className="ad-empty">Coming soon.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewSection({ title, emptyText, status, items, toRow, expanded, onToggle, onDecide }) {
  return (
    <section className="ad-section">
      <h2 className="ad-section-title">{title}</h2>
      <p className="ad-status" role="status">{status}</p>

      {items.length === 0 ? (
        <p className="ad-empty">{emptyText}</p>
      ) : (
        <div className="ad-list">
          {items.map((item) => {
            const row = toRow(item);
            return (
              <ReviewRow
                key={row.key}
                row={row}
                open={expanded.includes(row.key)}
                onToggle={() => onToggle(row.key)}
                onApprove={() => onDecide(item, 'Approved')}
                onReject={(reason) => onDecide(item, 'Rejected', reason)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function ReviewRow({ row, open, onToggle, onApprove, onReject }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const panelId = `ad-details-${row.key}`;
  const details = row.details.filter(([, value]) => value);

  async function decide(action) {
    setBusy(true);
    await action();
    setBusy(false);
  }

  return (
    <article className="ad-row">
      <div className="ad-row-main">
        <div className="ad-row-text">
          <h3 className="ad-row-name">{row.name}</h3>
          <p className="ad-row-meta">{row.meta}</p>
        </div>
        <div className="ad-row-actions">
          <button
            type="button"
            className="ad-review"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={onToggle}
          >
            {open ? 'Hide details' : 'Review'}
          </button>
          <button type="button" className="ad-approve" disabled={busy} onClick={() => decide(onApprove)}>
            Approve
          </button>
        </div>
      </div>

      {open && (
        <div className="ad-details" id={panelId}>
          <dl>
            {details.map(([label, value]) => (
              <div className="ad-detail" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {row.canGiveReason && (
            <label className="ad-reason">
              Reason for rejecting (optional)
              <textarea rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          )}
          <button type="button" className="ad-reject" disabled={busy} onClick={() => decide(() => onReject(reason.trim()))}>
            Reject
          </button>
        </div>
      )}
    </article>
  );
}
