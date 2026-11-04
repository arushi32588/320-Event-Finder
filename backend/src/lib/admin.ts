import type { SupabaseClient } from '@supabase/supabase-js';
import { EVENT_ID_PATTERN } from '@/lib/event-columns';
import { SUBMITTED_COLUMNS, toSubmittedEvent, type SubmittedEvent, type SubmittedEventRow } from '@/lib/event-submissions';
import { getAccount, requireUser, serverError, type SignedInRequest } from '@/lib/session';

export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type ReviewDecision = 'approved' | 'rejected';

export type VerificationRequest = {
  id: string;
  organizationName: string | null;
  description: string | null;
  address: string | null;
  website: string | null;
  contactEmail: string | null;
  documentUrl: string | null;
  status: VerificationStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  applicant: { id: string | null; name: string | null; email: string | null };
};

export type ReviewedRequest = Pick<VerificationRequest, 'id' | 'status' | 'rejectionReason' | 'reviewedAt'>;

type RequestRow = {
  id: number;
  organization_name: string | null;
  description: string | null;
  address: string | null;
  website: string | null;
  contact_email: string | null;
  document_url: string | null;
  status: VerificationStatus;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  applicant_id: string | null;
  applicant_name: string | null;
  applicant_email: string | null;
};

type ReviewedRow = Pick<RequestRow, 'id' | 'status' | 'rejection_reason' | 'reviewed_at'>;

export const MAX_REJECTION_REASON_LENGTH = 1000;
const STATUS_FILTERS = ['pending', 'approved', 'rejected', 'all'] as const;

// The custom error codes raised by the database functions, as HTTP statuses.
const REVIEW_ERROR_STATUS: Record<string, number> = { EF403: 403, EF404: 404, EF409: 409 };

export const forbidden = () => Response.json({ error: 'Only admins can do this.' }, { status: 403 });

// Like requireUser, but also turns away anyone who isn't an admin. The database
// functions check again, so this can't be the only thing protecting them.
export async function requireAdmin(request: Request): Promise<SignedInRequest | Response> {
  const session = await requireUser(request);
  if (session instanceof Response) return session;

  try {
    const account = await getAccount(session.supabase, session.user);
    return account.role === 'admin' ? session : forbidden();
  } catch (error) {
    console.error(error);
    return serverError('Could not check your account. Please try again.');
  }
}

// Reads ?status=, defaulting to pending. Returns null for "all".
export function parseStatusFilter(params: URLSearchParams): { status: VerificationStatus | null } | { error: string } {
  const value = (params.get('status') ?? 'pending').trim().toLowerCase();
  if (!(STATUS_FILTERS as readonly string[]).includes(value)) {
    return { error: `Unknown status: ${value}. Use ${STATUS_FILTERS.join(', ')}.` };
  }
  return { status: value === 'all' ? null : (value as VerificationStatus) };
}

export function isValidRequestId(id: string): boolean {
  return /^[1-9]\d{0,17}$/.test(id);
}

// Reads the optional { reason } body. A missing body just means no reason.
export async function readRejectionReason(request: Request): Promise<{ reason: string | null } | { error: string }> {
  const text = await request.text();
  if (!text.trim()) return { reason: null };

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: 'Request body must be a JSON object.' };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Request body must be a JSON object.' };

  const { reason } = body as { reason?: unknown };
  if (reason === undefined || reason === null) return { reason: null };
  if (typeof reason !== 'string') return { error: 'Reason must be text.' };
  if (reason.trim().length > MAX_REJECTION_REASON_LENGTH) {
    return { error: `Reason must be ${MAX_REJECTION_REASON_LENGTH} characters or fewer.` };
  }
  return { reason: reason.trim() || null };
}

export function toVerificationRequest(row: RequestRow): VerificationRequest {
  return {
    id: String(row.id),
    organizationName: row.organization_name,
    description: row.description,
    address: row.address,
    website: row.website,
    contactEmail: row.contact_email,
    documentUrl: row.document_url,
    status: row.status,
    rejectionReason: row.rejection_reason,
    submittedAt: row.created_at,
    reviewedAt: row.reviewed_at,
    applicant: { id: row.applicant_id, name: row.applicant_name, email: row.applicant_email },
  };
}

