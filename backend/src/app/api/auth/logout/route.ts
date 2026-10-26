import { notConfigured } from '@/lib/auth';
import { bearerToken, serverError, unauthorized } from '@/lib/session';
import { createAuthClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const SESSION_ALREADY_ENDED = [401, 403, 404];

export async function POST(request: Request) {
  const accessToken = bearerToken(request);
  if (!accessToken) return unauthorized();

  const supabase = createAuthClient();
  if (!supabase) return notConfigured();

  const { error } = await supabase.auth.admin.signOut(accessToken, 'local');
  if (error && !SESSION_ALREADY_ENDED.includes(error.status ?? 0)) {
    console.error(error);
    return serverError('Could not log you out. Please try again.');
  }

  return new Response(null, { status: 204 });
}
