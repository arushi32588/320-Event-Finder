import { afterEach, describe, expect, it } from 'vitest';
import { fail, mockApi, resetApi } from '../test/api.jsx';
import { getConversation, listConversations, openEventConversation, sendMessage } from './messages.js';

const conversation = {
  id: '1',
  kind: 'group',
  event: { id: '1', title: 'Movie Night', startsAt: '2026-10-16T23:00:00Z' },
  title: 'Movie Night',
  lastMessage: null,
};
const message = { id: '55', body: 'Hi!', sentAt: '2026-10-16T20:00:00Z', sender: { id: 'user-1', name: 'Maya Fox', isOrganizer: false }, mine: true };

afterEach(resetApi);

describe('messages (backend)', () => {
  it('lists the viewer’s conversations', async () => {
    const { callsTo } = mockApi({ 'GET /api/me/conversations': { conversations: [conversation] } });
    await expect(listConversations()).resolves.toEqual([conversation]);
    expect(callsTo('GET', '/api/me/conversations')).toHaveLength(1);
  });

  it('loads one conversation with its messages', async () => {
    mockApi({ 'GET /api/conversations/1': { conversation, messages: [message] } });
    await expect(getConversation('1')).resolves.toEqual({ conversation, messages: [message] });
  });

  it('passes a 404 through so the thread can say it isn’t available', async () => {
    mockApi({ 'GET /api/conversations/9': fail(404, "This conversation isn't available.") });
    await expect(getConversation('9')).rejects.toMatchObject({ status: 404, message: "This conversation isn't available." });
  });

  it('escapes ids in the path', async () => {
    const { calls } = mockApi({ 'GET /api/conversations/a%2Fb': fail(404, 'nope') });
    await expect(getConversation('a/b')).rejects.toMatchObject({ status: 404 });
    expect(calls[0].path).toBe('/api/conversations/a%2Fb');
  });

  it('sends a message and returns the saved copy', async () => {
    const { callsTo } = mockApi({ 'POST /api/conversations/1/messages': { __status: 201, message } });
    await expect(sendMessage('1', 'Hi!')).resolves.toEqual(message);
    expect(callsTo('POST', '/api/conversations/1/messages')[0].body).toEqual({ body: 'Hi!' });
  });

  it('passes the field error through when the server refuses a message', async () => {
    mockApi({ 'POST /api/conversations/1/messages': fail(400, 'Message cannot be empty.', { body: 'Message cannot be empty.' }) });
    await expect(sendMessage('1', ' ')).rejects.toMatchObject({ status: 400, fields: { body: 'Message cannot be empty.' } });
  });

  it('opens an event’s group chat', async () => {
    const { callsTo } = mockApi({ 'POST /api/events/1/conversations': { conversation } });
    await expect(openEventConversation('1')).resolves.toEqual(conversation);
    expect(callsTo('POST', '/api/events/1/conversations')[0].body).toEqual({ kind: 'group' });
  });

  it('passes a 403 through for someone not going', async () => {
    mockApi({ 'POST /api/events/1/conversations': fail(403, 'RSVP to join the group chat.') });
    await expect(openEventConversation('1')).rejects.toMatchObject({ status: 403, message: 'RSVP to join the group chat.' });
  });
});
