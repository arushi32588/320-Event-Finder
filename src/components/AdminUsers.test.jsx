import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminUsers from './AdminUsers.jsx';
import { fail, mockApi, renderPage, resetApi } from '../test/api.jsx';

const users = [
  { id: '1', name: 'Maya Fox', email: 'maya@example.org', role: 'attendee', organizerStatus: 'none', joinedAt: '2026-09-04T15:00:00Z' },
  { id: '2', name: 'Dana Whitfield', email: 'dana@jazz.example.org', role: 'organizer', organizerStatus: 'approved', joinedAt: '2026-09-12T18:30:00Z' },
  { id: '3', name: 'Sam Lee', email: 'sam@food.example.org', role: 'attendee', organizerStatus: 'pending', joinedAt: '2026-10-02T14:10:00Z' },
  { id: '4', name: 'Alex Rivera', email: 'alex@example.org', role: 'admin', organizerStatus: 'none', joinedAt: null },
];

const rowFor = (name) => screen.getByRole('heading', { level: 3, name }).closest('article');
const show = async (routes = { 'GET /api/admin/users': { users } }) => {
  mockApi(routes);
  renderPage(<AdminUsers />);
  await screen.findByRole('heading', { level: 2, name: 'Users' });
};

afterEach(resetApi);

describe('AdminUsers', () => {
  it('lists every user with their email, join date and role', async () => {
    await show();
    expect(await screen.findByRole('heading', { level: 3, name: 'Maya Fox' })).toBeInTheDocument();
    expect(screen.getByText('4 users')).toBeInTheDocument();
    expect(within(rowFor('Maya Fox')).getByText(/maya@example.org/)).toHaveTextContent('Joined Sep 4, 2026');
    expect(within(rowFor('Maya Fox')).getByText('Attendee')).toBeInTheDocument();
    expect(within(rowFor('Dana Whitfield')).getByText('Organizer')).toBeInTheDocument();
    expect(within(rowFor('Alex Rivera')).getByText('Admin')).toBeInTheDocument();
  });

  it('leaves out the join date when a user has none', async () => {
    await show();
    await screen.findByRole('heading', { level: 3, name: 'Alex Rivera' });
    expect(within(rowFor('Alex Rivera')).getByText('alex@example.org')).not.toHaveTextContent('Joined');
  });

  it('shows pending organizer requests next to the role', async () => {
    await show();
    await screen.findByRole('heading', { level: 3, name: 'Sam Lee' });
    expect(within(rowFor('Sam Lee')).getByText('Organizer request pending')).toBeInTheDocument();
    expect(within(rowFor('Maya Fox')).queryByText(/Organizer request/)).not.toBeInTheDocument();
  });

  it('searches by name', async () => {
    const user = userEvent.setup();
    await show();
    await screen.findByRole('heading', { level: 3, name: 'Maya Fox' });
    await user.type(screen.getByLabelText('Search users'), 'dana');
    expect(screen.getByRole('heading', { level: 3, name: 'Dana Whitfield' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Maya Fox' })).not.toBeInTheDocument();
  });

  it('searches by email, ignoring case', async () => {
    const user = userEvent.setup();
    await show();
    await screen.findByRole('heading', { level: 3, name: 'Maya Fox' });
    await user.type(screen.getByLabelText('Search users'), 'FOOD.EXAMPLE');
    expect(screen.getByRole('heading', { level: 3, name: 'Sam Lee' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Maya Fox' })).not.toBeInTheDocument();
  });

  it('filters by role', async () => {
    const user = userEvent.setup();
    await show();
    await screen.findByRole('heading', { level: 3, name: 'Maya Fox' });
    await user.selectOptions(screen.getByLabelText('Filter by role'), 'attendee');
    expect(screen.getByRole('heading', { level: 3, name: 'Maya Fox' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Sam Lee' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Dana Whitfield' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Alex Rivera' })).not.toBeInTheDocument();
  });

  it('combines search and role filter, and says when nothing matches', async () => {
    const user = userEvent.setup();
    await show();
    await screen.findByRole('heading', { level: 3, name: 'Maya Fox' });
    await user.selectOptions(screen.getByLabelText('Filter by role'), 'admin');
    await user.type(screen.getByLabelText('Search users'), 'maya');
    expect(screen.getByText('No users match your search.')).toBeInTheDocument();
  });

  it('shows an empty state when there are no users', async () => {
    await show({ 'GET /api/admin/users': { users: [] } });
    expect(await screen.findByText('No users yet.')).toBeInTheDocument();
    expect(screen.getByText('0 users')).toBeInTheDocument();
  });

  it('shows the error when the list fails to load', async () => {
    await show({ 'GET /api/admin/users': fail(500, 'Could not load users.') });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load users.');
    expect(screen.queryByLabelText('Search users')).not.toBeInTheDocument();
  });

  it('falls back to sample data, with a note, while the backend route is missing', async () => {
    await show({ 'GET /api/admin/users': fail(404, 'Not found') });
    expect(await screen.findByText('Showing sample data until the users backend is ready.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Maya Fox' })).toBeInTheDocument();
  });
});