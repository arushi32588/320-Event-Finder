import type { SupabaseClient, User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, PUT } from '@/app/api/me/events/[id]/image/route';
import { MAX_IMAGE_BYTES, readEventImage, storagePathFromUrl } from '@/lib/event-images';
import { requireUser } from '@/lib/session';
import { fakeSupabase } from './helpers/fake-supabase';

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  requireUser: vi.fn(),
}));

type QueryResult = { data: unknown; error: { message: string; code?: string } | null };

const PUBLIC_BASE = 'https://demo.supabase.co/storage/v1/object/public/event-images/';
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

const user = { id: 'user-1', email: 'sam@umass.edu', user_metadata: {} } as unknown as User;

const ok = (data: unknown = null): QueryResult => ({ data, error: null });
const failed = (message: string, code?: string): QueryResult => ({ data: null, error: { message, code } });

const ownEvent = (imageUrl: string | null = null) => ok({ submitted_by_user_id: 'user-1', image_url: imageUrl });

function fakeClient({
  event = ownEvent(),
  rpc = ok(),
  upload = ok({ path: 'x' }),
  remove = ok([]),
}: { event?: QueryResult; rpc?: QueryResult; upload?: QueryResult; remove?: QueryResult } = {}) {
  const events = fakeSupabase(event);
  const storage = {
    upload: vi.fn(async () => upload),
    remove: vi.fn(async () => remove),
    getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `${PUBLIC_BASE}${path}` } })),
  };
  const client = {
    from: events.client.from,
    rpc: vi.fn(async () => rpc),
    storage: { from: vi.fn(() => storage) },
  };
  return { client: client as unknown as SupabaseClient, rpc: client.rpc, storage, eventCalls: events.calls };
}

function signIn(options: Parameters<typeof fakeClient>[0] = {}) {
  const fake = fakeClient(options);
  vi.mocked(requireUser).mockResolvedValue({ user, supabase: fake.client, accessToken: 'token' });
  return fake;
}

function imageFile(bytes: number[], type = 'image/png', name = 'photo.png', size?: number) {
  const body = size ? new Uint8Array(size).map((_, i) => bytes[i] ?? 0) : new Uint8Array(bytes);
  return new File([body], name, { type });
}

function uploadRequest(file?: File | string) {
  const form = new FormData();
  if (file !== undefined) form.set('image', file);
  return new Request('http://localhost/api/me/events/7/image', {
    method: 'PUT',
    headers: { authorization: 'Bearer token' },
    body: form,
  });
}

const context = (id = '7') => ({ params: Promise.resolve({ id }) });

const upload = (file?: File | string, id = '7') => PUT(uploadRequest(file), context(id));

