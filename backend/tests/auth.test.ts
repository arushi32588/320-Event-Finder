import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as signup } from '@/app/api/auth/signup/route';
import { parseDateOfBirth, validateLogin, validateSignup } from '@/lib/auth';
import { createAuthClient } from '@/lib/supabase';
import { authError, fakeAuthClient, request } from './helpers/fake-supabase';

vi.mock('@/lib/supabase', () => ({ getSupabase: vi.fn(() => null), createAuthClient: vi.fn(() => null) }));

const today = new Date('2026-10-25T12:00:00Z');
const validSignup = {
  name: 'Ada Lovelace',
  email: 'Ada@Example.com ',
  dateOfBirth: '12 / 10 / 2004',
  password: 'correct horse',
  confirmPassword: 'correct horse',
  acceptedTerms: true,
};
const fieldErrors = (body: Record<string, unknown>) => {
  const result = validateSignup(body, today);
  return 'errors' in result ? result.errors : {};
};

const supabaseUser = {
  id: '6f1c2c1e-0000-4000-8000-000000000001',
  email: 'ada@example.com',
  user_metadata: { name: 'Ada Lovelace' },
  identities: [{ id: 'identity-1' }],
};
const supabaseSession = { access_token: 'access', refresh_token: 'refresh', expires_at: 1793000000, user: supabaseUser };

const postSignup = (body: unknown, raw?: string) => signup(request('http://localhost/api/auth/signup', body, raw));
const postLogin = (body: unknown, raw?: string) => login(request('http://localhost/api/auth/login', body, raw));

let auth: ReturnType<typeof fakeAuthClient>['auth'];

