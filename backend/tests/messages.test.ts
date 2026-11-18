import type { SupabaseClient, User } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { ChatError, getConversation, listConversations, openEventConversation, sendMessage } from '@/lib/messages';
import { fakeSupabase } from './helpers/fake-supabase';

type Result = { data: unknown; error: { message: string } | null };
const ok = (data: unknown): Result => ({ data, error: null });

function client(tables: Record<string, Result>) {
  const fakes = Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, fakeSupabase(r)]));
  return { from: (t: string) => fakes[t].client.from(t) } as unknown as SupabaseClient;
}

const user = (id: string) => ({ id, email: `${id}@umass.edu`, user_metadata: {} }) as unknown as User;
const event = (organizerUserId: string, id = 7) =>
  ok({ id, title: 'Hack Night', start_time: '2027-01-01T00:00:00Z', organizer_profiles: { user_id: organizerUserId } });
const going = ok({ status: 'going' });
const users = ok({ name: 'Sam', email: 'sam@umass.edu', role: 'attendee', date_of_birth: null });

const rejects = (promise: Promise<unknown>, status: number) =>
  promise.then(
    () => { throw new Error('should have thrown'); },
    (e) => { expect(e).toBeInstanceOf(ChatError); expect((e as ChatError).status).toBe(status); return e as ChatError; },
  );

describe('group chat messages (mock store)', () => {
  it('lets an RSVPed attendee send and read messages, oldest first', async () => {
    const db = client({ events: event('org-1', 11), rsvps: going, users });
    const sent = await sendMessage(db, user('u1'), '11', '  hello  ');
    expect(sent).toMatchObject({ body: 'hello', mine: true, sender: { id: 'u1', name: 'Sam', isOrganizer: false } });
    await sendMessage(db, user('u1'), '11', 'second');

    const { conversation, messages } = await getConversation(db, user('u1'), '11');
    expect(messages.map((m) => m.body)).toEqual(['hello', 'second']);
    expect(conversation).toMatchObject({ kind: 'group', title: 'Hack Night', lastMessage: { body: 'second' } });
  });

  it('marks organizer messages and sets mine per viewer', async () => {
    const asOrganizer = client({ events: event('org-1', 12), rsvps: ok(null), users });
    await sendMessage(asOrganizer, user('org-1'), '12', 'welcome');
    const viewer = client({ events: event('org-1', 12), rsvps: going, users });
    const { messages } = await getConversation(viewer, user('u2'), '12');
    expect(messages[0]).toMatchObject({ mine: false, sender: { isOrganizer: true } });
  });

  it('rejects empty and too-long bodies with a body field error', async () => {
    const db = client({ events: event('org-1'), rsvps: going, users });
    expect((await rejects(sendMessage(db, user('u1'), '7', '   '), 400)).fields).toHaveProperty('body');
    await rejects(sendMessage(db, user('u1'), '7', 'x'.repeat(2001)), 400);
    await rejects(sendMessage(db, user('u1'), '7', 42), 400);
  });

  it('returns 404 for non-members, unknown or invalid conversations', async () => {
    await rejects(getConversation(client({ events: event('org-1'), rsvps: ok(null) }), user('u1'), '7'), 404);
    await rejects(getConversation(client({ events: ok(null), rsvps: going }), user('u1'), '7'), 404);
    await rejects(getConversation(client({ events: event('org-1'), rsvps: going }), user('u1'), 'abc'), 404);
    await rejects(sendMessage(client({ events: event('org-1'), rsvps: ok(null) }), user('u1'), '7', 'hi'), 404);
  });

  it('opens a group chat for members only, and only kind "group"', async () => {
    const db = client({ events: event('org-1'), rsvps: going });
    expect(await openEventConversation(db, user('u1'), '7', 'group')).toMatchObject({ id: '7', kind: 'group' });
    await rejects(openEventConversation(client({ events: event('org-1'), rsvps: ok(null) }), user('u1'), '7', 'group'), 403);
    await rejects(openEventConversation(db, user('u1'), '7', 'direct'), 400);
    await rejects(openEventConversation(client({ events: ok(null), rsvps: going }), user('u1'), '7', 'group'), 404);
  });

  it('lists RSVPed and organized events without duplicates', async () => {
    const row = { id: 21, title: 'A', start_time: null, organizer_profiles: null };
    const db = client({ rsvps: ok([{ events: row }]), events: ok([row, { ...row, id: 22, title: 'B' }]) });
    const list = await listConversations(db, user('u1'));
    expect(list.map((c) => c.id).sort()).toEqual(['21', '22']);
  });
});
