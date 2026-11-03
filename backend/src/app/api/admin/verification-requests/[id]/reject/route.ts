import { handleReview } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// POST /api/admin/verification-requests/:id/reject -> { request }
// Optional body: { reason }. Marks the request and organizer profile rejected.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleReview(request, id, 'rejected');
}
