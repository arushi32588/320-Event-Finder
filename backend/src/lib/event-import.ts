import type { SupabaseClient } from '@supabase/supabase-js';
import { validateEventSubmission } from '@/lib/event-submissions';

export const MAX_IMPORT_BATCH = 100;

export type ImportResult = {
  created: number;
  duplicates: Array<{ index: number; sourceUrl: string }>;
  invalid: Array<{ index: number; fields: Record<string, string> }>;
};

// Normalized so the same link written two ways counts as one event.
export function normalizeSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function asText(value: unknown, max: number): string | null | false {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length > max) return false;
  return value.trim() || null;
}

// Imported events start pending so they still go through moderation.
export async function importEvents(supabase: SupabaseClient, items: unknown[], now: Date): Promise<ImportResult> {
  const result: ImportResult = { created: 0, duplicates: [], invalid: [] };
  const seen = new Set<string>();

  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      result.invalid.push({ index, fields: { event: 'Each event must be an object.' } });
      continue;
    }
    const body = item as Record<string, unknown>;
    const parsed = validateEventSubmission(body, now);
    const fields = 'errors' in parsed ? { ...parsed.errors } : {};

    const sourceUrl = normalizeSourceUrl(body.sourceUrl);
    if (!sourceUrl) fields.sourceUrl = 'Source URL must be an http:// or https:// link.';
    const sourceName = asText(body.sourceName, 255);
    if (sourceName === false) fields.sourceName = 'Source name must be text of 255 characters or fewer.';

    if (Object.keys(fields).length > 0 || !('value' in parsed) || !sourceUrl) {
      result.invalid.push({ index, fields });
      continue;
    }
    if (seen.has(sourceUrl)) {
      result.duplicates.push({ index, sourceUrl });
      continue;
    }
    seen.add(sourceUrl);

    const existing = await supabase.from('events').select('id').eq('external_source_url', sourceUrl).limit(1);
    if (existing.error) throw new Error(`Failed to check for duplicates: ${existing.error.message}`);
    if ((existing.data as unknown[] | null)?.length) {
      result.duplicates.push({ index, sourceUrl });
      continue;
    }

    const event = parsed.value;
    const { error } = await supabase.from('events').insert({
      external_organizer_name: event.organizerName,
      title: event.title,
      description: event.description,
      location: event.location,
      start_time: event.startsAt,
      end_time: event.endsAt,
      price_cents: event.priceCents,
      ages: event.ages,
      accessibility: event.accessibility,
      transportation: event.transportation,
      image_url: event.imageUrl,
      source: 'scraped',
      approval_status: 'pending',
      external_source_name: sourceName,
      external_source_url: sourceUrl,
    });
    if (error) {
      // 23505: someone imported the same link between our check and the insert.
      if ((error as { code?: string }).code === '23505') {
        result.duplicates.push({ index, sourceUrl });
        continue;
      }
      throw new Error(`Failed to import event ${index}: ${error.message}`);
    }
    result.created += 1;
  }
  return result;
}
