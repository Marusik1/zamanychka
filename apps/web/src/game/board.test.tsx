import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GameScreenPawnView } from './domain.js';
import { GameBoard } from './board.js';

const pawns: readonly GameScreenPawnView[] = [
  {
    pawnId: 'p1-1',
    playerId: 'p1',
    color: 'RED',
    position: { zone: 'PERIMETER', progress: 0 },
    coord: { row: 0, col: 0 },
    coordKey: '0:0',
    isLocalPlayerPawn: true,
  },
  {
    pawnId: 'p2-1',
    playerId: 'p2',
    color: 'BLUE',
    position: { zone: 'HOME', homeIndex: 2 },
    coord: { row: 2, col: 5 },
    coordKey: '2:5',
    isLocalPlayerPawn: false,
  },
  {
    pawnId: 'p3-1',
    playerId: 'p3',
    color: 'GREEN',
    position: { zone: 'OFF_BOARD' },
    coord: null,
    coordKey: null,
    isLocalPlayerPawn: false,
  },
  {
    pawnId: 'p4-1',
    playerId: 'p4',
    color: 'YELLOW',
    position: { zone: 'REMOVED' },
    coord: null,
    coordKey: null,
    isLocalPlayerPawn: false,
  },
];

describe('GameBoard', () => {
  it('renders exactly 64 board cells with alternating material tones', () => {
    render(<GameBoard pawns={pawns} />);
    expect(screen.getAllByRole('gridcell')).toHaveLength(64);
    expect(screen.getByRole('grid').querySelectorAll('[data-tone="light"]')).toHaveLength(32);
    expect(screen.getByRole('grid').querySelectorAll('[data-tone="dark"]')).toHaveLength(32);
  });

  it('renders canonical corner and HOME occupants in the expected cells', () => {
    render(<GameBoard pawns={pawns} />);
    expect(screen.getByRole('grid').querySelector('[data-cell="0:0"] [data-pawn-id="p1-1"]')).not.toBeNull();
    expect(screen.getByRole('grid').querySelector('[data-cell="2:5"] [data-pawn-id="p2-1"]')).not.toBeNull();
    expect(screen.getByRole('grid').querySelector('[data-cell="0:0"]')).toHaveAttribute('data-tone', 'light');
    expect(screen.getByRole('grid').querySelector('[data-cell="0:1"]')).toHaveAttribute('data-tone', 'dark');
  });

  it('clears the transient pawn-control focus before its authoritative action can replace the button', () => {
    const onPawnSelect = vi.fn();
    render(<GameBoard pawns={pawns} actionablePawnIds={['p1-1']} onPawnSelect={onPawnSelect} />);

    const pawnButton = screen.getByRole('button', { name: 'Пешка p1-1' });
    pawnButton.focus();
    fireEvent.click(pawnButton);

    expect(onPawnSelect).toHaveBeenCalledWith('p1-1');
    expect(document.activeElement).not.toBe(pawnButton);
  });

  it('renders the restored 8x8 board grid container and visible HOME guide tiles', () => {
    const { container } = render(<GameBoard pawns={pawns} />);

    expect(container.querySelector('.game-board-scene__board.premium-board-grid')).not.toBeNull();
    expect(container.querySelectorAll('.game-board-scene__home-tile')).toHaveLength(16);
  });

  it('keeps ENTER, MOVE, CAPTURE, and HOME visuals inside one board-contained overlay layer', () => {
    const { container } = render(
      <GameBoard
        pawns={pawns}
        presentation={{
          pawnVisuals: {
            enter: {
              pawnId: 'p1-1', playerId: 'p1', color: 'RED', motion: 'entering',
              anchor: { kind: 'reserve', color: 'RED', slot: 0 }, position: { zone: 'OFF_BOARD' },
            },
            move: {
              pawnId: 'p2-1', playerId: 'p2', color: 'BLUE', motion: 'moving',
              anchor: { kind: 'board', coord: { row: 2, col: 5 } }, position: { zone: 'HOME', homeIndex: 2 },
            },
            capture: {
              pawnId: 'p3-1', playerId: 'p3', color: 'GREEN', motion: 'captured',
              anchor: { kind: 'board', coord: { row: 3, col: 4 } }, position: { zone: 'PERIMETER', progress: 4 },
            },
            home: {
              pawnId: 'p4-1', playerId: 'p4', color: 'YELLOW', motion: 'home-cue',
              anchor: { kind: 'board', coord: { row: 5, col: 4 } }, position: { zone: 'HOME', homeIndex: 0 },
            },
          },
          hiddenPawnIds: [], cellCue: null, toast: null, dieRolling: false, dieValue: 4,
          victoryPlayerId: null, victoryReason: null, currentPlayerId: 'p1', interactionLocked: true,
        }}
      />,
    );

    const layer = container.querySelector('[data-animation-layer="board-contained"]');
    const grid = screen.getByRole('grid');
    expect(layer).not.toBeNull();
    expect(layer?.querySelectorAll('.game-board-scene__overlay-pawn')).toHaveLength(4);
    expect(layer?.querySelector('.game-board-scene__overlay')).not.toBeNull();
    expect(grid.querySelector('.game-board-scene__overlay')).not.toBeNull();
    expect(grid.querySelector('[data-anchor="board:2:5"]')).toHaveStyle({ left: '68.75%', top: '31.25%' });
    expect(grid.querySelector('[data-anchor="board:2:5"]')).not.toHaveStyle('--anchor-x: 68.75%');
  });

  it('keeps reserves and removed pawns outside the active board grid', () => {
    render(<GameBoard pawns={pawns} />);
    const board = screen.getByLabelText('Игровое поле');

    expect(screen.getByLabelText('Игроки')).toBeVisible();
    expect(screen.getByLabelText('Действия')).toBeVisible();
    expect(screen.getByText('Снятые')).toBeVisible();
    expect(board).toBeVisible();
    expect(board.querySelector('[data-pawn-id="p3-1"]')).toBeNull();
    expect(board.querySelector('[data-pawn-id="p4-1"]')).toBeNull();
  });
  it('keeps victory reveal inside the board zone instead of duplicating it in the action rail', () => {
    const { container } = render(<GameBoard pawns={pawns} victoryPlayerId="p1" />);

    expect(screen.queryByText(/Р¤РёРЅР°Р»СЊРЅР°СЏ РїРѕР·РёС†РёСЏ СЃРѕС…СЂР°РЅРµРЅР°/i)).toBeNull();
    expect(container.querySelectorAll('.game-board-scene__victory-card')).toHaveLength(1);
  });
  it('opens a mobile chat sheet without replacing the gameplay board state', () => {
    const close = vi.fn();
    render(
      <GameBoard
        pawns={pawns}
        mobileChatOpen
        onMobileChatClose={close}
        chatPanel={<section><h2>Чат комнаты</h2><input aria-label="Сообщение" /></section>}
      />,
    );

    expect(screen.getByRole('grid')).toBeVisible();
    expect(screen.getByLabelText('Вернуться к игре')).toBeVisible();
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    fireEvent.click(screen.getByLabelText('Вернуться к игре'));
    expect(close).toHaveBeenCalledOnce();
  });
  it('renders fallback initials instead of fixture portrait files when no real avatar url is provided', () => {
    render(<GameBoard pawns={pawns} playerNamesById={{ p1: 'Player One', p2: 'Player Two' }} />);

    expect(screen.getByText('PO')).toBeVisible();
    expect(screen.getByText('PT')).toBeVisible();
    expect(document.querySelectorAll('img.game-board-scene__avatar-portrait')).toHaveLength(0);
  });
});

