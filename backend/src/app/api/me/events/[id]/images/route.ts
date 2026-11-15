import { addGalleryImage } from '@/lib/event-gallery';
import { readEventImage } from '@/lib/event-images';
import { signedInForEvent, type EventRouteContext as Context } from '@/lib/event-route';
import { serverError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: Context) {
  const session = await signedInForEvent(request, context);
  if (session instanceof Response) return session;

  const parsed = await readEventImage(request);
  if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await addGalleryImage(session.supabase, session.user.id, session.eventId, parsed.image);
    if ('status' in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error(error);
    return serverError('Could not add this photo. Please try again.');
  }
}
