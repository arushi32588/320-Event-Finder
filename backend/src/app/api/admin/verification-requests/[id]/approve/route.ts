import { handleReview } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// POST /api/admin/verification-requests/:id/approve -> { request }
// Marks the request and organizer profile approved and makes the user an organizer.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleReview(request, id, 'approved');
}
