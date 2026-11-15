import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import Messages from './Messages.jsx';
import * as messages from '../lib/messages.js';
import { ApiError } from '../lib/api.js';
import { POLL_MS } from '../components/ChatThread.jsx';
import { loggedInRoutes, mockApi, renderPage, resetApi } from '../test/api.jsx';

function show(route = '/messages') {
  mockApi(loggedInRoutes());
  return renderPage(
    <Routes>
      <Route path="/messages" element={<Messages />} />
      <Route path="/messages/:conversationId" element={<Messages />} />
      <Route path="/events/:id" element={<h1>Event page</h1>} />
    </Routes>,
    { route },
  );
}

beforeEach(messages.resetMockMessages);
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetApi();
});

describe('Messages page', () => {
  it('lists conversations with group and direct stickers', async () => {
    show();
    const list = await screen.findByRole('navigation', { name: 'Conversations' });
    const rows = await within(list).findAllByRole('link');
    expect(rows.map((row) => row.getAttribute('href'))).toEqual(['/messages/101', '/messages/103', '/messages/102']);
    expect(within(rows[0]).getByText('Group')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Direct')).toBeInTheDocument();
    expect(within(rows[1]).getByText(/Hack Night/)).toBeInTheDocument();
    expect(screen.getByText('Pick a conversation to start chatting.')).toBeInTheDocument();
  });

  it('shows a friendly message when there are no conversations', async () => {
    vi.spyOn(messages, 'listConversations').mockResolvedValue([]);
    show();
    expect(await screen.findByText(/No conversations yet/)).toBeInTheDocument();
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

  it('sends a message, showing it right away and updating the list preview', async () => {
    const user = userEvent.setup();
    show('/messages/102');
    const box = await screen.findByLabelText('Message');
    await user.type(box, 'Is there parking?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const log = screen.getByRole('log', { name: 'Messages' });
    expect(await within(log).findByText('Is there parking?')).toBeInTheDocument();
    expect(box).toHaveValue('');
    const list = screen.getByRole('navigation', { name: 'Conversations' });
    await waitFor(() => expect(within(list).getAllByRole('link')[0]).toHaveTextContent('You: Is there parking?'));
  });

  it('sends with Enter and adds a line with Shift+Enter', async () => {
    const send = vi.spyOn(messages, 'sendMessage');
    const user = userEvent.setup();
    show('/messages/102');
    const box = await screen.findByLabelText('Message');
    await user.type(box, 'Line one{Shift>}{Enter}{/Shift}Line two');
    expect(box).toHaveValue('Line one\nLine two');
    await user.type(box, '{Enter}');
    expect(send).toHaveBeenCalledWith('102', 'Line one\nLine two');
  });

  it('keeps Send disabled until there is something to send', async () => {
    const user = userEvent.setup();
    show('/messages/102');
    const send = await screen.findByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText('Message'), '   ');
    expect(send).toBeDisabled();
  });

  it('puts the text back and shows the error when sending fails', async () => {
    vi.spyOn(messages, 'sendMessage').mockRejectedValue(new ApiError("Can't reach the server. Check your connection and try again.", 0));
    const user = userEvent.setup();
    show('/messages/102');
    const box = await screen.findByLabelText('Message');
    await user.type(box, 'Hello?{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server");
    expect(box).toHaveValue('Hello?');
    expect(within(screen.getByRole('log')).queryByText('Hello?')).not.toBeInTheDocument();
  });

  it('says when a conversation is not available', async () => {
    show('/messages/999');
    expect(await screen.findByText("This conversation isn't available.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← All messages' })).toHaveAttribute('href', '/messages');
  });

  it('checks for new messages every few seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const get = vi.spyOn(messages, 'getConversation');
    show('/messages/101');
    await screen.findByRole('log', { name: 'Messages' });
    expect(get).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(get).toHaveBeenCalledTimes(2);
  });
});
