import { IMAGE_ID_PATTERN, removeGalleryImage } from '@/lib/event-gallery';
import { signedInForEvent } from '@/lib/event-route';
import { serverError } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; imageId: string }> };

export async function DELETE(request: Request, context: Context) {
  const { imageId } = await context.params;
  if (!IMAGE_ID_PATTERN.test(imageId)) {
    return Response.json({ error: 'Photo id must be a positive whole number.' }, { status: 400 });
  }

  const session = await signedInForEvent(request, context);
  if (session instanceof Response) return session;

  try {
    const result = await removeGalleryImage(session.supabase, session.user.id, session.eventId, imageId);
    if ('status' in result) return Response.json({ error: result.error }, { status: result.status });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(error);
    return serverError('Could not remove this photo. Please try again.');
  }
}
