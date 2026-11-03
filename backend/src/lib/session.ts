import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { notConfigured } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';

export type SignedInRequest = { user: User; supabase: SupabaseClient; accessToken: string };

export type Role = 'attendee' | 'organizer' | 'admin';

export type Account = {
  id: string;
  email: string | null;
  name: string | null;
  dateOfBirth: string | null;
  role: Role;
};

type UserRow = { name: string | null; email: string | null; role: Role | null; date_of_birth: string | null };

export function createUserClient(accessToken: string): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function bearerToken(request: Request): string | null {
  const match = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

export const unauthorized = () => Response.json({ error: 'Please log in to continue.' }, { status: 401 });

export const serverError = (message: string) => Response.json({ error: message }, { status: 500 });

export async function requireUser(request: Request): Promise<SignedInRequest | Response> {
  const accessToken = bearerToken(request);
  if (!accessToken) return unauthorized();

  const supabase = createUserClient(accessToken);
  if (!supabase) return notConfigured();

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) {
    const status = error.status ?? 0;
    if (status >= 400 && status < 500) return unauthorized();
    console.error(error);
    return serverError('Could not check your login. Please try again.');
  }
  if (!data.user) return unauthorized();

  return { user: data.user, supabase, accessToken };
}

export async function getAccount(supabase: SupabaseClient, user: User): Promise<Account> {
  const { data, error } = await supabase
    .from('users')
    .select('name, email, role, date_of_birth')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load account ${user.id}: ${error.message}`);

  const row = data as UserRow | null;
  const metadata = user.user_metadata ?? {};
  return {
    id: user.id,
    email: row?.email ?? user.email ?? null,
    name: row?.name ?? (metadata.name as string | undefined) ?? null,
    dateOfBirth: row?.date_of_birth ?? (metadata.date_of_birth as string | undefined) ?? null,
    role: row?.role ?? 'attendee',
  };
}