describe('GameBoard exact-reference cues', () => {
  it('renders the restored DOM pawn renderer directly on the board without a separate 3D pawn layer', () => {
    const { container } = render(<GameBoard pawns={pawns} />);

    expect(container.querySelector('.premium-pawn-layer')).toBeNull();
    expect(screen.getByRole('grid').querySelector('[data-pawn-id="p1-1"] .game-pawn__svg')).not.toBeNull();
  });

  it('renders compact local board cues instead of the legacy oversized pulse overlay', () => {
    const { container } = render(
      <GameBoard
        pawns={pawns}
        presentation={{
          pawnVisuals: {},
          hiddenPawnIds: [],
          cellCue: { coord: { row: 2, col: 5 }, tone: 'capture' },
          toast: null,
          dieRolling: false,
          dieValue: 4,
          victoryPlayerId: null,
          victoryReason: null,
          currentPlayerId: 'p1',
          interactionLocked: false,
        }}
      />,
    );

    expect(container.querySelector('.game-board-scene__cue')).toBeNull();
    expect(container.querySelector('.game-board-scene__impact-ring')).not.toBeNull();
  });

  it('renders only the compact board-top capture toast and no center-board caption', () => {
    const { container } = render(
      <GameBoard
        pawns={pawns}
        presentation={{
          pawnVisuals: {},
          hiddenPawnIds: [],
          cellCue: { coord: { row: 0, col: 0 }, tone: 'destination' },
          dieRolling: false,
          dieValue: 4,
          victoryPlayerId: null,
          victoryReason: null,
          currentPlayerId: 'p1',
          interactionLocked: false,
          toast: null,
        }}
      />,
    );

    expect(container.querySelector('.game-board-scene__micro-toast')).toBeNull();

    const capture = render(
      <GameBoard
        pawns={pawns}
        presentation={{
          pawnVisuals: {},
          hiddenPawnIds: [],
          cellCue: { coord: { row: 2, col: 5 }, tone: 'capture' },
          dieRolling: false,
          dieValue: 4,
          victoryPlayerId: null,
          victoryReason: null,
          currentPlayerId: 'p1',
          interactionLocked: false,
          toast: {
            tone: 'capture',
            message: 'Алексей сбил синюю пешку',
          },
        }}
      />,
    );

    expect(screen.getByText('Алексей сбил синюю пешку')).toBeVisible();
    expect(capture.container.querySelector('.game-board-scene__micro-toast')).toHaveAttribute(
      'data-tone',
      'capture',
    );
    expect(capture.container.querySelector('.game-board-scene__victory-card')).toBeNull();
  });

  it('renders an exact-reference victory card with winner name and home-diagonal copy', () => {
    render(<GameBoard pawns={pawns} victoryPlayerId="p1" />);

    expect(screen.getByText('ПОБЕДА!')).toBeVisible();
    expect(screen.getByText(/Мария победил/i)).toBeVisible();
    expect(screen.getByText(/домашнюю диагональ/i)).toBeVisible();
  });
});
