import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { GameScreenPawnView } from './domain.js';
import { GamePawn } from './pawns.js';

describe('GamePawn', () => {
  it('renders readable ownership states for each pawn color and zone', () => {
    const sample: readonly GameScreenPawnView[] = [
      {
        pawnId: 'red-off',
        playerId: 'p1',
        color: 'RED',
        position: { zone: 'OFF_BOARD' },
        coord: null,
        coordKey: null,
        isLocalPlayerPawn: true,
      },
      {
        pawnId: 'blue-home',
        playerId: 'p2',
        color: 'BLUE',
        position: { zone: 'HOME', homeIndex: 1 },
        coord: { row: 1, col: 6 },
        coordKey: '1:6',
        isLocalPlayerPawn: false,
      },
      {
        pawnId: 'green-removed',
        playerId: 'p3',
        color: 'GREEN',
        position: { zone: 'REMOVED' },
        coord: null,
        coordKey: null,
        isLocalPlayerPawn: false,
      },
      {
        pawnId: 'yellow-board',
        playerId: 'p4',
        color: 'YELLOW',
        position: { zone: 'PERIMETER', progress: 13 },
        coord: { row: 7, col: 6 },
        coordKey: '7:6',
        isLocalPlayerPawn: false,
      },
    ];

    render(
      <div>
        {sample.map((pawn) => (
          <GamePawn key={pawn.pawnId} pawn={pawn} />
        ))}
      </div>,
    );

    expect(screen.getByTestId('red-off')).toHaveClass(
      'game-pawn',
      'game-pawn--red',
      'game-pawn--reserve',
    );
    expect(screen.getByTestId('blue-home')).toHaveClass(
      'game-pawn',
      'game-pawn--blue',
      'game-pawn--home',
    );
    expect(screen.getByTestId('green-removed')).toHaveClass(
      'game-pawn',
      'game-pawn--green',
      'game-pawn--removed',
    );
    expect(screen.getByTestId('yellow-board')).toHaveClass('game-pawn', 'game-pawn--yellow');
  });
  it('exposes presentation-only motion hooks without changing pawn identity', () => {
    const pawn: GameScreenPawnView = {
      pawnId: 'green-motion',
      playerId: 'p3',
      color: 'GREEN',
      position: { zone: 'PERIMETER', progress: 3 },
      coord: { row: 7, col: 3 },
      coordKey: '7:3',
      isLocalPlayerPawn: true,
    };

    render(<GamePawn pawn={pawn} motion="captured" size="board" />);

    expect(screen.getByTestId('green-motion')).toHaveClass(
      'game-pawn--motion-captured',
      'game-pawn--board',
    );
    expect(screen.getByTestId('green-motion')).toHaveAttribute('data-motion', 'captured');
    expect(screen.getByTestId('green-motion')).toHaveAttribute('data-pawn-id', pawn.pawnId);
  });
});