export async function listVerificationRequests(
  supabase: SupabaseClient,
  status: VerificationStatus | null,
): Promise<VerificationRequest[]> {
  const { data, error } = await supabase.rpc('list_verification_requests', { p_status: status });
  if (error) throw new Error(`Failed to load verification requests: ${error.message}`);
  return (data as RequestRow[]).map(toVerificationRequest);
}

// Returns the reviewed request, or the HTTP status for an expected refusal
// (not an admin, unknown id, already reviewed). Anything else throws.
export async function reviewVerificationRequest(
  supabase: SupabaseClient,
  id: string,
  decision: ReviewDecision,
  reason: string | null,
): Promise<{ request: ReviewedRequest } | { status: number; error: string }> {
  const { data, error } = await supabase
    .rpc('review_verification_request', { p_request_id: id, p_decision: decision, p_rejection_reason: reason })
    .single();

  if (error) {
    const status = error.code ? REVIEW_ERROR_STATUS[error.code] : undefined;
    if (status) return { status, error: error.message };
    throw new Error(`Failed to review verification request ${id}: ${error.message}`);
  }

  const row = data as ReviewedRow;
  return {
    request: { id: String(row.id), status: row.status, rejectionReason: row.rejection_reason, reviewedAt: row.reviewed_at },
  };
}

// The shared body of the approve and reject routes.
export async function handleReview(request: Request, id: string, decision: ReviewDecision): Promise<Response> {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  if (!isValidRequestId(id)) {
    return Response.json({ error: 'Request id must be a positive whole number.' }, { status: 400 });
  }

  let reason: string | null = null;
  if (decision === 'rejected') {
    const parsed = await readRejectionReason(request);
    if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    reason = parsed.reason;
  }

  try {
    const result = await reviewVerificationRequest(session.supabase, id, decision, reason);
    if ('status' in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ request: result.request });
  } catch (error) {
    console.error(error);
    return serverError('Could not save this review. Please try again.');
  }
}

// ---------- Event approvals ----------

export async function listEventsForReview(supabase: SupabaseClient, status: VerificationStatus | null): Promise<SubmittedEvent[]> {
  let query = supabase.from('events').select(SUBMITTED_COLUMNS).order('start_time', { ascending: true });
  if (status) query = query.eq('approval_status', status);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load events for review: ${error.message}`);
  return (data as unknown as SubmittedEventRow[]).map(toSubmittedEvent);
}

// Only a pending event can be reviewed, so two admins can't overwrite each other.
export async function reviewEvent(
  supabase: SupabaseClient,
  adminId: string,
  id: string,
  decision: ReviewDecision,
): Promise<{ event: SubmittedEvent } | { status: number; error: string }> {
  const { data, error } = await supabase
    .from('events')
    .update({ approval_status: decision, reviewed_by_user_id: adminId })
    .eq('id', id)
    .eq('approval_status', 'pending')
    .select(SUBMITTED_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to review event ${id}: ${error.message}`);
  if (data) return { event: toSubmittedEvent(data as unknown as SubmittedEventRow) };

  const existing = await supabase.from('events').select('id').eq('id', id).maybeSingle();
  if (existing.error) throw new Error(`Failed to look up event ${id}: ${existing.error.message}`);
  return existing.data
    ? { status: 409, error: 'This event has already been reviewed' }
    : { status: 404, error: 'Event not found' };
}

// The shared body of the event approve and reject routes.
export async function handleEventReview(request: Request, id: string, decision: ReviewDecision): Promise<Response> {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  if (!EVENT_ID_PATTERN.test(id)) {
    return Response.json({ error: 'Event id must be a positive whole number.' }, { status: 400 });
  }

  try {
    const result = await reviewEvent(session.supabase, session.user.id, id, decision);
    if ('status' in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ event: result.event });
  } catch (error) {
    console.error(error);
    return serverError('Could not save this review. Please try again.');
  }
}
