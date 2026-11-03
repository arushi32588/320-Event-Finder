import { describe, expect, it } from 'vitest';
import {
  type Event,
  formatPrice,
  getEvent,
  listEvents,
  matchesQuery,
  parseEventQuery,
  sanitizeSearch,
  timeWindows,
  toEvent,
} from '@/lib/events';
import { fakeSupabase } from './helpers/fake-supabase';

const params = (qs: string) => new URLSearchParams(qs);

const row = {
  id: 7,
  title: 'Hack Night',
  description: 'Bring a project.',
  location: 'CS Building',
  start_time: '2026-10-17T22:00:00+00:00',
  end_time: '2026-10-18T02:00:00+00:00',
  price_cents: 0,
  ages: '18+',
  accessibility: null,
  transportation: 'Walk / Bus',
  image_url: null,
  external_organizer_name: 'Hack Club (external)',
  organizer_profiles: { organization_name: 'Hack Club', verification_status: 'approved' },
};

describe('parseEventQuery', () => {
  it('defaults to no search and no filters', () => {
    expect(parseEventQuery(params(''))).toEqual({ query: { q: '', filters: [] } });
  });

  it('accepts repeated and comma-separated filters, case-insensitively, without duplicates', () => {
    expect(parseEventQuery(params('filter=free&filter=WEEK,free&filter=accessible'))).toEqual({
      query: { q: '', filters: ['free', 'week', 'accessible'] },
    });
  });

  it('ignores empty filter values', () => {
    expect(parseEventQuery(params('filter=&filter=free,,'))).toEqual({ query: { q: '', filters: ['free'] } });
  });

  it('rejects unknown filters and names them', () => {
    const result = parseEventQuery(params('filter=free&filter=cheap'));
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('cheap');
  });

  it('trims the search text', () => {
    expect(parseEventQuery(params('q=%20%20hack%20%20'))).toEqual({ query: { q: 'hack', filters: [] } });
  });

  it('rejects search text over 100 characters', () => {
    expect(parseEventQuery(params(`q=${'a'.repeat(100)}`))).toHaveProperty('query');
    expect(parseEventQuery(params(`q=${'a'.repeat(101)}`))).toHaveProperty('error');
  });
});

