import { EVENT_ID_PATTERN } from '@/lib/event-columns';
import { listGalleryImages } from '@/lib/event-gallery';
import { bearerToken, createUserClient, serverError } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!EVENT_ID_PATTERN.test(id)) {
    return Response.json({ error: 'Event id must be a positive whole number.' }, { status: 400 });
  }

  const token = bearerToken(request);
  const supabase = token ? createUserClient(token) : getSupabase();
  if (!supabase) return Response.json({ images: [] });

  try {
    const images = await listGalleryImages(supabase, id);
    if (!images) return Response.json({ error: 'Event not found' }, { status: 404 });
    return Response.json({ images });
  } catch (error) {
    console.error(error);
    return serverError('Could not load the photos for this event. Please try again.');
  }
}
