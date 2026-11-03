import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminDashboard from './AdminDashboard.jsx';

function rowFor(name) {
  return screen.getByRole('heading', { level: 3, name }).closest('article');
}

function section(title) {
  return screen.getByRole('heading', { level: 2, name: title }).closest('section');
}

describe('AdminDashboard', () => {
  // Overview shows both pending lists with every row.
  it('shows both pending sections and all rows on Overview', () => {
    render(<AdminDashboard />);

    expect(screen.getByRole('heading', { level: 1, name: 'Admin Dashboard' })).toBeInTheDocument();
    expect(within(section('Pending Organizer Requests')).getAllByRole('article')).toHaveLength(3);
    expect(within(section('Pending Event Approvals')).getAllByRole('article')).toHaveLength(3);

    expect(screen.getByText('Dana Whitfield • dana@amherstjazz.example.org')).toBeInTheDocument();
    expect(
      screen.getByText('Amherst Jazz Collective • Fri, Nov 13 • 6:00 PM • Amherst Town Common'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });

  // Approve removes the row and announces it in that section.
  it('removes an organizer request when approved', async () => {
    const user = userEvent.setup();
    render(<AdminDashboard />);

    await user.click(within(rowFor('UMass Outing Club')).getByRole('button', { name: 'Approve' }));

    expect(screen.queryByRole('heading', { level: 3, name: 'UMass Outing Club' })).not.toBeInTheDocument();
    expect(within(section('Pending Organizer Requests')).getByRole('status')).toHaveTextContent(
      'Approved UMass Outing Club.',
    );
    expect(within(section('Pending Event Approvals')).getByRole('status')).toHaveTextContent('');
  });

  // Review opens the details panel and Hide details closes it.
  it('expands and collapses details with Review', async () => {
    const user = userEvent.setup();
    render(<AdminDashboard />);
    const row = rowFor('Amherst Jazz Collective');

    const review = within(row).getByRole('button', { name: 'Review' });
    expect(review).toHaveAttribute('aria-expanded', 'false');

    await user.click(review);
    expect(review).toHaveAttribute('aria-expanded', 'true');
    expect(review).toHaveTextContent('Hide details');
    expect(within(row).getByText('35 S Pleasant St, Amherst, MA')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'View document' })).toHaveAttribute(
      'href',
      'https://example.org/docs/amherst-jazz-501c3.pdf',
    );
    expect(within(row).getByText('Oct 28, 2026')).toBeInTheDocument();

    await user.click(review);
    expect(review).toHaveAttribute('aria-expanded', 'false');
    expect(within(row).queryByText('35 S Pleasant St, Amherst, MA')).not.toBeInTheDocument();
  });

  // Reject lives in the expanded panel and removes the row.
  it('removes an event when rejected from the details panel', async () => {
    const user = userEvent.setup();
    render(<AdminDashboard />);
    const row = rowFor('Mount Holyoke Range Day Hike');

    await user.click(within(row).getByRole('button', { name: 'Review' }));
    expect(within(row).getByText('Sunday, Nov 15 • 9:00 AM – 2:00 PM')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Reject' }));

    expect(
      screen.queryByRole('heading', { level: 3, name: 'Mount Holyoke Range Day Hike' }),
    ).not.toBeInTheDocument();
    expect(within(section('Pending Event Approvals')).getByRole('status')).toHaveTextContent(
      'Rejected Mount Holyoke Range Day Hike.',
    );
  });

  // Missing optional fields are left out of the details.
  it('hides details a request does not have', async () => {
    const user = userEvent.setup();
    render(<AdminDashboard />);
    const row = rowFor('Pioneer Valley Food Share');

    await user.click(within(row).getByRole('button', { name: 'Review' }));

    expect(within(row).getByText('Contact email')).toBeInTheDocument();
    expect(within(row).queryByText('Address')).not.toBeInTheDocument();
    expect(within(row).queryByText('Website')).not.toBeInTheDocument();
    expect(within(row).queryByRole('link', { name: 'View document' })).not.toBeInTheDocument();
  });

  // Sidebar tabs show only the matching section.
  it('switches between sidebar sections', async () => {
    const user = userEvent.setup();
    render(<AdminDashboard />);

    await user.click(screen.getByRole('button', { name: 'Organizer Requests' }));
    expect(screen.getByRole('button', { name: 'Organizer Requests' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Overview' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { level: 2, name: 'Pending Organizer Requests' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Pending Event Approvals' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Event Approvals' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Pending Event Approvals' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Pending Organizer Requests' })).not.toBeInTheDocument();
  });

  // Users and Reports are placeholders for now.
  it('shows Coming soon for Users', async () => {
    const user = userEvent.setup();
    render(<AdminDashboard />);

    await user.click(screen.getByRole('button', { name: 'Users' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Users' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon.')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  // Approving every event leaves the empty state.
  it('shows the empty state once every event is approved', async () => {
    const user = userEvent.setup();
    render(<AdminDashboard />);
    const events = section('Pending Event Approvals');

    for (const button of within(events).getAllByRole('button', { name: 'Approve' })) {
      await user.click(button);
    }

    expect(within(events).queryByRole('article')).not.toBeInTheDocument();
    expect(within(events).getByText('No pending events.')).toBeInTheDocument();
  });
});
