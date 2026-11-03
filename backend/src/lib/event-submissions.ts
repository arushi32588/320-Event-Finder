import type { SupabaseClient } from '@supabase/supabase-js';
import { EVENT_COLUMNS, type EventRow } from '@/lib/event-columns';
import { toEvent, type Event } from '@/lib/events';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type SubmittedEvent = Event & { status: ApprovalStatus };

export type EventSubmission = {
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  priceCents: number;
  ages: string | null;
  accessibility: string | null;
  transportation: string | null;
  imageUrl: string | null;
  organizerName: string | null;
};

type FieldErrors = Record<string, string>;
type Result<T> = { value: T } | { errors: FieldErrors };

const MAX_PRICE_CENTS = 1_000_000;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const PRICE_TEXT = /^\$?(\d{1,5})(\.(\d{1,2}))?$/;

const SUBMITTED_COLUMNS = `${EVENT_COLUMNS}, approval_status`;

type SubmittedEventRow = EventRow & { approval_status: ApprovalStatus };

function optionalText(body: Record<string, unknown>, field: string, label: string, max: number, errors: FieldErrors): string | null {
  const value = body[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    errors[field] = `${label} must be text.`;
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) errors[field] = `${label} must be ${max} characters or fewer.`;
  return trimmed || null;
}

export function parseDateTime(value: unknown): Date | null {
  if (typeof value !== 'string' || !ISO_DATE_TIME.test(value.trim())) return null;
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parsePriceCents(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') {
    const cents = Math.round(value * 100);
    if (!Number.isFinite(value) || value < 0 || Math.abs(value * 100 - cents) > 1e-6) return null;
    return cents;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.toLowerCase() === 'free') return 0;
  const match = text.match(PRICE_TEXT);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[3] ?? '0').padEnd(2, '0'));
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateEventSubmission(body: Record<string, unknown>, now: Date): Result<EventSubmission> {
  const errors: FieldErrors = {};

  const title = optionalText(body, 'title', 'Event name', 255, errors);
  if (!title && !errors.title) errors.title = 'Event name is required.';

  const description = optionalText(body, 'description', 'Description', 5000, errors);
  const location = optionalText(body, 'location', 'Location', 255, errors);
  const ages = optionalText(body, 'ages', 'Age range', 100, errors);
  const accessibility = optionalText(body, 'accessibility', 'Accessibility information', 255, errors);
  const transportation = optionalText(body, 'transportation', 'Transportation options', 255, errors);
  const organizerName = optionalText(body, 'organizerName', 'Organizer name', 255, errors);

  const imageUrl = optionalText(body, 'imageUrl', 'Image URL', 2048, errors);
  if (imageUrl && !errors.imageUrl && !isWebUrl(imageUrl)) errors.imageUrl = 'Image URL must start with http:// or https://.';

  const startsAt = parseDateTime(body.startsAt);
  if (body.startsAt === undefined || body.startsAt === null || body.startsAt === '') errors.startsAt = 'Start time is required.';
  else if (!startsAt) errors.startsAt = 'Start time must be a date and time like 2026-11-05T19:00:00-05:00.';
  else if (startsAt <= now) errors.startsAt = 'Start time must be in the future.';

  let endsAt: Date | null = null;
  if (body.endsAt !== undefined && body.endsAt !== null && body.endsAt !== '') {
    endsAt = parseDateTime(body.endsAt);
    if (!endsAt) errors.endsAt = 'End time must be a date and time like 2026-11-05T21:00:00-05:00.';
    else if (startsAt && endsAt <= startsAt) errors.endsAt = 'End time must be after the start time.';
  }

  const priceCents = parsePriceCents(body.price);
  if (priceCents === null) errors.price = 'Price must be "Free" or an amount like 12.50.';
  else if (priceCents > MAX_PRICE_CENTS) errors.price = 'Price must be $10,000.00 or less.';

  if (Object.keys(errors).length > 0) return { errors };
  return {
    value: {
      title: title!,
      description,
      location,
      startsAt: startsAt!.toISOString(),
      endsAt: endsAt ? endsAt.toISOString() : null,
      priceCents: priceCents!,
      ages,
      accessibility,
      transportation,
      imageUrl,
      organizerName,
    },
  };
}

function toSubmittedEvent(row: SubmittedEventRow): SubmittedEvent {
  return { ...toEvent(row), status: row.approval_status };
}

async function approvedOrganizerProfileId(supabase: SupabaseClient, userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('organizer_profiles')
    .select('id')
    .eq('user_id', userId)
    .eq('verification_status', 'approved')
    .maybeSingle();
  if (error) throw new Error(`Failed to load organizer profile: ${error.message}`);
  return (data as { id: number } | null)?.id ?? null;
}

export async function submitEvent(supabase: SupabaseClient, userId: string, input: EventSubmission): Promise<SubmittedEvent> {
  const organizerProfileId = await approvedOrganizerProfileId(supabase, userId);

  const { data, error } = await supabase
    .from('events')
    .insert({
      submitted_by_user_id: userId,
      organizer_profile_id: organizerProfileId,
      external_organizer_name: input.organizerName,
      title: input.title,
      description: input.description,
      location: input.location,
      start_time: input.startsAt,
      end_time: input.endsAt,
      price_cents: input.priceCents,
      ages: input.ages,
      accessibility: input.accessibility,
      transportation: input.transportation,
      image_url: input.imageUrl,
      source: 'user_submission',
      approval_status: 'pending',
    })
    .select(SUBMITTED_COLUMNS)
    .single();
  if (error) throw new Error(`Failed to submit event: ${error.message}`);
  return toSubmittedEvent(data as unknown as SubmittedEventRow);
}

export async function listSubmittedEvents(supabase: SupabaseClient, userId: string): Promise<SubmittedEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select(SUBMITTED_COLUMNS)
    .eq('submitted_by_user_id', userId)
    .order('id', { ascending: false });
  if (error) throw new Error(`Failed to load submitted events: ${error.message}`);
  return (data as unknown as SubmittedEventRow[]).map(toSubmittedEvent);
}
