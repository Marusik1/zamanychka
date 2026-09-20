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

  const random = options.random ?? Math.random;

  const rolls = legalActions.filter((action) => action.type === 'ROLL_DICE');
  if (rolls.length > 0) return randomPick(rolls, random);

  return randomPick(legalActions, random);
}
