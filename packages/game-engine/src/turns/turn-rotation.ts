import type { GameState } from '../domain/types.js';

export function getNextActivePlayerId(state: GameState, fromPlayerId: string): string | null {
  const seatOrderedPlayers = [...state.players].sort((left, right) => left.seatIndex - right.seatIndex);
  if (seatOrderedPlayers.length === 0) {
    return null;
  }

  const fromIndex = seatOrderedPlayers.findIndex((player) => player.playerId === fromPlayerId);
  if (fromIndex === -1) {
    return null;
  }

  for (let step = 1; step <= seatOrderedPlayers.length; step += 1) {
    const candidate = seatOrderedPlayers[(fromIndex + step) % seatOrderedPlayers.length]!;
    if (candidate.status === 'ACTIVE') {
      return candidate.playerId;
    }
  }

  return null;
}
