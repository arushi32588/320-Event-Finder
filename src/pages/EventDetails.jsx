import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import EventPoster from '../components/EventPoster.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import '../theme.css';
import './EventDetails.css';

const timeZone = 'America/New_York';
const dateFormat = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone });
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone });

// "Friday, Oct 16 • 7:00 PM – 9:30 PM"
function formatWhen(startsAt, endsAt) {
  const start = new Date(startsAt);
  const times = endsAt
    ? `${timeFormat.format(start)} – ${timeFormat.format(new Date(endsAt))}`
    : timeFormat.format(start);
  return `${dateFormat.format(start)} • ${times}`;
}

export default function EventDetails() {
  const { id } = useParams();
  const [state, setState] = useState({ id: null, event: null, error: '', notFound: false });

  useEffect(() => {
    let current = true;
    api(`/api/events/${id}`)
      .then(({ event }) => {
        if (current) setState({ id, event, error: '', notFound: false });
      })
      .catch((err) => {
        if (!current) return;
        const notFound = err.status === 404 || err.status === 400;
        setState({ id, event: null, error: notFound ? '' : err.message, notFound });
      });
    return () => {
      current = false;
    };
  }, [id]);

  if (state.id !== id) return <p className="app-message" role="status">Loading event…</p>;

  if (state.error) {
    return (
      <div className="ed-page">
        <p className="app-error" role="alert">{state.error}</p>
        <Link className="ed-back" to="/">← Back to events</Link>
      </div>
    );
  }

  if (state.notFound) {
    return (
      <div className="ed-page">
        <h1 className="ed-title">Event not found</h1>
        <Link className="ed-back" to="/">← Back to events</Link>
      </div>
    );
  }

  // Keyed by id so Save/RSVP state resets when switching events.
  return <EventDetailsContent key={state.event.id} event={state.event} />;
}

function EventDetailsContent({ event }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [saved, setSaved] = useState(false);
  const [going, setGoing] = useState(false);
  const [error, setError] = useState('');
  const userId = user?.id;

  // Show what this user already did on this event.
  useEffect(() => {
    if (!userId) return undefined;
    let current = true;
    Promise.all([api(`/api/events/${event.id}/save`), api(`/api/events/${event.id}/rsvp`)])
      .then(([savedData, rsvpData]) => {
        if (!current) return;
        setSaved(savedData.saved);
        setGoing(rsvpData.going);
      })
      .catch(() => {
        // The event still shows; the buttons just start off.
      });
    return () => {
      current = false;
    };
  }, [event.id, userId]);

  async function toggle(path, isOn, setOn) {
    if (!userId) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    setError('');
    setOn(!isOn);
    try {
      await api(`/api/events/${event.id}/${path}`, { method: isOn ? 'DELETE' : 'PUT' });
    } catch (err) {
      setOn(isOn);
      setError(err.message);
    }
  }

  const where = [event.location, event.price, event.ages].filter(Boolean).join(' • ');

  return (
    <div className="ed-page">
      <Link className="ed-back" to="/">← Back to events</Link>

      <div className="ed-columns">
        <div className="ed-main">
          <div className="ed-image">
            <EventPoster event={event} />
          </div>
          <h1 className="ed-title">{event.title}</h1>
          <p className="ed-when">{formatWhen(event.startsAt, event.endsAt)}</p>
          <p className="ed-where">{where}</p>
          <p className="ed-description">{event.description}</p>
        </div>

        <aside className="ed-side">
          <div className="ed-card ed-info">
            <p><span className="ed-label">Organizer:</span> {event.organizer}</p>
            {event.verified && <p className="ed-verified">✓ Verified organizer</p>}
            {event.accessibility && (
              <p><span className="ed-label">Accessibility:</span> {event.accessibility}</p>
            )}
            {event.transportation && (
              <p><span className="ed-label">Transportation:</span> {event.transportation}</p>
            )}
            <div className="ed-actions">
              <button
                type="button"
                className="ed-save"
                aria-pressed={saved}
                onClick={() => toggle('save', saved, setSaved)}
              >
                {saved ? 'Saved' : 'Save Event'}
              </button>
              <button
                type="button"
                className="ed-rsvp"
                aria-pressed={going}
                onClick={() => toggle('rsvp', going, setGoing)}
              >
                {going ? 'Going' : 'RSVP'}
              </button>
            </div>
            {error && <p className="app-error" role="alert">{error}</p>}
          </div>
          <div className="ed-card ed-map">Map coming soon</div>
        </aside>
      </div>
    </div>
  );
}
