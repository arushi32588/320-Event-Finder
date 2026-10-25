import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import EventDetails from './EventDetails.jsx';

function renderAt(path, extra = null) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetails />} />
      </Routes>
      {extra}
    </MemoryRouter>,
  );
}

describe('EventDetails', () => {
  // Main column content renders for a known event.
  it('shows the title, date, place and description for an event', () => {
    renderAt('/events/1');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Community Outdoor Movie Night' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Friday, Oct 16 • 7:00 PM – 9:30 PM')).toBeInTheDocument();
    expect(screen.getByText('Amherst Town Common • Free • All ages')).toBeInTheDocument();
    expect(screen.getByText(/Bring a blanket or lawn chair/)).toBeInTheDocument();
  });

  // Sidebar card shows organizer, verified badge, accessibility and transportation.
  it('shows the organizer info card when every optional field is present', () => {
    renderAt('/events/1');

    expect(screen.getByText('Amherst Community Group')).toHaveTextContent(
      'Organizer: Amherst Community Group',
    );
    expect(screen.getByText('✓ Verified organizer')).toBeInTheDocument();
    expect(screen.getByText('Wheelchair accessible')).toHaveTextContent(
      'Accessibility: Wheelchair accessible',
    );
    expect(screen.getByText('Bus / Walk / Parking')).toHaveTextContent(
      'Transportation: Bus / Walk / Parking',
    );
  });

  // Missing optional fields are left out
  it('hides optional fields the event does not have', () => {
    renderAt('/events/3');

    expect(screen.getByRole('heading', { level: 1, name: 'Hack Night' })).toBeInTheDocument();
    expect(screen.queryByText('✓ Verified organizer')).not.toBeInTheDocument();
    expect(screen.queryByText('Accessibility:')).not.toBeInTheDocument();
    expect(screen.getByText('Walk / Bus')).toBeInTheDocument();
  });

  // Save button flips its label and pressed state on each click.
  it('toggles Save Event to Saved and back', async () => {
    const user = userEvent.setup();
    renderAt('/events/1');

    const save = screen.getByRole('button', { name: 'Save Event' });
    expect(save).toHaveAttribute('aria-pressed', 'false');

    await user.click(save);
    expect(save).toHaveTextContent('Saved');
    expect(save).toHaveAttribute('aria-pressed', 'true');

    await user.click(save);
    expect(save).toHaveTextContent('Save Event');
    expect(save).toHaveAttribute('aria-pressed', 'false');
  });

  // RSVP button flips its label and pressed state on each click.
  it('toggles RSVP to Going and back', async () => {
    const user = userEvent.setup();
    renderAt('/events/1');

    const rsvp = screen.getByRole('button', { name: 'RSVP' });
    expect(rsvp).toHaveAttribute('aria-pressed', 'false');

    await user.click(rsvp);
    expect(rsvp).toHaveTextContent('Going');
    expect(rsvp).toHaveAttribute('aria-pressed', 'true');

    await user.click(rsvp);
    expect(rsvp).toHaveTextContent('RSVP');
    expect(rsvp).toHaveAttribute('aria-pressed', 'false');
  });

  // Save/RSVP state doesn't carry over to the next event you open.
  it('resets Save/RSVP when switching to a different event', async () => {
    const user = userEvent.setup();
    renderAt('/events/1', <Link to="/events/2">Go to event 2</Link>);

    await user.click(screen.getByRole('button', { name: 'Save Event' }));
    await user.click(screen.getByRole('button', { name: 'RSVP' }));
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Go to event 2' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Fall Career Fair' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Event' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'RSVP' })).toHaveAttribute('aria-pressed', 'false');
  });

  // Back link goes to the events list page.
  it('has a back link to the events list', () => {
    renderAt('/events/1');
    expect(screen.getByRole('link', { name: /back to events/i })).toHaveAttribute('href', '/events');
  });

  // A bad id shows the not-found message instead of the event layout.
  it('shows "Event not found" for an unknown id', () => {
    renderAt('/events/999');

    expect(screen.getByRole('heading', { level: 1, name: 'Event not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to events/i })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'RSVP' })).not.toBeInTheDocument();
  });
});