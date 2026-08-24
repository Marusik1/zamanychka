import type { GameCommand, GameState, GameTransitionResult } from '../domain/types.js';
import { enterOrMovePawnTransition } from './pawn.js';
import { rollDiceTransition } from './roll-dice.js';
import { surrenderTransition } from './surrender.js';

export function transition(state: GameState, command: GameCommand, context: { actorPlayerId: string; diceValue?: 1 | 2 | 3 | 4 | 5 | 6 }): GameTransitionResult {
  switch (command.type) {
    case 'ROLL_DICE':
      return rollDiceTransition(state, command, context);
    case 'ENTER_PAWN':
    case 'MOVE_PAWN':
      return enterOrMovePawnTransition(state, command, context);
    case 'SURRENDER':
      return surrenderTransition(state, command, context);
    default:
      return {
        ok: false,
        code: 'INVALID_COMMAND',
        message: 'command not implemented in Task 7',
      };
  }
}
