import { EVENT_ID_PATTERN } from '@/lib/event-columns';
import { withdrawEvent } from '@/lib/event-submissions';
import { requireUser, serverError } from '@/lib/session';

export const dynamic = 'force-dynamic';

// DELETE /api/me/events/:id withdraws your own event before it is approved.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!EVENT_ID_PATTERN.test(id)) {
    return Response.json({ error: 'Event id must be a positive whole number.' }, { status: 400 });
  }
  const session = await requireUser(request);
  if (session instanceof Response) return session;

  try {
    const result = await withdrawEvent(session.supabase, session.user.id, id);
    if ('status' in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ withdrawn: true });
  } catch (error) {
    console.error(error);
    return serverError('Could not withdraw this event. Please try again.');
  }
}
