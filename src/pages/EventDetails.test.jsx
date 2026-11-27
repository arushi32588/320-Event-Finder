import { afterEach, describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes, useParams } from 'react-router';
import EventDetails from './EventDetails.jsx';
import { fail, loggedInRoutes, mockApi, renderPage, resetApi } from '../test/api.jsx';

const movieNight = {
  id: '1',
  title: 'Community Outdoor Movie Night',
  description: 'Bring a blanket or lawn chair.',
  location: 'Amherst Town Common',
  startsAt: '2026-10-16T23:00:00Z',
  endsAt: '2026-10-17T01:30:00Z',
  organizer: 'Amherst Community Group',
  price: 'Free',
  ages: 'All ages',
  verified: true,
  accessibility: 'Wheelchair accessible',
  transportation: 'Bus / Walk / Parking',
  imageUrl: null,
};
const bareEvent = { id: '3', title: 'Hack Night', startsAt: '2026-10-17T22:00:00Z', organizer: 'Hack Club', verified: false };

const eventRoutes = {
  'GET /api/events/1': { event: movieNight },
  'GET /api/events/3': { event: bareEvent },
  'GET /api/events/999': fail(404, 'Event not found'),
};

function renderAt(path, extra = null) {
  return renderPage(
    <>
      <Routes>
        <Route path="/events/:id" element={<EventDetails />} />
        <Route path="/login" element={<h1>Login page</h1>} />
      </Routes>
      {extra}
    </>,
    { route: path },
  );
}

const loggedIn = (overrides = {}) => ({
  ...eventRoutes,
  ...loggedInRoutes(),
  'GET /api/events/1/save': { saved: false },
  'GET /api/events/1/rsvp': { going: false },
  'GET /api/events/3/save': { saved: false },
  'GET /api/events/3/rsvp': { going: false },
  'PUT /api/events/1/save': { saved: true },
  'DELETE /api/events/1/save': { saved: false },
  'PUT /api/events/1/rsvp': { going: true },
  'DELETE /api/events/1/rsvp': { going: false },
  ...overrides,
});

afterEach(resetApi);

describe('EventDetails', () => {
  it('loads the event from the backend and shows its details', async () => {
    mockApi(eventRoutes);
    renderAt('/events/1');
    expect(screen.getByRole('status')).toHaveTextContent(/loading event/i);
    expect(await screen.findByRole('heading', { level: 1, name: 'Community Outdoor Movie Night' })).toBeInTheDocument();
    expect(screen.getByText('Friday, Oct 16 • 7:00 PM – 9:30 PM')).toBeInTheDocument();
    expect(screen.getByText('Amherst Town Common • Free • All ages')).toBeInTheDocument();
    expect(screen.getByText(/Bring a blanket or lawn chair/)).toBeInTheDocument();
  });

  it('shows the organizer info card when every optional field is present', async () => {
    mockApi(eventRoutes);
    renderAt('/events/1');
    expect(await screen.findByText('Amherst Community Group')).toBeInTheDocument();
    expect(screen.getByText('✓ Verified organizer')).toBeInTheDocument();
    expect(screen.getByText('Wheelchair accessible')).toBeInTheDocument();
    expect(screen.getByText('Bus / Walk / Parking')).toBeInTheDocument();
  });

  it('hides optional fields the event does not have', async () => {
    mockApi(eventRoutes);
    renderAt('/events/3');
    await screen.findByRole('heading', { level: 1, name: 'Hack Night' });
    expect(screen.queryByText('✓ Verified organizer')).not.toBeInTheDocument();
    expect(screen.queryByText('Accessibility:')).not.toBeInTheDocument();
    expect(screen.queryByText('Transportation:')).not.toBeInTheDocument();
  });

  it('has a back link to the events list', async () => {
    mockApi(eventRoutes);
    renderAt('/events/1');
    expect(await screen.findByRole('link', { name: '← Back to events' })).toHaveAttribute('href', '/');
  });

  it('shows "Event not found" when the backend has no such event', async () => {
    mockApi(eventRoutes);
    renderAt('/events/999');
    expect(await screen.findByRole('heading', { level: 1, name: 'Event not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Back to events' })).toBeInTheDocument();
  });

  it('shows the error instead of "not found" when the server fails', async () => {
    mockApi({ 'GET /api/events/1': fail(500, 'Could not load this event. Please try again.') });
    renderAt('/events/1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this event');
    expect(screen.queryByText('Event not found')).not.toBeInTheDocument();
  });
});

