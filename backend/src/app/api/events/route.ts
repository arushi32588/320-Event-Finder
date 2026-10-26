import { listEvents, listSampleEvents, parseEventQuery } from '@/lib/events';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/events                       -> approved events, soonest first
// GET /api/events?q=hack                -> title or description contains "hack"
// GET /api/events?filter=free&filter=week (or filter=free,week)
//     filters: today, week, free, accessible; all given filters must match
export async function GET(request: Request) {
  const parsed = parseEventQuery(new URL(request.url).searchParams);
  if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return Response.json({ events: listSampleEvents(parsed.query, new Date()) });

  try {
    return Response.json({ events: await listEvents(supabase, parsed.query, new Date()) });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Could not load events. Please try again.' }, { status: 500 });
  }
}
