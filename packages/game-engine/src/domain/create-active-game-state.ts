import type {
  CreateActiveGameStateConfig,
  GameState,
  PawnState,
  PlayerColor,
  PlayerState,
} from './types.js';

const COLOR_BY_PLAYER_COUNT: Record<2 | 3 | 4, readonly PlayerColor[]> = {
  2: ['RED', 'YELLOW'],
  3: ['RED', 'BLUE', 'GREEN'],
  4: ['RED', 'BLUE', 'YELLOW', 'GREEN'],
};

function assertValidSeatOrder(config: CreateActiveGameStateConfig): void {
  const { seatOrder, playerCount, firstPlayerId } = config;
  if (seatOrder.length !== playerCount) {
    throw new Error(`seatOrder length must match playerCount (${playerCount})`);
  }
  const uniqueSeats = new Set(seatOrder);
  if (uniqueSeats.size !== seatOrder.length) {
    throw new Error('seatOrder must contain unique player ids');
  }
  if (!seatOrder.includes(firstPlayerId)) {
    throw new Error('firstPlayerId must be present in seatOrder');
  }
}

function createPlayers(config: CreateActiveGameStateConfig): readonly PlayerState[] {
  const colors = COLOR_BY_PLAYER_COUNT[config.playerCount];
  const players: PlayerState[] = [];

  for (let index = 0; index < config.seatOrder.length; index += 1) {
    const playerId = config.seatOrder[index];
    const color = colors[index];
    if (!playerId || !color) {
      throw new Error('invalid seat order or player color mapping');
    }
    players.push({
      playerId,
      color,
      seatIndex: index as 0 | 1 | 2 | 3,
      status: 'ACTIVE',
    });
  }

  return players;
}

function createPawns(players: readonly PlayerState[]): readonly PawnState[] {
  return players.flatMap((player) =>
    Array.from({ length: 4 }, (_, pawnIndex) => ({
      pawnId: `${player.playerId}-pawn-${pawnIndex + 1}`,
      playerId: player.playerId,
      color: player.color,
      position: { zone: 'OFF_BOARD' as const },
    })),
  );
}

export function createActiveGameState(config: CreateActiveGameStateConfig): GameState {
  assertValidSeatOrder(config);

  const players = createPlayers(config);
  const currentPlayerId = config.firstPlayerId;
  const pawns = createPawns(players);

  return {
    status: 'ACTIVE',
    stateVersion: 0,
    turnNumber: 1,
    turnPhase: 'WAITING_FOR_ROLL',
    currentPlayerId,
    diceValue: null,
    winnerPlayerId: null,
    winReason: null,
    players,
    pawns,
  };
}
