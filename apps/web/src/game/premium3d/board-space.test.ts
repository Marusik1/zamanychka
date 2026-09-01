import { describe, expect, it } from 'vitest';

import { boardCoordToWorld } from './board-space.js';

describe('premium3d board space', () => {
  it('maps the top-left and bottom-right board cells symmetrically', () => {
    expect(boardCoordToWorld({ row: 0, col: 0 })).toEqual({ x: -3.5, y: 3.5 });
    expect(boardCoordToWorld({ row: 7, col: 7 })).toEqual({ x: 3.5, y: -3.5 });
  });

  it('keeps cell centers one world unit apart', () => {
    expect(boardCoordToWorld({ row: 4, col: 4 })).toEqual({ x: 0.5, y: -0.5 });
    expect(boardCoordToWorld({ row: 4, col: 5 })).toEqual({ x: 1.5, y: -0.5 });
  });
});
