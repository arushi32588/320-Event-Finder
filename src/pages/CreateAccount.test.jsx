import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import CreateAccount from './CreateAccount.jsx';

// CreateAccount needs to be inside a router.
function renderPage() {
  return render(
    <MemoryRouter>
      <CreateAccount />
    </MemoryRouter>,
  );
}

describe('CreateAccount', () => {
  // Page title renders.
  it('shows the heading', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeInTheDocument();
  });

  // Each field exists and has the right input type (runs once per row).
  it.each([
    ['Full Name', 'text'],
    ['Email', 'email'],
    ['Date of Birth', 'text'],
    ['Password', 'password'],
    ['Confirm Password', 'password'],
  ])('has a "%s" field of type %s', (label, type) => {
    renderPage();
    expect(screen.getByLabelText(label)).toHaveAttribute('type', type);
  });

  // Fields appear in the wireframe's order.
  it('lists the fields in the same order as the wireframe', () => {
    const { container } = renderPage();
    const labels = [...container.querySelectorAll('label[for]')].map((l) => l.textContent);
    expect(labels).toEqual(['Full Name', 'Email', 'Date of Birth', 'Password', 'Confirm Password']);
  });

  // Typed text shows up in the inputs.
  it('lets the user type into the fields', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Full Name'), 'Jane Doe');
    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter22');

    expect(screen.getByLabelText('Full Name')).toHaveValue('Jane Doe');
    expect(screen.getByLabelText('Email')).toHaveValue('jane@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('hunter22');
  });

  // Terms checkbox starts off and can be ticked.
  it('has a terms checkbox that starts unchecked and can be checked', async () => {
    const user = userEvent.setup();
    renderPage();

    const terms = screen.getByRole('checkbox', { name: /terms of service/i });
    expect(terms).not.toBeChecked();

    await user.click(terms);
    expect(terms).toBeChecked();
  });

  // Submitting is blocked by preventDefault()
  it('does not actually submit the form (no backend yet)', () => {
    renderPage();
    const form = screen.getByRole('button', { name: 'Create Account' }).closest('form');

    expect(fireEvent.submit(form)).toBe(false);
  });

  // Log in link points to /login.
  it('links to the login page', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });
});