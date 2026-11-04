import type { SupabaseClient } from '@supabase/supabase-js';
import { EVENT_COLUMNS, type EventRow } from '@/lib/event-columns';
import { toEvent, type Event } from '@/lib/events';

export async function isGoing(supabase: SupabaseClient, userId: string, eventId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('rsvps')
    .select('status')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw new Error(`Failed to check RSVP for event ${eventId}: ${error.message}`);
  return (data as { status: string } | null)?.status === 'going';
}

export async function rsvpGoing(supabase: SupabaseClient, userId: string, eventId: string): Promise<void> {
  const { error } = await supabase
    .from('rsvps')
    .upsert({ user_id: userId, event_id: eventId, status: 'going' }, { onConflict: 'user_id,event_id' });
  if (error) throw new Error(`Failed to RSVP to event ${eventId}: ${error.message}`);
}

export async function cancelRsvp(supabase: SupabaseClient, userId: string, eventId: string): Promise<void> {
  const { error } = await supabase.from('rsvps').delete().eq('user_id', userId).eq('event_id', eventId);
  if (error) throw new Error(`Failed to cancel RSVP for event ${eventId}: ${error.message}`);
}

export async function listRsvpedEvents(supabase: SupabaseClient, userId: string): Promise<Event[]> {
  const { data, error } = await supabase
    .from('rsvps')
    .select(`id, events!inner ( ${EVENT_COLUMNS} )`)
    .eq('user_id', userId)
    .eq('status', 'going')
    .eq('events.approval_status', 'approved')
    .order('id', { ascending: false });
  if (error) throw new Error(`Failed to load RSVPs: ${error.message}`);
  return (data as unknown as Array<{ events: EventRow }>).map((row) => toEvent(row.events));
}
