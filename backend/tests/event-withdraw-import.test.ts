import type { SupabaseClient, User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as importRoute } from '@/app/api/admin/events/import/route';
import { DELETE as deleteRoute } from '@/app/api/me/events/[id]/route';
import { importEvents, normalizeSourceUrl } from '@/lib/event-import';
import { withdrawEvent } from '@/lib/event-submissions';
import { requireUser } from '@/lib/session';

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  requireUser: vi.fn(),
}));

type Result = { data: unknown; error: { message: string; code?: string } | null };
const ok = (data: unknown): Result => ({ data, error: null });

// Each query on the client takes the next queued result. Calls are recorded.
function queued(results: Result[]) {
  const calls: Array<[string, unknown[]]> = [];
  const from = (table: string) => {
    const result = results.shift() ?? ok(null);
    calls.push(['from', [table]]);
    const builder: object = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (res: (r: Result) => unknown) => Promise.resolve(result).then(res);
        return (...args: unknown[]) => {
          calls.push([String(prop), args]);
          return builder;
        };
      },
    });
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, calls };
}

const user = { id: 'user-1', email: 'a@umass.edu', user_metadata: {} } as unknown as User;
const asUser = (client: SupabaseClient) =>
  vi.mocked(requireUser).mockResolvedValue({ user, supabase: client, accessToken: 't' });

const del = (id: string) =>
  deleteRoute(new Request(`http://localhost/api/me/events/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });

describe('withdrawing an event', () => {
  beforeEach(() => vi.resetAllMocks());

  it('deletes your own pending event', async () => {
    const { client, calls } = queued([ok({ id: 5 })]);
    asUser(client);
    const res = await del('5');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ withdrawn: true });
    expect(calls).toContainEqual(['eq', ['submitted_by_user_id', 'user-1']]);
    expect(calls).toContainEqual(['in', ['approval_status', ['pending', 'rejected']]]);
  });

  it('hides events that belong to someone else', async () => {
    const { client } = queued([ok(null), ok({ id: 5, submitted_by_user_id: 'someone-else' })]);
    asUser(client);
    const res = await del('5');
    expect(res.status).toBe(404);
  });

  it('refuses an already approved event', async () => {
    const { client } = queued([ok(null), ok({ id: 5, submitted_by_user_id: 'user-1' })]);
    asUser(client);
    const res = await del('5');
    expect(res.status).toBe(409);
  });

  it('404s for an event that does not exist', async () => {
    expect(await withdrawEvent(queued([ok(null), ok(null)]).client, 'user-1', '99')).toMatchObject({ status: 404 });
  });

  it.each(['abc', '0', '-1', '1.5', '12345678901234567890'])('rejects the invalid id %s', async (id) => {
    const { client, calls } = queued([]);
    asUser(client);
    expect((await del(id)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('requires a login', async () => {
    vi.mocked(requireUser).mockResolvedValue(Response.json({ error: 'Please log in to continue.' }, { status: 401 }));
    expect((await del('5')).status).toBe(401);
  });

  it('returns 500 when the database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    asUser(queued([{ data: null, error: { message: 'boom' } }]).client);
    expect((await del('5')).status).toBe(500);
  });
});

const NOW = new Date('2026-11-21T12:00:00Z');
const good = (n = 1, extra: Record<string, unknown> = {}) => ({
  title: `Event ${n}`,
  startsAt: '2026-12-01T19:00:00-05:00',
  sourceUrl: `https://events.example/e/${n}`,
  sourceName: 'Example',
  ...extra,
});

describe('importing events', () => {
  it('creates new events as pending and scraped', async () => {
    const { client, calls } = queued([ok([]), ok(null)]);
    const result = await importEvents(client, [good()], NOW);
    expect(result).toEqual({ created: 1, duplicates: [], invalid: [] });
    const insert = calls.find(([m]) => m === 'insert')![1][0] as Record<string, unknown>;
    expect(insert).toMatchObject({ source: 'scraped', approval_status: 'pending', external_source_url: 'https://events.example/e/1' });
  });

  it('skips an event already in the database', async () => {
    const { client, calls } = queued([ok([{ id: 3 }])]);
    const result = await importEvents(client, [good()], NOW);
    expect(result.created).toBe(0);
    expect(result.duplicates).toHaveLength(1);
    expect(calls.some(([m]) => m === 'insert')).toBe(false);
  });

  it('skips repeats inside one batch, even with a different #fragment', async () => {
    const { client } = queued([ok([]), ok(null)]);
    const result = await importEvents(client, [good(1), good(1, { sourceUrl: 'https://events.example/e/1#top' })], NOW);
    expect(result.created).toBe(1);
    expect(result.duplicates).toEqual([{ index: 1, sourceUrl: 'https://events.example/e/1' }]);
  });

  it('counts a unique-index violation as a duplicate', async () => {
    const { client } = queued([ok([]), { data: null, error: { message: 'dup', code: '23505' } }]);
    const result = await importEvents(client, [good()], NOW);
    expect(result).toMatchObject({ created: 0, duplicates: [{ index: 0 }] });
  });

  it('reports malformed events without stopping the rest', async () => {
    const { client } = queued([ok([]), ok(null)]);
    const result = await importEvents(
      client,
      [null, 'text', [], { title: 5 }, good(1, { sourceUrl: 'ftp://x' }), good(2, { startsAt: 'tomorrow' }), good(3)],
      NOW,
    );
    expect(result.created).toBe(1);
    expect(result.invalid.map((i) => i.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.invalid[3].fields).toMatchObject({ title: expect.any(String), startsAt: expect.any(String), sourceUrl: expect.any(String) });
    expect(result.invalid[4].fields).toHaveProperty('sourceUrl');
    expect(result.invalid[5].fields).toHaveProperty('startsAt');
  });

  it('normalizes and validates source links', () => {
    expect(normalizeSourceUrl(' https://a.example/x#y ')).toBe('https://a.example/x');
    expect(normalizeSourceUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeSourceUrl(42)).toBeNull();
    expect(normalizeSourceUrl(`https://a.example/${'x'.repeat(2100)}`)).toBeNull();
  });
});

describe('import route', () => {
  beforeEach(() => vi.resetAllMocks());
  const post = (body: unknown, raw?: string) =>
    importRoute(new Request('http://localhost/api/admin/events/import', { method: 'POST', body: raw ?? JSON.stringify(body) }));
  const asRole = (role: string) =>
    asUser(queued([ok({ name: 'A', email: 'a@umass.edu', role, date_of_birth: null }), ok([]), ok(null)]).client);

  it('turns away non-admins', async () => {
    asRole('organizer');
    expect((await post({ events: [good()] })).status).toBe(403);
  });

  it('rejects bodies that are not { events: [...] }', async () => {
    for (const [body, raw] of [[{}], [{ events: [] }], [{ events: 'x' }], [undefined, '{nope']] as const) {
      asRole('admin');
      expect((await post(body, raw)).status).toBe(400);
    }
  });

  it('rejects oversized batches', async () => {
    asRole('admin');
    expect((await post({ events: Array.from({ length: 101 }, (_, i) => good(i)) })).status).toBe(400);
  });

  it('imports for an admin', async () => {
    asRole('admin');
    const res = await post({ events: [good()] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ created: 1 });
  });
});