beforeEach(() => {
  const fake = fakeAuthClient();
  auth = fake.auth;
  vi.mocked(createAuthClient).mockReturnValue(fake.client);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('parseDateOfBirth', () => {
  it.each([
    ['12/10/2004', '2004-12-10'],
    ['12 / 10 / 2004', '2004-12-10'],
    ['1/2/2004', '2004-01-02'],
    ['2004-12-10', '2004-12-10'],
    ['02/29/2004', '2004-02-29'],
  ])('reads %j as %s', (input, expected) => {
    expect(parseDateOfBirth(input)).toBe(expected);
  });

  it.each(['02/30/2004', '02/29/2005', '13/01/2004', '00/10/2004', '12/32/2004', '01/01/0050', '2004/12/10', 'yesterday', ''])(
    'rejects %j',
    (input) => {
      expect(parseDateOfBirth(input)).toBeNull();
    },
  );
});

describe('validateSignup', () => {
  it('accepts a valid form and normalizes it', () => {
    expect(validateSignup(validSignup, today)).toEqual({
      value: { name: 'Ada Lovelace', email: 'ada@example.com', dateOfBirth: '2004-12-10', password: 'correct horse' },
    });
  });

  it('reports every missing field at once', () => {
    expect(Object.keys(fieldErrors({})).sort()).toEqual(
      ['acceptedTerms', 'dateOfBirth', 'email', 'name', 'password'].sort(),
    );
  });

  it('treats whitespace-only and non-string values as missing', () => {
    const errors = fieldErrors({ ...validSignup, name: '   ', email: 42 });
    expect(errors.name).toBe('Full name is required.');
    expect(errors.email).toBe('Email is required.');
  });

  it.each(['ada', 'ada@', '@example.com', 'ada@example', 'ada lovelace@example.com'])('rejects the email %j', (email) => {
    expect(fieldErrors({ ...validSignup, email }).email).toBe('Enter a valid email address.');
  });

  it('rejects names and emails over 255 characters', () => {
    expect(fieldErrors({ ...validSignup, name: 'a'.repeat(256) }).name).toContain('255');
    expect(fieldErrors({ ...validSignup, email: `${'a'.repeat(250)}@example.com` }).email).toBeDefined();
  });

  it('rejects impossible, future and pre-1900 dates of birth', () => {
    expect(fieldErrors({ ...validSignup, dateOfBirth: '02/30/2004' }).dateOfBirth).toContain('MM / DD / YYYY');
    expect(fieldErrors({ ...validSignup, dateOfBirth: '10/26/2026' }).dateOfBirth).toContain('future');
    expect(fieldErrors({ ...validSignup, dateOfBirth: '12/31/1899' }).dateOfBirth).toContain('real date');
  });

  it('accepts a date of birth of today', () => {
    expect(fieldErrors({ ...validSignup, dateOfBirth: '10/25/2026' }).dateOfBirth).toBeUndefined();
  });

  it('enforces the 8 to 72 character password length', () => {
    const withPassword = (password: string) => fieldErrors({ ...validSignup, password, confirmPassword: password }).password;
    expect(withPassword('a'.repeat(7))).toContain('at least 8');
    expect(withPassword('a'.repeat(8))).toBeUndefined();
    expect(withPassword('a'.repeat(72))).toBeUndefined();
    expect(withPassword('a'.repeat(73))).toContain('72');
  });

  it('does not trim passwords, so spaces must match exactly', () => {
    expect(fieldErrors({ ...validSignup, confirmPassword: 'correct horse ' }).confirmPassword).toBe('Passwords do not match.');
  });

  it('requires the terms checkbox to be exactly true', () => {
    expect(fieldErrors({ ...validSignup, acceptedTerms: 'true' }).acceptedTerms).toBeDefined();
    expect(fieldErrors({ ...validSignup, acceptedTerms: false }).acceptedTerms).toBeDefined();
  });
});

describe('validateLogin', () => {
  it('accepts a valid login and normalizes the email', () => {
    expect(validateLogin({ email: ' ADA@example.com', password: 'x' })).toEqual({
      value: { email: 'ada@example.com', password: 'x' },
    });
  });

  it('requires an email and password', () => {
    expect(validateLogin({})).toEqual({ errors: { email: 'Email is required.', password: 'Password is required.' } });
  });
});

describe('POST /api/auth/signup', () => {
  it('creates the account, passing name and date of birth for the users table', async () => {
    auth.signUp.mockResolvedValue({ data: { user: supabaseUser, session: supabaseSession }, error: null });
    const res = await postSignup(validSignup);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      user: { id: supabaseUser.id, email: 'ada@example.com', name: 'Ada Lovelace' },
      session: { accessToken: 'access', refreshToken: 'refresh', expiresAt: 1793000000 },
      needsEmailConfirmation: false,
    });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'correct horse',
      options: { data: { name: 'Ada Lovelace', date_of_birth: '2004-12-10' } },
    });
  });

  it('reports when the user must confirm their email first', async () => {
    auth.signUp.mockResolvedValue({ data: { user: supabaseUser, session: null }, error: null });
    const body = await (await postSignup(validSignup)).json();
    expect(body.session).toBeNull();
    expect(body.needsEmailConfirmation).toBe(true);
  });

  it('returns 400 with per-field errors and never calls Supabase for invalid input', async () => {
    const res = await postSignup({ ...validSignup, confirmPassword: 'different' });
    expect(res.status).toBe(400);
    expect((await res.json()).fields).toEqual({ confirmPassword: 'Passwords do not match.' });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed JSON', undefined, '{"name":'],
    ['a JSON array', [validSignup], undefined],
    ['JSON null', null, undefined],
    ['an empty body', undefined, ''],
  ])('returns 400 for %s', async (_label, body, raw) => {
    expect((await postSignup(body, raw)).status).toBe(400);
  });

  it('returns 409 when Supabase says the email is taken', async () => {
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: authError('user_already_exists') });
    expect((await postSignup(validSignup)).status).toBe(409);
  });

  it('returns 409 for a duplicate hidden by email confirmation (user with no identities)', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { ...supabaseUser, identities: [] }, session: null }, error: null });
    expect((await postSignup(validSignup)).status).toBe(409);
  });

  it('returns 400 when Supabase rejects the password as weak', async () => {
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: authError('weak_password', 'Password is known to be weak') });
    const res = await postSignup(validSignup);
    expect(res.status).toBe(400);
    expect((await res.json()).fields.password).toBe('Password is known to be weak');
  });

  it('returns 429 when Supabase rate-limits sign-ups', async () => {
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: authError('over_email_send_rate_limit') });
    expect((await postSignup(validSignup)).status).toBe(429);
  });

  it('returns a generic 500 for unexpected Supabase errors', async () => {
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: authError('unexpected_failure', 'db down') });
    const res = await postSignup(validSignup);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('db down');
  });

  it('returns 503 when Supabase is not configured', async () => {
    vi.mocked(createAuthClient).mockReturnValue(null);
    expect((await postSignup(validSignup)).status).toBe(503);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in and returns the user and session', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: supabaseUser, session: supabaseSession }, error: null });
    const res = await postLogin({ email: 'ADA@example.com', password: 'correct horse' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: supabaseUser.id, email: 'ada@example.com', name: 'Ada Lovelace' },
      session: { accessToken: 'access', refreshToken: 'refresh', expiresAt: 1793000000 },
    });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'correct horse' });
  });

  it('returns the same 401 for a wrong password or an unknown email', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: authError('invalid_credentials') });
    const res = await postLogin({ email: 'nobody@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Incorrect email or password.' });
  });

  it('returns 403 when the email is not confirmed yet', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: authError('email_not_confirmed') });
    expect((await postLogin({ email: 'ada@example.com', password: 'x' })).status).toBe(403);
  });

  it('returns 429 when Supabase rate-limits logins', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: authError('over_request_rate_limit') });
    expect((await postLogin({ email: 'ada@example.com', password: 'x' })).status).toBe(429);
  });

  it('returns 400 for an empty body or missing fields without calling Supabase', async () => {
    expect((await postLogin(undefined, '')).status).toBe(400);
    const res = await postLogin({ email: 'ada@example.com' });
    expect(res.status).toBe(400);
    expect((await res.json()).fields).toEqual({ password: 'Password is required.' });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('returns 503 when Supabase is not configured', async () => {
    vi.mocked(createAuthClient).mockReturnValue(null);
    expect((await postLogin({ email: 'ada@example.com', password: 'x' })).status).toBe(503);
  });
});
