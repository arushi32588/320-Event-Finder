import { readJsonObject } from '@/lib/auth';
import { listSubmittedEvents, submitEvent, validateEventSubmission } from '@/lib/event-submissions';
import { requireUser, serverError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await requireUser(request);
  if (session instanceof Response) return session;

  try {
    return Response.json({ events: await listSubmittedEvents(session.supabase, session.user.id) });
  } catch (error) {
    console.error(error);
    return serverError('Could not load your submitted events. Please try again.');
  }
}

export async function POST(request: Request) {
  const session = await requireUser(request);
  if (session instanceof Response) return session;

  const body = await readJsonObject(request);
  if (!body) return Response.json({ error: 'Request body must be a JSON object.' }, { status: 400 });

  const result = validateEventSubmission(body, new Date());
  if ('errors' in result) {
    return Response.json({ error: 'Please fix the highlighted fields.', fields: result.errors }, { status: 400 });
  }

  try {
    return Response.json({ event: await submitEvent(session.supabase, session.user.id, result.value) }, { status: 201 });
  } catch (error) {
    console.error(error);
    return serverError('Could not submit this event. Please try again.');
  }
}
