import type { SupabaseClient, User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as listImages } from '@/app/api/events/[id]/images/route';
import { POST as addImage } from '@/app/api/me/events/[id]/images/route';
import { DELETE as removeImage } from '@/app/api/me/events/[id]/images/[imageId]/route';
import { createUserClient, requireUser } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import { fakeSupabase } from './helpers/fake-supabase';

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  requireUser: vi.fn(),
  createUserClient: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ getSupabase: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));

type QueryResult = { data: unknown; error: { message: string; code?: string } | null };

const PUBLIC_BASE = 'https://demo.supabase.co/storage/v1/object/public/event-images/';
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];

const user = { id: 'user-1', email: 'sam@umass.edu', user_metadata: {} } as unknown as User;

const ok = (data: unknown = null): QueryResult => ({ data, error: null });
const failed = (message: string, code?: string): QueryResult => ({ data: null, error: { message, code } });

const ownEvent = ok({ submitted_by_user_id: 'user-1', image_url: null });

function fakeClient({
  events = ownEvent,
  eventImages = ok([]),
  rpc = ok({ id: 3, image_url: `${PUBLIC_BASE}7/gallery/new.png` }),
  upload = ok({ path: 'x' }),
}: { events?: QueryResult; eventImages?: QueryResult; rpc?: QueryResult; upload?: QueryResult } = {}) {
  const tables: Record<string, ReturnType<typeof fakeSupabase>> = {
    events: fakeSupabase(events),
    event_images: fakeSupabase(eventImages),
  };
  const storage = {
    upload: vi.fn(async () => upload),
    remove: vi.fn(async () => ok([])),
    getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `${PUBLIC_BASE}${path}` } })),
  };
  const rpcFn = vi.fn(() => {
    const result = Promise.resolve(rpc);
    return Object.assign(result, { single: () => result });
  });
  const client = {
    from: (table: string) => tables[table].client.from(table),
    rpc: rpcFn,
    storage: { from: vi.fn(() => storage) },
  };
  return { client: client as unknown as SupabaseClient, rpc: rpcFn, storage, calls: (table: string) => tables[table].calls };
}

function signIn(options: Parameters<typeof fakeClient>[0] = {}) {
  const fake = fakeClient(options);
  vi.mocked(requireUser).mockResolvedValue({ user, supabase: fake.client, accessToken: 'token' });
  return fake;
}

function pngFile() {
  return new File([new Uint8Array(PNG)], 'photo.png', { type: 'image/png' });
}

function add(file: File | null = pngFile(), id = '7') {
  const form = new FormData();
  if (file) form.set('image', file);
  return addImage(
    new Request(`http://localhost/api/me/events/${id}/images`, {
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: form,
    }),
    { params: Promise.resolve({ id }) },
  );
}

