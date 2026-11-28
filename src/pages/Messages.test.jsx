import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import Messages from './Messages.jsx';
import { POLL_MS } from '../components/ChatThread.jsx';
import { fail, loggedInRoutes, mockApi, renderPage, resetApi } from '../test/api.jsx';

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const dana = { id: 'u-dana', name: 'Dana Okafor', isOrganizer: true };
const priya = { id: 'u-priya', name: 'Priya Shah', isOrganizer: false };
const me = { id: 'user-1', name: 'Maya Fox', isOrganizer: false };

// A small stand-in for the chat backend: group chats keyed by event id, with
// messages that persist across requests for the length of one test.
function chatBackend({ empty = false } = {}) {
  const threads = {
    1: {
      conversation: { id: '1', kind: 'group', event: { id: '1', title: 'Community Outdoor Movie Night', startsAt: '2026-10-16T23:00:00Z' }, title: 'Community Outdoor Movie Night' },
      messages: [
        { id: '11', body: 'Welcome, everyone! Gates open at 6:30.', sentAt: minutesAgo(90), sender: dana },
        { id: '12', body: 'Is anyone bringing extra blankets?', sentAt: minutesAgo(30), sender: priya },
      ],
    },
    3: {
      conversation: { id: '3', kind: 'group', event: { id: '3', title: 'Hack Night', startsAt: '2026-10-17T22:00:00Z' }, title: 'Hack Night' },
      messages: [{ id: '31', body: 'Bring a laptop!', sentAt: minutesAgo(300), sender: dana }],
    },
  };
  let nextId = 100;
  const toMessage = (m) => ({ ...m, mine: m.sender.id === me.id });
  const summary = ({ conversation, messages }) => {
    const last = messages.at(-1);
    return { ...conversation, lastMessage: last ? { body: last.body, sentAt: last.sentAt, senderName: last.sender.name } : null };
  };

  const routes = {
    'GET /api/me/conversations': () => ({
      conversations: empty
        ? []
        : Object.values(threads).map(summary).sort((a, b) => (b.lastMessage?.sentAt ?? '').localeCompare(a.lastMessage?.sentAt ?? '')),
    }),
    'GET /api/conversations/999': fail(404, "This conversation isn't available."),
  };
  for (const [id, thread] of Object.entries(threads)) {
    routes[`GET /api/conversations/${id}`] = () => ({ conversation: summary(thread), messages: thread.messages.map(toMessage) });
    routes[`POST /api/conversations/${id}/messages`] = ({ body }) => {
      const message = { id: String(nextId++), body: body.body.trim(), sentAt: new Date().toISOString(), sender: me };
      thread.messages.push(message);
      return { __status: 201, message: toMessage(message) };
    };
  }
  return { routes, threads };
}

function show(route = '/messages', routes = chatBackend().routes) {
  const api = mockApi({ ...loggedInRoutes(), ...routes });
  renderPage(
    <Routes>
      <Route path="/messages" element={<Messages />} />
      <Route path="/messages/:conversationId" element={<Messages />} />
      <Route path="/events/:id" element={<h1>Event page</h1>} />
    </Routes>,
    { route },
  );
  return api;
}

afterEach(() => {
  vi.useRealTimers();
  resetApi();
});

