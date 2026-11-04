import { EVENT_ID_PATTERN } from '@/lib/event-columns';
import { requireUser, type SignedInRequest } from '@/lib/session';

export type EventRouteContext = { params: Promise<{ id: string }> };

// The login and event id check shared by the save and RSVP routes.
export async function signedInForEvent(
  request: Request,
  { params }: EventRouteContext,
): Promise<(SignedInRequest & { eventId: string }) | Response> {
  const { id } = await params;
  if (!EVENT_ID_PATTERN.test(id)) {
    return Response.json({ error: 'Event id must be a positive whole number.' }, { status: 400 });
  }
  const session = await requireUser(request);
  if (session instanceof Response) return session;
  return { ...session, eventId: id };
}
