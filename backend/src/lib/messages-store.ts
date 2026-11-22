import type { SupabaseClient } from '@supabase/supabase-js';

export type StoredMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderIsOrganizer: boolean;
  body: string;
  sentAt: string;
};

type MessageRow = {
  id: number | string;
  sender_id: string | null;
  sender_name: string;
  sender_is_organizer: boolean;
  body: string;
  sent_at: string;
};

type LastMessageRow = { event_id: number | string; sender_name: string; body: string; sent_at: string };

function toStoredMessage(conversationId: string, row: MessageRow): StoredMessage {
  return {
    id: String(row.id),
    conversationId,
    senderId: row.sender_id ?? '',
    senderName: row.sender_name,
    senderIsOrganizer: row.sender_is_organizer,
    body: row.body,
    sentAt: row.sent_at,
  };
}

export async function listStoredMessages(supabase: SupabaseClient, conversationId: string): Promise<StoredMessage[]> {
  const { data, error } = await supabase.rpc('event_chat_messages', { p_event_id: conversationId });
  if (error) throw new Error(`Failed to load messages for event ${conversationId}: ${error.message}`);
  return (data as MessageRow[]).map((row) => toStoredMessage(conversationId, row));
}

export async function addStoredMessage(
  supabase: SupabaseClient,
  conversationId: string,
  body: string,
): Promise<StoredMessage> {
  const { data, error } = await supabase
    .rpc('send_event_message', { p_event_id: conversationId, p_body: body })
    .single();
  if (error) throw new Error(`Failed to send message to event ${conversationId}: ${error.message}`);
  return toStoredMessage(conversationId, data as MessageRow);
}

export async function lastStoredMessages(
  supabase: SupabaseClient,
  conversationIds: string[],
): Promise<Map<string, StoredMessage>> {
  const last = new Map<string, StoredMessage>();
  if (conversationIds.length === 0) return last;

  const { data, error } = await supabase.rpc('last_event_chat_messages', { p_event_ids: conversationIds });
  if (error) throw new Error(`Failed to load latest messages: ${error.message}`);
  for (const row of data as LastMessageRow[]) {
    const id = String(row.event_id);
    last.set(id, {
      id: '',
      conversationId: id,
      senderId: '',
      senderName: row.sender_name,
      senderIsOrganizer: false,
      body: row.body,
      sentAt: row.sent_at,
    });
  }
  return last;
}
