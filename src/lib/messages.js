// Event group chat, saved by the backend (see backend/README.md "Event chat"
// and docs/specs/2026-11-27-persistent-chat-and-registration-link-design.md).
// One group chat per event; its conversation id is the event id. Members are the
// event's organizer and anyone who RSVPed "going". Failures arrive as ApiError
// with a status and a message that's safe to show.
import { api } from './api.js';

export const MAX_MESSAGE_LENGTH = 2000;

const id = (value) => encodeURIComponent(String(value));

// -> Conversation[], newest activity first
export async function listConversations() {
  const { conversations } = await api('/api/me/conversations');
  return conversations;
}

// -> { conversation, messages } (oldest first); 404 if missing or not a member
export async function getConversation(conversationId) {
  return api(`/api/conversations/${id(conversationId)}`);
}

// -> Message; 400 with fields.body if empty or too long
export async function sendMessage(conversationId, body) {
  const { message } = await api(`/api/conversations/${id(conversationId)}/messages`, {
    method: 'POST',
    body: { body },
  });
  return message;
}

// Finds the event's group chat. -> Conversation; 403 if the viewer isn't going.
export async function openEventConversation(eventId) {
  const { conversation } = await api(`/api/events/${id(eventId)}/conversations`, {
    method: 'POST',
    body: { kind: 'group' },
  });
  return conversation;
}
