import { authErrorResponse, notConfigured, publicSession, publicUser, readJsonObject, validateLogin } from '@/lib/auth';
import { createAuthClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// POST /api/auth/login
// Body: { email, password }
// 200 -> { user, session }; 401 for a wrong email or password.
export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) return Response.json({ error: 'Request body must be a JSON object.' }, { status: 400 });

  const result = validateLogin(body);
  if ('errors' in result) {
    return Response.json({ error: 'Please fix the highlighted fields.', fields: result.errors }, { status: 400 });
  }

  const supabase = createAuthClient();
  if (!supabase) return notConfigured();

  const { data, error } = await supabase.auth.signInWithPassword(result.value);
  if (error) return authErrorResponse(error);

  return Response.json({ user: publicUser(data.user), session: publicSession(data.session) });
}
