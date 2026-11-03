import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  addEvent,
  addUser,
  cleanup,
  db,
  emptyState,
  rejected,
  saved,
  skip,
} from './helpers.js';

describe('announcements', { skip, concurrency: 1 }, () => {
  const state = emptyState();
  let sender;
  let event;

  before(async () => {
    sender = await addUser(state, 'Host');
    event = await addEvent(state);
  });

  after(() => cleanup(state));

  test('an announcement is saved for an event', async () => {
    const announcement = saved(
      await db
        .from('event_announcements')
        .insert({
          event_id: event.id,
          sender_user_id: sender.id,
          title: 'Doors open at 2',
          body: 'Please arrive early.',
        })
        .select()
        .single(),
    );

    assert.equal(announcement.event_id, event.id);
    assert.equal(announcement.sender_user_id, sender.id);
    assert.equal(announcement.title, 'Doors open at 2');
  });

  test('an announcement without a title is rejected', async () => {
    rejected(await db.from('event_announcements').insert({ event_id: event.id }), '23502');
  });

  test('an announcement for an unknown event is rejected', async () => {
    rejected(
      await db.from('event_announcements').insert({ event_id: 0, title: 'Update' }),
      '23503',
    );
  });

  test('deleting the sender clears sender_user_id', async () => {
    const author = await addUser(state, 'Author');
    const announcement = saved(
      await db
        .from('event_announcements')
        .insert({
          event_id: event.id,
          sender_user_id: author.id,
          title: 'Room change',
        })
        .select()
        .single(),
    );

    saved(await db.auth.admin.deleteUser(author.id));

    const row = saved(
      await db
        .from('event_announcements')
        .select('sender_user_id, title')
        .eq('id', announcement.id)
        .single(),
    );
    assert.equal(row.sender_user_id, null);
    assert.equal(row.title, 'Room change');
  });
});
