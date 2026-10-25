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

describe('organizer profiles', { skip, concurrency: 1 }, () => {
  const state = emptyState();
  let user;
  let profile;

  before(async () => {
    user = await addUser(state, 'Grace');
    profile = saved(
      await db
        .from('organizer_profiles')
        .insert({ user_id: user.id, organization_name: 'Campus Events' })
        .select()
        .single(),
    );
  });

  after(() => cleanup(state));

  test('a new profile defaults to pending', () => {
    assert.equal(profile.user_id, user.id);
    assert.equal(profile.verification_status, 'pending');
  });

  test('one user cannot have two profiles', async () => {
    rejected(
      await db.from('organizer_profiles').insert({
        user_id: user.id,
        organization_name: 'Another Club',
      }),
      '23505',
    );
  });

  test('a profile for an unknown user is rejected', async () => {
    rejected(await db.from('organizer_profiles').insert({ user_id: missingUserId }), '23503');
  });

  test('an invalid verification status is rejected', async () => {
    rejected(
      await db.from('organizer_profiles').insert({ verification_status: 'later' }),
      '22P02',
    );
  });

  test('deleting the user deletes the profile', async () => {
    const organizer = await addUser(state, 'Temporary Organizer');
    const ownProfile = saved(
      await db
        .from('organizer_profiles')
        .insert({ user_id: organizer.id, organization_name: 'Temp Club' })
        .select()
        .single(),
    );

    saved(await db.auth.admin.deleteUser(organizer.id));

    const rows = saved(await db.from('organizer_profiles').select('id').eq('id', ownProfile.id));
    assert.equal(rows.length, 0);
  });
});

describe('verification requests', { skip, concurrency: 1 }, () => {
  const state = emptyState();
  let profile;

  before(async () => {
    const organizer = await addUser(state, 'Organizer');
    profile = saved(
      await db
        .from('organizer_profiles')
        .insert({ user_id: organizer.id, organization_name: 'Campus Events' })
        .select()
        .single(),
    );
  });

  after(() => cleanup(state));

  test('a new request defaults to pending', async () => {
    const request = saved(
      await db
        .from('organizer_verification_requests')
        .insert({
          organizer_profile_id: profile.id,
          document_url: 'https://example.com/id.pdf',
        })
        .select()
        .single(),
    );

    assert.equal(request.organizer_profile_id, profile.id);
    assert.equal(request.status, 'pending');
  });

  test('a request for an unknown profile is rejected', async () => {
    rejected(
      await db.from('organizer_verification_requests').insert({ organizer_profile_id: 0 }),
      '23503',
    );
  });

  test('deleting the profile deletes the request', async () => {
    const request = saved(
      await db
        .from('organizer_verification_requests')
        .insert({ organizer_profile_id: profile.id })
        .select()
        .single(),
    );

    saved(await db.from('organizer_profiles').delete().eq('id', profile.id));

    const rows = saved(
      await db.from('organizer_verification_requests').select('id').eq('id', request.id),
    );
    assert.equal(rows.length, 0);
  });
});
