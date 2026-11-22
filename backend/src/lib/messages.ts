import type { SupabaseClient, User } from '@supabase/supabase-js';
import { isGoing } from '@/lib/rsvps';
import { addStoredMessage, lastStoredMessages, listStoredMessages, type StoredMessage } from '@/lib/messages-store';

export const MAX_MESSAGE_LENGTH = 2000;

// Group chats only: one per event, so the conversation id is the event id.
export type Conversation = {
  id: string;
  kind: 'group';
  event: { id: string; title: string; startsAt: string | null };
  title: string;
  lastMessage: { body: string; sentAt: string; senderName: string } | null;
};

export type Message = {
  id: string;
  body: string;
  sentAt: string;
  sender: { id: string; name: string; isOrganizer: boolean };
  mine: boolean;
};

export class ChatError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

type EventRow = {
  id: number | string;
  title: string;
  start_time: string | null;
  organizer_profiles: { user_id: string | null } | Array<{ user_id: string | null }> | null;
};

type ChatEvent = { conversation: Omit<Conversation, 'lastMessage'>; organizerUserId: string | null };

const EVENT_SELECT = 'id, title, start_time, organizer_profiles ( user_id )';

function toChatEvent(row: EventRow): ChatEvent {
  const profile = Array.isArray(row.organizer_profiles) ? row.organizer_profiles[0] : row.organizer_profiles;
  const id = String(row.id);
  return {
    organizerUserId: profile?.user_id ?? null,
    conversation: {
      id,
      kind: 'group',
      event: { id, title: row.title, startsAt: row.start_time },
      title: row.title,
    },
  };
}

async function loadApprovedEvent(supabase: SupabaseClient, eventId: string): Promise<ChatEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('id', eventId)
    .eq('approval_status', 'approved')
    .maybeSingle();
  if (error) throw new Error(`Failed to load event ${eventId}: ${error.message}`);
  return data ? toChatEvent(data as unknown as EventRow) : null;
}

// Organizer of the event or someone who RSVPed "going" may use its group chat.
async function canUseChat(supabase: SupabaseClient, user: User, event: ChatEvent): Promise<boolean> {
  if (event.organizerUserId === user.id) return true;
  return isGoing(supabase, user.id, event.conversation.id);
}

// Loads the chat, or throws 404 (missing, or not a member: same answer on purpose).
async function memberChat(supabase: SupabaseClient, user: User, conversationId: string): Promise<ChatEvent> {
  const notFound = new ChatError(404, "This conversation isn't available.");
  if (!/^[1-9]\d*$/.test(conversationId)) throw notFound;
  const event = await loadApprovedEvent(supabase, conversationId);
  if (!event || !(await canUseChat(supabase, user, event))) throw notFound;
  return event;
}

const toMessage = (m: StoredMessage, userId: string): Message => ({
  id: m.id,
  body: m.body,
  sentAt: m.sentAt,
  sender: { id: m.senderId, name: m.senderName, isOrganizer: m.senderIsOrganizer },
  mine: m.senderId === userId,
});

const toLastMessage = (m: StoredMessage | undefined): Conversation['lastMessage'] =>
  m ? { body: m.body, sentAt: m.sentAt, senderName: m.senderName } : null;

export async function listConversations(supabase: SupabaseClient, user: User): Promise<Conversation[]> {
  const [going, organized] = await Promise.all([
    supabase.from('rsvps').select(`events!inner ( ${EVENT_SELECT} )`).eq('user_id', user.id).eq('status', 'going'),
    supabase
      .from('events')
      .select('id, title, start_time, organizer_profiles!inner ( user_id )')
      .eq('organizer_profiles.user_id', user.id)
      .eq('approval_status', 'approved'),
  ]);
  if (going.error) throw new Error(`Failed to load RSVPs: ${going.error.message}`);
  if (organized.error) throw new Error(`Failed to load organized events: ${organized.error.message}`);

  const rows = [
    ...(going.data as unknown as Array<{ events: EventRow }>).map((r) => r.events),
    ...(organized.data as unknown as EventRow[]),
  ];
  const byId = new Map(rows.map((row) => [String(row.id), toChatEvent(row).conversation]));
  const last = await lastStoredMessages(supabase, [...byId.keys()]);

  return [...byId.values()]
    .map((c) => ({ ...c, lastMessage: toLastMessage(last.get(c.id)) }))
    .sort((a, b) => (b.lastMessage?.sentAt ?? '').localeCompare(a.lastMessage?.sentAt ?? ''));
}

export async function getConversation(
  supabase: SupabaseClient,
  user: User,
  conversationId: string,
): Promise<{ conversation: Conversation; messages: Message[] }> {
  const event = await memberChat(supabase, user, conversationId);
  const stored = await listStoredMessages(supabase, conversationId);
  return {
    conversation: { ...event.conversation, lastMessage: toLastMessage(stored.at(-1)) },
    messages: stored.map((m) => toMessage(m, user.id)), // oldest first
  };
}

export async function sendMessage(
  supabase: SupabaseClient,
  user: User,
  conversationId: string,
  rawBody: unknown,
): Promise<Message> {
  const body = typeof rawBody === 'string' ? rawBody.trim() : '';
  if (body.length < 1 || body.length > MAX_MESSAGE_LENGTH) {
    const reason = body.length < 1 ? 'Message cannot be empty.' : `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`;
    throw new ChatError(400, reason, { body: reason });
  }
  await memberChat(supabase, user, conversationId);
  const stored = await addStoredMessage(supabase, conversationId, body);
  return toMessage(stored, user.id);
}

// Find or create: with one group chat per event, "create" is just the access check.
export async function openEventConversation(
  supabase: SupabaseClient,
  user: User,
  eventId: string,
  kind: unknown,
): Promise<Conversation> {
  if (kind !== 'group') throw new ChatError(400, 'Only group chats are supported.', { kind: 'Must be "group".' });
  const event = await loadApprovedEvent(supabase, eventId);
  if (!event) throw new ChatError(404, 'Event not found');
  if (!(await canUseChat(supabase, user, event))) throw new ChatError(403, 'RSVP to join the group chat.');
  const last = await lastStoredMessages(supabase, [eventId]);
  return { ...event.conversation, lastMessage: toLastMessage(last.get(eventId)) };
}

export function chatErrorResponse(error: unknown, fallback: string): Response {
  if (error instanceof ChatError) {
    return Response.json(error.fields ? { error: error.message, fields: error.fields } : { error: error.message }, {
      status: error.status,
    });
  }
  console.error(error);
  return Response.json({ error: fallback }, { status: 500 });
}
