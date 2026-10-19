// Rules for the two table games. The server runs this same code as the referee (it's part of
// the api bundle); the client uses it for instant feedback.

export type GameKind = 'connect4' | 'tictactoe';
/** Cells hold 0 (empty), 1 (player who started), 2 (the other player). */
export type Board = number[];

export const DIMS: Record<GameKind, { cols: number; rows: number; win: number }> = {
  connect4: { cols: 7, rows: 6, win: 4 },
  tictactoe: { cols: 3, rows: 3, win: 3 },
};

export function emptyBoard(kind: GameKind): Board {
  const { cols, rows } = DIMS[kind];
  return new Array(cols * rows).fill(0);
}

/**
 * Apply a move. Connect 4 moves are a column (the piece drops to the lowest empty row);
 * tic-tac-toe moves are a cell index. Returns the cell that was filled, or -1 if illegal.
 */
export function applyMove(kind: GameKind, board: Board, move: number, player: 1 | 2): number {
  const { cols, rows } = DIMS[kind];
  if (kind === 'tictactoe') {
    if (move < 0 || move >= board.length || board[move] !== 0) return -1;
    board[move] = player;
    return move;
  }
  if (move < 0 || move >= cols) return -1;
  for (let r = rows - 1; r >= 0; r--) {
    const i = r * cols + move;
    if (board[i] === 0) { board[i] = player; return i; }
  }
  return -1;
}

/** Winner (1 or 2) with the winning cells, 'draw' when full, or null if play continues. */
export function outcome(kind: GameKind, board: Board): { winner: 1 | 2; cells: number[] } | 'draw' | null {
  const { cols, rows, win } = DIMS[kind];
  const at = (c: number, r: number) => (c < 0 || r < 0 || c >= cols || r >= rows ? -1 : board[r * cols + c]);
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const p = at(c, r);
    if (p <= 0) continue;
    for (const [dc, dr] of dirs) {
      const cells = [r * cols + c];
      for (let k = 1; k < win; k++) {
        if (at(c + dc * k, r + dr * k) !== p) break;
        cells.push((r + dr * k) * cols + (c + dc * k));
      }
      if (cells.length === win) return { winner: p as 1 | 2, cells };
    }
  }
  return board.every((v) => v !== 0) ? 'draw' : null;
}

export function legalMoves(kind: GameKind, board: Board): number[] {
  const { cols } = DIMS[kind];
  if (kind === 'tictactoe') return board.flatMap((v, i) => (v === 0 ? [i] : []));
  return [...Array(cols).keys()].filter((c) => board[c] === 0);
}
