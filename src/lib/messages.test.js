import { beforeEach, describe, expect, it } from 'vitest';
import {
  getConversation,
  listConversations,
  MAX_MESSAGE_LENGTH,
  openEventConversation,
  resetMockMessages,
  sendMessage,
} from './messages.js';

beforeEach(resetMockMessages);

describe('messages (mock)', () => {
  it('lists conversations with the most recent activity first', async () => {
    const list = await listConversations();
    expect(list.map((c) => c.id)).toEqual(['101', '103', '102']);
    expect(list[0]).toMatchObject({ kind: 'group', title: 'Community Outdoor Movie Night', event: { id: '1' } });
    expect(list[0].lastMessage.senderName).toBe('Dana Okafor');
    expect(list[0]).not.toHaveProperty('messages');
  });

  it('marks the viewer’s own messages and organizer messages', async () => {
    const { messages } = await getConversation('101');
    expect(messages[0]).toMatchObject({ mine: false, sender: { name: 'Dana Okafor', isOrganizer: true } });
    expect(messages.find((m) => m.mine).body).toBe('Thanks! Is there a rain date?');
  });

  it('rejects an unknown conversation with a 404', async () => {
    await expect(getConversation('nope')).rejects.toMatchObject({ status: 404, message: "This conversation isn't available." });
  });

  it('sends a trimmed message and moves the thread to the top', async () => {
    const message = await sendMessage('102', '  See you there!  ');
    expect(message).toMatchObject({ body: 'See you there!', mine: true });
    const list = await listConversations();
    expect(list[0].id).toBe('102');
    expect(list[0].lastMessage.body).toBe('See you there!');
  });

  it('keeps the viewer’s organizer badge in threads they organize', async () => {
    const message = await sendMessage('103', 'Doors at 6!');
    expect(message.sender.isOrganizer).toBe(true);
  });

  it.each([
    ['blank', '   ', 'Write a message first.'],
    ['too long', 'x'.repeat(MAX_MESSAGE_LENGTH + 1), `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`],
  ])('refuses a %s message with a field error', async (_, body, error) => {
    await expect(sendMessage('101', body)).rejects.toMatchObject({ status: 400, fields: { body: error } });
  });

  it('finds an existing event conversation instead of making a second one', async () => {
    const group = await openEventConversation({ id: '1', title: 'Community Outdoor Movie Night' }, 'group');
    expect(group.id).toBe('101');
  });

  it('creates a new direct thread named after the organizer', async () => {
    const event = { id: '42', title: 'Pottery Night', startsAt: '2099-01-01T00:00:00Z', organizer: 'Clay Studio' };
    const first = await openEventConversation(event, 'direct');
    expect(first).toMatchObject({ kind: 'direct', title: 'Clay Studio', event: { id: '42', title: 'Pottery Night' }, lastMessage: null });
    const again = await openEventConversation(event, 'direct');
    expect(again.id).toBe(first.id);
  });
});
