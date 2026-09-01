import { describe, expect, it, vi } from 'vitest';

vi.mock('@zamanushka/game-engine', async () => {
  const actual = await vi.importActual<typeof import('@zamanushka/game-engine')>(
    '@zamanushka/game-engine',
  );
  return {
    ...actual,
    getLegalActions: vi.fn(() => [{ type: 'SURRENDER' }]),
    getLegalTurnActions: vi.fn(() => [{ type: 'ROLL_DICE' }]),
  };
});
import {
  createActiveGameState,
  getLegalActions,
  getLegalTurnActions,
} from '@zamanushka/game-engine';

import { createLegalActionAdapter } from './legal-action-adapter.js';

describe('legal-action adapter', () => {
  it('projects canonical engine legal actions for the local player', () => {
    const state = createActiveGameState({
      playerCount: 2,
      seatOrder: ['p1', 'p2'],
      firstPlayerId: 'p1',
    });

    const adapter = createLegalActionAdapter(state, 'p1');
    expect(adapter.legalTurnActions).toEqual([{ type: 'ROLL_DICE' }]);
    expect(adapter.legalActions).toEqual([{ type: 'SURRENDER' }]);
  });

  it('delegates to the canonical game-engine API instead of copying legality rules in web code', () => {
    const state = createActiveGameState({
      playerCount: 2,
      seatOrder: ['p1', 'p2'],
      firstPlayerId: 'p1',
    });

    const adapter = createLegalActionAdapter(state, 'p1');
    expect(getLegalTurnActions).toHaveBeenCalledWith(state, 'p1');
    expect(getLegalActions).toHaveBeenCalledWith(state, 'p1');
    expect(adapter).toEqual({
      legalTurnActions: [{ type: 'ROLL_DICE' }],
      legalActions: [{ type: 'SURRENDER' }],
    });
  });
});
