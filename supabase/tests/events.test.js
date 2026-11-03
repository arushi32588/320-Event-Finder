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

describe('events', { skip, concurrency: 1 }, () => {
  const state = emptyState();
  let attendee;
  let profile;
  let event;

  before(async () => {
    attendee = await addUser(state, 'Ada');
    const organizer = await addUser(state, 'Grace');
    profile = saved(
      await db
        .from('organizer_profiles')
        .insert({ user_id: organizer.id, organization_name: 'Campus Events' })
        .select()
        .single(),
    );
    event = await addEvent(state, {
      title: 'Fall Concert',
      location: 'Buckley Recital Hall',
    });
  });

  after(() => cleanup(state));

  test('a new event defaults to pending and user_submission', () => {
    assert.equal(event.title, 'Fall Concert');
    assert.equal(event.location, 'Buckley Recital Hall');
    assert.equal(event.approval_status, 'pending');
    assert.equal(event.source, 'user_submission');
  });

  test('an event without a title is rejected', async () => {
    rejected(
      await db.from('events').insert({
        location: 'Amherst',
        start_time: '2026-11-01T15:00:00Z',
      }),
      '23502',
    );
  });

  test('a title longer than 255 characters is rejected', async () => {
    rejected(await db.from('events').insert({ title: 'x'.repeat(256) }), '22001');
  });

  test('an unknown submitter is rejected', async () => {
    rejected(
      await db.from('events').insert({
        title: 'Bad submitter',
        submitted_by_user_id: missingUserId,
      }),
      '23503',
    );
  });

  test('an invalid approval status is rejected', async () => {
    rejected(
      await db.from('events').insert({ title: 'Bad status', approval_status: 'later' }),
      '22P02',
    );
  });

  test('deleting the submitter keeps the event and clears that id', async () => {
    const submitter = await addUser(state, 'Submitter');
    const submitted = await addEvent(state, {
      submitted_by_user_id: submitter.id,
      organizer_profile_id: profile.id,
    });

    saved(await db.auth.admin.deleteUser(submitter.id));

    const row = saved(
      await db
        .from('events')
        .select('submitted_by_user_id, organizer_profile_id')
        .eq('id', submitted.id)
        .single(),
    );
    assert.equal(row.submitted_by_user_id, null);
    assert.equal(row.organizer_profile_id, profile.id);
  });

  test('deleting an event deletes its related rows', async () => {
    const linked = await addEvent(state);
    const rsvp = saved(
      await db
        .from('rsvps')
        .insert({ user_id: attendee.id, event_id: linked.id, status: 'going' })
        .select()
        .single(),
    );
    const bookmark = saved(
      await db
        .from('saved_events')
        .insert({ user_id: attendee.id, event_id: linked.id })
        .select()
        .single(),
    );
    const announcement = saved(
      await db
        .from('event_announcements')
        .insert({ event_id: linked.id, title: 'Doors open at 2' })
        .select()
        .single(),
    );
    const conversation = saved(
      await db
        .from('conversations')
        .insert({
          attendee_user_id: attendee.id,
          organizer_profile_id: profile.id,
          event_id: linked.id,
        })
        .select()
        .single(),
    );
    const message = saved(
      await db
        .from('messages')
        .insert({ conversation_id: conversation.id, body: 'See you there.' })
        .select()
        .single(),
    );

    saved(await db.from('events').delete().eq('id', linked.id));

    const leftovers = await Promise.all([
      db.from('rsvps').select('id').eq('id', rsvp.id),
      db.from('saved_events').select('id').eq('id', bookmark.id),
      db.from('event_announcements').select('id').eq('id', announcement.id),
      db.from('conversations').select('id').eq('id', conversation.id),
      db.from('messages').select('id').eq('id', message.id),
    ]);

    for (const rows of leftovers) {
      assert.equal(saved(rows).length, 0);
    }
  });
});
