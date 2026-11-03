import type { toEvent } from '@/lib/events';

export const EVENT_COLUMNS = `
  id, title, description, location, start_time, end_time, price_cents, ages,
  accessibility, transportation, image_url, external_organizer_name,
  organizer_profiles ( organization_name, verification_status )
`;

export type EventRow = Parameters<typeof toEvent>[0];

export const EVENT_ID_PATTERN = /^[1-9]\d{0,17}$/;