const remove = (id = '7') =>
  DELETE(
    new Request(`http://localhost/api/me/events/${id}/image`, { method: 'DELETE', headers: { authorization: 'Bearer token' } }),
    context(id),
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('readEventImage', () => {
  it('accepts JPEG, PNG and WebP files', async () => {
    for (const [bytes, type] of [[JPEG, 'image/jpeg'], [PNG, 'image/png'], [WEBP, 'image/webp']] as const) {
      const result = await readEventImage(uploadRequest(imageFile([...bytes], type)));
      expect(result).toMatchObject({ image: { contentType: type } });
    }
  });

  it('requires a file', async () => {
    expect(await readEventImage(uploadRequest())).toEqual({ error: 'Choose a photo.' });
    expect(await readEventImage(uploadRequest('not a file'))).toEqual({ error: 'Choose a photo.' });
  });

  it('rejects other file types', async () => {
    const result = await readEventImage(uploadRequest(imageFile([0x47, 0x49, 0x46], 'image/gif', 'photo.gif')));
    expect(result).toEqual({ error: 'Use a JPEG, PNG or WebP image.' });
  });

  it('rejects a file whose contents are not the image type it claims', async () => {
    const result = await readEventImage(uploadRequest(imageFile([0x3c, 0x73, 0x76, 0x67], 'image/png')));
    expect(result).toEqual({ error: 'That file is not a JPEG, PNG or WebP image.' });
  });

  it('rejects files over 5 MB', async () => {
    const result = await readEventImage(uploadRequest(imageFile(PNG, 'image/png', 'big.png', MAX_IMAGE_BYTES + 1)));
    expect(result).toEqual({ error: 'That file is 5.0 MB. Photos can be up to 5 MB.' });
  });

  it('rejects a body that is not a file upload', async () => {
    const request = new Request('http://localhost/api/me/events/7/image', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(await readEventImage(request)).toEqual({ error: 'Send the photo as a file upload in the "image" field.' });
  });
});

describe('storagePathFromUrl', () => {
  it('returns the storage path for an uploaded image', () => {
    expect(storagePathFromUrl(`${PUBLIC_BASE}7/abc.png`)).toBe('7/abc.png');
  });

  it('ignores images that are not in the bucket', () => {
    expect(storagePathFromUrl('https://example.com/photo.png')).toBeNull();
    expect(storagePathFromUrl(null)).toBeNull();
  });
});

describe('PUT /api/me/events/:id/image', () => {
  it('returns 401 when not logged in', async () => {
    vi.mocked(requireUser).mockResolvedValue(Response.json({ error: 'Please log in to continue.' }, { status: 401 }));
    expect((await upload(imageFile(PNG))).status).toBe(401);
  });

  it('rejects a bad event id with 400', async () => {
    signIn();
    expect((await upload(imageFile(PNG), 'abc')).status).toBe(400);
  });

  it('rejects a bad file with 400', async () => {
    const fake = signIn();
    const res = await upload(imageFile([0x47, 0x49, 0x46], 'image/gif', 'photo.gif'));
    expect(res.status).toBe(400);
    expect(fake.storage.upload).not.toHaveBeenCalled();
  });

  it('uploads the photo and saves its link on the event', async () => {
    const fake = signIn();
    const res = await upload(imageFile(PNG));
    expect(res.status).toBe(200);

    const { imageUrl } = await res.json();
    expect(imageUrl).toMatch(new RegExp(`^${PUBLIC_BASE}7/[0-9a-f-]+\\.png$`));
    expect(fake.storage.upload).toHaveBeenCalledWith(expect.stringMatching(/^7\/[0-9a-f-]+\.png$/), expect.any(Uint8Array), {
      contentType: 'image/png',
      upsert: false,
    });
    expect(fake.rpc).toHaveBeenCalledWith('set_event_image', { p_event_id: '7', p_image_url: imageUrl });
    expect(fake.storage.remove).not.toHaveBeenCalled();
  });

  it('removes the old photo after replacing it', async () => {
    const fake = signIn({ event: ownEvent(`${PUBLIC_BASE}7/old.png`) });
    expect((await upload(imageFile(PNG))).status).toBe(200);
    expect(fake.storage.remove).toHaveBeenCalledWith(['7/old.png']);
  });

  it('returns 404 for an unknown event', async () => {
    const fake = signIn({ event: ok(null) });
    const res = await upload(imageFile(PNG));
    expect(res.status).toBe(404);
    expect(fake.storage.upload).not.toHaveBeenCalled();
  });

  it('returns 403 when the user did not submit the event', async () => {
    const fake = signIn({ event: ok({ submitted_by_user_id: 'someone-else', image_url: null }) });
    const res = await upload(imageFile(PNG));
    expect(res.status).toBe(403);
    expect(fake.storage.upload).not.toHaveBeenCalled();
  });

  it('returns the database error status and cleans up the upload', async () => {
    const fake = signIn({ rpc: failed('Only the person who submitted this event can change its photo', 'EF403') });
    const res = await upload(imageFile(PNG));
    expect(res.status).toBe(403);
    expect(fake.storage.remove).toHaveBeenCalledWith([expect.stringMatching(/^7\//)]);
  });

  it('returns a friendly 500 when the upload fails', async () => {
    signIn({ upload: failed('storage down') });
    const res = await upload(imageFile(PNG));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Could not upload this photo. Please try again.' });
  });

  it('returns a friendly 500 and cleans up when saving the link fails', async () => {
    const fake = signIn({ rpc: failed('db down') });
    expect((await upload(imageFile(PNG))).status).toBe(500);
    expect(fake.storage.remove).toHaveBeenCalledTimes(1);
  });
});

describe('DELETE /api/me/events/:id/image', () => {
  it('returns 401 when not logged in', async () => {
    vi.mocked(requireUser).mockResolvedValue(Response.json({ error: 'Please log in to continue.' }, { status: 401 }));
    expect((await remove()).status).toBe(401);
  });

  it('clears the photo and removes the stored file', async () => {
    const fake = signIn({ event: ownEvent(`${PUBLIC_BASE}7/old.png`) });
    const res = await remove();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ imageUrl: null });
    expect(fake.rpc).toHaveBeenCalledWith('set_event_image', { p_event_id: '7', p_image_url: null });
    expect(fake.storage.remove).toHaveBeenCalledWith(['7/old.png']);
  });

  it('does not touch storage for an image hosted somewhere else', async () => {
    const fake = signIn({ event: ownEvent('https://example.com/photo.png') });
    expect((await remove()).status).toBe(200);
    expect(fake.storage.remove).not.toHaveBeenCalled();
  });

  it('returns 403 when the user did not submit the event', async () => {
    const fake = signIn({ event: ok({ submitted_by_user_id: 'someone-else', image_url: null }) });
    expect((await remove()).status).toBe(403);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown event', async () => {
    signIn({ event: ok(null) });
    expect((await remove()).status).toBe(404);
  });

  it('returns a friendly 500 when the database fails', async () => {
    signIn({ event: failed('db down') });
    const res = await remove();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Could not remove this photo. Please try again.' });
  });
});
