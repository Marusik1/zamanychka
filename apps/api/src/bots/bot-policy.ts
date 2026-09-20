import type { BotLegalAction } from './types.js';

export interface ChooseBotActionOptions {
  random?: () => number;
}

function randomPick<T>(items: readonly T[], random: () => number): T {
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[index]!;
}

export function chooseBotAction(
  legalActions: readonly BotLegalAction[],
  options: ChooseBotActionOptions = {},
): BotLegalAction | null {
  if (legalActions.length === 0) return null;
  if (legalActions.length === 1) return legalActions[0]!;

  const random = options.random ?? Math.random;

  const rolls = legalActions.filter((action) => action.type === 'ROLL_DICE');
  if (rolls.length > 0) return randomPick(rolls, random);

  const captures = legalActions.filter((action) => action.capturesOpponent === true);
  if (captures.length > 0) return randomPick(captures, random);

  const enters = legalActions.filter((action) => action.type === 'ENTER_PAWN');
  if (enters.length > 0) return randomPick(enters, random);

  const scored = legalActions
    .filter((action) => Number.isFinite(action.progressScore))
    .sort((a, b) => (b.progressScore ?? 0) - (a.progressScore ?? 0));

  if (scored.length > 0) {
    const bestScore = scored[0]!.progressScore;
    const best = scored.filter((action) => action.progressScore === bestScore);
    return randomPick(best, random);
  }

  return randomPick(legalActions, random);
}
