import { getEvent, getSampleEvent } from '@/lib/events';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/events/:id -> { event }, 400 for a non-numeric id, 404 if there is
// no approved event with that id.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,17}$/.test(id)) {
    return Response.json({ error: 'Event id must be a positive whole number.' }, { status: 400 });
  }

  const supabase = getSupabase();
  try {
    const event = supabase ? await getEvent(supabase, id) : getSampleEvent(id);
    if (!event) return Response.json({ error: 'Event not found' }, { status: 404 });
    return Response.json({ event });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Could not load this event. Please try again.' }, { status: 500 });
  }
}
