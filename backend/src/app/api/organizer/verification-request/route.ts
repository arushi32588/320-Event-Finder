import { readJsonObject } from '@/lib/auth';
import {
  getLatestVerificationRequest,
  submitVerificationRequest,
  validateVerificationApplication,
} from '@/lib/organizer-verification';
import { requireUser, serverError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await requireUser(request);
  if (session instanceof Response) return session;

  try {
    return Response.json({ request: await getLatestVerificationRequest(session.supabase) });
  } catch (error) {
    console.error(error);
    return serverError('Could not load your verification request. Please try again.');
  }
}

export async function POST(request: Request) {
  const session = await requireUser(request);
  if (session instanceof Response) return session;

  const body = await readJsonObject(request);
  if (!body) return Response.json({ error: 'Request body must be a JSON object.' }, { status: 400 });

  const result = validateVerificationApplication(body);
  if ('errors' in result) {
    return Response.json({ error: 'Please fix the highlighted fields.', fields: result.errors }, { status: 400 });
  }

  try {
    const submitted = await submitVerificationRequest(session.supabase, result.value);
    if ('status' in submitted) return Response.json({ error: submitted.error }, { status: submitted.status });
    return Response.json({ request: submitted.request }, { status: 201 });
  } catch (error) {
    console.error(error);
    return serverError('Could not submit your verification request. Please try again.');
  }
}
