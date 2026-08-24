import type { GameTransitionError, GameTransitionErrorCode } from '../domain/types.js';

export const gameTransitionErrors = {
  create(code: GameTransitionErrorCode, message: string): GameTransitionError {
    return { ok: false, code, message };
  },
} as const;
