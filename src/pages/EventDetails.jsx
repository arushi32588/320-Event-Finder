import { Link } from 'react-router';
import './EventDetails.css';

// Placeholder event matching the wireframe until event data is wired up.
const event = {
  title: 'Community Outdoor Movie Night',
  date: 'Friday, Oct 16',
  time: '7:00 PM – 9:30 PM',
  location: 'Amherst Town Common',
  price: 'Free',
  ages: 'All ages',
  description:
    'Description of the event goes here. Include accessibility, indoor/outdoor details, transportation options, and external contact information.',
  organizer: 'Amherst Community Group',
  verified: true,
  accessibility: 'Wheelchair accessible',
  transportation: 'Bus / Walk / Parking',
};

export default function EventDetails() {
  return (
    <div className="ed-page">
      <Link className="ed-back" to="/events">← Back to events</Link>

      <div className="ed-columns">
        <div className="ed-main">
          <div className="ed-image">EVENT IMAGE</div>
          <h1 className="ed-title">{event.title}</h1>
          <p className="ed-when">{event.date} • {event.time}</p>
          <p className="ed-where">{event.location} • {event.price} • {event.ages}</p>
          <p className="ed-description">{event.description}</p>
        </div>

        <aside className="ed-side">
          <div className="ed-info">
            <p className="ed-organizer">Organizer: {event.organizer}</p>
            {event.verified && <p className="ed-verified">✓ Verified organizer</p>}
            <p className="ed-accessibility">Accessibility: {event.accessibility}</p>
            <p className="ed-transportation">Transportation: {event.transportation}</p>
            <div className="ed-actions">
              <button type="button" className="ed-save">Save Event</button>
              <button type="button" className="ed-rsvp">RSVP</button>
            </div>
          </div>
          <div className="ed-map">MAP / LOCATION</div>
        </aside>
      </div>
    </div>
  );
}
