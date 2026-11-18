import { chatErrorResponse, sendMessage } from '@/lib/messages';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST { body } -> 201 { message }; 400 { error, fields: { body } } if empty or too long.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireUser(request);
  if (session instanceof Response) return session;
  const payload = (await request.json().catch(() => null)) as { body?: unknown } | null;
  try {
    return Response.json({ message: await sendMessage(session.supabase, session.user, id, payload?.body) }, { status: 201 });
  } catch (error) {
    return chatErrorResponse(error, 'Could not send your message. Please try again.');
  }
}
