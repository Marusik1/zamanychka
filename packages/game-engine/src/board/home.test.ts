import { describe, expect, it } from 'vitest';
import { resolveHomeCoord, resolvePawnCoordinate } from './home.js';

describe('home coordinates', () => {
  it('maps each color home diagonal exactly', () => {
    expect(resolveHomeCoord('RED', 0)).toEqual({ row: 0, col: 0 });
    expect(resolveHomeCoord('RED', 1)).toEqual({ row: 1, col: 1 });
    expect(resolveHomeCoord('RED', 2)).toEqual({ row: 2, col: 2 });
    expect(resolveHomeCoord('RED', 3)).toEqual({ row: 3, col: 3 });

    expect(resolveHomeCoord('BLUE', 0)).toEqual({ row: 0, col: 7 });
    expect(resolveHomeCoord('BLUE', 1)).toEqual({ row: 1, col: 6 });
    expect(resolveHomeCoord('BLUE', 2)).toEqual({ row: 2, col: 5 });
    expect(resolveHomeCoord('BLUE', 3)).toEqual({ row: 3, col: 4 });

    expect(resolveHomeCoord('YELLOW', 0)).toEqual({ row: 7, col: 7 });
    expect(resolveHomeCoord('YELLOW', 1)).toEqual({ row: 6, col: 6 });
    expect(resolveHomeCoord('YELLOW', 2)).toEqual({ row: 5, col: 5 });
    expect(resolveHomeCoord('YELLOW', 3)).toEqual({ row: 4, col: 4 });

    expect(resolveHomeCoord('GREEN', 0)).toEqual({ row: 7, col: 0 });
    expect(resolveHomeCoord('GREEN', 1)).toEqual({ row: 6, col: 1 });
    expect(resolveHomeCoord('GREEN', 2)).toEqual({ row: 5, col: 2 });
    expect(resolveHomeCoord('GREEN', 3)).toEqual({ row: 4, col: 3 });
  });

  it('keeps HOME(0) distinct but physically aligned with the owner corner', () => {
    expect(resolvePawnCoordinate({ zone: 'HOME', homeIndex: 0 }, { color: 'RED' })).toEqual({
      row: 0,
      col: 0,
    });
    expect(resolvePawnCoordinate({ zone: 'PERIMETER', progress: 0 }, { color: 'RED' })).toEqual({
      row: 0,
      col: 0,
    });
  });

  it('excludes off-board and removed pawns from physical coordinates', () => {
    expect(resolvePawnCoordinate({ zone: 'OFF_BOARD' }, { color: 'RED' })).toBeNull();
    expect(resolvePawnCoordinate({ zone: 'REMOVED' }, { color: 'RED' })).toBeNull();
  });
});
