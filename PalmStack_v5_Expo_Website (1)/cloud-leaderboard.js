/**
 * Public leaderboard for the original static Palm Stack game.
 * No secret or service-role key belongs in a browser application.
 * Supabase JS is lazy-loaded so losing the network does not stop gameplay.
 */
import { LEVELS } from './config.js';
import { cleanName, compareRecords } from './storage.js';

export const SUPABASE_URL = 'https://tsgfmqrcnbyrtursnyhu.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_4XFGYRRMn18IAZjzZjzU3Q_mNeo2Ady';
const tableFor = level => level === 'easy' ? 'leaderboard_scores_easy_v2' : 'leaderboard_scores';
const STARTERS = ['human', 'computer'];
const LIMIT = 10;

function assertGroup(level, starter) {
  if (!Object.hasOwn(LEVELS, level) || !STARTERS.includes(starter)) {
    throw new Error('Invalid leaderboard category');
  }
}

function fromRow(row) {
  const record = {
    name: cleanName(row.name), level: row.level, starter: row.starter,
    moves: row.moves, thinkingMs: row.thinking_ms,
    savedAt: Date.parse(row.saved_at), userId: row.user_id,
  };
  if (!record.name || !Object.hasOwn(LEVELS, record.level) ||
      !STARTERS.includes(record.starter) ||
      !Number.isInteger(record.moves) || record.moves < 4 || record.moves > 21 ||
      !Number.isInteger(record.thinkingMs) || record.thinkingMs < 0 ||
      !Number.isFinite(record.savedAt)) return null;
  return record;
}

function validWin(record) {
  return cleanName(record.name) && Object.hasOwn(LEVELS, record.level) &&
    STARTERS.includes(record.starter) && Number.isInteger(record.moves) &&
    record.moves >= 4 && record.moves <= 21 &&
    Number.isInteger(record.thinkingMs) && record.thinkingMs >= 0 &&
    record.thinkingMs <= 604800000;
}

const loadSupabaseClient = async () => {
  // Pin this CDN dependency to avoid silently changing the SDK during the event.
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.4');
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storageKey: 'palmstack.auth.v1',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
};

export function createCloudLeaderboard({ loadClient = loadSupabaseClient } = {}) {
  let clientPromise;
  let pendingReset = Promise.resolve();
  let pendingWrite = Promise.resolve();
  function getClient() {
    if (!clientPromise) {
      clientPromise = Promise.resolve().then(loadClient).catch((error) => {
        clientPromise = undefined; // Allow retries when connectivity returns.
        throw error;
      });
    }
    return clientPromise;
  }

  async function list(level, starter) {
    assertGroup(level, starter);
    const client = await getClient();
    const { data, error } = await client.from(tableFor(level))
      .select('user_id,name,level,starter,moves,thinking_ms,saved_at')
      .eq('level', level).eq('starter', starter)
      .order('moves', { ascending: true })
      .order('thinking_ms', { ascending: true })
      .order('saved_at', { ascending: true })
      .limit(LIMIT);
    if (error) throw error;
    return (data || []).map(fromRow).filter(Boolean).sort(compareRecords);
  }

  async function saveWin(input) {
    await input.waitForReset;
    const client = await getClient();
    const { data: { session }, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    let currentSession = session;
    if (!currentSession) {
      const { data, error } = await client.auth.signInAnonymously();
      if (error) throw error;
      currentSession = data.session;
    }
    const userId = currentSession?.user?.id;
    if (!userId) throw new Error('Anonymous sign-in did not return a user');

    // Unique constraint: (user_id, level, starter).
    // Compare before upsert to avoid replacing the player's personal best.
    const { data: old, error: readError } = await client.from(tableFor(input.level))
      .select('name,level,starter,moves,thinking_ms,saved_at,user_id')
      .eq('user_id', userId).eq('level', input.level).eq('starter', input.starter)
      .maybeSingle();
    if (readError) throw readError;
    const previous = old ? fromRow(old) : null;
    const candidate = {
      name: cleanName(input.name), level: input.level, starter: input.starter,
      moves: input.moves, thinkingMs: input.thinkingMs,
      savedAt: Date.now(), userId,
    };
    const improved = !previous || compareRecords(candidate, previous) < 0;
    if (improved) {
      const { error } = await client.from(tableFor(input.level)).upsert({
        user_id: userId, name: candidate.name,
        level: candidate.level, starter: candidate.starter,
        moves: candidate.moves, thinking_ms: candidate.thinkingMs,
        saved_at: new Date(candidate.savedAt).toISOString(),
      }, { onConflict: 'user_id,level,starter' });
      if (error) throw error;
    }
    const top = await list(input.level, input.starter);
    const index = top.findIndex((item) => item.userId === userId);
    return { saved: true, improved, rank: index < 0 ? null : index + 1 };
  }

  function submitWin(input) {
    if (!validWin(input)) return Promise.reject(new Error('Invalid winning result'));
    const waitForReset = pendingReset;
    const result = pendingWrite.catch(() => {}).then(() => saveWin({ ...input, waitForReset }));
    pendingWrite = result.catch(() => {});
    return result;
  }

  function newPlayer() {
    // A shared kiosk can host several players without merging their scores.
    // There is no email/password to recover anonymous IDs after sign-out.
    const waitForWrites = pendingWrite;
    pendingReset = pendingReset.catch(() => {}).then(async () => {
      await waitForWrites;
      const client = await getClient();
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) return;
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
    });
    return pendingReset;
  }

  return { list, submitWin, newPlayer };
}
