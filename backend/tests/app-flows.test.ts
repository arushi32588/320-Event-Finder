import type { SupabaseClient, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as approveEvent } from '@/app/api/admin/events/[id]/approve/route';
import { POST as rejectEvent } from '@/app/api/admin/events/[id]/reject/route';
import { GET as listAdminEvents } from '@/app/api/admin/events/route';
import { POST as refresh } from '@/app/api/auth/refresh/route';
import { DELETE as cancelRsvp, GET as getRsvp, PUT as putRsvp } from '@/app/api/events/[id]/rsvp/route';
import { PATCH as patchProfile } from '@/app/api/me/profile/route';
import { GET as listRsvps } from '@/app/api/me/rsvps/route';
import { requireUser } from '@/lib/session';
import { createAuthClient } from '@/lib/supabase';
import { fakeSupabase, request } from './helpers/fake-supabase';

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  requireUser: vi.fn(),
}));
vi.mock('@/lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase')>()),
  createAuthClient: vi.fn(),
}));

type QueryResult = { data: unknown; error: { message: string } | null };

const user = { id: 'user-1', email: 'a@umass.edu', user_metadata: {} } as unknown as User;
const ok = (data: unknown): QueryResult => ({ data, error: null });
const failed = (message: string): QueryResult => ({ data: null, error: { message } });
const eventRow = {
  id: 7, title: 'Hack Night', description: null, location: null, start_time: '2026-12-01T00:00:00Z', end_time: null,
  price_cents: 0, ages: null, accessibility: null, transportation: null, image_url: null,
  external_organizer_name: 'Hack Club', organizer_profiles: null, approval_status: 'pending',
};

