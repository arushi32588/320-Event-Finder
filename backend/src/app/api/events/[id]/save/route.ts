import { EVENT_ID_PATTERN } from '@/lib/event-columns';
import { isApprovedEvent, isSaved, saveEvent, unsaveEvent } from '@/lib/saved-events';
import { requireUser, serverError, type SignedInRequest } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

async function signedInForEvent(request: Request, { params }: Context): Promise<(SignedInRequest & { eventId: string }) | Response> {
  const { id } = await params;
  if (!EVENT_ID_PATTERN.test(id)) {
    return Response.json({ error: 'Event id must be a positive whole number.' }, { status: 400 });
  }
  const session = await requireUser(request);
  if (session instanceof Response) return session;
  return { ...session, eventId: id };
}

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
