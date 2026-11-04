import { signedInForEvent, type EventRouteContext as Context } from '@/lib/event-route';
import { cancelRsvp, isGoing, rsvpGoing } from '@/lib/rsvps';
import { isApprovedEvent } from '@/lib/saved-events';
import { serverError } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET -> { going }, PUT -> RSVP as going, DELETE -> cancel the RSVP.
export async function GET(request: Request, context: Context) {
  const session = await signedInForEvent(request, context);
  if (session instanceof Response) return session;

  try {
    return Response.json({ going: await isGoing(session.supabase, session.user.id, session.eventId) });
  } catch (error) {
    console.error(error);
    return serverError('Could not check your RSVP. Please try again.');
  }
}

export async function PUT(request: Request, context: Context) {
  const session = await signedInForEvent(request, context);
  if (session instanceof Response) return session;

  try {
    if (!(await isApprovedEvent(session.supabase, session.eventId))) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }
    await rsvpGoing(session.supabase, session.user.id, session.eventId);
    return Response.json({ going: true });
  } catch (error) {
    console.error(error);
    return serverError('Could not save your RSVP. Please try again.');
  }
}

export async function DELETE(request: Request, context: Context) {
  const session = await signedInForEvent(request, context);
  if (session instanceof Response) return session;

  try {
    await cancelRsvp(session.supabase, session.user.id, session.eventId);
    return Response.json({ going: false });
  } catch (error) {
    console.error(error);
    return serverError('Could not cancel your RSVP. Please try again.');
  }
}
