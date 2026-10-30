import {
  ROWS, COLS, HUMAN, COMPUTER,
  getValidColumns, getGameResult, makeMove,
} from "./rules.js";

export const DEFAULT_DEPTH = 4;

const WIN_SCORE = 1_000_000;
const COLUMN_ORDER = [3, 2, 4, 1, 5, 0, 6];
const WINDOW_WEIGHTS = [0, 1, 10, 60, 1000];
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

function evaluateWindow(cells) {
  const computerCount = cells.filter((cell) => cell === COMPUTER).length;
  const humanCount = cells.filter((cell) => cell === HUMAN).length;

  if (computerCount > 0 && humanCount > 0) return 0;
  if (computerCount > 0) return WINDOW_WEIGHTS[computerCount];
  return -WINDOW_WEIGHTS[humanCount];
}

function evaluateBoard(board) {
  let score = 0;
  const center = Math.floor(COLS / 2);

  for (let row = 0; row < ROWS; row++) {
    if (board[row][center] === COMPUTER) score += 3;
    if (board[row][center] === HUMAN) score -= 3;

    for (let col = 0; col < COLS; col++) {
      for (const [rowStep, colStep] of DIRECTIONS) {
        const endRow = row + rowStep * 3;
        const endCol = col + colStep * 3;

        if (
          endRow < 0 || endRow >= ROWS ||
          endCol < 0 || endCol >= COLS
        ) continue;

        const cells = Array.from({ length: 4 }, (_, step) =>
          board[row + rowStep * step][col + colStep * step]
        );

        score += evaluateWindow(cells);
      }
    }
  }

  return score;
}

function minimax(board, depth, alpha, beta, player, context) {
  context.stats.nodesVisited++;
  const result = getGameResult(board);

  // Terminal results outweigh the heuristic and favor faster wins.
  if (result.status === "win") {
    const score = result.winner === COMPUTER
      ? WIN_SCORE + depth
      : -WIN_SCORE - depth;
    return { col: null, score };
  }

  if (result.status === "draw") return { col: null, score: 0 };
  if (depth === 0) return { col: null, score: evaluateBoard(board) };

  const maximizing = player === COMPUTER;
  const nextPlayer = maximizing ? HUMAN : COMPUTER;
  const validColumns = getValidColumns(board);
  const columns = COLUMN_ORDER.filter((col) => validColumns.includes(col));
  let bestCol = null;
  let bestScore = maximizing ? -Infinity : Infinity;

  for (let index = 0; index < columns.length; index++) {
    const col = columns[index];
    const move = makeMove(board, col, player);
    const child = minimax(
      move.board, depth - 1, alpha, beta, nextPlayer, context
    );

    const better = maximizing
      ? child.score > bestScore
      : child.score < bestScore;

    if (better) {
      bestScore = child.score;
      bestCol = col;
    }

    if (maximizing) alpha = Math.max(alpha, bestScore);
    else beta = Math.min(beta, bestScore);

    if (context.usePruning && alpha >= beta) {
      // Count cutoff events with unsearched siblings, not skipped nodes.
      if (index < columns.length - 1) context.stats.cutoffs++;
      break;
    }
  }

  return { col: bestCol, score: bestScore };
}

export function findBestMove(
  board, maxDepth = DEFAULT_DEPTH, usePruning = true
) {
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 6) {
    throw new RangeError("Search depth must be an integer from 1 to 6.");
  }

  const stats = { depth: maxDepth, nodesVisited: 0, cutoffs: 0, timeMs: 0 };
  const context = { usePruning, stats };
  const started = performance.now();

  const choice = minimax(
    board, maxDepth, -Infinity, Infinity, COMPUTER, context
  );

  stats.timeMs = performance.now() - started;
  return { ...choice, stats };
}
