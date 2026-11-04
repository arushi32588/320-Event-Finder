import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, getSession, onSessionEnded, setSession } from './api.js';
import { fail, mockApi, resetApi } from '../test/api.jsx';

afterEach(() => {
  onSessionEnded(null);
  resetApi();
});

describe('api', () => {
  it('sends JSON and the login token', async () => {
    setSession({ accessToken: 'abc', refreshToken: 'r' }, false);
    const { calls } = mockApi({ 'POST /api/x': { ok: true } });
    expect(await api('/api/x', { method: 'POST', body: { a: 1 } })).toEqual({ ok: true });
    expect(calls[0].body).toEqual({ a: 1 });
    expect(calls[0].token).toBe('abc');
  });

  it('sends no token when logged out', async () => {
    const { calls } = mockApi({ 'GET /api/x': {} });
    await api('/api/x');
    expect(calls[0].token).toBeUndefined();
  });

  it('turns an error response into ApiError with its message and field errors', async () => {
    mockApi({ 'POST /api/x': fail(400, 'Please fix it.', { name: 'Name is required.' }) });
    const error = await api('/api/x', { method: 'POST', body: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: 'Please fix it.', status: 400, fields: { name: 'Name is required.' } });
  });

  it('gives a friendly message when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api('/api/x')).rejects.toMatchObject({ status: 0, message: expect.stringContaining("Can't reach the server") });
  });

  it('gives a friendly message when the response is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })));
    await expect(api('/api/x')).rejects.toMatchObject({ status: 502, message: 'Something went wrong. Please try again.' });
  });

  it('handles an empty 204 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    expect(await api('/api/x')).toBeNull();
  });
});

describe('expired logins', () => {
  const renewed = { session: { accessToken: 'new', refreshToken: 'newer', expiresAt: 2 } };

  it('renews the token once and retries the request', async () => {
    setSession({ accessToken: 'old', refreshToken: 'r1' }, false);
    const { calls } = mockApi({
      'GET /api/x': ({ token }) => (token === 'new' ? { ok: true } : fail(401, 'Please log in to continue.')),
      'POST /api/auth/refresh': renewed,
    });
    expect(await api('/api/x')).toEqual({ ok: true });
    expect(calls.map((c) => c.path)).toEqual(['/api/x', '/api/auth/refresh', '/api/x']);
    expect(calls[1].body).toEqual({ refreshToken: 'r1' });
    expect(getSession().accessToken).toBe('new');
  });

  it('shares one renewal between requests that expire together', async () => {
    setSession({ accessToken: 'old', refreshToken: 'r1' }, false);
    const { callsTo } = mockApi({
      'GET /api/x': ({ token }) => (token === 'new' ? { ok: true } : fail(401, 'expired')),
      'POST /api/auth/refresh': renewed,
    });
    await Promise.all([api('/api/x'), api('/api/x')]);
    expect(callsTo('POST', '/api/auth/refresh')).toHaveLength(1);
  });

  it('logs out when the renewal fails', async () => {
    setSession({ accessToken: 'old', refreshToken: 'r1' }, false);
    const ended = vi.fn();
    onSessionEnded(ended);
    mockApi({ 'GET /api/x': fail(401, 'Please log in to continue.'), 'POST /api/auth/refresh': fail(401, 'Please log in again.') });
    await expect(api('/api/x')).rejects.toMatchObject({ status: 401 });
    expect(getSession()).toBeNull();
    expect(ended).toHaveBeenCalledOnce();
  });

  it('does not try to renew when logged out', async () => {
    const { calls } = mockApi({ 'GET /api/x': fail(401, 'Please log in to continue.') });
    await expect(api('/api/x')).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(1);
  });

  it('keeps a remembered login remembered after renewing', async () => {
    setSession({ accessToken: 'old', refreshToken: 'r1' }, true);
    mockApi({
      'GET /api/x': ({ token }) => (token === 'new' ? {} : fail(401, 'expired')),
      'POST /api/auth/refresh': renewed,
    });
    await api('/api/x');
    expect(JSON.parse(localStorage.getItem('event-finder-session')).accessToken).toBe('new');
  });
});

describe('where the login is kept', () => {
  it('uses sessionStorage by default and localStorage for "remember me"', () => {
    setSession({ accessToken: 'a' }, false);
    expect(sessionStorage.getItem('event-finder-session')).toContain('"a"');
    expect(localStorage.getItem('event-finder-session')).toBeNull();
    setSession({ accessToken: 'b' }, true);
    expect(localStorage.getItem('event-finder-session')).toContain('"b"');
    expect(sessionStorage.getItem('event-finder-session')).toBeNull();
  });
});
