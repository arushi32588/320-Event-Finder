import { requireAdmin } from '@/lib/admin';
import { readJsonObject } from '@/lib/auth';
import { MAX_IMPORT_BATCH, importEvents } from '@/lib/event-import';
import { serverError } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST /api/admin/events/import with { events: [...] } -> 200 { created, duplicates, invalid }
export async function POST(request: Request) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const body = await readJsonObject(request);
  const events = body?.events;
  if (!Array.isArray(events) || events.length === 0) {
    return Response.json({ error: 'Send { "events": [...] } with at least one event.' }, { status: 400 });
  }
  if (events.length > MAX_IMPORT_BATCH) {
    return Response.json({ error: `Import at most ${MAX_IMPORT_BATCH} events at a time.` }, { status: 400 });
  }

  try {
    return Response.json(await importEvents(session.supabase, events, new Date()));
  } catch (error) {
    console.error(error);
    return serverError('Could not import these events. Please try again.');
  }
}
