import { listSavedEvents } from '@/lib/saved-events';
import { requireUser, serverError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await requireUser(request);
  if (session instanceof Response) return session;

  try {
    return Response.json({ events: await listSavedEvents(session.supabase, session.user.id) });
  } catch (error) {
    console.error(error);
    return serverError('Could not load your saved events. Please try again.');
  }
}
