import type { SupabaseClient } from '@supabase/supabase-js';
import { EVENT_COLUMNS, type EventRow } from '@/lib/event-columns';
import { toEvent, type Event } from '@/lib/events';

export async function isApprovedEvent(supabase: SupabaseClient, eventId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('events')
    .select('id')
    .eq('id', eventId)
    .eq('approval_status', 'approved')
    .maybeSingle();
  if (error) throw new Error(`Failed to look up event ${eventId}: ${error.message}`);
  return data !== null;
}

export async function isSaved(supabase: SupabaseClient, userId: string, eventId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('saved_events')
    .select('id')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw new Error(`Failed to check saved event ${eventId}: ${error.message}`);
  return data !== null;
}

export async function saveEvent(supabase: SupabaseClient, userId: string, eventId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_events')
    .upsert({ user_id: userId, event_id: eventId }, { onConflict: 'user_id,event_id', ignoreDuplicates: true });
  if (error) throw new Error(`Failed to save event ${eventId}: ${error.message}`);
}

export async function unsaveEvent(supabase: SupabaseClient, userId: string, eventId: string): Promise<void> {
  const { error } = await supabase.from('saved_events').delete().eq('user_id', userId).eq('event_id', eventId);
  if (error) throw new Error(`Failed to unsave event ${eventId}: ${error.message}`);
}

export async function listSavedEvents(supabase: SupabaseClient, userId: string): Promise<Event[]> {
  const { data, error } = await supabase
    .from('saved_events')
    .select(`id, events!inner ( ${EVENT_COLUMNS} )`)
    .eq('user_id', userId)
    .eq('events.approval_status', 'approved')
    .order('id', { ascending: false });
  if (error) throw new Error(`Failed to load saved events: ${error.message}`);
  return (data as unknown as Array<{ events: EventRow }>).map((row) => toEvent(row.events));
}
