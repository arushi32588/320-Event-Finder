import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { clearSession, setSession } from '../lib/api.js';
import { AuthProvider } from '../lib/auth.jsx';

// Replaces fetch with a table like { 'GET /api/events': handler }. A handler is a
// response body, or a function of the request returning one; wrap it in fail()
// for an error status. Every call is recorded in `calls`. A request with no
// matching route fails loudly, so a page can't call something the test forgot.
export const fail = (status, error, fields) => ({ __status: status, error, fields });

export function mockApi(routes) {
  const calls = [];
  const fetchMock = vi.fn(async (url, options = {}) => {
    const parsed = new URL(url, 'http://localhost');
    const method = options.method ?? 'GET';
    const call = {
      method,
      path: parsed.pathname,
      params: parsed.searchParams,
      body: options.body ? JSON.parse(options.body) : undefined,
      token: options.headers?.Authorization?.replace('Bearer ', ''),
    };
    calls.push(call);

    const route = routes[`${method} ${parsed.pathname}`];
    if (route === undefined) throw new Error(`Test has no route for ${method} ${parsed.pathname}`);
    const result = typeof route === 'function' ? route(call) : route;
    const { __status: status = 200, ...body } = result ?? {};
    return new Response(status === 204 ? null : JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock, callsTo: (method, path) => calls.filter((c) => c.method === method && c.path === path) };
}

export function resetApi() {
  clearSession();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // Nothing stored.
  }
  vi.unstubAllGlobals();
}

export const profile = (overrides = {}) => ({
  id: 'user-1',
  email: 'maya@umass.edu',
  name: 'Maya Fox',
  dateOfBirth: '2004-05-01',
  role: 'attendee',
  organizerStatus: 'none',
  organizationName: null,
  ...overrides,
});

// Logs a user in for the test: stores a session and answers the profile request.
export function loggedInRoutes(overrides = {}) {
  setSession({ accessToken: 'token-1', refreshToken: 'refresh-1', expiresAt: 1 }, false);
  return { 'GET /api/me/profile': { profile: profile(overrides) } };
}

export function renderPage(ui, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
  );
}
