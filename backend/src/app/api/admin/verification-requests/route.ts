import { listVerificationRequests, parseStatusFilter, requireAdmin } from '@/lib/admin';
import { serverError } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET /api/admin/verification-requests             -> pending requests, oldest first
// GET /api/admin/verification-requests?status=all  -> also: approved, rejected
export async function GET(request: Request) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const parsed = parseStatusFilter(new URL(request.url).searchParams);
  if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    return Response.json({ requests: await listVerificationRequests(session.supabase, parsed.status) });
  } catch (error) {
    console.error(error);
    return serverError('Could not load verification requests. Please try again.');
  }
}
