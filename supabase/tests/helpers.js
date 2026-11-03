import '../load-env.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const skip = !url || !serviceKey
  ? 'Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to supabase/.env'
  : false;

export const db = skip
  ? null
  : createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

export const missingUserId = '00000000-0000-0000-0000-000000000000';

export function saved(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export function rejected(result, code) {
  assert.equal(result.error?.code, code, result.error?.message);
}

export function emptyState() {
  return { authUserIds: [], eventIds: [] };
}

async function createAuthUser(state) {
  const email = `schema-test-${randomUUID()}@example.com`;
  const password = `Pw-${randomUUID()}-9a`;
  const authUser = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  saved(authUser);
  state.authUserIds.push(authUser.data.user.id);
  return { id: authUser.data.user.id, email, password };
}

async function publicUserFor(authUser, name) {
  const existing = saved(await db.from('users').select().eq('id', authUser.id).maybeSingle());
  if (existing) {
    return saved(await db.from('users').update({ name }).eq('id', authUser.id).select().single());
  }
  return saved(await db.from('users').insert({ id: authUser.id, name, email: authUser.email }).select().single());
}

export async function addUser(state, name) {
  return publicUserFor(await createAuthUser(state), name);
}

export async function addSignedInUser(state, name) {
  if (!process.env.SUPABASE_ANON_KEY) throw new Error('SUPABASE_ANON_KEY is required');
  const authUser = await createAuthUser(state);
  const user = await publicUserFor(authUser, name);
  const client = createClient(url, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  saved(await client.auth.signInWithPassword({ email: authUser.email, password: authUser.password }));
  return { user, client };
}

export async function addEvent(state, row = {}) {
  const event = saved(
    await db
      .from('events')
      .insert({
        title: 'Schema test event',
        location: 'Amherst',
        start_time: '2026-11-01T15:00:00Z',
        ...row,
      })
      .select()
      .single(),
  );
  state.eventIds.push(event.id);
  return event;
}

export async function cleanup(state) {
  if (!db) return;

  if (state.eventIds.length > 0) {
    saved(await db.from('events').delete().in('id', state.eventIds));
  }

  for (const id of state.authUserIds) {
    const result = await db.auth.admin.deleteUser(id);
    if (result.error && result.error.status !== 404) {
      throw new Error(result.error.message);
    }
  }
}
