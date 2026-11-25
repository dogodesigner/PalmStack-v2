export const ROWS = 6;
export const COLS = 7;
export const EMPTY = 0;
export const HUMAN = 1;
export const COMPUTER = 2;

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

export function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
}

export function getOpenRow(board, col) {
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return -1;

  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === EMPTY) return row;
  }

  return -1;
}

export function getValidColumns(board) {
  return Array.from({ length: COLS }, (_, col) => col)
    .filter((col) => getOpenRow(board, col) !== -1);
}

export function getGameResult(board) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const player = board[row][col];
      if (player === EMPTY) continue;

      for (const [rowStep, colStep] of DIRECTIONS) {
        const cells = [];

        for (let step = 0; step < 4; step++) {
          const nextRow = row + rowStep * step;
          const nextCol = col + colStep * step;

          if (
            nextRow < 0 || nextRow >= ROWS ||
            nextCol < 0 || nextCol >= COLS ||
            board[nextRow][nextCol] !== player
          ) break;

          cells.push({ row: nextRow, col: nextCol });
        }

        if (cells.length === 4) {
          return { status: "win", winner: player, cells };
        }
      }
    }
  }

  const full = getValidColumns(board).length === 0;
  return { status: full ? "draw" : "playing", winner: EMPTY, cells: [] };
}

export function makeMove(board, col, player) {
  if (player !== HUMAN && player !== COMPUTER) return null;

  const row = getOpenRow(board, col);
  if (row === -1 || getGameResult(board).status !== "playing") return null;

  // Search uses copies so hypothetical moves never change the live board.
  const nextBoard = board.map((currentRow) => [...currentRow]);
  nextBoard[row][col] = player;

  return { board: nextBoard, row, col, player };
}
