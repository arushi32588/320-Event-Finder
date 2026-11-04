import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import Profile from './Profile.jsx';
import Saved from './Saved.jsx';
import { RequireAuth } from '../lib/auth.jsx';
import { fail, loggedInRoutes, mockApi, profile, renderPage, resetApi } from '../test/api.jsx';

const future = { id: '1', title: 'Future Show', startsAt: '2099-01-01T00:00:00Z', location: 'Town Hall' };
const past = { id: '2', title: 'Old Show', startsAt: '2001-01-01T00:00:00Z', location: 'Library' };
const saved = { id: '3', title: 'Saved Show', startsAt: '2099-02-01T00:00:00Z', location: 'Campus' };

const routes = (user = {}, overrides = {}) => ({
  ...loggedInRoutes(user),
  'GET /api/me/saved-events': { events: [saved] },
  'GET /api/me/rsvps': { events: [future, past] },
  'GET /api/me/events': { events: [] },
  ...overrides,
});

const show = (page = <Profile />) =>
  renderPage(
    <Routes>
      <Route path="/" element={<RequireAuth>{page}</RequireAuth>} />
      <Route path="/login" element={<h1>Login page</h1>} />
    </Routes>,
  );
const sectionFollowing = (title) => screen.getByRole('heading', { level: 2, name: title }).nextElementSibling;

afterEach(resetApi);

describe('Profile', () => {
  it('sends logged-out visitors to log in', async () => {
    mockApi({});
    show();
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument();
  });

  it('shows the real name and email from the backend', async () => {
    mockApi(routes());
    show();
    expect(await screen.findByRole('heading', { level: 1, name: 'Maya Fox' })).toBeInTheDocument();
    expect(screen.getByText('maya@umass.edu')).toBeInTheDocument();
  });

  it('lists saved events, and splits RSVPs into going and past', async () => {
    mockApi(routes());
    show();
    await screen.findByRole('heading', { level: 3, name: 'Saved Show' });
    expect(within(sectionFollowing('Saved Events')).getByText('Saved Show')).toBeInTheDocument();
    expect(within(sectionFollowing('Going')).getByText('Future Show')).toBeInTheDocument();
    expect(within(sectionFollowing('Past / Attended')).getByText('Old Show')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Saved Show/ })).toHaveAttribute('href', '/events/3');
  });

  it('shows empty messages when the lists are empty', async () => {
    mockApi(routes({}, { 'GET /api/me/saved-events': { events: [] }, 'GET /api/me/rsvps': { events: [] } }));
    show();
    expect(await screen.findByText("You haven't saved any events yet.")).toBeInTheDocument();
    expect(screen.getByText('No upcoming RSVPs.')).toBeInTheDocument();
    expect(screen.getByText('No past events yet.')).toBeInTheDocument();
  });

  it('shows the error when the lists fail to load', async () => {
    mockApi(routes({}, { 'GET /api/me/rsvps': fail(500, 'Could not load your RSVPs. Please try again.') }));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your RSVPs');
    expect(screen.getByRole('heading', { level: 1, name: 'Maya Fox' })).toBeInTheDocument();
  });

  it('lists submitted events with their review status, only if there are any', async () => {
    mockApi(routes({}, { 'GET /api/me/events': { events: [{ id: '9', title: 'My Party', status: 'pending', startsAt: '2099-01-01T00:00:00Z' }] } }));
    show();
    expect(await screen.findByRole('heading', { level: 2, name: 'Events You Submitted' })).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });
});

describe('Profile: organizer status', () => {
  it('offers to apply when the user never applied', async () => {
    mockApi(routes());
    show();
    expect(await screen.findByRole('link', { name: 'Become an Organizer' })).toHaveAttribute('href', '/organizer/verify');
  });

  it('shows pending and hides the apply button', async () => {
    mockApi(routes({ organizerStatus: 'pending' }));
    show();
    expect(await screen.findByText('Organizer request pending review')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /organizer|apply/i })).not.toBeInTheDocument();
  });

  it('shows the verified badge once approved', async () => {
    mockApi(routes({ organizerStatus: 'approved' }));
    show();
    expect(await screen.findByText('✓ Verified organizer')).toBeInTheDocument();
  });

  it('shows the rejection reason and lets the user apply again', async () => {
    mockApi(routes({ organizerStatus: 'rejected' }, { 'GET /api/organizer/verification-request': { request: { rejectionReason: 'Need more proof' } } }));
    show();
    expect(await screen.findByText('Need more proof')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Apply Again' })).toBeInTheDocument();
  });
});

describe('Profile: editing', () => {
  it('saves a new name to the backend', async () => {
    const { callsTo } = mockApi(routes({}, { 'PATCH /api/me/profile': { profile: profile({ name: 'Maya Q' }) } }));
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Edit Profile' }));
    const input = screen.getByLabelText(/name/i);
    await user.clear(input);
    await user.type(input, 'Maya Q');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Maya Q' })).toBeInTheDocument();
    expect(callsTo('PATCH', '/api/me/profile')[0].body).toEqual({ name: 'Maya Q' });
  });

  it('shows the error and stays in edit mode when the name is invalid', async () => {
    mockApi(routes({}, { 'PATCH /api/me/profile': fail(400, 'Please fix the highlighted fields.', { name: 'Name is required.' }) }));
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Edit Profile' }));
    await user.clear(screen.getByLabelText(/name/i));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Name is required.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('cancel leaves the name alone', async () => {
    const { callsTo } = mockApi(routes());
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Edit Profile' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Maya Fox' })).toBeInTheDocument();
    expect(callsTo('PATCH', '/api/me/profile')).toHaveLength(0);
  });
});

describe('Saved page', () => {
  it('lists saved events from the backend', async () => {
    mockApi(routes());
    show(<Saved />);
    expect(await screen.findByRole('link', { name: /Saved Show/ })).toHaveAttribute('href', '/events/3');
  });

  it('has an empty state pointing back to browsing', async () => {
    mockApi(routes({}, { 'GET /api/me/saved-events': { events: [] } }));
    show(<Saved />);
    expect(await screen.findByRole('link', { name: 'Browse events' })).toHaveAttribute('href', '/');
  });

  it('shows the error when loading fails', async () => {
    mockApi(routes({}, { 'GET /api/me/saved-events': fail(500, 'Could not load your saved events. Please try again.') }));
    show(<Saved />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your saved events');
  });
});
