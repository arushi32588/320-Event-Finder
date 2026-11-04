import { readJsonObject } from '@/lib/auth';
import { getProfile, updateName, validateName } from '@/lib/profile';
import { requireUser, serverError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await requireUser(request);
  if (session instanceof Response) return session;

  try {
    return Response.json({ profile: await getProfile(session.supabase, session.user) });
  } catch (error) {
    console.error(error);
    return serverError('Could not load your profile. Please try again.');
  }
}

// PATCH { name } -> { profile }. Name is the only editable field for now.
export async function PATCH(request: Request) {
  const session = await requireUser(request);
  if (session instanceof Response) return session;

  const body = await readJsonObject(request);
  if (!body) return Response.json({ error: 'Request body must be a JSON object.' }, { status: 400 });

  const result = validateName(body.name);
  if ('error' in result) {
    return Response.json({ error: 'Please fix the highlighted fields.', fields: { name: result.error } }, { status: 400 });
  }

  try {
    await updateName(session.supabase, session.user.id, result.name);
    return Response.json({ profile: await getProfile(session.supabase, session.user) });
  } catch (error) {
    console.error(error);
    return serverError('Could not update your profile. Please try again.');
  }
}
