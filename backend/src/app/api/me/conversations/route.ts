import { chatErrorResponse, listConversations } from '@/lib/messages';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET -> { conversations }: group chats for events you organize or RSVPed to.
export async function GET(request: Request) {
  const session = await requireUser(request);
  if (session instanceof Response) return session;
  try {
    return Response.json({ conversations: await listConversations(session.supabase, session.user) });
  } catch (error) {
    return chatErrorResponse(error, 'Could not load your conversations. Please try again.');
  }
}
