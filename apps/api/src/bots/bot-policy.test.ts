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

  it('prefers capture actions after roll actions are unavailable', () => {
    expect(
      chooseBotAction([
        { type: 'MOVE_PAWN', pawnId: 'p1', progressScore: 20 },
        { type: 'MOVE_PAWN', pawnId: 'p2', capturesOpponent: true, progressScore: 5 },
      ]),
    ).toEqual({ type: 'MOVE_PAWN', pawnId: 'p2', capturesOpponent: true, progressScore: 5 });
  });
});
