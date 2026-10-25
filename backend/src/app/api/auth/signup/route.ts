import { authErrorResponse, notConfigured, publicSession, publicUser, readJsonObject, validateSignup } from '@/lib/auth';
import { createAuthClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// POST /api/auth/signup
// Body: { name, email, dateOfBirth, password, confirmPassword, acceptedTerms }
// 201 -> { user, session, needsEmailConfirmation }
// 400 -> { error, fields } for invalid input; 409 if the email is taken.
// The public.users row is created by the on_auth_user_created database trigger.
export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) return Response.json({ error: 'Request body must be a JSON object.' }, { status: 400 });

  const result = validateSignup(body, new Date());
  if ('errors' in result) {
    return Response.json({ error: 'Please fix the highlighted fields.', fields: result.errors }, { status: 400 });
  }

  const supabase = createAuthClient();
  if (!supabase) return notConfigured();

  const { name, email, dateOfBirth, password } = result.value;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, date_of_birth: dateOfBirth } },
  });
  if (error) return authErrorResponse(error);

  // With email confirmation on, Supabase hides duplicate signups by returning a
  // user with no identities instead of an error.
  if (!data.user || data.user.identities?.length === 0) {
    return Response.json({ error: 'An account with this email already exists.' }, { status: 409 });
  }

  return Response.json(
    { user: publicUser(data.user), session: publicSession(data.session), needsEmailConfirmation: !data.session },
    { status: 201 },
  );
}
