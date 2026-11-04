import { notConfigured, publicSession, publicUser, readJsonObject } from '@/lib/auth';
import { createAuthClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// POST /api/auth/refresh with { refreshToken } -> { user, session }.
// Login tokens expire after an hour; this swaps the refresh token for new ones.
export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const refreshToken = typeof body?.refreshToken === 'string' ? body.refreshToken : '';
  if (!refreshToken) return Response.json({ error: 'Refresh token is required.' }, { status: 400 });

  const supabase = createAuthClient();
  if (!supabase) return notConfigured();

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) {
    return Response.json({ error: 'Please log in again.' }, { status: 401 });
  }
  return Response.json({ user: publicUser(data.user), session: publicSession(data.session) });
}
