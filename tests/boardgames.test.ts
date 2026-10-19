import { describe, expect, it } from 'vitest';
import { applyMove, emptyBoard, legalMoves, outcome } from '../src/core/boardgames';

describe('connect 4', () => {
  it('drops pieces to the bottom and stacks them', () => {
    const b = emptyBoard('connect4');
    expect(applyMove('connect4', b, 3, 1)).toBe(5 * 7 + 3);
    expect(applyMove('connect4', b, 3, 2)).toBe(4 * 7 + 3);
  });
  it('detects horizontal, vertical and diagonal wins', () => {
    const h = emptyBoard('connect4');
    [0, 1, 2, 3].forEach((c) => applyMove('connect4', h, c, 1));
    expect(outcome('connect4', h)).toMatchObject({ winner: 1 });
    const v = emptyBoard('connect4');
    [0, 0, 0, 0].forEach((c) => applyMove('connect4', v, c, 2));
    expect(outcome('connect4', v)).toMatchObject({ winner: 2 });
    const d = emptyBoard('connect4');
    // Build a rising diagonal for player 1 from column 0 to 3.
    const seq: [number, 1 | 2][] = [[0, 1], [1, 2], [1, 1], [2, 2], [2, 2], [2, 1], [3, 2], [3, 2], [3, 2], [3, 1]];
    seq.forEach(([c, p]) => applyMove('connect4', d, c, p));
    expect(outcome('connect4', d)).toMatchObject({ winner: 1 });
  });
  it('rejects moves into a full column', () => {
    const b = emptyBoard('connect4');
    for (let i = 0; i < 6; i++) applyMove('connect4', b, 0, ((i % 2) + 1) as 1 | 2);
    expect(applyMove('connect4', b, 0, 1)).toBe(-1);
    expect(legalMoves('connect4', b)).not.toContain(0);
  });
});

describe('tic-tac-toe', () => {
  it('finds a win and a draw', () => {
    const b = emptyBoard('tictactoe');
    [0, 4, 8].forEach((i) => applyMove('tictactoe', b, i, 2));
    expect(outcome('tictactoe', b)).toEqual({ winner: 2, cells: [0, 4, 8] });
    const d = [1, 2, 1, 1, 2, 2, 2, 1, 1];
    expect(outcome('tictactoe', d)).toBe('draw');
  });
  it('rejects taken cells', () => {
    const b = emptyBoard('tictactoe');
    applyMove('tictactoe', b, 4, 1);
    expect(applyMove('tictactoe', b, 4, 2)).toBe(-1);
  });
});
