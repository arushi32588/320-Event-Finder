// Event chat: one group thread per event, plus private threads with an event's
// organizer. Each function matches one planned backend route (see
// docs/specs/2026-11-14-event-chat-and-cover-photos-design.md).
//
// MOCK: there is no messaging backend yet, so these run against seeded data in
// memory and reset on reload. To connect the backend, replace each body with the
// api(...) call in its comment. Nothing else needs to change.
import { ApiError } from './api.js';

export const MAX_MESSAGE_LENGTH = 2000;

const DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 250;
const wait = () => new Promise((resolve) => setTimeout(resolve, DELAY_MS));
const copy = (value) => structuredClone(value);

const VIEWER = { id: 'viewer', name: 'You' };
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

const events = {
  1: { id: '1', title: 'Community Outdoor Movie Night', startsAt: '2026-10-16T23:00:00Z', organizer: 'Amherst Community Group' },
  2: { id: '2', title: 'Fall Career Fair', startsAt: '2026-10-15T15:00:00Z', organizer: 'Career Services' },
  3: { id: '3', title: 'Hack Night', startsAt: '2026-10-17T22:00:00Z', organizer: 'Hack Club' },
};

function seed() {
  const dana = { id: 'u-dana', name: 'Dana Okafor', isOrganizer: true };
  const priya = { id: 'u-priya', name: 'Priya Shah', isOrganizer: false };
  const jordan = { id: 'u-jordan', name: 'Jordan Lee', isOrganizer: false };
  const careers = { id: 'u-careers', name: 'Career Services', isOrganizer: true };
  const sam = { id: 'u-sam', name: 'Sam Rivera', isOrganizer: false };
  const me = { ...VIEWER, isOrganizer: false };
  const meOrganizer = { ...VIEWER, isOrganizer: true };

  return [
    {
      id: '101',
      kind: 'group',
      event: events[1],
      title: events[1].title,
      messages: [
        [dana, 'Welcome, everyone! Gates open at 6:30 and the film starts at 7.', 190],
        [priya, 'Is anyone bringing extra blankets? Mine is tiny 😅', 120],
        [jordan, 'I have two, happy to share. I’ll be near the front left.', 117],
        [jordan, 'Look for the orange umbrella.', 116],
        [me, 'Thanks! Is there a rain date?', 45],
        [dana, 'Yes. If it rains we move to Saturday at the same time. We’ll post here by 3 PM.', 40],
      ],
    },
    {
      id: '102',
      kind: 'direct',
      event: events[2],
      title: careers.name,
      messages: [
        [me, 'Hi! Will there be companies hiring for summer software internships?', 1500],
        [careers, 'Yes, about a dozen. The full employer list goes up on our site Monday.', 1380],
      ],
    },
    {
      id: '103',
      kind: 'direct',
      event: events[3],
      title: sam.name,
      viewerOrganizes: true,
      messages: [
        [sam, 'Hey! Can I come if I don’t have a team yet?', 300],
        [meOrganizer, 'Absolutely. We do team matching at the start of the night.', 290],
        [sam, 'Awesome, see you there.', 288],
      ],
    },
  ].map(({ messages, ...conversation }) => ({
    ...conversation,
    messages: messages.map(([sender, body, ago], index) => ({
      id: `${conversation.id}-${index + 1}`,
      body,
      sentAt: minutesAgo(ago),
      sender,
    })),
  }));
}

let conversations = seed();
let nextId = 1000;

// Tests start each case from the seeded threads.
export function resetMockMessages() {
  conversations = seed();
  nextId = 1000;
}

function toMessage(message) {
  return { ...message, mine: message.sender.id === VIEWER.id };
}

// viewerOrganizes is mock bookkeeping (the server knows who organizes what).
function toConversation({ messages, viewerOrganizes, ...conversation }) {
  const last = messages.at(-1);
  return {
    ...conversation,
    lastMessage: last ? { body: last.body, sentAt: last.sentAt, senderName: last.sender.name } : null,
  };
}

function find(id) {
  const conversation = conversations.find((c) => c.id === String(id));
  if (!conversation) throw new ApiError("This conversation isn't available.", 404);
  return conversation;
}

// GET /api/me/conversations
export async function listConversations() {
  await wait();
  const lastSent = (c) => c.messages.at(-1)?.sentAt ?? '';
  return copy([...conversations].sort((a, b) => lastSent(b).localeCompare(lastSent(a))).map(toConversation));
}

// GET /api/conversations/:id
export async function getConversation(id) {
  await wait();
  const conversation = find(id);
  return copy({ conversation: toConversation(conversation), messages: conversation.messages.map(toMessage) });
}

// POST /api/conversations/:id/messages  { body }
export async function sendMessage(conversationId, body) {
  await wait();
  const conversation = find(conversationId);
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) throw new ApiError('Write a message first.', 400, { body: 'Write a message first.' });
  if (text.length > MAX_MESSAGE_LENGTH) {
    const error = `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`;
    throw new ApiError(error, 400, { body: error });
  }
  const isOrganizer = Boolean(conversation.viewerOrganizes);
  const message = {
    id: String(nextId++),
    body: text,
    sentAt: new Date().toISOString(),
    sender: { ...VIEWER, isOrganizer },
  };
  conversation.messages.push(message);
  return copy(toMessage(message));
}

// POST /api/events/:id/conversations  { kind }
// The real route only needs event.id; the mock uses the rest to name new threads.
// The real server also refuses a group thread to anyone who hasn't RSVP'd (403);
// the mock trusts the event page, which only offers it after an RSVP.
export async function openEventConversation(event, kind) {
  await wait();
  const eventId = String(event.id);
  // "Message organizer" never reopens a thread the viewer runs as the organizer.
  const existing = conversations.find((c) => c.kind === kind && c.event.id === eventId && !c.viewerOrganizes);
  if (existing) return copy(toConversation(existing));

  const conversation = {
    id: String(nextId++),
    kind,
    event: { id: eventId, title: event.title, startsAt: event.startsAt ?? null },
    title: kind === 'group' ? event.title : event.organizer || 'Organizer',
    messages: [],
  };
  conversations.push(conversation);
  return copy(toConversation(conversation));
}
