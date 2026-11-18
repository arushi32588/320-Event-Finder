import { signedInForEvent, type EventRouteContext } from '@/lib/event-route';
import { chatErrorResponse, openEventConversation } from '@/lib/messages';

export const dynamic = 'force-dynamic';

// POST { kind: 'group' } -> { conversation }. 403 "RSVP to join the group chat." if not going/organizer.
export async function POST(request: Request, context: EventRouteContext) {
  const session = await signedInForEvent(request, context);
  if (session instanceof Response) return session;
  const payload = (await request.json().catch(() => null)) as { kind?: unknown } | null;
  try {
    return Response.json({
      conversation: await openEventConversation(session.supabase, session.user, session.eventId, payload?.kind),
    });
  } catch (error) {
    return chatErrorResponse(error, 'Could not open the group chat. Please try again.');
  }
}
