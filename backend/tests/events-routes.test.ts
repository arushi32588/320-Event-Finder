import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getEvents } from '@/app/api/events/route';
import { GET as getEventById } from '@/app/api/events/[id]/route';
import { getSupabase } from '@/lib/supabase';
import { fakeSupabase, request } from './helpers/fake-supabase';

vi.mock('@/lib/supabase', () => ({ getSupabase: vi.fn(() => null), createAuthClient: vi.fn(() => null) }));

const list = (qs = '') => getEvents(request(`http://localhost/api/events${qs}`));
const detail = (id: string) => getEventById(request(`http://localhost/api/events/${id}`), { params: Promise.resolve({ id }) });
const ids = async (res: Response) => ((await res.json()).events as Array<{ id: string }>).map((e) => e.id);

const row = {
  id: 7,
  title: 'Hack Night',
  description: null,
  location: null,
  start_time: '2026-10-17T22:00:00+00:00',
  end_time: null,
  price_cents: 500,
  ages: null,
  accessibility: null,
  transportation: null,
  image_url: null,
  external_organizer_name: 'Hack Club',
  organizer_profiles: null,
};

beforeEach(() => {
  // Friday Oct 16, 8 AM in Amherst. Sample events: #2 was yesterday,
  // #1 is tonight, #3 is tomorrow (Hack Night, not accessible).
  vi.useFakeTimers({ now: new Date('2026-10-16T12:00:00Z'), toFake: ['Date'] });
  vi.mocked(getSupabase).mockReturnValue(null);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('GET /api/events without Supabase (sample data)', () => {
  it('returns all sample events', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(await ids(res)).toEqual(['1', '2', '3']);
  });

  it('applies the Today filter', async () => {
    expect(await ids(await list('?filter=today'))).toEqual(['1']);
  });

  it('applies the This Week filter, leaving out past events', async () => {
    expect(await ids(await list('?filter=week'))).toEqual(['1', '3']);
  });

  it('combines filters so all must match', async () => {
    expect(await ids(await list('?filter=week,accessible'))).toEqual(['1']);
    expect(await ids(await list('?filter=today&filter=week&filter=free&filter=accessible'))).toEqual(['1']);
  });

  it('searches title and description', async () => {
    expect(await ids(await list('?q=hack'))).toEqual(['3']);
    expect(await ids(await list('?q=employers'))).toEqual(['2']);
  });

  it('returns an empty list when nothing matches', async () => {
    const res = await list('?q=no-such-event');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ events: [] });
  });

  it('rejects an unknown filter with 400', async () => {
    const res = await list('?filter=cheap');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('cheap');
  });

  it('rejects overly long search text with 400', async () => {
    expect((await list(`?q=${'x'.repeat(101)}`)).status).toBe(400);
  });
});

describe('GET /api/events with Supabase', () => {
  it('returns events from the database in the frontend shape', async () => {
    vi.mocked(getSupabase).mockReturnValue(fakeSupabase({ data: [row], error: null }).client);
    const res = await list('?filter=week');
    expect(res.status).toBe(200);
    const { events } = await res.json();
    expect(events).toEqual([expect.objectContaining({ id: '7', price: '$5.00', organizer: 'Hack Club', verified: false })]);
  });

  it('hides database errors behind a 500 with a friendly message', async () => {
    vi.mocked(getSupabase).mockReturnValue(fakeSupabase({ data: null, error: { message: 'secret internals' } }).client);
    const res = await list();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Could not load events. Please try again.');
    expect(JSON.stringify(body)).not.toContain('secret internals');
  });
});

describe('GET /api/events/:id', () => {
  it('returns a sample event by id', async () => {
    const res = await detail('3');
    expect(res.status).toBe(200);
    expect((await res.json()).event.title).toBe('Hack Night');
  });

  it('returns 404 for an id that does not exist', async () => {
    const res = await detail('999');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Event not found' });
  });

  it.each(['abc', '0', '-1', '1.5', '007', '1e3', ' 1', '1234567890123456789'])('returns 400 for the invalid id %j', async (id) => {
    expect((await detail(id)).status).toBe(400);
  });

  it('returns the database event, including whether the organizer is verified', async () => {
    const verifiedRow = { ...row, organizer_profiles: { organization_name: 'Hack Club', verification_status: 'approved' } };
    vi.mocked(getSupabase).mockReturnValue(fakeSupabase({ data: verifiedRow, error: null }).client);
    const res = await detail('7');
    expect(res.status).toBe(200);
    expect((await res.json()).event).toEqual(expect.objectContaining({ id: '7', verified: true }));
  });

  it('returns 404 when the database has no approved event with that id', async () => {
    vi.mocked(getSupabase).mockReturnValue(fakeSupabase({ data: null, error: null }).client);
    expect((await detail('7')).status).toBe(404);
  });

  it('returns 500 when the database fails', async () => {
    vi.mocked(getSupabase).mockReturnValue(fakeSupabase({ data: null, error: { message: 'timeout' } }).client);
    expect((await detail('7')).status).toBe(500);
  });
});
