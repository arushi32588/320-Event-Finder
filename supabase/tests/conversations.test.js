import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  addEvent,
  addUser,
  cleanup,
  db,
  emptyState,
  missingUserId,
  rejected,
  saved,
  skip,
} from './helpers.js';

describe('conversations and messages', { skip, concurrency: 1 }, () => {
  const state = emptyState();
  let attendee;
  let organizer;
  let profile;
  let event;

  before(async () => {
    attendee = await addUser(state, 'Ada');
    organizer = await addUser(state, 'Grace');
    profile = saved(
      await db
        .from('organizer_profiles')
        .insert({ user_id: organizer.id, organization_name: 'Campus Events' })
        .select()
        .single(),
    );
    event = await addEvent(state);
  });

  after(() => cleanup(state));

  function conversationRow(overrides = {}) {
    return {
      attendee_user_id: attendee.id,
      organizer_profile_id: profile.id,
      event_id: event.id,
      ...overrides,
    };
  }

  test('an attendee can start a conversation', async () => {
    const conversation = saved(
      await db.from('conversations').insert(conversationRow()).select().single(),
    );

    assert.equal(conversation.attendee_user_id, attendee.id);
    assert.equal(conversation.organizer_profile_id, profile.id);
    assert.equal(conversation.event_id, event.id);

    await db.from('conversations').delete().eq('id', conversation.id);
  });

  test('an unknown attendee is rejected', async () => {
    rejected(
      await db.from('conversations').insert(conversationRow({ attendee_user_id: missingUserId })),
      '23503',
    );
  });

  test('an unknown event is rejected', async () => {
    rejected(await db.from('conversations').insert(conversationRow({ event_id: 0 })), '23503');
  });

  test('messages are saved on a conversation', async () => {
    const conversation = saved(
      await db.from('conversations').insert(conversationRow()).select().single(),
    );
    saved(
      await db.from('messages').insert([
        {
          conversation_id: conversation.id,
          sender_user_id: attendee.id,
          body: 'Is this event outdoors?',
        },
        {
          conversation_id: conversation.id,
          sender_user_id: organizer.id,
          body: 'Yes, bring a jacket.',
        },
      ]),
    );

    const messages = saved(
      await db.from('messages').select('body').eq('conversation_id', conversation.id).order('id'),
    );
    assert.deepEqual(
      messages.map((message) => message.body),
      ['Is this event outdoors?', 'Yes, bring a jacket.'],
    );

    await db.from('conversations').delete().eq('id', conversation.id);
  });

  test('a message for an unknown conversation is rejected', async () => {
    rejected(await db.from('messages').insert({ conversation_id: 0, body: 'Hi' }), '23503');
  });

  test('deleting the conversation deletes its messages', async () => {
    const conversation = saved(
      await db.from('conversations').insert(conversationRow()).select().single(),
    );
    const message = saved(
      await db
        .from('messages')
        .insert({ conversation_id: conversation.id, body: 'See you there.' })
        .select()
        .single(),
    );

    saved(await db.from('conversations').delete().eq('id', conversation.id));

    const rows = saved(await db.from('messages').select('id').eq('id', message.id));
    assert.equal(rows.length, 0);
  });

  test('deleting the sender clears sender_user_id', async () => {
    const author = await addUser(state, 'Author');
    const conversation = saved(
      await db.from('conversations').insert(conversationRow()).select().single(),
    );
    const message = saved(
      await db
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          sender_user_id: author.id,
          body: 'I can help set up.',
        })
        .select()
        .single(),
    );

    saved(await db.auth.admin.deleteUser(author.id));

    const row = saved(
      await db.from('messages').select('sender_user_id, body').eq('id', message.id).single(),
    );
    assert.equal(row.sender_user_id, null);
    assert.equal(row.body, 'I can help set up.');
  });
});
