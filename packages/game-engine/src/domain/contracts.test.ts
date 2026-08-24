import { expectTypeOf, describe, it } from 'vitest';
import type * as contracts from './contracts.js';
import type { GameEvent, GameTransitionError, GameTransitionResult } from './types.js';

describe('canonical contracts', () => {
  it('stay owned by packages/game-engine and are typecheck-visible', () => {
    expectTypeOf<contracts.GameEvent>().toEqualTypeOf<GameEvent>();
    expectTypeOf<contracts.GameTransitionError>().toEqualTypeOf<GameTransitionError>();
    expectTypeOf<contracts.GameTransitionResult>().toEqualTypeOf<GameTransitionResult>();
  });
});
