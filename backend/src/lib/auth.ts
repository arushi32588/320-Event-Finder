import type { AuthError, Session, User } from '@supabase/supabase-js';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72; // Supabase Auth's limit
const MAX_NAME_LENGTH = 255;
const MAX_EMAIL_LENGTH = 255;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignupInput = { name: string; email: string; dateOfBirth: string; password: string };
export type LoginInput = { email: string; password: string };
type FieldErrors = Record<string, string>;
type Result<T> = { value: T } | { errors: FieldErrors };

// Reads a JSON object body, or returns null if the body is missing or not an object.
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function checkEmail(value: unknown, errors: FieldErrors): string {
  const email = text(value).toLowerCase();
  if (!email) errors.email = 'Email is required.';
  else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.';
  return email;
}

// Accepts the form's "MM / DD / YYYY" (spaces optional) or ISO "YYYY-MM-DD".
// Returns the ISO date, or null if it isn't a real calendar date.
export function parseDateOfBirth(value: string): string | null {
  const us = value.replace(/\s+/g, '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const [year, month, day] = us
    ? [Number(us[3]), Number(us[1]), Number(us[2])]
    : iso
      ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : [NaN, NaN, NaN];
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects overflow like 02/30 (which Date rolls into March) and years 0000-0099
  // (which Date.UTC maps to 1900-1999).
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

export function validateSignup(body: Record<string, unknown>, today: Date): Result<SignupInput> {
  const errors: FieldErrors = {};

  const name = text(body.name);
  if (!name) errors.name = 'Full name is required.';
  else if (name.length > MAX_NAME_LENGTH) errors.name = `Full name must be ${MAX_NAME_LENGTH} characters or fewer.`;

  const email = checkEmail(body.email, errors);

  const rawDob = text(body.dateOfBirth);
  const dateOfBirth = rawDob ? parseDateOfBirth(rawDob) : null;
  if (!rawDob) errors.dateOfBirth = 'Date of birth is required.';
  else if (!dateOfBirth) errors.dateOfBirth = 'Enter your date of birth as MM / DD / YYYY.';
  else if (dateOfBirth > today.toISOString().slice(0, 10)) errors.dateOfBirth = 'Date of birth cannot be in the future.';
  else if (dateOfBirth < '1900-01-01') errors.dateOfBirth = 'Enter a real date of birth.';

  // Passwords are not trimmed: spaces are allowed characters.
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password) errors.password = 'Password is required.';
  else if (password.length < MIN_PASSWORD_LENGTH) errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  else if (password.length > MAX_PASSWORD_LENGTH) errors.password = `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  if (password && body.confirmPassword !== password) errors.confirmPassword = 'Passwords do not match.';

  if (body.acceptedTerms !== true) errors.acceptedTerms = 'You must agree to the Terms of Service and Privacy Policy.';

  if (Object.keys(errors).length > 0) return { errors };
  return { value: { name, email, dateOfBirth: dateOfBirth!, password } };
}

export function validateLogin(body: Record<string, unknown>): Result<LoginInput> {
  const errors: FieldErrors = {};
  const email = checkEmail(body.email, errors);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password) errors.password = 'Password is required.';
  if (Object.keys(errors).length > 0) return { errors };
  return { value: { email, password } };
}

// The user and session fields the frontend needs, without Supabase internals.
export function publicUser(user: User) {
  return { id: user.id, email: user.email ?? null, name: (user.user_metadata?.name as string | undefined) ?? null };
}

export function publicSession(session: Session | null) {
  if (!session) return null;
  return { accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: session.expires_at ?? null };
}

// Turns a Supabase Auth error into an HTTP status and a message safe to show users.
export function authErrorResponse(error: AuthError): Response {
  switch (error.code) {
    case 'user_already_exists':
    case 'email_exists':
      return Response.json({ error: 'An account with this email already exists.' }, { status: 409 });
    case 'weak_password':
      return Response.json({ error: 'Password is too weak. Try a longer one.', fields: { password: error.message } }, { status: 400 });
    case 'invalid_credentials':
      return Response.json({ error: 'Incorrect email or password.' }, { status: 401 });
    case 'email_not_confirmed':
      return Response.json({ error: 'Please confirm your email before logging in.' }, { status: 403 });
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return Response.json({ error: 'Too many attempts. Please wait a minute and try again.' }, { status: 429 });
    default:
      console.error(error);
      return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export const notConfigured = () =>
  Response.json({ error: 'Accounts are not available yet: Supabase is not configured.' }, { status: 503 });
