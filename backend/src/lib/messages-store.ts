// MOCK message storage (in memory, resets on server restart).
// The real `conversations` / `messages` tables cannot hold group chats yet
// (see "Event chat: schema changes needed" in README.md). When they can,
// replace the body of these three functions with Supabase queries and
// nothing else needs to change.

export type StoredMessage = {
  id: string;
  conversationId: string; // the event id: one group chat per event
  senderId: string;
  senderName: string;
  senderIsOrganizer: boolean;
  body: string;
  sentAt: string;
};

const globalStore = globalThis as unknown as { __chatMessages?: StoredMessage[] };
const messages = (globalStore.__chatMessages ??= []);

export async function listStoredMessages(conversationId: string): Promise<StoredMessage[]> {
  return messages.filter((m) => m.conversationId === conversationId);
}

export async function addStoredMessage(message: Omit<StoredMessage, 'id' | 'sentAt'>): Promise<StoredMessage> {
  const stored = { ...message, id: String(messages.length + 1), sentAt: new Date().toISOString() };
  messages.push(stored);
  return stored;
}

export async function lastStoredMessages(conversationIds: string[]): Promise<Map<string, StoredMessage>> {
  const last = new Map<string, StoredMessage>();
  for (const m of messages) if (conversationIds.includes(m.conversationId)) last.set(m.conversationId, m);
  return last;
}
