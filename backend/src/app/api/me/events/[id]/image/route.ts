import { readEventImage, removeEventImage, uploadEventImage } from '@/lib/event-images';
import { signedInForEvent, type EventRouteContext as Context } from '@/lib/event-route';
import { serverError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, context: Context) {
  const session = await signedInForEvent(request, context);
  if (session instanceof Response) return session;

  const parsed = await readEventImage(request);
  if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await uploadEventImage(session.supabase, session.user.id, session.eventId, parsed.image);
    if ('status' in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result);
  } catch (error) {
    console.error(error);
    return serverError('Could not upload this photo. Please try again.');
  }
}

export async function DELETE(request: Request, context: Context) {
  const session = await signedInForEvent(request, context);
  if (session instanceof Response) return session;

  try {
    const result = await removeEventImage(session.supabase, session.user.id, session.eventId);
    if ('status' in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result);
  } catch (error) {
    console.error(error);
    return serverError('Could not remove this photo. Please try again.');
  }
}
