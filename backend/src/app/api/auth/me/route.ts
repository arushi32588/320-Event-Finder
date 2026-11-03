import { getAccount, requireUser, serverError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await requireUser(request);
  if (session instanceof Response) return session;

  try {
    return Response.json({ user: await getAccount(session.supabase, session.user) });
  } catch (error) {
    console.error(error);
    return serverError('Could not load your account. Please try again.');
  }
}
