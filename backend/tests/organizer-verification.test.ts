import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/organizer/verification-request/route';
import { validateVerificationApplication } from '@/lib/organizer-verification';
import { requireUser } from '@/lib/session';
import { request } from './helpers/fake-supabase';

vi.mock('@/lib/supabase', () => ({ getSupabase: vi.fn(() => null), createAuthClient: vi.fn(() => null) }));
vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  requireUser: vi.fn(),
}));

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };

// A stand-in for the client's rpc(): records each call and resolves to `result`,
// whether or not the chain ends in .single().
function fakeRpcClient(result: RpcResult) {
  const rpc = vi.fn((_name: string, _args?: unknown) => {
    const builder: object = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (resolve: (r: RpcResult) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve(result).then(resolve, reject);
          }
          return () => builder;
        },
      },
    );
    return builder;
  });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const ok = (data: unknown): RpcResult => ({ data, error: null });
const fail = (message: string, code?: string): RpcResult => ({ data: null, error: { message, code } });

const URL = 'http://localhost/api/organizer/verification-request';
const post = (body?: unknown, raw?: string) => POST(request(URL, body ?? {}, raw));
const get = () => GET(request(URL));

const asUser = (supabase: SupabaseClient) =>
  vi.mocked(requireUser).mockResolvedValue({ user: { id: 'user-1' } as never, supabase, accessToken: 't' });

const row = {
  id: 9,
  organization_name: 'Hack Club',
  description: 'We run hackathons.',
  address: '1 Main St',
  website: 'https://hackclub.org',
  contact_email: 'team@hackclub.org',
  document_url: 'https://example.com/doc.pdf',
  status: 'pending',
  rejection_reason: null,
  created_at: '2026-11-03T15:00:00+00:00',
  reviewed_at: null,
};
const shaped = {
  id: '9',
  organizationName: 'Hack Club',
  description: 'We run hackathons.',
  address: '1 Main St',
  website: 'https://hackclub.org',
  contactEmail: 'team@hackclub.org',
  documentUrl: 'https://example.com/doc.pdf',
  status: 'pending',
  rejectionReason: null,
  submittedAt: '2026-11-03T15:00:00+00:00',
  reviewedAt: null,
};

const full = {
  organizationName: ' Hack Club ',
  description: ' We run hackathons. ',
  address: '1 Main St',
  website: 'https://hackclub.org',
  contactEmail: 'Team@HackClub.org',
  documentUrl: 'https://example.com/doc.pdf',
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(requireUser).mockReset();
});

describe('validateVerificationApplication', () => {
  it('accepts every field, trimming text and lowercasing the email', () => {
    expect(validateVerificationApplication(full)).toEqual({
      value: {
        organizationName: 'Hack Club',
        description: 'We run hackathons.',
        address: '1 Main St',
        website: 'https://hackclub.org',
        contactEmail: 'team@hackclub.org',
        documentUrl: 'https://example.com/doc.pdf',
      },
    });
  });

  it('rejects invalid URLs and email', () => {
    for (const website of ['not a url', 'ftp://x.org', 'javascript:alert(1)']) {
      const result = validateVerificationApplication({ organizationName: 'A', website });
      expect('errors' in result && result.errors.website).toBe('Website must start with http:// or https://.');
    }
    const doc = validateVerificationApplication({ organizationName: 'A', documentUrl: 'nope' });
    expect('errors' in doc && doc.errors.documentUrl).toBe('Document URL must start with http:// or https://.');
    const email = validateVerificationApplication({ organizationName: 'A', contactEmail: 'not-an-email' });
    expect('errors' in email && email.errors.contactEmail).toBe('Enter a valid contact email address.');
  });
});

describe('not logged in', () => {
  it('returns 401 from both endpoints', async () => {
    vi.mocked(requireUser).mockResolvedValue(Response.json({ error: 'Please log in to continue.' }, { status: 401 }));
    expect((await get()).status).toBe(401);
    expect((await post({ organizationName: 'Hack Club' })).status).toBe(401);
  });
});

describe('POST /api/organizer/verification-request', () => {
  it('returns 400 with per-field errors and touches no data', async () => {
    const { client, rpc } = fakeRpcClient(ok(row));
    asUser(client);
    const res = await post({ website: 'nope', contactEmail: 'nope' });
    expect(res.status).toBe(400);
    expect((await res.json()).fields).toEqual({
      organizationName: 'Organization name is required.',
      website: 'Website must start with http:// or https://.',
      contactEmail: 'Enter a valid contact email address.',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('submits the cleaned application and returns the new request', async () => {
    const { client, rpc } = fakeRpcClient(ok(row));
    asUser(client);

    const res = await post(full);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ request: shaped });
    expect(rpc).toHaveBeenCalledWith('submit_verification_request', {
      p_organization_name: 'Hack Club',
      p_description: 'We run hackathons.',
      p_address: '1 Main St',
      p_website: 'https://hackclub.org',
      p_contact_email: 'team@hackclub.org',
      p_document_url: 'https://example.com/doc.pdf',
    });
  });

  it('returns 409 when the user already has a pending request', async () => {
    const { client } = fakeRpcClient(fail('You already have a verification request pending review', 'EF409'));
    asUser(client);

    const res = await post({ organizationName: 'Hack Club' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('pending');
    expect(console.error).not.toHaveBeenCalled();
  });

  it('returns 409 when the user is already approved', async () => {
    const { client } = fakeRpcClient(fail('Your organization is already verified', 'EF409'));
    asUser(client);

    const res = await post({ organizationName: 'Hack Club' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('already verified');
  });

  it('returns 500 without leaking details when the database fails', async () => {
    const { client } = fakeRpcClient(fail('connection to db.internal refused', 'XX000'));
    asUser(client);

    const res = await post({ organizationName: 'Hack Club' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('db.internal');
    expect(console.error).toHaveBeenCalled();
  });
});

describe('GET /api/organizer/verification-request', () => {
  it('returns null when the user has never applied', async () => {
    const { client, rpc } = fakeRpcClient(ok([]));
    asUser(client);

    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ request: null });
    expect(rpc).toHaveBeenCalledWith('get_my_verification_request');
  });

  it('returns the latest request with its status', async () => {
    const { client } = fakeRpcClient(ok([{ ...row, status: 'rejected', rejection_reason: 'Missing proof', reviewed_at: '2026-11-04T10:00:00+00:00' }]));
    asUser(client);

    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      request: { ...shaped, status: 'rejected', rejectionReason: 'Missing proof', reviewedAt: '2026-11-04T10:00:00+00:00' },
    });
  });
});
