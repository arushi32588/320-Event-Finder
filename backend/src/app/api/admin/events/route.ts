import { listEventsForReview, parseStatusFilter, requireAdmin } from '@/lib/admin';
import { serverError } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET /api/admin/events             -> pending events, soonest first
// GET /api/admin/events?status=all  -> also: approved, rejected
export async function GET(request: Request) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const parsed = parseStatusFilter(new URL(request.url).searchParams);
  if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    return Response.json({ events: await listEventsForReview(session.supabase, parsed.status) });
  } catch (error) {
    console.error(error);
    return serverError('Could not load events for review. Please try again.');
  }
}