describe('timeWindows', () => {
  it('uses the Amherst calendar day during daylight time (UTC-4)', () => {
    const { today } = timeWindows(new Date('2026-10-16T12:00:00Z'));
    expect(today.start.toISOString()).toBe('2026-10-16T04:00:00.000Z');
    expect(today.end.toISOString()).toBe('2026-10-17T04:00:00.000Z');
  });

  it('uses the Amherst day, not the UTC day, late in the evening', () => {
    // 11:30 PM Oct 16 in Amherst is already Oct 17 in UTC.
    const { today } = timeWindows(new Date('2026-10-17T03:30:00Z'));
    expect(today.start.toISOString()).toBe('2026-10-16T04:00:00.000Z');
  });

  it('handles the 25-hour day when clocks fall back (Nov 1, 2026)', () => {
    const { today } = timeWindows(new Date('2026-11-01T15:00:00Z'));
    expect(today.start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(today.end.toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });

  it('handles the 23-hour day when clocks spring forward (Mar 8, 2026)', () => {
    const { today } = timeWindows(new Date('2026-03-08T15:00:00Z'));
    expect(today.start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(today.end.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  it('rolls over month and year ends', () => {
    const { today } = timeWindows(new Date('2026-12-31T20:00:00Z'));
    expect(today.end.toISOString()).toBe('2027-01-01T05:00:00.000Z');
  });

  it('makes "this week" the next 7 days from now', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    const { week } = timeWindows(now);
    expect(week.start).toEqual(now);
    expect(week.end.toISOString()).toBe('2026-10-23T12:00:00.000Z');
  });
});

describe('formatPrice', () => {
  it('shows Free for 0 or a missing price', () => {
    expect(formatPrice(0)).toBe('Free');
    expect(formatPrice(null)).toBe('Free');
  });

  it('formats cents as dollars', () => {
    expect(formatPrice(1250)).toBe('$12.50');
    expect(formatPrice(5)).toBe('$0.05');
  });
});

describe('toEvent', () => {
  it('maps a database row to the shape the frontend renders', () => {
    expect(toEvent(row)).toEqual({
      id: '7',
      title: 'Hack Night',
      description: 'Bring a project.',
      location: 'CS Building',
      startsAt: '2026-10-17T22:00:00+00:00',
      endsAt: '2026-10-18T02:00:00+00:00',
      organizer: 'Hack Club',
      verified: true,
      price: 'Free',
      ages: '18+',
      accessibility: null,
      transportation: 'Walk / Bus',
      imageUrl: null,
    });
  });

  it('only marks organizers verified once approved', () => {
    for (const status of ['pending', 'rejected']) {
      const pending = { ...row, organizer_profiles: { organization_name: 'Hack Club', verification_status: status } };
      expect(toEvent(pending).verified).toBe(false);
    }
  });

  it('falls back to the external organizer name when there is no organizer profile', () => {
    const external = toEvent({ ...row, organizer_profiles: null });
    expect(external.organizer).toBe('Hack Club (external)');
    expect(external.verified).toBe(false);
  });

  it('returns a null organizer when neither name is known', () => {
    expect(toEvent({ ...row, organizer_profiles: null, external_organizer_name: null }).organizer).toBeNull();
  });
});

describe('sanitizeSearch', () => {
  it('keeps ordinary words and punctuation', () => {
    expect(sanitizeSearch("Rock & Roll's Night")).toBe("Rock & Roll's Night");
    expect(sanitizeSearch('café 2026')).toBe('café 2026');
  });

  it('strips characters that would break the query or act as wildcards', () => {
    expect(sanitizeSearch('a,b(c)"d%e_f*g\\h')).toBe('a b c d e f g h');
    expect(sanitizeSearch('%%%')).toBe('');
  });
});

describe('listEvents', () => {
  const now = new Date('2026-10-16T12:00:00Z');

  it('asks for approved events, soonest first, and maps the rows', async () => {
    const { client, calls } = fakeSupabase({ data: [row], error: null });
    const events = await listEvents(client, { q: '', filters: [] }, now);

    expect(events.map((e) => e.id)).toEqual(['7']);
    expect(calls).toContainEqual(['from', ['events']]);
    expect(calls).toContainEqual(['eq', ['approval_status', 'approved']]);
    expect(calls).toContainEqual(['order', ['start_time', { ascending: true }]]);
    expect(calls.map(([method]) => method)).not.toContain('or');
  });

  it('turns each filter into the matching database condition', async () => {
    const { client, calls } = fakeSupabase({ data: [], error: null });
    await listEvents(client, { q: '', filters: ['today', 'week', 'free', 'accessible'] }, now);

    expect(calls).toContainEqual(['gte', ['start_time', '2026-10-16T04:00:00.000Z']]);
    expect(calls).toContainEqual(['lt', ['start_time', '2026-10-17T04:00:00.000Z']]);
    expect(calls).toContainEqual(['gte', ['start_time', '2026-10-16T12:00:00.000Z']]);
    expect(calls).toContainEqual(['lte', ['start_time', '2026-10-23T12:00:00.000Z']]);
    expect(calls).toContainEqual(['eq', ['price_cents', 0]]);
    expect(calls).toContainEqual(['not', ['accessibility', 'is', null]]);
  });

  it('searches title and description with sanitized text', async () => {
    const { client, calls } = fakeSupabase({ data: [], error: null });
    await listEvents(client, { q: 'hack,night%', filters: [] }, now);
    expect(calls).toContainEqual(['or', ['title.ilike."%hack night%",description.ilike."%hack night%"']]);
  });

  it('skips the search when nothing is left after sanitizing', async () => {
    const { client, calls } = fakeSupabase({ data: [], error: null });
    await listEvents(client, { q: '(%)', filters: [] }, now);
    expect(calls.map(([method]) => method)).not.toContain('or');
  });

  it('returns an empty list when there are no events', async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    expect(await listEvents(client, { q: '', filters: [] }, now)).toEqual([]);
  });

  it('throws when the database returns an error', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'relation "events" does not exist' } });
    await expect(listEvents(client, { q: '', filters: [] }, now)).rejects.toThrow('does not exist');
  });
});

