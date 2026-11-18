import { chatErrorResponse, getConversation } from '@/lib/messages';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET -> { conversation, messages } (oldest first); 404 if not a member.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireUser(request);
  if (session instanceof Response) return session;
  try {
    return Response.json(await getConversation(session.supabase, session.user, id));
  } catch (error) {
    return chatErrorResponse(error, 'Could not load this conversation. Please try again.');
  }
}
