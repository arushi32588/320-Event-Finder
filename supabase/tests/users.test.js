import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  addUser,
  cleanup,
  db,
  emptyState,
  missingUserId,
  rejected,
  saved,
  skip,
} from './helpers.js';

describe('users', { skip, concurrency: 1 }, () => {
  const state = emptyState();
  let user;

  before(async () => {
    user = await addUser(state, 'Ada');
  });

  after(() => cleanup(state));

  test('a new user defaults to attendee', () => {
    assert.equal(user.name, 'Ada');
    assert.equal(user.role, 'attendee');
  });

  test('the same user id cannot be inserted twice', async () => {
    rejected(
      await db.from('users').insert({ id: user.id, name: 'Ada', email: user.email }),
      '23505',
    );
  });

  test('an invalid role is rejected', async () => {
    rejected(await db.from('users').insert({ id: user.id, role: 'guest' }), '22P02');
  });

  test('an id that is not an auth user is rejected', async () => {
    rejected(
      await db.from('users').insert({
        id: missingUserId,
        name: 'Ghost',
        email: 'ghost@example.com',
      }),
      '23503',
    );
  });

  test('deleting the auth user deletes the public user', async () => {
    const extra = await addUser(state, 'Temporary');
    saved(await db.auth.admin.deleteUser(extra.id));

    const rows = saved(await db.from('users').select('id').eq('id', extra.id));
    assert.equal(rows.length, 0);
  });
});
