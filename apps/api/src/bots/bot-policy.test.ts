import { describe, expect, it } from 'vitest';
import { chooseBotAction } from './bot-policy.js';

describe('bot policy', () => {
  it('chooses only from legal actions and prefers authoritative roll actions', () => {
    expect(
      chooseBotAction([
        { type: 'MOVE_PAWN', pawnId: 'p1', progressScore: 10 },
        { type: 'ROLL_DICE' },
      ]),
    ).toEqual({ type: 'ROLL_DICE' });
  });

  it('chooses one non-roll legal pawn action randomly after the authoritative roll', () => {
    expect(
      chooseBotAction([
        { type: 'MOVE_PAWN', pawnId: 'p1', progressScore: 20 },
        { type: 'MOVE_PAWN', pawnId: 'p2', capturesOpponent: true, progressScore: 5 },
      ], { random: () => 0 }),
    ).toEqual({ type: 'MOVE_PAWN', pawnId: 'p1', progressScore: 20 });

    expect(
      chooseBotAction([
        { type: 'ENTER_PAWN', pawnId: 'p1' },
        { type: 'MOVE_PAWN', pawnId: 'p2', capturesOpponent: true, progressScore: 5 },
      ], { random: () => 0.99 }),
    ).toEqual({ type: 'MOVE_PAWN', pawnId: 'p2', capturesOpponent: true, progressScore: 5 });
  });
});
