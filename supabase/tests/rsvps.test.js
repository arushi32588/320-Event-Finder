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

describe('rsvps', { skip, concurrency: 1 }, () => {
  const state = emptyState();
  let user;
  let event;

  before(async () => {
    user = await addUser(state, 'Ada');
    event = await addEvent(state);
  });

  after(() => cleanup(state));

  test('a new RSVP defaults to going', async () => {
    const rsvp = saved(
      await db
        .from('rsvps')
        .insert({ user_id: user.id, event_id: event.id })
        .select()
        .single(),
    );

    assert.equal(rsvp.status, 'going');
    await db.from('rsvps').delete().eq('id', rsvp.id);
  });

  test('a user cannot RSVP to the same event twice', async () => {
    const row = { user_id: user.id, event_id: event.id, status: 'interested' };
    saved(await db.from('rsvps').insert(row).select().single());

    rejected(await db.from('rsvps').insert(row), '23505');
    await db.from('rsvps').delete().eq('user_id', user.id).eq('event_id', event.id);
  });

  test('changing an RSVP updates the same row', async () => {
    const inserted = saved(
      await db
        .from('rsvps')
        .insert({ user_id: user.id, event_id: event.id, status: 'interested' })
        .select()
        .single(),
    );

    saved(await db.from('rsvps').update({ status: 'going' }).eq('id', inserted.id));

    const rows = saved(
      await db
        .from('rsvps')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('event_id', event.id),
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, inserted.id);
    assert.equal(rows[0].status, 'going');

    await db.from('rsvps').delete().eq('id', inserted.id);
  });

  test('an invalid RSVP status is rejected', async () => {
    rejected(await db.from('rsvps').insert({ status: 'maybe' }), '22P02');
  });

  test('an RSVP for an unknown event is rejected', async () => {
    rejected(await db.from('rsvps').insert({ event_id: 0 }), '23503');
  });
});

describe('saved events', { skip, concurrency: 1 }, () => {
  const state = emptyState();
  let user;
  let event;

  before(async () => {
    user = await addUser(state, 'Ada');
    event = await addEvent(state);
  });

  after(() => cleanup(state));

  test('a user cannot save the same event twice', async () => {
    const row = { user_id: user.id, event_id: event.id };
    saved(await db.from('saved_events').insert(row).select().single());

    rejected(await db.from('saved_events').insert(row), '23505');
    await db.from('saved_events').delete().eq('user_id', user.id).eq('event_id', event.id);
  });

  test('a saved event for an unknown user is rejected', async () => {
    rejected(await db.from('saved_events').insert({ user_id: missingUserId }), '23503');
  });
});
