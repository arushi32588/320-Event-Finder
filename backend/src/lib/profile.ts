import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getAccount, type Account } from '@/lib/session';

export type OrganizerStatus = 'none' | 'pending' | 'approved' | 'rejected';

export type Profile = Account & {
  organizerStatus: OrganizerStatus;
  organizationName: string | null;
};

type OrganizerProfileRow = {
  organization_name: string | null;
  verification_status: Exclude<OrganizerStatus, 'none'>;
};

async function getOrganizerProfile(supabase: SupabaseClient, userId: string): Promise<OrganizerProfileRow | null> {
  const { data, error } = await supabase
    .from('organizer_profiles')
    .select('organization_name, verification_status')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load organizer profile for ${userId}: ${error.message}`);
  return data as OrganizerProfileRow | null;
}

export async function getProfile(supabase: SupabaseClient, user: User): Promise<Profile> {
  const [account, organizer] = await Promise.all([getAccount(supabase, user), getOrganizerProfile(supabase, user.id)]);
  return {
    ...account,
    organizerStatus: organizer?.verification_status ?? 'none',
    organizationName: organizer?.organization_name ?? null,
  };
}

export const MAX_NAME_LENGTH = 255;

export function validateName(value: unknown): { name: string } | { error: string } {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) return { error: 'Name is required.' };
  if (name.length > MAX_NAME_LENGTH) return { error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  return { name };
}

export async function updateName(supabase: SupabaseClient, userId: string, name: string): Promise<void> {
  const { error } = await supabase.from('users').update({ name }).eq('id', userId);
  if (error) throw new Error(`Failed to update name for ${userId}: ${error.message}`);
}
