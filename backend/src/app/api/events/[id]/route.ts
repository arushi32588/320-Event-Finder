import { sampleEvents } from '@/data/sample-events';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = sampleEvents.find((e) => e.id === id);
  if (!event) return Response.json({ error: 'Event not found' }, { status: 404 });
  return Response.json({ event });
}
