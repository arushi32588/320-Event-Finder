import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import Layout from '../components/Layout.jsx';
import OrganizerVerification from './OrganizerVerification.jsx';
import SubmitEvent from './SubmitEvent.jsx';
import { RequireAuth } from '../lib/auth.jsx';
import { fail, loggedInRoutes, mockApi, profile, renderPage, resetApi } from '../test/api.jsx';

afterEach(resetApi);

describe('Organizer verification form', () => {
  const show = () => renderPage(<RequireAuth><OrganizerVerification /></RequireAuth>);

  async function fillRequired(user) {
    await user.type(await screen.findByLabelText(/Organization Name/), 'Hack Club');
    await user.type(screen.getByLabelText(/Organization Description/), 'We run hackathons.');
    await user.type(screen.getByLabelText(/Contact Email/), 'team@hackclub.org');
  }

  it('checks required fields before calling the backend', async () => {
    const { callsTo } = mockApi(loggedInRoutes());
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Submit Request' }));
    expect(screen.getByText('Organization Name is required.')).toBeInTheDocument();
    expect(callsTo('POST', '/api/organizer/verification-request')).toHaveLength(0);
  });

  it('sends the application, mapping the proof link to documentUrl', async () => {
    const { callsTo } = mockApi({ ...loggedInRoutes(), 'POST /api/organizer/verification-request': { request: { id: '1', status: 'pending' } } });
    const user = userEvent.setup();
    show();
    await fillRequired(user);
    await user.type(screen.getByLabelText(/Website/), 'instagram.com/hackclub');
    await user.type(screen.getByLabelText(/Supporting Proof/), 'https://drive.example.com/x');
    await user.click(screen.getByRole('button', { name: 'Submit Request' }));
    expect(await screen.findByRole('heading', { name: 'Request sent!' })).toBeInTheDocument();
    expect(callsTo('POST', '/api/organizer/verification-request')[0].body).toEqual({
      organizationName: 'Hack Club',
      description: 'We run hackathons.',
      address: '',
      website: 'instagram.com/hackclub',
      contactEmail: 'team@hackclub.org',
      documentUrl: 'https://drive.example.com/x',
    });
  });

  it('explains when a request is already pending', async () => {
    mockApi({ ...loggedInRoutes(), 'POST /api/organizer/verification-request': fail(409, 'You already have a verification request pending review') });
    const user = userEvent.setup();
    show();
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Submit Request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already have a verification request');
    expect(screen.queryByRole('heading', { name: 'Request sent!' })).not.toBeInTheDocument();
  });

  it('shows the backend error next to the field', async () => {
    mockApi({ ...loggedInRoutes(), 'POST /api/organizer/verification-request': fail(400, 'Please fix the highlighted fields.', { website: 'Enter a valid website, like instagram.com/yourorg.', documentUrl: 'Enter a valid link to your document.' }) });
    const user = userEvent.setup();
    show();
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Submit Request' }));
    expect(await screen.findByText('Enter a valid website, like instagram.com/yourorg.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid link to your document.')).toBeInTheDocument();
  });
});

describe('Submit event form', () => {
  const show = () => renderPage(<RequireAuth><SubmitEvent /></RequireAuth>);

  it('sends exact times to the backend and confirms', async () => {
    const { callsTo } = mockApi({ ...loggedInRoutes(), 'POST /api/me/events': { event: { id: '9', title: 'My Party', status: 'pending' } } });
    const user = userEvent.setup();
    show();
    await user.type(await screen.findByLabelText(/Event Name/), 'My Party');
    await user.type(screen.getByLabelText(/Starts/), '2099-01-02T18:30');
    await user.click(screen.getByRole('button', { name: 'Submit Event' }));
    expect(await screen.findByRole('heading', { name: 'Event submitted!' })).toBeInTheDocument();
    const { body } = callsTo('POST', '/api/me/events')[0];
    expect(body.title).toBe('My Party');
    expect(body.startsAt).toBe(new Date('2099-01-02T18:30').toISOString());
    expect(body.endsAt).toBeNull();
  });

  it('shows field errors from the backend', async () => {
    mockApi({ ...loggedInRoutes(), 'POST /api/me/events': fail(400, 'Please fix the highlighted fields.', { title: 'Event name is required.', startsAt: 'Start time is required.' }) });
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Submit Event' }));
    expect(await screen.findByText('Event name is required.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Event Name/)).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Navigation bar', () => {
  const show = (route = '/') =>
    renderPage(
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<h1>Home page</h1>} />
          <Route path="admin" element={<h1>Admin page</h1>} />
        </Route>
      </Routes>,
      { route },
    );

  it('shows Log in when logged out, with no member links', () => {
    mockApi({});
    show();
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Submit Event' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('shows Log out and Submit Event when logged in, but no Admin link', async () => {
    mockApi(loggedInRoutes());
    show();
    expect(await screen.findByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Submit Event' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('shows the Admin link to admins', async () => {
    mockApi({ 'GET /api/me/profile': { profile: profile({ role: 'admin' }) }, ...loggedInRoutes({ role: 'admin' }) });
    show();
    expect(await screen.findByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });

  it('logs out on the server and locally', async () => {
    const { callsTo } = mockApi({ ...loggedInRoutes(), 'POST /api/auth/logout': { __status: 204 } });
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(callsTo('POST', '/api/auth/logout')[0].token).toBe('token-1');
    expect(sessionStorage.getItem('event-finder-session')).toBeNull();
  });

  it('still logs out locally if the server call fails', async () => {
    mockApi({ ...loggedInRoutes(), 'POST /api/auth/logout': fail(500, 'Could not log you out.') });
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument();
  });

  it('searching goes to the home page with the search in the URL', async () => {
    mockApi({});
    const user = userEvent.setup();
    show('/admin');
    await user.type(screen.getByRole('searchbox', { name: 'Search events' }), 'jazz night{Enter}');
    expect(await screen.findByRole('heading', { name: 'Home page' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search events' })).toHaveValue('jazz night');
  });
});
