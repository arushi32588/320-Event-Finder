import type { SupabaseClient, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as approveRoute } from '@/app/api/admin/verification-requests/[id]/approve/route';
import { POST as rejectRoute } from '@/app/api/admin/verification-requests/[id]/reject/route';
import { GET as listRoute } from '@/app/api/admin/verification-requests/route';
import {
  MAX_REJECTION_REASON_LENGTH,
  isValidRequestId,
  parseStatusFilter,
  readRejectionReason,
  toVerificationRequest,
} from '@/lib/admin';
import { requireUser } from '@/lib/session';
import { fakeSupabase } from './helpers/fake-supabase';

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  requireUser: vi.fn(),
}));

type QueryResult = { data: unknown; error: { message: string; code?: string } | null };

const BASE = 'http://localhost/api/admin/verification-requests';
const adminUser = { id: 'admin-1', email: 'admin@umass.edu', user_metadata: {} } as unknown as User;
const ok = (data: unknown): QueryResult => ({ data, error: null });
const failed = (message: string, code?: string): QueryResult => ({ data: null, error: { message, code } });

const row = {
  id: 7,
  organization_name: 'Hack Club',
  description: 'Student hackers',
  address: '140 Governors Dr',
  website: 'https://hackclub.example',
  contact_email: 'hello@hackclub.example',
  document_url: 'https://docs.example/proof.pdf',
  status: 'pending',
  rejection_reason: null,
  created_at: '2026-11-01T12:00:00+00:00',
  reviewed_at: null,
  applicant_id: 'user-1',
  applicant_name: 'Sam',
  applicant_email: 'sam@umass.edu',
};

const reviewed = { id: 7, status: 'approved', rejection_reason: null, reviewed_at: '2026-11-03T12:00:00+00:00' };

// Signs in a user with the given role. The users table answers the role check
// and every rpc call resolves to `rpcResult`, whatever is chained onto it.
function signIn(role: string | null, rpcResult: QueryResult = ok([]), usersResult?: QueryResult) {
  const users = fakeSupabase(usersResult ?? ok(role === null ? null : { name: 'Ada', email: 'a@umass.edu', role, date_of_birth: null }));
  const rpc = vi.fn(() => fakeSupabase(rpcResult).client.from('rpc'));
  const supabase = { from: users.client.from, rpc } as unknown as SupabaseClient;
  vi.mocked(requireUser).mockResolvedValue({ user: adminUser, supabase, accessToken: 'token' });
  return { rpc };
}

const signedOut = () => {
  vi.mocked(requireUser).mockResolvedValue(Response.json({ error: 'Please log in to continue.' }, { status: 401 }));
};