describe('getEvent', () => {
  it('returns the approved event with that id', async () => {
    const { client, calls } = fakeSupabase({ data: row, error: null });
    expect((await getEvent(client, '7'))?.title).toBe('Hack Night');
    expect(calls).toContainEqual(['eq', ['id', '7']]);
    expect(calls).toContainEqual(['eq', ['approval_status', 'approved']]);
    expect(calls).toContainEqual(['maybeSingle', []]);
  });

  it('returns null when no approved event has that id', async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await getEvent(client, '999')).toBeNull();
  });

  it('throws when the database returns an error', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'timeout' } });
    await expect(getEvent(client, '7')).rejects.toThrow('timeout');
  });
});

describe('matchesQuery (sample data)', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  const base: Event = {
    id: '1',
    title: 'Movie Night',
    description: 'Outdoor film',
    location: null,
    startsAt: '2026-10-16T23:00:00Z',
    endsAt: null,
    organizer: null,
    verified: false,
    price: 'Free',
    ages: null,
    accessibility: 'Wheelchair accessible',
    transportation: null,
    imageUrl: null,
  };
  const at = (startsAt: string | null) => ({ ...base, startsAt });
  const filters = (...f: Array<'today' | 'week' | 'free' | 'accessible'>) => ({ q: '', filters: f });

  it('includes an event starting exactly at midnight today but not at midnight tomorrow', () => {
    expect(matchesQuery(at('2026-10-16T04:00:00Z'), filters('today'), now)).toBe(true);
    expect(matchesQuery(at('2026-10-17T04:00:00Z'), filters('today'), now)).toBe(false);
  });

  it('counts events earlier today as "today" but not as "this week"', () => {
    const earlier = at('2026-10-16T10:00:00Z');
    expect(matchesQuery(earlier, filters('today'), now)).toBe(true);
    expect(matchesQuery(earlier, filters('week'), now)).toBe(false);
  });

  it('includes the exact 7-day boundary in "this week" but not one second past it', () => {
    expect(matchesQuery(at('2026-10-23T12:00:00Z'), filters('week'), now)).toBe(true);
    expect(matchesQuery(at('2026-10-23T12:00:01Z'), filters('week'), now)).toBe(false);
  });

  it('never matches date filters for an event with no start time', () => {
    expect(matchesQuery(at(null), filters('today'), now)).toBe(false);
    expect(matchesQuery(at(null), filters('week'), now)).toBe(false);
    expect(matchesQuery(at(null), filters('free'), now)).toBe(true);
  });

  it('requires every active filter to match', () => {
    expect(matchesQuery(base, filters('today', 'free', 'accessible'), now)).toBe(true);
    expect(matchesQuery({ ...base, price: '$5.00' }, filters('today', 'free'), now)).toBe(false);
    expect(matchesQuery({ ...base, accessibility: null }, filters('accessible'), now)).toBe(false);
  });

  it('searches title and description case-insensitively', () => {
    expect(matchesQuery(base, { q: 'MOVIE', filters: [] }, now)).toBe(true);
    expect(matchesQuery(base, { q: 'outdoor', filters: [] }, now)).toBe(true);
    expect(matchesQuery(base, { q: 'concert', filters: [] }, now)).toBe(false);
    expect(matchesQuery({ ...base, description: null }, { q: 'film', filters: [] }, now)).toBe(false);
  });
});