describe('EventDetails: Save and RSVP', () => {
  it.each(['Save Event', 'RSVP'])('sends logged-out visitors to log in when clicking %s', async (name) => {
    mockApi(eventRoutes);
    const user = userEvent.setup();
    renderAt('/events/1');
    await user.click(await screen.findByRole('button', { name }));
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument();
  });

  it('shows what the user already did', async () => {
    mockApi(loggedIn({ 'GET /api/events/1/save': { saved: true }, 'GET /api/events/1/rsvp': { going: true } }));
    renderAt('/events/1');
    expect(await screen.findByRole('button', { name: 'Saved' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('button', { name: 'Going' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles Save Event on the server and back', async () => {
    const { callsTo } = mockApi(loggedIn());
    const user = userEvent.setup();
    renderAt('/events/1');
    await user.click(await screen.findByRole('button', { name: 'Save Event' }));
    await user.click(await screen.findByRole('button', { name: 'Saved' }));
    expect(await screen.findByRole('button', { name: 'Save Event' })).toHaveAttribute('aria-pressed', 'false');
    expect(callsTo('PUT', '/api/events/1/save')).toHaveLength(1);
    await waitFor(() => expect(callsTo('DELETE', '/api/events/1/save')).toHaveLength(1));
  });

  it('toggles RSVP on the server and back', async () => {
    const { callsTo } = mockApi(loggedIn());
    const user = userEvent.setup();
    renderAt('/events/1');
    await user.click(await screen.findByRole('button', { name: 'RSVP' }));
    await user.click(await screen.findByRole('button', { name: 'Going' }));
    expect(await screen.findByRole('button', { name: 'RSVP' })).toBeInTheDocument();
    expect(callsTo('PUT', '/api/events/1/rsvp')).toHaveLength(1);
    await waitFor(() => expect(callsTo('DELETE', '/api/events/1/rsvp')).toHaveLength(1));
  });

  it('undoes the change and explains when the RSVP fails', async () => {
    mockApi(loggedIn({ 'PUT /api/events/1/rsvp': fail(500, 'Could not save your RSVP. Please try again.') }));
    const user = userEvent.setup();
    renderAt('/events/1');
    await user.click(await screen.findByRole('button', { name: 'RSVP' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your RSVP');
    expect(screen.getByRole('button', { name: 'RSVP' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('resets Save/RSVP when switching to a different event', async () => {
    mockApi(loggedIn({ 'GET /api/events/1/save': { saved: true } }));
    const user = userEvent.setup();
    renderAt('/events/1', <Link to="/events/3">Go to event 3</Link>);
    await screen.findByRole('button', { name: 'Saved' });
    await user.click(screen.getByRole('link', { name: 'Go to event 3' }));
    await screen.findByRole('heading', { level: 1, name: 'Hack Night' });
    expect(screen.getByRole('button', { name: 'Save Event' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'RSVP' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('EventDetails: chat', () => {
  function renderWithMessages(path) {
    return renderPage(
      <Routes>
        <Route path="/events/:id" element={<EventDetails />} />
        <Route path="/login" element={<h1>Login page</h1>} />
        <Route path="/messages/:conversationId" element={<MessagesStub />} />
      </Routes>,
      { route: path },
    );
  }

  const groupChat = { id: '1', kind: 'group', event: { id: '1', title: movieNight.title, startsAt: movieNight.startsAt }, title: movieNight.title, lastMessage: null };

  it('locks the group chat until the user RSVPs', async () => {
    mockApi(loggedIn());
    const user = userEvent.setup();
    renderWithMessages('/events/1');
    const group = await screen.findByRole('button', { name: 'Group chat' });
    await waitFor(() => expect(group).toBeDisabled());
    expect(group).toHaveAccessibleDescription('RSVP to join the group chat.');
    await user.click(screen.getByRole('button', { name: 'RSVP' }));
    await waitFor(() => expect(group).toBeEnabled());
    expect(screen.queryByText('RSVP to join the group chat.')).not.toBeInTheDocument();
  });

  it('opens the event’s saved group chat for someone going', async () => {
    const { callsTo } = mockApi(loggedIn({
      'GET /api/events/1/rsvp': { going: true },
      'POST /api/events/1/conversations': { conversation: groupChat },
    }));
    const user = userEvent.setup();
    renderWithMessages('/events/1');
    const group = await screen.findByRole('button', { name: 'Group chat' });
    await waitFor(() => expect(group).toBeEnabled());
    await user.click(group);
    expect(await screen.findByRole('heading', { name: 'Conversation 1' })).toBeInTheDocument();
    expect(callsTo('POST', '/api/events/1/conversations')[0].body).toEqual({ kind: 'group' });
  });

  it('shows the server’s reason when it refuses the chat', async () => {
    mockApi(loggedIn({
      'GET /api/events/1/rsvp': { going: true },
      'POST /api/events/1/conversations': fail(403, 'RSVP to join the group chat.'),
    }));
    const user = userEvent.setup();
    renderWithMessages('/events/1');
    const group = await screen.findByRole('button', { name: 'Group chat' });
    await waitFor(() => expect(group).toBeEnabled());
    await user.click(group);
    expect(await screen.findByRole('alert')).toHaveTextContent('RSVP to join the group chat.');
    expect(group).toBeEnabled();
  });

  it('only offers the group chat (no direct messages)', async () => {
    mockApi(loggedIn());
    renderWithMessages('/events/1');
    await screen.findByRole('button', { name: 'Group chat' });
    expect(screen.queryByRole('button', { name: 'Message organizer' })).not.toBeInTheDocument();
  });

  it('sends logged-out visitors to log in when clicking Group chat', async () => {
    mockApi(eventRoutes);
    const user = userEvent.setup();
    renderWithMessages('/events/1');
    await user.click(await screen.findByRole('button', { name: 'Group chat' }));
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument();
  });
});

describe('EventDetails: registration link', () => {
  it('shows the registration card with a QR code when the event has a link', async () => {
    mockApi({ ...eventRoutes, 'GET /api/events/1': { event: { ...movieNight, registrationUrl: 'https://www.eventbrite.com/e/123' } } });
    renderAt('/events/1');
    const card = await screen.findByRole('region', { name: 'Register' });
    expect(card).toHaveTextContent('via eventbrite.com');
    expect(await screen.findByRole('img', { name: 'QR code for the registration link' })).toBeInTheDocument();
  });

  it('leaves the card out when there is no link', async () => {
    mockApi(eventRoutes);
    renderAt('/events/1');
    await screen.findByRole('heading', { name: movieNight.title });
    expect(screen.queryByRole('region', { name: /Register|Tickets/ })).not.toBeInTheDocument();
  });
});

function MessagesStub() {
  const { conversationId } = useParams();
  return <h1>Conversation {conversationId}</h1>;
}
