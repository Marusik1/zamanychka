import { describe, expect, it } from 'vitest';

import {
  createActiveGameState,
  type GameState,
  type PawnState,
} from '@zamanushka/game-engine';

import {
  projectBoardCoord,
  projectGameScreenModel,
  projectPawnPosition,
} from './domain.js';

function withPawnPositions(state: GameState, positions: readonly PawnState['position'][]) {
  return {
    ...state,
    pawns: state.pawns.map((pawn, index) => ({
      ...pawn,
      position: positions[index] ?? pawn.position,
    })),
  } satisfies GameState;
}

describe('game screen domain', () => {
  it('projects frozen board coordinates deterministically', () => {
    expect(projectBoardCoord({ row: 0, col: 0 })).toBe('0:0');
    expect(projectBoardCoord({ row: 0, col: 7 })).toBe('0:7');
    expect(projectBoardCoord({ row: 7, col: 7 })).toBe('7:7');
    expect(projectBoardCoord({ row: 7, col: 0 })).toBe('7:0');
  });

  it('projects the canonical HOME coordinates for each player color', () => {
    const state = createActiveGameState({
      playerCount: 4,
      seatOrder: ['p1', 'p2', 'p3', 'p4'],
      firstPlayerId: 'p1',
    });
    const playersById = new Map(state.players.map((player) => [player.playerId, player]));

    const homePositions: readonly PawnState['position'][] = [
      { zone: 'HOME', homeIndex: 0 },
      { zone: 'HOME', homeIndex: 1 },
      { zone: 'HOME', homeIndex: 2 },
      { zone: 'HOME', homeIndex: 3 },
    ];

    const projected = withPawnPositions(state, [
      homePositions[0]!,
      homePositions[1]!,
      homePositions[2]!,
      homePositions[3]!,
      homePositions[0]!,
      homePositions[1]!,
      homePositions[2]!,
      homePositions[3]!,
      homePositions[0]!,
      homePositions[1]!,
      homePositions[2]!,
      homePositions[3]!,
      homePositions[0]!,
      homePositions[1]!,
      homePositions[2]!,
      homePositions[3]!,
    ]);

    const owner0 = playersById.get('p1');
    const owner1 = playersById.get('p2');
    const owner2 = playersById.get('p3');
    const owner3 = playersById.get('p4');
    expect(owner0).toBeTruthy();
    expect(owner1).toBeTruthy();
    expect(owner2).toBeTruthy();
    expect(owner3).toBeTruthy();

    expect(projectPawnPosition(projected, projected.pawns[0]!, 'p1').coordKey).toBe('0:0');
    expect(projectPawnPosition(projected, projected.pawns[1]!, 'p1').coordKey).toBe('1:1');
    expect(projectPawnPosition(projected, projected.pawns[4]!, 'p2').coordKey).toBe('0:7');
    expect(projectPawnPosition(projected, projected.pawns[5]!, 'p2').coordKey).toBe('1:6');
    expect(projectPawnPosition(projected, projected.pawns[8]!, 'p3').coordKey).toBe('7:7');
    expect(projectPawnPosition(projected, projected.pawns[9]!, 'p3').coordKey).toBe('6:6');
    expect(projectPawnPosition(projected, projected.pawns[12]!, 'p4').coordKey).toBe('7:0');
    expect(projectPawnPosition(projected, projected.pawns[13]!, 'p4').coordKey).toBe('6:1');
  });

  it('projects all HOME indexes for RED and YELLOW without inventing a second home algorithm', () => {
    const state = createActiveGameState({
      playerCount: 4,
      seatOrder: ['p1', 'p2', 'p3', 'p4'],
      firstPlayerId: 'p1',
    });

    const projected = withPawnPositions(state, [
      { zone: 'HOME', homeIndex: 0 },
      { zone: 'HOME', homeIndex: 1 },
      { zone: 'HOME', homeIndex: 2 },
      { zone: 'HOME', homeIndex: 3 },
      { zone: 'OFF_BOARD' },
      { zone: 'OFF_BOARD' },
      { zone: 'OFF_BOARD' },
      { zone: 'OFF_BOARD' },
      { zone: 'HOME', homeIndex: 0 },
      { zone: 'HOME', homeIndex: 1 },
      { zone: 'HOME', homeIndex: 2 },
      { zone: 'HOME', homeIndex: 3 },
      { zone: 'OFF_BOARD' },
      { zone: 'OFF_BOARD' },
      { zone: 'OFF_BOARD' },
      { zone: 'OFF_BOARD' },
    ]);

    expect(projectPawnPosition(projected, projected.pawns[0]!, 'p1').coordKey).toBe('0:0');
    expect(projectPawnPosition(projected, projected.pawns[1]!, 'p1').coordKey).toBe('1:1');
    expect(projectPawnPosition(projected, projected.pawns[2]!, 'p1').coordKey).toBe('2:2');
    expect(projectPawnPosition(projected, projected.pawns[3]!, 'p1').coordKey).toBe('3:3');

    expect(projectPawnPosition(projected, projected.pawns[8]!, 'p1').coordKey).toBe('7:7');
    expect(projectPawnPosition(projected, projected.pawns[9]!, 'p1').coordKey).toBe('6:6');
    expect(projectPawnPosition(projected, projected.pawns[10]!, 'p1').coordKey).toBe('5:5');
    expect(projectPawnPosition(projected, projected.pawns[11]!, 'p1').coordKey).toBe('4:4');
  });

  it('projects local-player and participant state without inventing gameplay rules', () => {
    const state = createActiveGameState({
      playerCount: 2,
      seatOrder: ['p1', 'p2'],
      firstPlayerId: 'p2',
    });

    const model = projectGameScreenModel(state, 'p1');
    expect(model.localPlayerId).toBe('p1');
    expect(model.localPlayer?.isLocalPlayer).toBe(true);
    expect(model.localPlayer?.isCurrentPlayer).toBe(false);
    expect(model.players).toHaveLength(2);
    expect(model.players.find((player) => player.playerId === 'p2')?.isCurrentPlayer).toBe(true);
    expect(model.pawns).toHaveLength(8);
    expect(model.boardCells).toHaveLength(0);
  });
});