describe('Messages page', () => {
  it('lists saved group chats, most recent activity first', async () => {
    show();
    const list = await screen.findByRole('navigation', { name: 'Conversations' });
    const rows = await within(list).findAllByRole('link');
    expect(rows.map((row) => row.getAttribute('href'))).toEqual(['/messages/1', '/messages/3']);
    expect(within(rows[0]).getByText('Group')).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('Priya Shah: Is anyone bringing extra blankets?');
    expect(screen.getByText('Pick a conversation to start chatting.')).toBeInTheDocument();
  });

  it('shows a friendly message when there are no conversations', async () => {
    show('/messages', chatBackend({ empty: true }).routes);
    expect(await screen.findByText('No conversations yet. RSVP to an event to join its group chat.')).toBeInTheDocument();
  });

  it('opens a thread with organizer messages labelled', async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('link', { name: /Community Outdoor Movie Night/ }));
    const log = await screen.findByRole('log', { name: 'Messages' });
    expect(within(log).getByText(/Gates open at 6:30/)).toBeInTheDocument();
    expect(within(log).getAllByText('Organizer').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'View event' })).toHaveAttribute('href', '/events/1');
    expect(screen.getByRole('link', { name: /Community Outdoor Movie Night/ })).toHaveClass('active');
  });

  it('saves a sent message to the backend and updates the list preview', async () => {
    const backend = chatBackend();
    const user = userEvent.setup();
    const { callsTo } = show('/messages/3', backend.routes);
    const box = await screen.findByLabelText('Message');
    await user.type(box, 'Is there parking?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const log = screen.getByRole('log', { name: 'Messages' });
    expect(await within(log).findByText('Is there parking?')).toBeInTheDocument();
    expect(box).toHaveValue('');
    expect(callsTo('POST', '/api/conversations/3/messages')[0].body).toEqual({ body: 'Is there parking?' });
    expect(backend.threads[3].messages.at(-1).body).toBe('Is there parking?');
    const list = screen.getByRole('navigation', { name: 'Conversations' });
    await waitFor(() => expect(within(list).getAllByRole('link')[0]).toHaveTextContent('Maya Fox: Is there parking?'));
  });

  it('sends with Enter and adds a line with Shift+Enter', async () => {
    const user = userEvent.setup();
    const { callsTo } = show('/messages/3');
    const box = await screen.findByLabelText('Message');
    await user.type(box, 'Line one{Shift>}{Enter}{/Shift}Line two');
    expect(box).toHaveValue('Line one\nLine two');
    await user.type(box, '{Enter}');
    await waitFor(() => expect(callsTo('POST', '/api/conversations/3/messages')).toHaveLength(1));
    expect(callsTo('POST', '/api/conversations/3/messages')[0].body).toEqual({ body: 'Line one\nLine two' });
  });

  it('keeps Send disabled until there is something to send', async () => {
    const user = userEvent.setup();
    show('/messages/3');
    const send = await screen.findByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText('Message'), '   ');
    expect(send).toBeDisabled();
  });

  it('puts the text back and shows the server’s error when sending fails', async () => {
    const { routes } = chatBackend();
    routes['POST /api/conversations/3/messages'] = fail(400, 'Message must be 2000 characters or fewer.', { body: 'Message must be 2000 characters or fewer.' });
    const user = userEvent.setup();
    show('/messages/3', routes);
    const box = await screen.findByLabelText('Message');
    await user.type(box, 'Hello?{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Message must be 2000 characters or fewer.');
    expect(box).toHaveValue('Hello?');
    expect(within(screen.getByRole('log')).queryByText('Hello?')).not.toBeInTheDocument();
  });

  it('says when a conversation is not available', async () => {
    show('/messages/999');
    expect(await screen.findByText("This conversation isn't available.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← All messages' })).toHaveAttribute('href', '/messages');
  });

  it('picks up messages other people send while the thread is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const backend = chatBackend();
    const { callsTo } = show('/messages/1', backend.routes);
    const log = await screen.findByRole('log', { name: 'Messages' });
    expect(callsTo('GET', '/api/conversations/1')).toHaveLength(1);
    backend.threads[1].messages.push({ id: '13', body: 'I have two, happy to share.', sentAt: new Date().toISOString(), sender: priya });
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(callsTo('GET', '/api/conversations/1')).toHaveLength(2);
    expect(await within(log).findByText('I have two, happy to share.')).toBeInTheDocument();
  });
});

describe('Messages page: errors and empty states', () => {
  it('shows the error when the conversation list fails to load', async () => {
    show('/messages', { ...chatBackend().routes, 'GET /api/me/conversations': fail(500, 'Could not load your conversations. Please try again.') });
    const list = await screen.findByRole('navigation', { name: 'Conversations' });
    expect(await within(list).findByRole('alert')).toHaveTextContent('Could not load your conversations.');
  });

  it('shows the server error (not "not available") when a thread fails to load', async () => {
    show('/messages/1', { ...chatBackend().routes, 'GET /api/conversations/1': fail(500, 'Could not load this conversation. Please try again.') });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this conversation. Please try again.');
    expect(screen.queryByText("This conversation isn't available.")).not.toBeInTheDocument();
  });

  it('invites the first message in an empty thread', async () => {
    const backend = chatBackend();
    backend.threads[3].messages = [];
    show('/messages/3', backend.routes);
    const log = await screen.findByRole('log', { name: 'Messages' });
    expect(within(log).getByText('No messages yet. Say hello!')).toBeInTheDocument();
  });
});
