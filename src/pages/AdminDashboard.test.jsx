import { afterEach, describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminDashboard from './AdminDashboard.jsx';
import { RequireAuth } from '../lib/auth.jsx';
import { fail, loggedInRoutes, mockApi, renderPage, resetApi } from '../test/api.jsx';

const requests = [
  {
    id: '101',
    organizationName: 'Amherst Jazz Collective',
    description: 'Free jazz nights.',
    address: '35 S Pleasant St',
    website: 'https://amherstjazz.example.org',
    contactEmail: 'hello@amherstjazz.example.org',
    documentUrl: 'https://example.org/doc.pdf',
    status: 'pending',
    submittedAt: '2026-10-28T14:20:00Z',
    applicant: { id: 'u-1', name: 'Dana Whitfield', email: 'dana@example.org' },
  },
  {
    id: '103',
    organizationName: 'Pioneer Valley Food Share',
    description: 'Weekly community meals.',
    address: null,
    website: null,
    contactEmail: 'info@pvfoodshare.example.org',
    documentUrl: null,
    status: 'pending',
    submittedAt: '2026-11-01T14:20:00Z',
    applicant: { id: 'u-2', name: 'Sam Lee', email: 'sam@example.org' },
  },
];
const events = [
  { id: '7', title: 'Winter Craft Fair', organizer: 'Craft Guild', startsAt: '2026-12-05T15:00:00Z', location: 'Town Hall', price: 'Free', status: 'pending' },
  { id: '8', title: 'Jazz on the Common', organizer: 'Jazz Club', startsAt: '2026-12-06T23:00:00Z', location: 'Town Common', price: '$5.00', status: 'pending' },
];

const routes = (overrides = {}) => ({
  ...loggedInRoutes({ role: 'admin' }),
  'GET /api/admin/verification-requests': { requests },
  'GET /api/admin/events': { events },
  ...overrides,
});

const rowFor = (name) => screen.getByRole('heading', { level: 3, name }).closest('article');
const section = (title) => screen.getByRole('heading', { level: 2, name: title }).closest('section');

async function renderAdmin() {
  const view = renderPage(<AuthedAdmin />);
  await screen.findByRole('heading', { level: 2, name: 'Pending Organizer Requests' });
  return view;
}

function AuthedAdmin() {
  return <RequireAuth><AdminDashboard /></RequireAuth>;
}

afterEach(resetApi);

describe('AdminDashboard: access', () => {
  it('refuses non-admins and never asks for the admin data', async () => {
    const { calls } = mockApi(loggedInRoutes({ role: 'attendee' }));
    renderPage(<AuthedAdmin />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Only admins can view this page.');
    expect(calls.some((c) => c.path.startsWith('/api/admin'))).toBe(false);
  });

  it('shows the error if the backend refuses', async () => {
    mockApi(routes({ 'GET /api/admin/verification-requests': fail(403, 'Only admins can do this.') }));
    renderPage(<AuthedAdmin />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Only admins can do this.');
  });
});

describe('AdminDashboard', () => {
  it('loads both pending sections from the backend on Overview', async () => {
    mockApi(routes());
    await renderAdmin();
    expect(screen.getByRole('heading', { level: 1, name: 'Admin Dashboard' })).toBeInTheDocument();
    expect(within(section('Pending Organizer Requests')).getAllByRole('article')).toHaveLength(2);
    expect(within(section('Pending Event Approvals')).getAllByRole('article')).toHaveLength(2);
  });

  it('approves an organizer request on the server, then removes the row', async () => {
    const { callsTo } = mockApi(routes({ 'POST /api/admin/verification-requests/101/approve': { request: { id: '101', status: 'approved' } } }));
    const user = userEvent.setup();
    await renderAdmin();
    await user.click(within(rowFor('Amherst Jazz Collective')).getByRole('button', { name: 'Approve' }));
    expect(await within(section('Pending Organizer Requests')).findByText('Approved Amherst Jazz Collective.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Amherst Jazz Collective' })).not.toBeInTheDocument();
    expect(callsTo('POST', '/api/admin/verification-requests/101/approve')).toHaveLength(1);
  });

  it('keeps the row and explains if approving fails', async () => {
    mockApi(routes({ 'POST /api/admin/verification-requests/101/approve': fail(500, 'Could not save this review. Please try again.') }));
    const user = userEvent.setup();
    await renderAdmin();
    await user.click(within(rowFor('Amherst Jazz Collective')).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText(/Could not update Amherst Jazz Collective/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Amherst Jazz Collective' })).toBeInTheDocument();
  });

  it('removes the row if another admin already reviewed it', async () => {
    mockApi(routes({ 'POST /api/admin/verification-requests/101/approve': fail(409, 'This request has already been reviewed') }));
    const user = userEvent.setup();
    await renderAdmin();
    await user.click(within(rowFor('Amherst Jazz Collective')).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText(/already been reviewed/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Amherst Jazz Collective' })).not.toBeInTheDocument();
  });

  it('expands and collapses details with Review', async () => {
    mockApi(routes());
    const user = userEvent.setup();
    await renderAdmin();
    const row = within(rowFor('Amherst Jazz Collective'));
    expect(row.queryByText('Free jazz nights.')).not.toBeInTheDocument();
    await user.click(row.getByRole('button', { name: 'Review' }));
    expect(row.getByText('Free jazz nights.')).toBeInTheDocument();
    await user.click(row.getByRole('button', { name: 'Hide details' }));
    expect(row.queryByText('Free jazz nights.')).not.toBeInTheDocument();
  });

  it('hides details a request does not have', async () => {
    mockApi(routes());
    const user = userEvent.setup();
    await renderAdmin();
    const row = within(rowFor('Pioneer Valley Food Share'));
    await user.click(row.getByRole('button', { name: 'Review' }));
    expect(row.queryByText('Address')).not.toBeInTheDocument();
    expect(row.queryByText('Website')).not.toBeInTheDocument();
    expect(row.getByText('Contact email')).toBeInTheDocument();
  });

  it('rejects an organizer request with the reason typed in', async () => {
    const { callsTo } = mockApi(routes({ 'POST /api/admin/verification-requests/101/reject': { request: { id: '101', status: 'rejected' } } }));
    const user = userEvent.setup();
    await renderAdmin();
    const row = within(rowFor('Amherst Jazz Collective'));
    await user.click(row.getByRole('button', { name: 'Review' }));
    await user.type(row.getByLabelText(/reason for rejecting/i), '  Need more proof ');
    await user.click(row.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Rejected Amherst Jazz Collective.')).toBeInTheDocument();
    expect(callsTo('POST', '/api/admin/verification-requests/101/reject')[0].body).toEqual({ reason: 'Need more proof' });
  });

  it('rejects an event from the details panel, on the server', async () => {
    const { callsTo } = mockApi(routes({ 'POST /api/admin/events/7/reject': { event: { id: '7', status: 'rejected' } } }));
    const user = userEvent.setup();
    await renderAdmin();
    const row = within(rowFor('Winter Craft Fair'));
    await user.click(row.getByRole('button', { name: 'Review' }));
    expect(row.queryByLabelText(/reason for rejecting/i)).not.toBeInTheDocument();
    await user.click(row.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Rejected Winter Craft Fair.')).toBeInTheDocument();
    expect(callsTo('POST', '/api/admin/events/7/reject')).toHaveLength(1);
  });

  it('switches between sidebar sections', async () => {
    mockApi(routes());
    const user = userEvent.setup();
    await renderAdmin();
    await user.click(screen.getByRole('button', { name: 'Organizer Requests' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Pending Organizer Requests' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Pending Event Approvals' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Event Approvals' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Pending Event Approvals' })).toBeInTheDocument();
  });

  it('shows Coming soon for Users', async () => {
    mockApi(routes());
    const user = userEvent.setup();
    await renderAdmin();
    await user.click(screen.getByRole('button', { name: 'Users' }));
    expect(screen.getByText('Coming soon.')).toBeInTheDocument();
  });

  it('shows the empty state once every event is approved', async () => {
    mockApi(routes({
      'POST /api/admin/events/7/approve': { event: { id: '7', status: 'approved' } },
      'POST /api/admin/events/8/approve': { event: { id: '8', status: 'approved' } },
    }));
    const user = userEvent.setup();
    await renderAdmin();
    await user.click(within(rowFor('Winter Craft Fair')).getByRole('button', { name: 'Approve' }));
    await screen.findByText('Approved Winter Craft Fair.');
    await user.click(within(rowFor('Jazz on the Common')).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.getByText('No pending events.')).toBeInTheDocument());
  });
});
