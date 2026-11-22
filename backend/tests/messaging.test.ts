import type { SupabaseClient, User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getConversationRoute } from '@/app/api/conversations/[id]/route';
import { POST as sendMessageRoute } from '@/app/api/conversations/[id]/messages/route';
import { GET as listConversationsRoute } from '@/app/api/me/conversations/route';
import { requireUser } from '@/lib/session';
import { fakeSupabase } from './helpers/fake-supabase';

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  requireUser: vi.fn(),
}));

type Result = { data: unknown; error: { message: string } | null };

const ok = (data: unknown): Result => ({ data, error: null });
const failed = (message: string): Result => ({ data: null, error: { message } });

const user = { id: 'u1', email: 'sam@umass.edu', user_metadata: {} } as unknown as User;

const approvedEvent = ok({
  id: 7,
  title: 'Hack Night',
  start_time: '2026-12-01T23:00:00Z',
  organizer_profiles: { user_id: 'org-1' },
});

const row = (id: number, body: string, senderId = 'u1', minute = id) => ({
  id,
  sender_id: senderId,
  sender_name: senderId === 'org-1' ? 'Olive' : 'Sam',
  sender_is_organizer: senderId === 'org-1',
  body,
  sent_at: `2026-11-22T10:${String(minute).padStart(2, '0')}:00Z`,
});

function signIn(tables: Record<string, Result>, rpcs: Record<string, Result> = {}) {
  const fakes = Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, fakeSupabase(r)]));
  const rpc = vi.fn((name: string) => {
    const result = Promise.resolve(rpcs[name] ?? ok([]));
    return Object.assign(result, { single: () => result });
  });
  const client = { from: vi.fn((t: string) => fakes[t].client.from(t)), rpc } as unknown as SupabaseClient;
  vi.mocked(requireUser).mockResolvedValue({ user, supabase: client, accessToken: 'token' });
  return { client, rpc, from: client.from as ReturnType<typeof vi.fn> };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const authed = { authorization: 'Bearer token' };

const fetchChat = (id = '7') =>
  getConversationRoute(new Request(`http://localhost/api/conversations/${id}`, { headers: authed }), params(id));

const send = (body: unknown, id = '7') =>
  sendMessageRoute(
    new Request(`http://localhost/api/conversations/${id}/messages`, {
      method: 'POST',
      headers: { ...authed, 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
    }),
    params(id),
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('event chat routes', () => {
  it('rejects users who are not logged in', async () => {
    vi.mocked(requireUser).mockResolvedValue(Response.json({ error: 'Please log in to continue.' }, { status: 401 }));
    expect((await fetchChat()).status).toBe(401);
    expect((await send('hi')).status).toBe(401);
  });

  it('sends a trimmed message and returns it', async () => {
    const db = signIn({ events: approvedEvent, rsvps: ok({ status: 'going' }) }, { send_event_message: ok(row(1, 'hello')) });
    const res = await send('  hello  ');
    expect(res.status).toBe(201);
    expect((await res.json()).message).toMatchObject({ id: '1', body: 'hello', mine: true, sender: { name: 'Sam' } });
    expect(db.rpc).toHaveBeenCalledWith('send_event_message', { p_event_id: '7', p_body: 'hello' });
  });

  it('fetches messages oldest first with the organizer marked', async () => {
    signIn(
      { events: approvedEvent, rsvps: ok({ status: 'going' }) },
      { event_chat_messages: ok([row(1, 'welcome', 'org-1'), row(2, 'thanks'), row(3, 'see you there')]) },
    );
    const res = await fetchChat();
    expect(res.status).toBe(200);
    const { conversation, messages } = await res.json();
    expect(messages.map((m: { body: string }) => m.body)).toEqual(['welcome', 'thanks', 'see you there']);
    expect(messages[0]).toMatchObject({ mine: false, sender: { isOrganizer: true } });
    expect(messages[1]).toMatchObject({ mine: true, sender: { isOrganizer: false } });
    expect(conversation.lastMessage).toMatchObject({ body: 'see you there' });
  });

  it('returns an empty chat when nobody has posted yet', async () => {
    signIn({ events: approvedEvent, rsvps: ok({ status: 'going' }) });
    const { conversation, messages } = await (await fetchChat()).json();
    expect(messages).toEqual([]);
    expect(conversation.lastMessage).toBeNull();
  });

  it('returns an empty list for a user with no chats', async () => {
    signIn({ rsvps: ok([]), events: ok([]) });
    const res = await listConversationsRoute(new Request('http://localhost/api/me/conversations', { headers: authed }));
    expect(await res.json()).toEqual({ conversations: [] });
  });

  it('returns 404 for invalid or unknown event ids without loading messages', async () => {
    const db = signIn({ events: ok(null), rsvps: ok({ status: 'going' }) });
    expect((await fetchChat('abc')).status).toBe(404);
    expect((await fetchChat('0')).status).toBe(404);
    expect((await fetchChat('999')).status).toBe(404);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('hides the chat from users who are not members', async () => {
    const db = signIn({ events: approvedEvent, rsvps: ok(null) });
    expect((await fetchChat()).status).toBe(404);
    expect((await send('let me in')).status).toBe(404);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('rejects empty and too long messages with a field error', async () => {
    signIn({ events: approvedEvent, rsvps: ok({ status: 'going' }) });
    const empty = await send('   ');
    expect(empty.status).toBe(400);
    expect((await empty.json()).fields).toHaveProperty('body');
    expect((await send('x'.repeat(2001))).status).toBe(400);
  });

  it('returns a friendly 500 when saving the message fails', async () => {
    signIn({ events: approvedEvent, rsvps: ok({ status: 'going' }) }, { send_event_message: failed('db down') });
    const res = await send('hello');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Could not send your message. Please try again.' });
  });
});