// Each table answers with its queued results, in order, however the query is chained.
function signIn(tables: Record<string, QueryResult[]>) {
  const calls: Record<string, Array<[string, unknown[]]>> = {};
  const from = (table: string) => {
    const next = tables[table]?.shift();
    if (!next) throw new Error(`Unexpected query on ${table}`);
    const fake = fakeSupabase(next);
    calls[table] = fake.calls;
    return fake.client.from(table);
  };
  vi.mocked(requireUser).mockResolvedValue({ user, supabase: { from } as unknown as SupabaseClient, accessToken: 'token' });
  return calls;
}
const signedOut = () => vi.mocked(requireUser).mockResolvedValue(Response.json({ error: 'Please log in to continue.' }, { status: 401 }));
const admin = ok({ name: 'Ada', email: 'a@umass.edu', role: 'admin', date_of_birth: null });
const attendee = ok({ name: 'Sam', email: 's@umass.edu', role: 'attendee', date_of_birth: null });

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const url = (path: string) => `http://localhost${path}`;
const adminPost = (id: string) => new Request(url(`/api/admin/events/${id}/approve`), { method: 'POST' });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('RSVP endpoints', () => {
  const rsvpReq = (method: string) => new Request(url('/api/events/7/rsvp'), { method });

  it('requires a login', async () => {
    signedOut();
    expect((await putRsvp(rsvpReq('PUT'), context('7'))).status).toBe(401);
  });

  it('rejects an invalid event id before checking the login', async () => {
    expect((await getRsvp(rsvpReq('GET'), context('abc'))).status).toBe(400);
    expect(requireUser).not.toHaveBeenCalled();
  });

  it('reports whether the user is going', async () => {
    signIn({ rsvps: [ok({ status: 'going' }), ok(null)] });
    expect(await (await getRsvp(rsvpReq('GET'), context('7'))).json()).toEqual({ going: true });
    expect(await (await getRsvp(rsvpReq('GET'), context('7'))).json()).toEqual({ going: false });
  });

  it('saves an RSVP for an approved event, as the logged-in user', async () => {
    const calls = signIn({ events: [ok({ id: 7 })], rsvps: [ok(null)] });
    const res = await putRsvp(rsvpReq('PUT'), context('7'));
    expect(await res.json()).toEqual({ going: true });
    expect(calls.rsvps[1]).toEqual(['upsert', [{ user_id: 'user-1', event_id: '7', status: 'going' }, { onConflict: 'user_id,event_id' }]]);
  });

  it('returns 404 for an event that is not approved', async () => {
    signIn({ events: [ok(null)] });
    expect((await putRsvp(rsvpReq('PUT'), context('7'))).status).toBe(404);
  });

  it('cancels an RSVP', async () => {
    signIn({ rsvps: [ok(null)] });
    expect(await (await cancelRsvp(rsvpReq('DELETE'), context('7'))).json()).toEqual({ going: false });
  });

  it('hides database errors behind a friendly 500', async () => {
    signIn({ rsvps: [failed('secret internals')] });
    const res = await getRsvp(rsvpReq('GET'), context('7'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret internals');
  });

  it('lists the events a user is going to', async () => {
    signIn({ rsvps: [ok([{ id: 1, events: eventRow }])] });
    const { events } = await (await listRsvps(new Request(url('/api/me/rsvps')))).json();
    expect(events).toEqual([expect.objectContaining({ id: '7', title: 'Hack Night' })]);
  });
});

describe('PATCH /api/me/profile', () => {
  const patch = (body: unknown) => patchProfile(new Request(url('/api/me/profile'), { method: 'PATCH', body: JSON.stringify(body) }));

  it('updates the name, trimmed, and returns the profile', async () => {
    const calls = signIn({ users: [ok(null), ok({ name: 'New Name', email: 'a@umass.edu', role: 'attendee', date_of_birth: null })], organizer_profiles: [ok(null)] });
    const res = await patch({ name: '  New Name ' });
    expect(res.status).toBe(200);
    expect((await res.json()).profile.name).toBe('New Name');
    expect(calls.users).toBeDefined();
  });

  it.each([[{}], [{ name: '   ' }], [{ name: 42 }], [{ name: 'x'.repeat(256) }]])('rejects %j', async (body) => {
    signIn({});
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect((await res.json()).fields.name).toBeDefined();
  });

  it('requires a login', async () => {
    signedOut();
    expect((await patch({ name: 'X' })).status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  const post = (body: unknown) => refresh(request(url('/api/auth/refresh'), body));
  const withAuth = (refreshSession: ReturnType<typeof vi.fn>) =>
    vi.mocked(createAuthClient).mockReturnValue({ auth: { refreshSession } } as unknown as SupabaseClient);

  it('returns new tokens', async () => {
    const session = { access_token: 'new', refresh_token: 'newer', expires_at: 123 };
    const refreshSession = vi.fn().mockResolvedValue({ data: { session, user: { id: 'u', email: 'a@b.co', user_metadata: {} } }, error: null });
    withAuth(refreshSession);
    const res = await post({ refreshToken: 'old' });
    expect(res.status).toBe(200);
    expect((await res.json()).session).toEqual({ accessToken: 'new', refreshToken: 'newer', expiresAt: 123 });
    expect(refreshSession).toHaveBeenCalledWith({ refresh_token: 'old' });
  });

  it('returns 401 for an expired refresh token', async () => {
    withAuth(vi.fn().mockResolvedValue({ data: { session: null, user: null }, error: { message: 'expired' } }));
    expect((await post({ refreshToken: 'old' })).status).toBe(401);
  });

  it('returns 400 when no token is sent', async () => {
    expect((await post({})).status).toBe(400);
  });

  it('returns 503 when Supabase is not configured', async () => {
    vi.mocked(createAuthClient).mockReturnValue(null);
    expect((await post({ refreshToken: 'old' })).status).toBe(503);
  });
});

describe('admin event review', () => {
  it('blocks non-admins from all three endpoints', async () => {
    signIn({ users: [attendee, attendee, attendee] });
    expect((await listAdminEvents(new Request(url('/api/admin/events')))).status).toBe(403);
    expect((await approveEvent(adminPost('7'), context('7'))).status).toBe(403);
    expect((await rejectEvent(adminPost('7'), context('7'))).status).toBe(403);
  });

  it('requires a login', async () => {
    signedOut();
    expect((await listAdminEvents(new Request(url('/api/admin/events')))).status).toBe(401);
  });

  it('lists pending events by default', async () => {
    const calls = signIn({ users: [admin], events: [ok([eventRow])] });
    const { events } = await (await listAdminEvents(new Request(url('/api/admin/events')))).json();
    expect(events).toEqual([expect.objectContaining({ id: '7', status: 'pending', organizer: 'Hack Club' })]);
    expect(calls.events).toContainEqual(['eq', ['approval_status', 'pending']]);
  });

  it('returns 400 for an unknown status', async () => {
    signIn({ users: [admin] });
    expect((await listAdminEvents(new Request(url('/api/admin/events?status=later')))).status).toBe(400);
  });

  it('approves a pending event and records the reviewer', async () => {
    const calls = signIn({ users: [admin], events: [ok({ ...eventRow, approval_status: 'approved' })] });
    const res = await approveEvent(adminPost('7'), context('7'));
    expect(res.status).toBe(200);
    expect((await res.json()).event.status).toBe('approved');
    expect(calls.events).toContainEqual(['update', [{ approval_status: 'approved', reviewed_by_user_id: 'user-1' }]]);
    expect(calls.events).toContainEqual(['eq', ['approval_status', 'pending']]);
  });

  it('rejects a pending event', async () => {
    signIn({ users: [admin], events: [ok({ ...eventRow, approval_status: 'rejected' })] });
    expect((await (await rejectEvent(adminPost('7'), context('7'))).json()).event.status).toBe('rejected');
  });

  it('returns 409 if already reviewed and 404 if it does not exist', async () => {
    signIn({ users: [admin, admin], events: [ok(null), ok({ id: 7 }), ok(null), ok(null)] });
    expect((await approveEvent(adminPost('7'), context('7'))).status).toBe(409);
    expect((await approveEvent(adminPost('7'), context('7'))).status).toBe(404);
  });

  it('returns 400 for an invalid id', async () => {
    signIn({ users: [admin] });
    expect((await approveEvent(adminPost('abc'), context('abc'))).status).toBe(400);
  });

  it('hides database errors behind a friendly 500', async () => {
    signIn({ users: [admin], events: [failed('secret internals')] });
    const res = await approveEvent(adminPost('7'), context('7'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret internals');
  });
});
