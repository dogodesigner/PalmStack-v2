import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import { createBoard, makeMove, getGameResult, HUMAN, COMPUTER } from '../rules.js';
import { findBestMove } from '../ai.js';
import { LEVELS } from '../config.js';

test('all configured levels make legal blocking moves without mutating the input', () => {
  let board = createBoard();
  for (const [col, player] of [[0, HUMAN], [6, COMPUTER], [1, HUMAN], [6, COMPUTER], [2, HUMAN]]) {
    board = makeMove(board, col, player).board;
  }
  const snapshot = structuredClone(board);
  for (const level of Object.values(LEVELS)) {
    const result = findBestMove(board, level.depth);
    assert.equal(result.col, 3);
    assert.equal(result.stats.depth, level.depth);
    assert.ok(result.stats.nodesVisited > 0);
    assert.deepEqual(board, snapshot);
  }
});

test('browser worker entry point accepts depth and preserves request identity', { timeout: 10000 }, async () => {
  const url = new URL('../ai-worker.js', import.meta.url).href;
  const worker = new Worker(`
    const { parentPort } = require('node:worker_threads');
    global.self = {
      addEventListener: (name, callback) => parentPort.on('message', data => callback({ data })),
      postMessage: value => parentPort.postMessage(value)
    };
    import(${JSON.stringify(url)}).then(() => parentPort.postMessage({ ready: true }));
  `, { eval: true });
  try {
    const [ready] = await once(worker, 'message');
    assert.equal(ready.ready, true);
    const received = once(worker, 'message');
    worker.postMessage({ requestId: 39, board: createBoard(), depth: 6 });
    const [message] = await received;
    assert.equal(message.requestId, 39);
    assert.equal(message.type, 'result');
    assert.equal(message.result.stats.depth, 6);
    assert.ok(makeMove(createBoard(), message.result.col, COMPUTER));
    const failed = once(worker, 'message');
    worker.postMessage({ requestId: 40, board: createBoard(), depth: 0 });
    assert.equal((await failed)[0].type, 'error');
  } finally { await worker.terminate(); }
});

test('a legal human win is detected and terminal moves are rejected', () => {
  let board = createBoard();
  for (const [index, col] of [0, 1, 0, 1, 0, 1, 0].entries()) {
    board = makeMove(board, col, index % 2 ? COMPUTER : HUMAN).board;
  }
  assert.equal(getGameResult(board).winner, HUMAN);
  assert.equal(makeMove(board, 2, COMPUTER), null);
});
