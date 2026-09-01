import {
  resolvePawnCoordinate,
  type BoardCoord,
  type GameState,
  type LegalAction,
  type PawnPosition,
  type PawnState,
  type PlayerState,
} from '@zamanushka/game-engine';

import { createLegalActionAdapter } from './legal-action-adapter.js';

export type BoardCoordKey = `${BoardCoord['row']}:${BoardCoord['col']}`;

export type GameScreenPlayerView = Readonly<{
  playerId: string;
  color: PlayerState['color'];
  seatIndex: PlayerState['seatIndex'];
  status: PlayerState['status'];
  isLocalPlayer: boolean;
  isCurrentPlayer: boolean;
  isWinner: boolean;
  pawnCount: number;
}>;

export type GameScreenPawnView = Readonly<{
  pawnId: string;
  playerId: string;
  color: PawnState['color'];
  position: PawnPosition;
  coord: BoardCoord | null;
  coordKey: BoardCoordKey | null;
  isLocalPlayerPawn: boolean;
}>;

export type GameScreenBoardOccupantView = Readonly<{
  pawnId: string;
  playerId: string;
  color: PawnState['color'];
  position: PawnPosition;
  coord: BoardCoord;
  coordKey: BoardCoordKey;
  isLocalPlayerPawn: boolean;
}>;

export type GameScreenBoardCellView = Readonly<{
  coord: BoardCoord;
  coordKey: BoardCoordKey;
  occupants: readonly GameScreenBoardOccupantView[];
}>;

export type GameScreenModel = Readonly<{
  localPlayerId: string;
  localPlayer: GameScreenPlayerView | null;
  players: readonly GameScreenPlayerView[];
  pawns: readonly GameScreenPawnView[];
  boardCells: readonly GameScreenBoardCellView[];
  legalTurnActions: readonly LegalAction[];
  legalActions: readonly LegalAction[];
}>;

function boardCoordKey(coord: BoardCoord): BoardCoordKey {
  return `${coord.row}:${coord.col}`;
}

function isCurrentPlayer(state: GameState, playerId: string): boolean {
  return state.currentPlayerId === playerId;
}

function isWinner(state: GameState, playerId: string): boolean {
  return state.winnerPlayerId === playerId;
}

function projectPawnCoord(
  state: GameState,
  pawn: PawnState,
): { coord: BoardCoord; coordKey: BoardCoordKey } | null {
  const owner = state.players.find((player) => player.playerId === pawn.playerId);
  if (!owner) {
    return null;
  }

  const coord = resolvePawnCoordinate(pawn.position, owner);
  if (!coord) {
    return null;
  }

  return { coord, coordKey: boardCoordKey(coord) };
}

function projectPlayer(state: GameState, player: PlayerState, localPlayerId: string): GameScreenPlayerView {
  return {
    playerId: player.playerId,
    color: player.color,
    seatIndex: player.seatIndex,
    status: player.status,
    isLocalPlayer: player.playerId === localPlayerId,
    isCurrentPlayer: isCurrentPlayer(state, player.playerId),
    isWinner: isWinner(state, player.playerId),
    pawnCount: state.pawns.filter((pawn) => pawn.playerId === player.playerId && pawn.position.zone !== 'REMOVED')
      .length,
  };
}

export function projectBoardCoord(coord: BoardCoord): BoardCoordKey {
  return boardCoordKey(coord);
}

export function projectPawnPosition(
  state: GameState,
  pawn: PawnState,
  localPlayerId: string,
): GameScreenPawnView {
  const projected = projectPawnCoord(state, pawn);
  return {
    pawnId: pawn.pawnId,
    playerId: pawn.playerId,
    color: pawn.color,
    position: pawn.position,
    coord: projected?.coord ?? null,
    coordKey: projected?.coordKey ?? null,
    isLocalPlayerPawn: pawn.playerId === localPlayerId,
  };
}

export function projectGameScreenModel(state: GameState, localPlayerId: string): GameScreenModel {
  const players = state.players.map((player) => projectPlayer(state, player, localPlayerId));
  const pawns = state.pawns.map((pawn) => projectPawnPosition(state, pawn, localPlayerId));
  const legalActions = createLegalActionAdapter(state, localPlayerId);

  const occupied = new Map<BoardCoordKey, GameScreenBoardOccupantView[]>();
  for (const pawn of pawns) {
    if (!pawn.coord || !pawn.coordKey || pawn.position.zone === 'OFF_BOARD' || pawn.position.zone === 'REMOVED') {
      continue;
    }
    const occupants = occupied.get(pawn.coordKey) ?? [];
    occupants.push({
      pawnId: pawn.pawnId,
      playerId: pawn.playerId,
      color: pawn.color,
      position: pawn.position,
      coord: pawn.coord,
      coordKey: pawn.coordKey,
      isLocalPlayerPawn: pawn.isLocalPlayerPawn,
    });
    occupied.set(pawn.coordKey, occupants);
  }

  return {
    localPlayerId,
    localPlayer: players.find((player) => player.playerId === localPlayerId) ?? null,
    players,
    pawns,
    boardCells: [...occupied.entries()].map(([coordKey, occupants]) => {
      const [row, col] = coordKey.split(':').map((value) => Number(value)) as [number, number];
      return {
        coord: { row: row as BoardCoord['row'], col: col as BoardCoord['col'] },
        coordKey,
        occupants,
      };
    }),
    legalTurnActions: legalActions.legalTurnActions,
    legalActions: legalActions.legalActions,
  };
}
