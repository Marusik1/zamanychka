import type { GameState, PlayerState, WinReason } from '../domain/types.js';

function getPlayer(state: GameState, playerId: string): PlayerState | null {
  return state.players.find((player) => player.playerId === playerId) ?? null;
}

export function isWinningState(state: GameState, playerId: string): boolean {
  const player = getPlayer(state, playerId);
  if (!player) {
    return false;
  }

  const homePawns = state.pawns.filter(
    (pawn) => pawn.playerId === playerId && pawn.position.zone === 'HOME',
  );
  const allHomeIndices = new Set(
    state.pawns
      .filter((pawn) => pawn.playerId === playerId && pawn.position.zone === 'HOME')
      .map((pawn) => (pawn.position.zone === 'HOME' ? pawn.position.homeIndex : undefined))
      .filter((homeIndex): homeIndex is 0 | 1 | 2 | 3 => homeIndex !== undefined),
  );
  if (homePawns.length === 4 && allHomeIndices.size === 4) {
    return true;
  }

  const activePlayers = state.players.filter((candidate) => candidate.status === 'ACTIVE');
  return activePlayers.length === 1 && activePlayers[0]?.playerId === playerId;
}

export function projectTerminalState(
  state: GameState,
  winnerPlayerId: string,
  reason: WinReason,
): GameState {
  return {
    ...state,
    status: 'FINISHED',
    winnerPlayerId,
    winReason: reason,
    currentPlayerId: null,
    turnPhase: null,
    diceValue: null,
    players: state.players.map((player) =>
      player.status === 'SURRENDERED'
        ? player
        : {
            ...player,
            status:
              player.playerId === winnerPlayerId || player.status === 'ACTIVE'
                ? 'FINISHED'
                : player.status,
          },
    ),
  };
}
