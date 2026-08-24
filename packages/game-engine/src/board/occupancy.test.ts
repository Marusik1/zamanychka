import { describe, expect, it } from 'vitest';
import { getOccupancy } from './occupancy.js';

describe('occupancy', () => {
  it('projects mixed perimeter and home pawns into unified physical occupancy', () => {
    const result = getOccupancy(
      [
        {
          pawnId: 'r1',
          playerId: 'p1',
          color: 'RED',
          position: { zone: 'PERIMETER', progress: 0 },
        },
        { pawnId: 'r2', playerId: 'p1', color: 'RED', position: { zone: 'HOME', homeIndex: 1 } },
        {
          pawnId: 'b1',
          playerId: 'p2',
          color: 'BLUE',
          position: { zone: 'PERIMETER', progress: 0 },
        },
        { pawnId: 'x1', playerId: 'p3', color: 'GREEN', position: { zone: 'OFF_BOARD' } },
        { pawnId: 'x2', playerId: 'p4', color: 'YELLOW', position: { zone: 'REMOVED' } },
      ],
      [
        { playerId: 'p1', color: 'RED' },
        { playerId: 'p2', color: 'BLUE' },
        { playerId: 'p3', color: 'GREEN' },
        { playerId: 'p4', color: 'YELLOW' },
      ],
    );

    expect(result.cells).toEqual([
      {
        coord: { row: 0, col: 0 },
        occupants: [
          expect.objectContaining({ pawnId: 'r1', zone: 'PERIMETER', semanticZone: 'PERIMETER' }),
        ],
      },
      {
        coord: { row: 0, col: 7 },
        occupants: [
          expect.objectContaining({ pawnId: 'b1', zone: 'PERIMETER', semanticZone: 'PERIMETER' }),
        ],
      },
      {
        coord: { row: 1, col: 1 },
        occupants: [expect.objectContaining({ pawnId: 'r2', zone: 'HOME', semanticZone: 'HOME' })],
      },
    ]);
    expect(result.conflicts).toHaveLength(0);
  });

  it('surfaces duplicate physical occupancy instead of overwriting it', () => {
    const result = getOccupancy(
      [
        {
          pawnId: 'r1',
          playerId: 'p1',
          color: 'RED',
          position: { zone: 'PERIMETER', progress: 0 },
        },
        { pawnId: 'r2', playerId: 'p1', color: 'RED', position: { zone: 'HOME', homeIndex: 0 } },
      ],
      [{ playerId: 'p1', color: 'RED' }],
    );

    expect(result.cells).toHaveLength(1);
    expect(result.cells[0]?.occupants).toHaveLength(2);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.coord).toEqual({ row: 0, col: 0 });
  });
});
