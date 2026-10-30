import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, cleanName, RECORDS_KEY } from '../storage.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), map };
}
const entry = (values = {}) => ({ name: 'دانة', level: 'easy', starter: 'human', moves: 7, thinkingMs: 12000, ...values });

test('persists best wins, separates difficulty and starter, and ranks moves before time', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.submitWin(entry());
  store.submitWin(entry({ moves: 8, thinkingMs: 1000 }));
  assert.equal(store.list('easy', 'human')[0].moves, 7);
  store.submitWin(entry({ name: '  دانة  ', moves: 6, thinkingMs: 50000 }));
  assert.equal(store.list('easy', 'human').length, 1);
  assert.equal(store.list('easy', 'human')[0].moves, 6);
  store.submitWin(entry({ name: 'نور', moves: 5, thinkingMs: 60000 }));
  store.submitWin(entry({ name: 'ريم', moves: 6, thinkingMs: 1000 }));
  assert.deepEqual(store.list('easy', 'human').map((item) => item.name), ['نور', 'ريم', 'دانة']);
  store.submitWin(entry({ level: 'hard', moves: 4 }));
  store.submitWin(entry({ starter: 'computer', moves: 4 }));
  const reloaded = createStore(storage);
  assert.equal(reloaded.list('hard', 'human').length, 1);
  assert.equal(reloaded.list('easy', 'computer').length, 1);
  assert.equal(reloaded.list('easy', 'human').length, 3);
  store.saveSettings({ level: 'medium', sound: false });
  assert.deepEqual(createStore(storage).settings, { level: 'medium', sound: false });
});

test('caps each category at ten and rejects malformed stored or submitted entries', () => {
  const storage = memoryStorage();
  storage.setItem(RECORDS_KEY, '{broken');
  const store = createStore(storage);
  assert.equal(store.list('easy', 'human').length, 0);
  assert.equal(store.submitWin(entry({ name: '' })).accepted, false);
  assert.equal(store.submitWin(entry({ level: '__proto__' })).accepted, false);
  assert.equal(store.submitWin(entry({ thinkingMs: -10 })).accepted, false);
  assert.equal(store.submitWin(entry({ moves: 3 })).accepted, false);
  for (let i = 0; i < 16; i++) store.submitWin(entry({ name: `لاعب ${i}`, moves: 4 + i }));
  assert.equal(store.list('easy', 'human').length, 10);
  assert.equal(createStore(storage).list('easy', 'human').length, 10);
  assert.equal(cleanName(' \u202e دانة   التميمي\u0000 '), 'دانة التميمي');
  assert.equal([...cleanName('أ'.repeat(40))].length, 24);
});

test('storage denied or quota full keeps in-memory play results', () => {
  const storage = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Quota'); } };
  const store = createStore(storage);
  const result = store.submitWin(entry());
  assert.equal(result.saved, false);
  assert.equal(store.persistent, false);
  assert.equal(store.list('easy', 'human').length, 1);
  assert.equal(createStore(null).submitWin(entry()).saved, false);
});
