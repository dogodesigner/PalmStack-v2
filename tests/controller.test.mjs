import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBoard, makeMove, getGameResult, getValidColumns, HUMAN, COMPUTER } from '../rules.js';
import { findBestMove } from '../ai.js';

// A small DOM/Worker boundary double. Game behavior comes from the actual game.js.
let clockNow = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clockNow }, configurable: true });
const timers = new Map();
let timerId = 0;
globalThis.setTimeout = (callback, delay) => {
  timers.set(++timerId, { callback, delay });
  return timerId;
};
globalThis.clearTimeout = (id) => timers.delete(id);
globalThis.setInterval = (callback, delay) => { timers.set(++timerId, { callback, delay, interval: true }); return timerId; };
globalThis.clearInterval = globalThis.clearTimeout;
const flush = () => new Promise((resolve) => setImmediate(resolve));
function runTimer(delay) {
  const found = [...timers].find(([, item]) => item.delay === delay);
  assert.ok(found, `Expected a ${delay}ms timer`);
  timers.delete(found[0]);
  found[1].callback();
}

class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.attributes = {};
    this.listeners = new Map();
    this.open = false;
    this.disabled = false;
    this.hidden = false;
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.clientWidth = 480;
    this.clientHeight = 450;
    this.style = { setProperty() {} };
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.className.split(' '), ...names])].join(' ').trim(); },
      remove: (...names) => { this.className = this.className.split(' ').filter((name) => !names.includes(name)).join(' '); },
      contains: (name) => this.className.split(' ').includes(name),
    };
  }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = [...items]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type, props = {}) {
    const event = { target: this, preventDefault() {}, ...props };
    for (const callback of this.listeners.get(type) || []) callback(event);
  }
  focus() { document.activeElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; this.emit('close'); }
  getBoundingClientRect() { return { top: 100, height: 60 }; }
}

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const ids = new Map([...html.matchAll(/id="([^"]+)"/g)].map((match) => [match[1], new Element()]));
const el = (id) => {
  assert.ok(ids.has(id), `Missing HTML ID: ${id}`);
  return ids.get(id);
};
for (const who of ['human', 'computer', 'draw']) el(`${who}-score`).textContent = '0';
el('game-screen').hidden = true;
const documentEvents = new Element();
const windowEvents = new Element();
globalThis.document = {
  hidden: false,
  addEventListener: (...args) => documentEvents.addEventListener(...args),
  body: new Element('body'),
  getElementById: el,
  createElement: (tag) => new Element(tag),
};
document.activeElement = document.body;
const media = { matches: true, addEventListener() {} };
globalThis.window = { matchMedia: () => media, addEventListener: (...args) => windowEvents.addEventListener(...args) };
const savedData = new Map();
globalThis.localStorage = { getItem: key => savedData.get(key) ?? null, setItem: (key, value) => savedData.set(key, value) };

class TestWorker {
  static instances = [];
  static failConstruction = false;
  constructor(url, options) {
    if (TestWorker.failConstruction) throw new Error('Simulated worker load failure');
    assert.equal(options.type, 'module');
    assert.match(url.pathname, /ai-worker\.js$/);
    this.terminated = false;
    TestWorker.instances.push(this);
  }
  postMessage(message) { this.request = structuredClone(message); }
  terminate() { this.terminated = true; }
  reply(col, extra = {}) {
    this.onmessage({ data: {
      type: 'result', requestId: this.request.requestId,
      result: { col, score: 0, stats: { depth: this.request.depth, nodesVisited: 123, cutoffs: 7, timeMs: 1.2 } },
      ...extra,
    } });
  }
}
globalThis.Worker = TestWorker;
const expectedErrors = [];
console.error = (...args) => expectedErrors.push(args);
await import('../game.js');

const buttons = () => el('column-controls').children;
const cells = () => el('game-board').children.flatMap((row) => row.children);
const pieces = () => cells().flatMap((cell) => cell.children);
const lastWorker = () => TestWorker.instances.at(-1);
const click = (col) => buttons()[col].emit('click');
const score = (who) => el(`${who}-score`).textContent;
const fmt = (n) => new Intl.NumberFormat('ar-SA').format(n);
function start(name = '', level = 'easy') {
  el('difficulty-select').value = level;
  el('player-name').value = name;
  el('start-form').emit('submit');
}
function newPlayer() { el('new-player-button').emit('click'); }
function newRound() { el('new-round-button').emit('click'); }
async function humanThenComputer(humanCol, computerCol) {
  click(humanCol);
  await flush();
  lastWorker().reply(computerCol);
  await flush();
}

test('controller: levels, fair timing, scores, records, cancellation, input locks, sound and media failures', async () => {
  start('<img src=x onerror=x>', 'medium');
  assert.equal(el('human-name').textContent, '<img src=x onerror=x>');
  assert.equal(el('human-name').children.length, 0);
  assert.equal(cells().length, 42);
  assert.equal(buttons().length, 7);
  click(0); click(1);
  assert.equal(pieces().length, 1);
  await flush();
  assert.equal(lastWorker().request.depth, 4);
  assert.ok(buttons().every(button => button.disabled));
  const realResult = findBestMove(lastWorker().request.board, 4);
  lastWorker().reply(realResult.col, { result: realResult });
  await flush();
  assert.equal(pieces().length, 2);
  assert.equal(el('stat-depth').textContent, fmt(4));

  // Change level during a pending computer turn; the stale reply cannot cross rounds.
  click(0); await flush();
  const abandoned = lastWorker();
  el('change-level-button').emit('click');
  assert.equal(el('player-name').value, '<img src=x onerror=x>');
  assert.ok(abandoned.terminated);
  start('المستوى الصعب', 'hard');
  abandoned.reply(6);
  assert.equal(pieces().length, 0);
  click(3); await flush();
  assert.equal(lastWorker().request.depth, 6);
  const old = lastWorker();
  newRound();
  const fresh = lastWorker();
  assert.equal(fresh.request.depth, 6);
  old.reply(1);
  fresh.reply(3, { requestId: -1 });
  assert.equal(pieces().length, 0);
  fresh.reply(3); fresh.reply(4); await flush();
  assert.equal(pieces().length, 1);

  // Win as a named human. Paused and computer time must not enter the record.
  newPlayer(); start('الوقت', 'easy');
  clockNow += 1500;
  click(0); await flush();
  assert.equal(lastWorker().request.depth, 2);
  clockNow += 5000;
  lastWorker().reply(1); await flush();
  clockNow += 2500;
  el('leaderboard-button').emit('click');
  assert.equal(el('leaderboard-dialog').open, true);
  clockNow += 10000;
  el('close-leaderboard').emit('click');
  clockNow += 1000;
  await humanThenComputer(0, 1);
  document.hidden = true; documentEvents.emit('visibilitychange');
  clockNow += 9000;
  document.hidden = false; documentEvents.emit('visibilitychange');
  clockNow += 1000;
  await humanThenComputer(0, 1);
  const workerCount = TestWorker.instances.length;
  clockNow += 1000;
  click(0); await flush();
  assert.equal(score('human'), fmt(1));
  assert.equal(TestWorker.instances.length, workerCount);
  assert.equal(el('move-count').textContent, fmt(4));
  assert.equal(cells().filter(cell => cell.classList.contains('is-winning')).length, 4);
  assert.equal(el('result-panel').hidden, false);
  assert.ok(el('result-panel').classList.contains('is-human-win'));
  const { createStore } = await import('../storage.js');
  const reloaded = createStore(localStorage);
  const record = reloaded.list('easy', 'human')[0];
  assert.equal(record.name, 'الوقت');
  assert.equal(record.moves, 4);
  assert.equal(record.thinkingMs, 7000);
  assert.equal(el('leaderboard-rows').children.length, 1);
  click(2); lastWorker().reply(2); await flush();
  assert.equal(score('human'), fmt(1));
  assert.equal(pieces().length, 7);
  newRound();
  assert.equal(score('human'), fmt(1));
  newPlayer();
  assert.equal(score('human'), fmt(0));
  assert.equal(createStore(localStorage).list('easy', 'human').length, 1);

  // Guest wins are valid but are not placed in a shared anonymous leaderboard row.
  start();
  for (let i = 0; i < 3; i++) await humanThenComputer(0, 1);
  click(0); await flush();
  assert.equal(score('human'), fmt(1));
  assert.equal(createStore(localStorage).list('easy', 'human').length, 1);

  // Computer victory and full-column rejection.
  newPlayer(); start('نور');
  for (let i = 0; i < 3; i++) await humanThenComputer(0, 1);
  await humanThenComputer(2, 1);
  assert.equal(score('computer'), fmt(1));
  assert.ok(buttons().every(button => button.disabled));
  newPlayer(); start();
  for (let i = 0; i < 3; i++) await humanThenComputer(0, 0);
  assert.equal(buttons()[0].disabled, true);
  click(0); await flush();
  assert.equal(pieces().length, 6);
  el('column-controls').emit('keydown', { target: buttons()[1], key: 'ArrowLeft' });
  assert.equal(document.activeElement, buttons()[6]);

  // A full legal draw stays out of the win-only leaderboard.
  let seed = 9;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  let drawMoves;
  for (let attempt = 0; attempt < 1000 && !drawMoves; attempt++) {
    let board = createBoard();
    const moves = [];
    for (let turn = 0; turn < 42; turn++) {
      const legal = getValidColumns(board).map(col => makeMove(board, col, turn % 2 ? COMPUTER : HUMAN))
        .filter(move => getGameResult(move.board).status !== 'win');
      if (!legal.length) break;
      const move = legal[Math.floor(random() * legal.length)];
      board = move.board; moves.push(move.col);
    }
    if (moves.length === 42) drawMoves = moves;
  }
  assert.ok(drawMoves);
  newPlayer(); start('تعادل');
  for (let i = 0; i < 42; i += 2) await humanThenComputer(drawMoves[i], drawMoves[i + 1]);
  assert.equal(score('draw'), fmt(1));
  assert.equal(pieces().length, 42);
  assert.equal(createStore(localStorage).list('easy', 'human').length, 1);

  // Cancelling both human and computer drop animations leaves no ghost turns.
  newPlayer(); media.matches = false; start();
  click(2); newRound(); await flush();
  assert.equal(pieces().length, 0);
  assert.ok(![...timers.values()].some(item => item.delay === 650));
  lastWorker().reply(3); newPlayer(); await flush();
  assert.equal(el('game-screen').hidden, true);
  assert.equal(timers.size, 0);

  // Both animation completion and fallback work; celebration cleanup is finite.
  start('مؤثرات'); click(0);
  pieces()[0].emit('animationend', { animationName: 'piece-drop' });
  await flush(); lastWorker().reply(1); runTimer(650); await flush();
  for (let i = 0; i < 2; i++) {
    click(0); runTimer(650); await flush();
    lastWorker().reply(1); runTimer(650); await flush();
  }
  click(0); runTimer(650); await flush();
  assert.equal(el('celebration-layer').children.length, 36);
  newRound();
  assert.equal(el('celebration-layer').children.length, 0);
  assert.equal(el('board-shell').classList.contains('is-celebrating'), false);
  newPlayer(); media.matches = true;
  assert.equal(timers.size, 0);

  // Mute preference survives reload; missing art falls back without altering play.
  el('sound-toggle').emit('click');
  assert.equal(el('sound-toggle').attributes['aria-pressed'], 'false');
  assert.equal(createStore(localStorage).settings.sound, false);
  el('signature-image').emit('error');
  assert.equal(el('signature-image').hidden, true);
  assert.equal(el('signature-fallback').hidden, false);
  assert.equal(el('media-notice').hidden, false);
  el('retry-media-button').emit('click');
  assert.match(el('signature-image').src, /retry=1/);
  el('signature-image').emit('load');
  assert.equal(el('media-notice').hidden, true);
  assert.equal(el('signature-fallback').hidden, true);

  TestWorker.failConstruction = true;
  start(); click(3); await flush();
  assert.equal(el('game-error').hidden, false);
  assert.ok(buttons().every(button => button.disabled));
  TestWorker.failConstruction = false;
  el('retry-move-button').emit('click');
  assert.equal(pieces().length, 1);
  assert.equal(lastWorker().request.board[5][3], HUMAN);
  lastWorker().reply(2); await flush();
  assert.equal(pieces().length, 2);
  assert.equal(el('move-count').textContent, fmt(1));
  assert.ok(buttons().some(button => !button.disabled));
  newPlayer(); start(); click(3); await flush();
  const timedOut = lastWorker();
  runTimer(15000);
  assert.equal(el('game-error').hidden, false);
  assert.ok(lastWorker().terminated);
  const preservedBoard = structuredClone(timedOut.request.board);
  el('retry-move-button').emit('click');
  assert.deepEqual(lastWorker().request.board, preservedBoard);
  timedOut.reply(2);
  assert.equal(pieces().length, 1);
  lastWorker().reply(1); await flush();
  assert.equal(pieces().length, 2);
  newRound();
  assert.equal(el('game-error').hidden, true);
  lastWorker().reply(99);
  assert.equal(el('game-error').hidden, false);
  newPlayer();
  assert.equal(timers.size, 0);
  assert.equal(expectedErrors.length, 3);
});

