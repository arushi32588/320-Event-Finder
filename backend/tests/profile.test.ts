import type { SupabaseClient, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getProfileRoute } from '@/app/api/me/profile/route';
import { getProfile } from '@/lib/profile';
import { requireUser } from '@/lib/session';
import { fakeSupabase, request } from './helpers/fake-supabase';

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  requireUser: vi.fn(),
}));

type QueryResult = { data: unknown; error: { message: string } | null };

function fakeTables(results: Record<string, QueryResult>) {
  const tables = Object.fromEntries(Object.entries(results).map(([table, result]) => [table, fakeSupabase(result)]));
  const client = { from: (table: string) => tables[table].client.from(table) };
  return { client: client as unknown as SupabaseClient, calls: (table: string) => tables[table].calls };
}

const user = { id: 'user-1', email: 'sam@umass.edu', user_metadata: {} } as unknown as User;

const userRow = { name: 'Sam', email: 'sam@umass.edu', role: 'attendee', date_of_birth: '2004-05-01' };

const account = { id: 'user-1', email: 'sam@umass.edu', name: 'Sam', dateOfBirth: '2004-05-01', role: 'attendee' };

const ok = (data: unknown): QueryResult => ({ data, error: null });
const failed = (message: string): QueryResult => ({ data: null, error: { message } });

const callRoute = () =>
  getProfileRoute(new Request('http://localhost/api/me/profile', { headers: { authorization: 'Bearer token' } }));

function signIn(results: Record<string, QueryResult>) {
  const fake = fakeTables(results);
  vi.mocked(requireUser).mockResolvedValue({ user, supabase: fake.client, accessToken: 'token' });
  return fake;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getProfile', () => {
  it('returns none when the user never applied to be an organizer', async () => {
    const { client } = fakeTables({ users: ok(userRow), organizer_profiles: ok(null) });
    expect(await getProfile(client, user)).toEqual({ ...account, organizerStatus: 'none', organizationName: null });
  });

  it('returns the organizer status and organization name', async () => {
    const { client } = fakeTables({
      users: ok(userRow),
      organizer_profiles: ok({ organization_name: 'Hack Club', verification_status: 'pending' }),
    });
    expect(await getProfile(client, user)).toEqual({
      ...account,
      organizerStatus: 'pending',
      organizationName: 'Hack Club',
    });
  });

  it('looks up the organizer profile for the signed-in user', async () => {
    const fake = fakeTables({ users: ok(userRow), organizer_profiles: ok(null) });
    await getProfile(fake.client, user);
    expect(fake.calls('organizer_profiles')).toContainEqual(['eq', ['user_id', 'user-1']]);
  });

  it('throws when the organizer profile query fails', async () => {
    const { client } = fakeTables({ users: ok(userRow), organizer_profiles: failed('boom') });
    await expect(getProfile(client, user)).rejects.toThrow('boom');
  });
});

describe('GET /api/me/profile', () => {
  it('returns 401 when not logged in', async () => {
    vi.mocked(requireUser).mockResolvedValue(Response.json({ error: 'Please log in to continue.' }, { status: 401 }));
    const res = await getProfileRoute(request('http://localhost/api/me/profile'));
    expect(res.status).toBe(401);
  });

  it('returns the profile for an approved organizer', async () => {
    signIn({
      users: ok({ ...userRow, role: 'organizer' }),
      organizer_profiles: ok({ organization_name: 'Hack Club', verification_status: 'approved' }),
    });
    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      profile: { ...account, role: 'organizer', organizerStatus: 'approved', organizationName: 'Hack Club' },
    });
  });

  it('returns a friendly 500 when the users query fails', async () => {
    signIn({ users: failed('down'), organizer_profiles: ok(null) });
    const res = await callRoute();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Could not load your profile. Please try again.' });
  });

  it('returns a friendly 500 when the organizer profile query fails', async () => {
    signIn({ users: ok(userRow), organizer_profiles: failed('down') });
    expect((await callRoute()).status).toBe(500);
  });
});
