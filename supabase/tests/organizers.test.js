import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  addUser,
  addSignedInUser,
  cleanup,
  db,
  emptyState,
  missingUserId,
  rejected,
  saved,
  skip,
} from './helpers.js';

const requiredRequestFields = {
  organization_name: 'Campus Events',
  organization_description: 'Community events for students',
  contact_email: 'events@example.com',
};

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
    assert.ok(profile.created_at);
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
    rejected(await db.from('organizer_profiles').insert({ user_id: missingUserId, organization_name: 'Unknown Club' }), '23503');
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

describe('organizer verification access', { skip: skip || !process.env.SUPABASE_ANON_KEY, concurrency: 1 }, () => {
  const state = emptyState();

  after(() => cleanup(state));

  test('owners cannot review, while admins can review and owners can reapply', async () => {
    const owner = await addSignedInUser(state, 'Applicant');
    const stranger = await addSignedInUser(state, 'Other User');
    const admin = await addSignedInUser(state, 'Administrator');
    saved(await db.from('users').update({ role: 'admin' }).eq('id', admin.user.id));

    const profile = saved(await owner.client.from('organizer_profiles')
      .insert({ user_id: owner.user.id, organization_name: 'Campus Club' })
      .select().single());
    rejected(await owner.client.from('organizer_verification_requests')
      .insert({ organizer_profile_id: profile.id, organization_name: 'Campus Club' }), '23514');
    const request = saved(await owner.client.from('organizer_verification_requests')
      .insert({
        organizer_profile_id: profile.id,
        organization_name: 'Campus Club',
        organization_description: 'Student-led events',
        contact_email: 'club@example.com',
        document_url: 'https://example.com/proof.pdf',
      })
      .select().single());

    assert.equal(saved(await stranger.client.from('organizer_profiles').select('id').eq('id', profile.id)).length, 0);
    assert.equal(saved(await stranger.client.from('organizer_verification_requests').select('id').eq('id', request.id)).length, 0);

    rejected(await owner.client.from('organizer_profiles')
      .update({ verification_status: 'approved' }).eq('id', profile.id), '42501');
    rejected(await owner.client.from('organizer_verification_requests')
      .update({ status: 'approved' }).eq('id', request.id), '42501');
    rejected(await owner.client.from('organizer_verification_requests')
      .update({ reviewed_by_user_id: owner.user.id }).eq('id', request.id), '42501');

    const reviewedAt = new Date().toISOString();
    const reviewed = saved(await admin.client.from('organizer_verification_requests')
      .update({ status: 'rejected', reviewed_by_user_id: admin.user.id, reviewed_at: reviewedAt })
      .eq('id', request.id).select().single());
    assert.equal(reviewed.status, 'rejected');
    assert.equal(reviewed.reviewed_by_user_id, admin.user.id);
    const reviewedProfile = saved(await admin.client.from('organizer_profiles')
      .update({ verification_status: 'rejected' }).eq('id', profile.id).select().single());
    assert.equal(reviewedProfile.verification_status, 'rejected');

    const next = saved(await owner.client.from('organizer_verification_requests')
      .insert({ organizer_profile_id: profile.id, ...requiredRequestFields }).select().single());
    assert.equal(next.status, 'pending');
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
          ...requiredRequestFields,
        })
        .select()
        .single(),
    );

    assert.equal(request.organizer_profile_id, profile.id);
    assert.equal(request.status, 'pending');
    assert.ok(request.created_at);
    assert.equal(request.reviewed_at, null);
  });

  test('only one pending request is allowed, but a rejected request can be followed by another', async () => {
    const applicant = await addUser(state, 'Repeat Applicant');
    const applicantProfile = saved(await db.from('organizer_profiles')
      .insert({ user_id: applicant.id, organization_name: 'Campus Volunteers' })
      .select().single());
    const first = saved(
      await db.from('organizer_verification_requests')
        .insert({ organizer_profile_id: applicantProfile.id, document_url: 'https://example.com/proof.pdf', ...requiredRequestFields })
        .select().single(),
    );

    rejected(
      await db.from('organizer_verification_requests').insert({ organizer_profile_id: applicantProfile.id, ...requiredRequestFields }),
      '23505',
    );

    saved(await db.from('organizer_verification_requests')
      .update({ status: 'rejected', reviewed_by_user_id: applicant.id, reviewed_at: new Date().toISOString() })
      .eq('id', first.id));

    const second = saved(
      await db.from('organizer_verification_requests')
        .insert({ organizer_profile_id: applicantProfile.id, ...requiredRequestFields }).select().single(),
    );
    assert.equal(second.status, 'pending');
  });

  test('a request for an unknown profile is rejected', async () => {
    rejected(
      await db.from('organizer_verification_requests').insert({ organizer_profile_id: 0, ...requiredRequestFields }),
      '23503',
    );
  });

  test('deleting a reviewer clears the reviewer link', async () => {
    const applicant = await addUser(state, 'Reviewer Test Applicant');
    const reviewer = await addUser(state, 'Reviewer Test Admin');
    saved(await db.from('users').update({ role: 'admin' }).eq('id', reviewer.id));
    const applicantProfile = saved(await db.from('organizer_profiles')
      .insert({ user_id: applicant.id, organization_name: 'Reviewer Test Club' })
      .select().single());
    const request = saved(await db.from('organizer_verification_requests')
      .insert({ organizer_profile_id: applicantProfile.id, ...requiredRequestFields })
      .select().single());
    saved(await db.from('organizer_verification_requests')
      .update({ status: 'rejected', reviewed_by_user_id: reviewer.id, reviewed_at: new Date().toISOString() })
      .eq('id', request.id));

    saved(await db.auth.admin.deleteUser(reviewer.id));
    const row = saved(await db.from('organizer_verification_requests')
      .select('reviewed_by_user_id').eq('id', request.id).single());
    assert.equal(row.reviewed_by_user_id, null);
  });

  test('deleting the profile deletes the request', async () => {
    const applicant = await addUser(state, 'Temporary Applicant');
    const removableProfile = saved(await db.from('organizer_profiles')
      .insert({ user_id: applicant.id, organization_name: 'Temporary Club' })
      .select().single());
    const request = saved(
      await db
        .from('organizer_verification_requests')
        .insert({ organizer_profile_id: removableProfile.id, ...requiredRequestFields })
        .select()
        .single(),
    );

    saved(await db.from('organizer_profiles').delete().eq('id', removableProfile.id));

    const rows = saved(
      await db.from('organizer_verification_requests').select('id').eq('id', request.id),
    );
    assert.equal(rows.length, 0);
  });
});
