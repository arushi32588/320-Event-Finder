import { sampleEvents } from '@/data/sample-events';

export const dynamic = 'force-dynamic';

// GET /api/events          -> all events
// GET /api/events?q=hack   -> events whose title or description matches
export function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase();
  const events = q
    ? sampleEvents.filter((e) => `${e.title} ${e.description}`.toLowerCase().includes(q))
    : sampleEvents;
  return Response.json({ events });
}
