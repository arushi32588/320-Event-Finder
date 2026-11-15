import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import Layout from '../components/Layout.jsx';
import OrganizerVerification from './OrganizerVerification.jsx';
import SubmitEvent from './SubmitEvent.jsx';
import { RequireAuth } from '../lib/auth.jsx';
import { fail, loggedInRoutes, mockApi, profile, renderPage, resetApi } from '../test/api.jsx';
import * as images from '../lib/eventImages.js';
import { resetMockImages } from '../lib/eventImages.js';

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

describe('Submit event form: cover photo', () => {
  const show = () => renderPage(<RequireAuth><SubmitEvent /></RequireAuth>);
  const photo = (name = 'poster.png', type = 'image/png', size = 1000) => {
    const file = new File(['x'], name, { type });
    Object.defineProperty(file, 'size', { value: size });
    return file;
  };
  const created = { 'POST /api/me/events': { event: { id: '9', title: 'My Party', status: 'pending' } } };

  async function fillAndPick(user, file) {
    await user.type(await screen.findByLabelText(/Event Name/), 'My Party');
    await user.type(screen.getByLabelText(/Starts/), '2099-01-02T18:30');
    if (file) await user.upload(screen.getByLabelText(/Cover photo/), file);
  }

  beforeEach(resetMockImages);
  afterEach(() => vi.restoreAllMocks());

  it('replaces the old image link field', async () => {
    mockApi(loggedInRoutes());
    show();
    expect(await screen.findByLabelText(/Cover photo/)).toHaveAttribute('type', 'file');
    expect(screen.queryByLabelText('Image Link')).not.toBeInTheDocument();
    expect(screen.getByText('JPEG, PNG or WebP, up to 5 MB')).toBeInTheDocument();
  });

  it('refuses the wrong kind of file', async () => {
    mockApi(loggedInRoutes());
    const user = userEvent.setup({ applyAccept: false });
    show();
    await user.upload(await screen.findByLabelText(/Cover photo/), photo('notes.pdf', 'application/pdf'));
    expect(screen.getByText('Use a JPEG, PNG or WebP image.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Cover photo/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('refuses a photo over 5 MB, saying how big it was', async () => {
    mockApi(loggedInRoutes());
    const user = userEvent.setup();
    show();
    await user.upload(await screen.findByLabelText(/Cover photo/), photo('huge.jpg', 'image/jpeg', 8.2 * 1024 * 1024));
    expect(screen.getByText('That file is 8.2 MB. Photos can be up to 5 MB.')).toBeInTheDocument();
  });

  it('previews the chosen photo and can remove it', async () => {
    mockApi(loggedInRoutes());
    const user = userEvent.setup();
    show();
    await user.upload(await screen.findByLabelText(/Cover photo/), photo());
    expect(screen.getByText('poster.png')).toBeInTheDocument();
    expect(document.querySelector('.cp-preview img')).toHaveAttribute('src', expect.stringMatching(/^blob:/));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByText('poster.png')).not.toBeInTheDocument();
    expect(screen.getByText(/Drop a photo here/)).toBeInTheDocument();
  });

  it('submits the event first, then uploads the photo for it', async () => {
    const order = [];
    mockApi({ ...loggedInRoutes(), 'POST /api/me/events': () => (order.push('create'), created['POST /api/me/events']) });
    const upload = vi.spyOn(images, 'uploadEventImage').mockImplementation(async () => {
      order.push('upload');
      return 'blob:x';
    });
    const user = userEvent.setup();
    show();
    const file = photo();
    await fillAndPick(user, file);
    await user.click(screen.getByRole('button', { name: 'Submit Event' }));
    expect(await screen.findByRole('heading', { name: 'Event submitted!' })).toBeInTheDocument();
    expect(order).toEqual(['create', 'upload']);
    expect(upload).toHaveBeenCalledWith('9', file);
    expect(screen.queryByText(/photo didn't upload/)).not.toBeInTheDocument();
  });

  it('skips the upload when no photo was chosen', async () => {
    mockApi({ ...loggedInRoutes(), ...created });
    const upload = vi.spyOn(images, 'uploadEventImage');
    const user = userEvent.setup();
    show();
    await fillAndPick(user, null);
    await user.click(screen.getByRole('button', { name: 'Submit Event' }));
    await screen.findByRole('heading', { name: 'Event submitted!' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('still confirms the event when the photo upload fails', async () => {
    mockApi({ ...loggedInRoutes(), ...created });
    vi.spyOn(images, 'uploadEventImage').mockRejectedValue(new Error('Upload failed'));
    const user = userEvent.setup();
    show();
    await fillAndPick(user, photo());
    await user.click(screen.getByRole('button', { name: 'Submit Event' }));
    expect(await screen.findByRole('heading', { name: 'Event submitted!' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Your event was submitted, but the photo didn't upload. You can add it from your profile.");
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
