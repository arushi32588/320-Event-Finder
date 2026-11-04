import { afterEach, describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import CreateAccount from './CreateAccount.jsx';
import { getSession } from '../lib/api.js';
import { fail, mockApi, profile, renderPage, resetApi } from '../test/api.jsx';

function renderPageUnderTest() {
  return renderPage(
    <Routes>
      <Route path="/signup" element={<CreateAccount />} />
      <Route path="/" element={<h1>Home page</h1>} />
    </Routes>,
    { route: '/signup' },
  );
}

async function fillIn(user) {
  await user.type(screen.getByLabelText('Full Name'), 'Maya Fox');
  await user.type(screen.getByLabelText('Email'), 'maya@example.org');
  await user.type(screen.getByLabelText('Date of Birth'), '05/01/2004');
  await user.type(screen.getByLabelText('Password'), 'secret-pass');
  await user.type(screen.getByLabelText('Confirm Password'), 'secret-pass');
  await user.click(screen.getByRole('checkbox'));
}
const submit = () => screen.getByRole('button', { name: 'Create Account' });
const session = { accessToken: 'token-1', refreshToken: 'refresh-1', expiresAt: 1 };

afterEach(resetApi);

describe('CreateAccount', () => {
  it('shows the heading', () => {
    renderPageUnderTest();
    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toBeInTheDocument();
  });

  it('lists the fields in the same order as the wireframe', () => {
    renderPageUnderTest();
    const labels = [...document.querySelectorAll('.ca-field label')].map((l) => l.textContent);
    expect(labels).toEqual(['Full Name', 'Email', 'Date of Birth', 'Password', 'Confirm Password']);
  });

  it('has a terms checkbox that starts unchecked and can be checked', async () => {
    const user = userEvent.setup();
    renderPageUnderTest();
    const terms = screen.getByRole('checkbox');
    expect(terms).not.toBeChecked();
    await user.click(terms);
    expect(terms).toBeChecked();
  });

  it('links to the login page', () => {
    renderPageUnderTest();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('sends every field to the backend, logs in and goes home', async () => {
    const { callsTo } = mockApi({
      'POST /api/auth/signup': { user: { id: 'user-1' }, session, needsEmailConfirmation: false },
      'GET /api/me/profile': { profile: profile() },
    });
    const user = userEvent.setup();
    renderPageUnderTest();
    await fillIn(user);
    await user.click(submit());
    expect(await screen.findByRole('heading', { name: 'Home page' })).toBeInTheDocument();
    expect(callsTo('POST', '/api/auth/signup')[0].body).toEqual({
      name: 'Maya Fox',
      email: 'maya@example.org',
      dateOfBirth: '05/01/2004',
      password: 'secret-pass',
      confirmPassword: 'secret-pass',
      acceptedTerms: true,
    });
    expect(getSession().accessToken).toBe('token-1');
  });

  it('tells the user to check their email when confirmation is required', async () => {
    mockApi({ 'POST /api/auth/signup': { user: { id: 'user-1' }, session: null, needsEmailConfirmation: true } });
    const user = userEvent.setup();
    renderPageUnderTest();
    await fillIn(user);
    await user.click(submit());
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(getSession()).toBeNull();
  });

  it('shows the error next to each field the backend rejects', async () => {
    mockApi({
      'POST /api/auth/signup': fail(400, 'Please fix the highlighted fields.', {
        email: 'Enter a valid email address.',
        confirmPassword: 'Passwords do not match.',
        acceptedTerms: 'You must agree to the Terms of Service and Privacy Policy.',
      }),
    });
    const user = userEvent.setup();
    renderPageUnderTest();
    await user.click(submit());
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(screen.getByText(/You must agree/)).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(submit()).toBeEnabled();
  });

  it('shows a message when the email is already taken', async () => {
    mockApi({ 'POST /api/auth/signup': fail(409, 'An account with this email already exists.') });
    const user = userEvent.setup();
    renderPageUnderTest();
    await fillIn(user);
    await user.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  });
});
