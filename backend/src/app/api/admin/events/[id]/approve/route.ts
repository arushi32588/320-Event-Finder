import { handleEventReview } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleEventReview(request, id, 'approved');
}
