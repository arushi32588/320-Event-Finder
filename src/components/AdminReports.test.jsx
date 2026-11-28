import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import AdminReports from './AdminReports.jsx';
import { fail, mockApi, renderPage, resetApi } from '../test/api.jsx';

const reports = {
  totalUsers: 50,
  organizers: 7,
  pendingOrganizerRequests: 2,
  pendingEvents: 5,
  approvedEvents: 19,
  totalRsvps: 130,
};

const show = (routes) => {
  mockApi(routes);
  renderPage(<AdminReports />);
};
const card = (label) => screen.getByText(label).closest('div');

afterEach(resetApi);

describe('AdminReports', () => {
  it('shows each summary count in its own card', async () => {
    show({ 'GET /api/admin/reports': { reports } });
    expect(await screen.findByText('Total users')).toBeInTheDocument();
    expect(within(card('Total users')).getByText('50')).toBeInTheDocument();
    expect(within(card('Verified organizers')).getByText('7')).toBeInTheDocument();
    expect(within(card('Pending organizer requests')).getByText('2')).toBeInTheDocument();
    expect(within(card('Events awaiting approval')).getByText('5')).toBeInTheDocument();
    expect(within(card('Published events')).getByText('19')).toBeInTheDocument();
    expect(within(card('Total RSVPs')).getByText('130')).toBeInTheDocument();
  });

  it('shows 0 for a count the backend leaves out', async () => {
    show({ 'GET /api/admin/reports': { reports: { totalUsers: 3 } } });
    expect(await screen.findByText('Total users')).toBeInTheDocument();
    expect(within(card('Total users')).getByText('3')).toBeInTheDocument();
    expect(within(card('Total RSVPs')).getByText('0')).toBeInTheDocument();
  });

  it('does not show the sample-data note for real data', async () => {
    show({ 'GET /api/admin/reports': { reports } });
    await screen.findByText('Total users');
    expect(screen.queryByText(/sample data/)).not.toBeInTheDocument();
  });

  it('shows the error when the report fails to load', async () => {
    show({ 'GET /api/admin/reports': fail(500, 'Could not load reports.') });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load reports.');
    expect(screen.queryByText('Total users')).not.toBeInTheDocument();
  });

  it('falls back to sample data, with a note, while the backend route is missing', async () => {
    show({ 'GET /api/admin/reports': fail(404, 'Not found') });
    expect(await screen.findByText('Showing sample data until the reports backend is ready.')).toBeInTheDocument();
    expect(screen.getByText('Total users')).toBeInTheDocument();
    expect(within(card('Total users')).getByText('42')).toBeInTheDocument();
  });
});