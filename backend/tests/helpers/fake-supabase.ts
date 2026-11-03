import type { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';

type QueryResult = { data: unknown; error: { message: string } | null };

// A stand-in for the Supabase client's query builder. Every chained call
// (select, eq, gte, ...) is recorded in `calls`, and awaiting the chain
// resolves to `result`, the way a real query resolves to { data, error }.
export function fakeSupabase(result: QueryResult) {
  const calls: Array<[method: string, args: unknown[]]> = [];
  const builder: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (r: QueryResult) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          calls.push([String(prop), args]);
          return builder;
        };
      },
    },
  );
  const client = {
    from: (table: string) => {
      calls.push(['from', [table]]);
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

// A stand-in for the client's auth API; set each method's result per test.
export function fakeAuthClient() {
  const auth = { signUp: vi.fn(), signInWithPassword: vi.fn() };
  return { client: { auth } as unknown as SupabaseClient, auth };
}

// Mimics Supabase's AuthError, which carries a machine-readable `code`.
export function authError(code: string, message = code) {
  return Object.assign(new Error(message), { name: 'AuthApiError', code, status: 400, __isAuthError: true });
}

export function request(url: string, body?: unknown, raw?: string) {
  if (body === undefined && raw === undefined) return new Request(url);
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
}