function remove(imageId = '3', id = '7') {
  return removeImage(
    new Request(`http://localhost/api/me/events/${id}/images/${imageId}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer token' },
    }),
    { params: Promise.resolve({ id, imageId }) },
  );
}

function list(id = '7', token?: string) {
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  return listImages(new Request(`http://localhost/api/events/${id}/images`, { headers }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/me/events/:id/images', () => {
  it('returns 401 when not logged in', async () => {
    vi.mocked(requireUser).mockResolvedValue(Response.json({ error: 'Please log in to continue.' }, { status: 401 }));
    expect((await add()).status).toBe(401);
  });

  it('rejects a missing or bad file with 400', async () => {
    const fake = signIn();
    expect((await add(null)).status).toBe(400);
    expect(fake.storage.upload).not.toHaveBeenCalled();
  });

  it('adds the photo to the event', async () => {
    const fake = signIn();
    const res = await add();
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ image: { id: '3', url: `${PUBLIC_BASE}7/gallery/new.png` } });
    expect(fake.storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^7\/gallery\/[0-9a-f-]+\.png$/),
      expect.any(Uint8Array),
      { contentType: 'image/png', upsert: false },
    );
    expect(fake.rpc).toHaveBeenCalledWith('add_event_image', {
      p_event_id: '7',
      p_image_url: expect.stringMatching(new RegExp(`^${PUBLIC_BASE}7/gallery/`)),
    });
  });

  it('returns 409 and cleans up when the event already has 6 photos', async () => {
    const fake = signIn({ rpc: failed('An event can have up to 6 photos', 'EF409') });
    const res = await add();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'An event can have up to 6 photos' });
    expect(fake.storage.remove).toHaveBeenCalledWith([expect.stringMatching(/^7\/gallery\//)]);
  });

  it('returns 403 when the user did not submit the event', async () => {
    const fake = signIn({ events: ok({ submitted_by_user_id: 'someone-else', image_url: null }) });
    expect((await add()).status).toBe(403);
    expect(fake.storage.upload).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown event', async () => {
    signIn({ events: ok(null) });
    expect((await add()).status).toBe(404);
  });

  it('returns a friendly 500 and cleans up when saving fails', async () => {
    const fake = signIn({ rpc: failed('db down') });
    const res = await add();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Could not add this photo. Please try again.' });
    expect(fake.storage.remove).toHaveBeenCalledTimes(1);
  });

  it('returns a friendly 500 when the upload fails', async () => {
    const fake = signIn({ upload: failed('storage down') });
    expect((await add()).status).toBe(500);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/me/events/:id/images/:imageId', () => {
  it('rejects a bad photo id with 400', async () => {
    signIn();
    expect((await remove('abc')).status).toBe(400);
  });

  it('returns 401 when not logged in', async () => {
    vi.mocked(requireUser).mockResolvedValue(Response.json({ error: 'Please log in to continue.' }, { status: 401 }));
    expect((await remove()).status).toBe(401);
  });

  it('removes the photo and its stored file', async () => {
    const fake = signIn({ rpc: ok(`${PUBLIC_BASE}7/gallery/old.png`) });
    const res = await remove();
    expect(res.status).toBe(204);
    expect(fake.rpc).toHaveBeenCalledWith('remove_event_image', { p_event_id: '7', p_image_id: '3' });
    expect(fake.storage.remove).toHaveBeenCalledWith(['7/gallery/old.png']);
  });

  it('returns 404 for a photo that is not on the event', async () => {
    const fake = signIn({ rpc: failed('Photo not found', 'EF404') });
    expect((await remove()).status).toBe(404);
    expect(fake.storage.remove).not.toHaveBeenCalled();
  });

  it('returns 403 when the user did not submit the event', async () => {
    const fake = signIn({ events: ok({ submitted_by_user_id: 'someone-else', image_url: null }) });
    expect((await remove()).status).toBe(403);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('returns a friendly 500 when the database fails', async () => {
    signIn({ rpc: failed('db down') });
    const res = await remove();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Could not remove this photo. Please try again.' });
  });
});

describe('GET /api/events/:id/images', () => {
  it('rejects a bad event id with 400', async () => {
    expect((await list('abc')).status).toBe(400);
  });

  it('lists the photos oldest first', async () => {
    const fake = fakeClient({
      events: ok({ id: 7 }),
      eventImages: ok([
        { id: 1, image_url: `${PUBLIC_BASE}7/gallery/a.png` },
        { id: 2, image_url: `${PUBLIC_BASE}7/gallery/b.png` },
      ]),
    });
    vi.mocked(getSupabase).mockReturnValue(fake.client);
    const res = await list();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      images: [
        { id: '1', url: `${PUBLIC_BASE}7/gallery/a.png` },
        { id: '2', url: `${PUBLIC_BASE}7/gallery/b.png` },
      ],
    });
    expect(fake.calls('event_images')).toContainEqual(['order', ['id', { ascending: true }]]);
  });

  it('uses the logged in user so submitters can see photos on pending events', async () => {
    const fake = fakeClient({ events: ok({ id: 7 }) });
    vi.mocked(createUserClient).mockReturnValue(fake.client);
    expect((await list('7', 'token')).status).toBe(200);
    expect(createUserClient).toHaveBeenCalledWith('token');
    expect(getSupabase).not.toHaveBeenCalled();
  });

  it('returns 404 for an event the user cannot see', async () => {
    vi.mocked(getSupabase).mockReturnValue(fakeClient({ events: ok(null) }).client);
    expect((await list()).status).toBe(404);
  });

  it('returns an empty list without Supabase configured', async () => {
    vi.mocked(getSupabase).mockReturnValue(null);
    expect(await (await list()).json()).toEqual({ images: [] });
  });

  it('returns a friendly 500 when the database fails', async () => {
    vi.mocked(getSupabase).mockReturnValue(fakeClient({ events: ok({ id: 7 }), eventImages: failed('db down') }).client);
    const res = await list();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Could not load the photos for this event. Please try again.' });
  });
});
