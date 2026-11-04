import { signedInForEvent, type EventRouteContext as Context } from '@/lib/event-route';
import { isApprovedEvent, isSaved, saveEvent, unsaveEvent } from '@/lib/saved-events';
import { serverError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: Context) {
  const session = await signedInForEvent(request, context);
  if (session instanceof Response) return session;

  try {
    return Response.json({ saved: await isSaved(session.supabase, session.user.id, session.eventId) });
  } catch (error) {
    console.error(error);
    return serverError('Could not check whether this event is saved. Please try again.');
  }
}

export async function PUT(request: Request, context: Context) {
  const session = await signedInForEvent(request, context);
  if (session instanceof Response) return session;

  try {
    if (!(await isApprovedEvent(session.supabase, session.eventId))) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }
    await saveEvent(session.supabase, session.user.id, session.eventId);
    return Response.json({ saved: true });
  } catch (error) {
    console.error(error);
    return serverError('Could not save this event. Please try again.');
  }
}

export async function DELETE(request: Request, context: Context) {
  const session = await signedInForEvent(request, context);
  if (session instanceof Response) return session;

  try {
    await unsaveEvent(session.supabase, session.user.id, session.eventId);
    return Response.json({ saved: false });
  } catch (error) {
    console.error(error);
    return serverError('Could not unsave this event. Please try again.');
  }
}
