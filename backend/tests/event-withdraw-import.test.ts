import type { SupabaseClient, User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as importRoute } from '@/app/api/admin/events/import/route';
import { DELETE as deleteRoute } from '@/app/api/me/events/[id]/route';
import { importEvents, normalizeSourceUrl } from '@/lib/event-import';
import { MAX_IMAGE_BYTES, readEventImage, storagePathFromUrl } from '@/lib/event-images';
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
  const removed: string[][] = [];
  const storage = { from: () => ({ remove: async (paths: string[]) => (removed.push(paths), { error: null }) }) };
  return { client: { from, storage } as unknown as SupabaseClient, calls, removed };
}

const user = { id: 'user-1', email: 'a@umass.edu', user_metadata: {} } as unknown as User;
const asUser = (client: SupabaseClient) =>
  vi.mocked(requireUser).mockResolvedValue({ user, supabase: client, accessToken: 't' });

const del = (id: string) =>
  deleteRoute(new Request(`http://localhost/api/me/events/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });

const BASE_URL = 'https://demo.supabase.co/storage/v1/object/public/event-images/';
const mine = (status: string, extra: Record<string, unknown> = {}) =>
  ok({ id: 5, submitted_by_user_id: 'user-1', source: 'user_submission', approval_status: status, image_url: null, ...extra });

describe('withdrawing an event', () => {
  beforeEach(() => vi.resetAllMocks());

  it('deletes your own pending event', async () => {
    const { client, calls } = queued([mine('pending'), ok([]), ok({ id: 5 })]);
    asUser(client);
    const res = await del('5');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ withdrawn: true });
    expect(calls).toContainEqual(['eq', ['submitted_by_user_id', 'user-1']]);
    expect(calls).toContainEqual(['in', ['approval_status', ['pending', 'rejected']]]);
  });

  it('removes the cover photo and gallery photos from storage', async () => {
    const { client, removed } = queued([
      mine('pending', { image_url: `${BASE_URL}5/cover.png` }),
      ok([{ image_url: `${BASE_URL}5/gallery/a.jpg` }, { image_url: 'https://elsewhere.example/x.png' }]),
      ok({ id: 5 }),
    ]);
    expect(await withdrawEvent(client, 'user-1', '5')).toEqual({ ok: true });
    expect(removed).toEqual([['5/cover.png', '5/gallery/a.jpg']]);
  });

  it('hides events that belong to someone else', async () => {
    const { client, calls, removed } = queued([mine('pending', { submitted_by_user_id: 'someone-else' })]);
    asUser(client);
    expect((await del('5')).status).toBe(404);
    expect(calls.some(([m]) => m === 'delete')).toBe(false);
    expect(removed).toEqual([]);
  });

  it('refuses an already approved event and leaves its photos alone', async () => {
    const { client, calls, removed } = queued([mine('approved', { image_url: `${BASE_URL}5/cover.png` })]);
    asUser(client);
    expect((await del('5')).status).toBe(409);
    expect(calls.some(([m]) => m === 'delete')).toBe(false);
    expect(removed).toEqual([]);
  });

  it('rejects invalid event ids without touching the database', async () => {
    const { client, calls } = queued([]);
    asUser(client);
    for (const id of ['abc', '0', '-1', '1.5', '12345678901234567890']) {
      expect((await del(id)).status).toBe(400);
    }
    expect(calls).toEqual([]);
  });

});

describe('image upload edge cases', () => {
  const file = (bytes: number[], type: string, size?: number) =>
    new File([size ? new Uint8Array(size).map((_, i) => bytes[i] ?? 0) : new Uint8Array(bytes)], 'p', { type });
  const form = (value?: File | string) => {
    const f = new FormData();
    if (value !== undefined) f.set('image', value);
    return new Request('http://localhost/x', { method: 'PUT', body: f });
  };
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];

  it('accepts a file of exactly 5 MB and rejects one byte more', async () => {
    expect(await readEventImage(form(file(PNG, 'image/png', MAX_IMAGE_BYTES)))).toHaveProperty('image');
    expect(await readEventImage(form(file(PNG, 'image/png', MAX_IMAGE_BYTES + 1)))).toHaveProperty('error');
  });

  it('rejects an empty file', async () => {
    expect(await readEventImage(form(file([], 'image/png')))).toEqual({ error: 'Choose a photo.' });
  });

  it('uses the real format, not the claimed one, for the file extension', async () => {
    const result = await readEventImage(form(file(PNG, 'image/jpeg')));
    expect(result).toMatchObject({ image: { contentType: 'image/png', extension: 'png' } });
  });

  it('ignores a storage link with broken percent-encoding instead of throwing', () => {
    expect(storagePathFromUrl(`${BASE_URL}5/%E0%A4%A.png`)).toBeNull();
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

});