const list = (qs = '') => listRoute(new Request(`${BASE}${qs}`));
const post = (id: string, init?: RequestInit) => new Request(`${BASE}/${id}/review`, { method: 'POST', ...init });
const approve = (id = '7') => approveRoute(post(id), { params: Promise.resolve({ id }) });
const reject = (id = '7', body?: string) =>
  rejectRoute(post(id, body === undefined ? undefined : { body }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('parseStatusFilter', () => {
  const parse = (qs: string) => parseStatusFilter(new URLSearchParams(qs));

  it('defaults to pending', () => {
    expect(parse('')).toEqual({ status: 'pending' });
  });

  it.each(['pending', 'approved', 'rejected'])('accepts %s', (status) => {
    expect(parse(`status=${status}`)).toEqual({ status });
  });

  it('turns all into no filter, ignoring case', () => {
    expect(parse('status=ALL')).toEqual({ status: null });
  });

  it('rejects unknown statuses and names them', () => {
    expect((parse('status=later') as { error: string }).error).toContain('later');
  });
});

describe('isValidRequestId', () => {
  it('accepts positive whole numbers', () => {
    expect(isValidRequestId('1')).toBe(true);
    expect(isValidRequestId('123456789012345678')).toBe(true);
  });

  it.each(['abc', '0', '-1', '1.5', '007', '1e3', ' 1', '', '1234567890123456789'])('rejects %j', (id) => {
    expect(isValidRequestId(id)).toBe(false);
  });
});

describe('readRejectionReason', () => {
  const read = (body: string) => readRejectionReason(new Request(BASE, { method: 'POST', body }));

  it('treats a missing or blank body as no reason', async () => {
    expect(await readRejectionReason(new Request(BASE, { method: 'POST' }))).toEqual({ reason: null });
    expect(await read('   ')).toEqual({ reason: null });
  });

  it('trims the reason and treats a blank or missing one as none', async () => {
    expect(await read('{"reason":"  Not a real org  "}')).toEqual({ reason: 'Not a real org' });
    expect(await read('{"reason":"   "}')).toEqual({ reason: null });
    expect(await read('{"reason":null}')).toEqual({ reason: null });
    expect(await read('{}')).toEqual({ reason: null });
  });

  it.each(['{oops', '[1]', 'null', '"text"'])('rejects the non-object body %s', async (body) => {
    expect(await read(body)).toHaveProperty('error');
  });

  it('rejects a reason that is not text', async () => {
    expect(await read('{"reason":42}')).toEqual({ error: 'Reason must be text.' });
  });

  it('enforces the length limit', async () => {
    const atLimit = 'x'.repeat(MAX_REJECTION_REASON_LENGTH);
    expect(await read(JSON.stringify({ reason: atLimit }))).toEqual({ reason: atLimit });
    expect(await read(JSON.stringify({ reason: `${atLimit}x` }))).toHaveProperty('error');
  });
});

describe('toVerificationRequest', () => {
  it('maps a database row to the shape the dashboard renders', () => {
    expect(toVerificationRequest(row as Parameters<typeof toVerificationRequest>[0])).toEqual({
      id: '7',
      organizationName: 'Hack Club',
      description: 'Student hackers',
      address: '140 Governors Dr',
      website: 'https://hackclub.example',
      contactEmail: 'hello@hackclub.example',
      documentUrl: 'https://docs.example/proof.pdf',
      status: 'pending',
      rejectionReason: null,
      submittedAt: '2026-11-01T12:00:00+00:00',
      reviewedAt: null,
      applicant: { id: 'user-1', name: 'Sam', email: 'sam@umass.edu' },
    });
  });
});

describe('who can use the admin endpoints', () => {
  const endpoints: Array<[string, () => Promise<Response>]> = [
    ['list', () => list()],
    ['approve', () => approve()],
    ['reject', () => reject()],
  ];

  it.each(endpoints)('%s returns 401 when not logged in', async (_name, call) => {
    signedOut();
    expect((await call()).status).toBe(401);
  });

  it.each(endpoints)('%s returns 403 for an attendee and never reaches the database function', async (_name, call) => {
    const { rpc } = signIn('attendee');
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Only admins can do this.' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(endpoints)('%s returns 403 for an organizer', async (_name, call) => {
    const { rpc } = signIn('organizer');
    expect((await call()).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(endpoints)('%s returns 403 when the user has no users row', async (_name, call) => {
    const { rpc } = signIn(null);
    expect((await call()).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(endpoints)('%s returns 500 when the role check fails, and stays closed', async (_name, call) => {
    const { rpc } = signIn('admin', ok([]), failed('db down'));
    const res = await call();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('db down');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/verification-requests', () => {
  it('asks for pending requests by default and returns them mapped', async () => {
    const { rpc } = signIn('admin', ok([row]));
    const res = await list();
    expect(res.status).toBe(200);
    const { requests } = await res.json();
    expect(requests).toEqual([expect.objectContaining({ id: '7', organizationName: 'Hack Club', status: 'pending' })]);
    expect(rpc).toHaveBeenCalledWith('list_verification_requests', { p_status: 'pending' });
  });

  it('passes a chosen status through', async () => {
    const { rpc } = signIn('admin');
    await list('?status=rejected');
    expect(rpc).toHaveBeenCalledWith('list_verification_requests', { p_status: 'rejected' });
  });

  it('passes no status for all', async () => {
    const { rpc } = signIn('admin');
    await list('?status=all');
    expect(rpc).toHaveBeenCalledWith('list_verification_requests', { p_status: null });
  });

  it('returns an empty list when nothing is waiting', async () => {
    signIn('admin', ok([]));
    expect(await (await list()).json()).toEqual({ requests: [] });
  });

  it('returns 400 for an unknown status without calling the database function', async () => {
    const { rpc } = signIn('admin');
    expect((await list('?status=later')).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('hides database errors behind a friendly 500', async () => {
    signIn('admin', failed('secret internals'));
    const res = await list();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret internals');
  });
});

describe('POST /api/admin/verification-requests/:id/approve', () => {
  it('approves the request and returns the result', async () => {
    const { rpc } = signIn('admin', ok(reviewed));
    const res = await approve();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      request: { id: '7', status: 'approved', rejectionReason: null, reviewedAt: '2026-11-03T12:00:00+00:00' },
    });
    expect(rpc).toHaveBeenCalledWith('review_verification_request', {
      p_request_id: '7',
      p_decision: 'approved',
      p_rejection_reason: null,
    });
  });

  it.each(['abc', '0', '-1', '1.5'])('returns 400 for the invalid id %j without calling the database function', async (id) => {
    const { rpc } = signIn('admin');
    expect((await approve(id)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['EF404', 404, 'Verification request not found'],
    ['EF409', 409, 'This request has already been reviewed'],
    ['EF403', 403, 'Admins only'],
  ])('maps database error %s to %i', async (code, status, message) => {
    signIn('admin', failed(message, code));
    const res = await approve();
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: message });
  });

  it('hides unexpected database errors behind a friendly 500', async () => {
    signIn('admin', failed('function does not exist', 'PGRST202'));
    const res = await approve();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('does not exist');
  });
});

describe('POST /api/admin/verification-requests/:id/reject', () => {
  const rejected = { ...reviewed, status: 'rejected', rejection_reason: 'Not a real org' };

  it('rejects with a trimmed reason', async () => {
    const { rpc } = signIn('admin', ok(rejected));
    const res = await reject('7', '{"reason":"  Not a real org "}');
    expect(res.status).toBe(200);
    expect((await res.json()).request).toEqual(expect.objectContaining({ status: 'rejected', rejectionReason: 'Not a real org' }));
    expect(rpc).toHaveBeenCalledWith('review_verification_request', {
      p_request_id: '7',
      p_decision: 'rejected',
      p_rejection_reason: 'Not a real org',
    });
  });

  it('rejects without a body', async () => {
    const { rpc } = signIn('admin', ok({ ...rejected, rejection_reason: null }));
    expect((await reject()).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('review_verification_request', {
      p_request_id: '7',
      p_decision: 'rejected',
      p_rejection_reason: null,
    });
  });

  it.each(['{oops', '[1]', '{"reason":42}', JSON.stringify({ reason: 'x'.repeat(MAX_REJECTION_REASON_LENGTH + 1) })])(
    'returns 400 for the bad body %s without calling the database function',
    async (body) => {
      const { rpc } = signIn('admin');
      expect((await reject('7', body)).status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it('returns 400 for an invalid id before reading the body', async () => {
    const { rpc } = signIn('admin');
    expect((await reject('abc', '{oops')).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 409 for a request that was already reviewed', async () => {
    signIn('admin', failed('This request has already been reviewed', 'EF409'));
    expect((await reject()).status).toBe(409);
  });
});
