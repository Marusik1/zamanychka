import { describe, expect, it } from 'vitest';
import {
  NORMALIZED_PERIMETER_COORDS,
  PERIMETER_OFFSETS,
  resolvePerimeterCoord,
  resolvePerimeterIndex,
} from './perimeter.js';

describe('perimeter mapping', () => {
  it('defines the normalized 28-cell clockwise perimeter exactly once', () => {
    expect(NORMALIZED_PERIMETER_COORDS).toHaveLength(28);
    expect(
      new Set(NORMALIZED_PERIMETER_COORDS.map((coord) => `${coord.row},${coord.col}`)).size,
    ).toBe(28);
    expect(NORMALIZED_PERIMETER_COORDS).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 0, col: 4 },
      { row: 0, col: 5 },
      { row: 0, col: 6 },
      { row: 0, col: 7 },
      { row: 1, col: 7 },
      { row: 2, col: 7 },
      { row: 3, col: 7 },
      { row: 4, col: 7 },
      { row: 5, col: 7 },
      { row: 6, col: 7 },
      { row: 7, col: 7 },
      { row: 7, col: 6 },
      { row: 7, col: 5 },
      { row: 7, col: 4 },
      { row: 7, col: 3 },
      { row: 7, col: 2 },
      { row: 7, col: 1 },
      { row: 7, col: 0 },
      { row: 6, col: 0 },
      { row: 5, col: 0 },
      { row: 4, col: 0 },
      { row: 3, col: 0 },
      { row: 2, col: 0 },
      { row: 1, col: 0 },
    ]);
  });

  it('maps each color to the correct start coordinate and offset', () => {
    expect(PERIMETER_OFFSETS).toEqual({
      RED: 0,
      BLUE: 7,
      YELLOW: 14,
      GREEN: 21,
    });

    expect(resolvePerimeterCoord('RED', 0)).toEqual({ row: 0, col: 0 });
    expect(resolvePerimeterCoord('BLUE', 0)).toEqual({ row: 0, col: 7 });
    expect(resolvePerimeterCoord('YELLOW', 0)).toEqual({ row: 7, col: 7 });
    expect(resolvePerimeterCoord('GREEN', 0)).toEqual({ row: 7, col: 0 });
  });

  it('resolves boundary and representative intermediate progress values deterministically', () => {
    expect(resolvePerimeterCoord('RED', 27)).toEqual({ row: 1, col: 0 });
    expect(resolvePerimeterCoord('RED', 7)).toEqual({ row: 0, col: 7 });
    expect(resolvePerimeterCoord('BLUE', 1)).toEqual({ row: 1, col: 7 });
    expect(resolvePerimeterCoord('YELLOW', 14)).toEqual({ row: 0, col: 0 });
    expect(resolvePerimeterCoord('GREEN', 21)).toEqual({ row: 7, col: 7 });
    expect(resolvePerimeterCoord('GREEN', 27)).toEqual({ row: 7, col: 1 });
  });

  it('keeps progress in the player-relative 0..27 window', () => {
    expect(resolvePerimeterIndex('RED', 0)).toBe(0);
    expect(resolvePerimeterIndex('RED', 27)).toBe(27);
    expect(resolvePerimeterIndex('BLUE', 0)).toBe(7);
    expect(resolvePerimeterIndex('YELLOW', 0)).toBe(14);
    expect(resolvePerimeterIndex('GREEN', 0)).toBe(21);
  });

  it('throws on out of range progress values', () => {
    expect(() => resolvePerimeterCoord('RED', -1)).toThrow(RangeError);
    expect(() => resolvePerimeterCoord('RED', 28)).toThrow(RangeError);
    expect(() => resolvePerimeterCoord('RED', 1.5)).toThrow(RangeError);
  });
});
