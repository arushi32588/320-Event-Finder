import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

// Returns a shared server-side Supabase client, or null until the
// SUPABASE_URL / SUPABASE_ANON_KEY env vars are set in .env.local.
// Use it for data queries only, never for sign-in: a signed-in client holds
// that user's session, and sharing it would leak the session across requests.
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  return client;
}

// Returns a fresh client for one sign-up or login request, or null until
// Supabase is configured. Each request gets its own so sessions never mix.
export function createAuthClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
