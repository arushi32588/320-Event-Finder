import type { SupabaseClient } from '@supabase/supabase-js';
import { sampleEvents } from '@/data/sample-events';

// The event shape the frontend renders (matches src/data/events.js).
export type Event = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  organizer: string | null;
  verified: boolean;
  price: string; // 'Free' or e.g. '$12.50'
  ages: string | null;
  accessibility: string | null;
  transportation: string | null;
  imageUrl: string | null;
};

// The Home page's filter chips. Several can be active at once (all must match).
export const EVENT_FILTERS = ['today', 'week', 'free', 'accessible'] as const;
export type EventFilter = (typeof EVENT_FILTERS)[number];

export type EventQuery = { q: string; filters: EventFilter[] };

export const TIME_ZONE = 'America/New_York';
const MAX_QUERY_LENGTH = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

// Parses ?q=hack&filter=free&filter=week (or filter=free,week).
export function parseEventQuery(params: URLSearchParams): { query: EventQuery } | { error: string } {
  const q = (params.get('q') ?? '').trim();
  if (q.length > MAX_QUERY_LENGTH) {
    return { error: `Search text must be ${MAX_QUERY_LENGTH} characters or fewer.` };
  }

  const requested = params
    .getAll('filter')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const unknown = requested.filter((f) => !(EVENT_FILTERS as readonly string[]).includes(f));
  if (unknown.length > 0) {
    return { error: `Unknown filter: ${unknown.join(', ')}. Use ${EVENT_FILTERS.join(', ')}.` };
  }

  return { query: { q, filters: [...new Set(requested)] as EventFilter[] } };
}

// "Today" is the current calendar day in Amherst; "This week" is the next 7
// days from now. Both mirror the Home page's own filter logic.
export function timeWindows(now: Date) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE })
    .format(now)
    .split('-')
    .map(Number);
  return {
    today: { start: zonedMidnight(y, m, d), end: zonedMidnight(y, m, d + 1) },
    week: { start: now, end: new Date(now.getTime() + 7 * DAY_MS) },
  };
}

// Midnight at the start of y-m-d in TIME_ZONE, as a UTC instant. Day overflow
// (d = 32) rolls into the next month, and the offset is re-checked for DST.
function zonedMidnight(y: number, m: number, d: number): Date {
  const wallClock = Date.UTC(y, m - 1, d);
  let instant = wallClock - zoneOffset(wallClock);
  instant = wallClock - zoneOffset(instant);
  return new Date(instant);
}

function zoneOffset(instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

// ---------- Supabase ----------

const EVENT_COLUMNS = `
  id, title, description, location, start_time, end_time, price_cents, ages,
  accessibility, transportation, image_url, external_organizer_name,
  organizer_profiles ( organization_name, verification_status )
`;

type EventRow = {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string | null;
  end_time: string | null;
  price_cents: number | null;
  ages: string | null;
  accessibility: string | null;
  transportation: string | null;
  image_url: string | null;
  external_organizer_name: string | null;
  organizer_profiles: { organization_name: string | null; verification_status: string } | null;
};

export function formatPrice(cents: number | null): string {
  if (!cents) return 'Free';
  return `$${(cents / 100).toFixed(2)}`;
}

export function toEvent(row: EventRow): Event {
  const profile = row.organizer_profiles;
  return {
    id: String(row.id),
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.start_time,
    endsAt: row.end_time,
    organizer: profile?.organization_name ?? row.external_organizer_name,
    verified: profile?.verification_status === 'approved',
    price: formatPrice(row.price_cents),
    ages: row.ages,
    accessibility: row.accessibility,
    transportation: row.transportation,
    imageUrl: row.image_url,
  };
}

// Keeps letters, digits, spaces and a little punctuation so the search text
// can't break PostgREST's filter syntax or act as a LIKE wildcard.
export function sanitizeSearch(q: string): string {
  return q.replace(/[^\p{L}\p{N}\s'.&-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export async function listEvents(supabase: SupabaseClient, query: EventQuery, now: Date): Promise<Event[]> {
  const windows = timeWindows(now);
  let request = supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('approval_status', 'approved')
    .order('start_time', { ascending: true });

  const term = sanitizeSearch(query.q);
  if (term) request = request.or(`title.ilike."%${term}%",description.ilike."%${term}%"`);

  for (const filter of query.filters) {
    if (filter === 'today') {
      request = request.gte('start_time', windows.today.start.toISOString()).lt('start_time', windows.today.end.toISOString());
    } else if (filter === 'week') {
      request = request.gte('start_time', windows.week.start.toISOString()).lte('start_time', windows.week.end.toISOString());
    } else if (filter === 'free') {
      request = request.eq('price_cents', 0);
    } else if (filter === 'accessible') {
      request = request.not('accessibility', 'is', null);
    }
  }

  const { data, error } = await request;
  if (error) throw new Error(`Failed to load events: ${error.message}`);
  return (data as unknown as EventRow[]).map(toEvent);
}

export async function getEvent(supabase: SupabaseClient, id: string): Promise<Event | null> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('id', id)
    .eq('approval_status', 'approved')
    .maybeSingle();
  if (error) throw new Error(`Failed to load event ${id}: ${error.message}`);
  return data ? toEvent(data as unknown as EventRow) : null;
}

// ---------- Sample data (used until Supabase is configured) ----------

export function matchesQuery(event: Event, query: EventQuery, now: Date): boolean {
  const windows = timeWindows(now);
  const term = sanitizeSearch(query.q).toLowerCase();
  if (term && !`${event.title} ${event.description ?? ''}`.toLowerCase().includes(term)) return false;

  const start = event.startsAt ? new Date(event.startsAt) : null;
  return query.filters.every((filter) => {
    if (filter === 'today') return start !== null && start >= windows.today.start && start < windows.today.end;
    if (filter === 'week') return start !== null && start >= windows.week.start && start <= windows.week.end;
    if (filter === 'free') return event.price === 'Free';
    return Boolean(event.accessibility);
  });
}

export function listSampleEvents(query: EventQuery, now: Date): Event[] {
  return sampleEvents.filter((event) => matchesQuery(event, query, now));
}

export function getSampleEvent(id: string): Event | null {
  return sampleEvents.find((event) => event.id === id) ?? null;
}
