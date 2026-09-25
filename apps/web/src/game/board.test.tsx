import { fireEvent, render, screen, within } from '@testing-library/react';
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

function offBoardPawnSet(
  players: readonly { playerId: string; color: GameScreenPawnView['color']; isLocal?: boolean }[],
): readonly GameScreenPawnView[] {
  return players.flatMap((player) =>
    Array.from({ length: 4 }, (_, index) => ({
      pawnId: `${player.playerId}-${index + 1}`,
      playerId: player.playerId,
      color: player.color,
      position: { zone: 'OFF_BOARD' as const },
      coord: null,
      coordKey: null,
      isLocalPlayerPawn: Boolean(player.isLocal),
    })),
  );
}

describe('GameBoard', () => {
  it('renders exactly 64 board cells with alternating material tones', () => {
    render(<GameBoard pawns={pawns} />);
    expect(screen.getAllByRole('gridcell')).toHaveLength(64);
    expect(screen.getByRole('grid').querySelectorAll('[data-tone="light"]')).toHaveLength(32);
    expect(screen.getByRole('grid').querySelectorAll('[data-tone="dark"]')).toHaveLength(32);
  });

  it('renders canonical corner and HOME occupants in the expected cells', () => {
    render(<GameBoard pawns={pawns} />);
    expect(screen.getByRole('grid').querySelector('[data-board-pawn="p1-1"][data-board-edge="top"]')).not.toBeNull();
    expect(screen.getByRole('grid').querySelector('[data-board-pawn="p2-1"][data-board-edge="interior"]')).not.toBeNull();
    expect(screen.getByRole('grid').querySelector('[data-cell="0:0"]')).toHaveClass(
      'game-board-scene__cell--occupied',
    );
    expect(screen.getByRole('grid').querySelector('[data-cell="2:5"]')).toHaveClass(
      'game-board-scene__cell--occupied',
    );
    expect(screen.getByRole('grid').querySelector('[data-cell="0:0"]')).toHaveAttribute('data-tone', 'light');
    expect(screen.getByRole('grid').querySelector('[data-cell="0:1"]')).toHaveAttribute('data-tone', 'dark');
  });

  it('renders every OFF_BOARD pawn from an initial 2-player snapshot as visible reserve DOM', () => {
    const initialPawns = offBoardPawnSet([
      { playerId: 'red-seat', color: 'RED', isLocal: true },
      { playerId: 'yellow-seat', color: 'YELLOW' },
    ]);

    const { container } = render(
      <GameBoard
        pawns={initialPawns}
        players={[
          { playerId: 'red-seat', color: 'RED', seatIndex: 0, status: 'ACTIVE', isLocalPlayer: true, isCurrentPlayer: true, isWinner: false, pawnCount: 4 },
          { playerId: 'yellow-seat', color: 'YELLOW', seatIndex: 1, status: 'ACTIVE', isLocalPlayer: false, isCurrentPlayer: false, isWinner: false, pawnCount: 4 },
        ]}
      />,
    );

    const reserveLayer = container.querySelector('.game-board-scene__players');
    expect(reserveLayer?.querySelectorAll('.game-board-scene__reserve-mini [data-pawn-id]')).toHaveLength(8);
    expect(reserveLayer?.querySelectorAll('.game-pawn--red')).toHaveLength(5);
    expect(reserveLayer?.querySelectorAll('.game-pawn--yellow')).toHaveLength(5);
  });

  it('renders every OFF_BOARD pawn from an initial 4-player snapshot as visible reserve DOM', () => {
    const initialPawns = offBoardPawnSet([
      { playerId: 'red-seat', color: 'RED', isLocal: true },
      { playerId: 'blue-seat', color: 'BLUE' },
      { playerId: 'yellow-seat', color: 'YELLOW' },
      { playerId: 'green-seat', color: 'GREEN' },
    ]);

    const { container } = render(
      <GameBoard
        pawns={initialPawns}
        players={[
          { playerId: 'red-seat', color: 'RED', seatIndex: 0, status: 'ACTIVE', isLocalPlayer: true, isCurrentPlayer: true, isWinner: false, pawnCount: 4 },
          { playerId: 'blue-seat', color: 'BLUE', seatIndex: 1, status: 'ACTIVE', isLocalPlayer: false, isCurrentPlayer: false, isWinner: false, pawnCount: 4 },
          { playerId: 'yellow-seat', color: 'YELLOW', seatIndex: 2, status: 'ACTIVE', isLocalPlayer: false, isCurrentPlayer: false, isWinner: false, pawnCount: 4 },
          { playerId: 'green-seat', color: 'GREEN', seatIndex: 3, status: 'ACTIVE', isLocalPlayer: false, isCurrentPlayer: false, isWinner: false, pawnCount: 4 },
        ]}
      />,
    );

    const reserveLayer = container.querySelector('.game-board-scene__players');
    expect(reserveLayer?.querySelectorAll('.game-board-scene__reserve-mini [data-pawn-id]')).toHaveLength(16);
    expect(reserveLayer?.querySelectorAll('.game-pawn--red')).toHaveLength(5);
    expect(reserveLayer?.querySelectorAll('.game-pawn--blue')).toHaveLength(5);
    expect(reserveLayer?.querySelectorAll('.game-pawn--yellow')).toHaveLength(5);
    expect(reserveLayer?.querySelectorAll('.game-pawn--green')).toHaveLength(5);
  });

  it('clears the transient pawn-control focus before its authoritative action can replace the button', () => {
    const edgePawns: readonly GameScreenPawnView[] = [
      pawns[0]!,
      { ...pawns[0]!, pawnId: 'right', coord: { row: 3, col: 7 }, coordKey: '3:7' },
      { ...pawns[0]!, pawnId: 'bottom', color: 'YELLOW', coord: { row: 7, col: 4 }, coordKey: '7:4' },
    ];
    const edgeRender = render(<GameBoard pawns={edgePawns} />);
    const layer = edgeRender.container.querySelector('[data-pawn-layer="static"]');
    expect(layer?.querySelector('[data-board-edge="top"] .game-pawn__svg')).not.toBeNull();
    expect(layer?.querySelector('[data-board-edge="right"] .game-pawn__svg')).not.toBeNull();
    expect(layer?.querySelector('[data-board-edge="bottom"] .game-pawn__svg')).not.toBeNull();
    edgeRender.unmount();

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

  it('keeps the mobile board layers inside one width-driven square coordinate space', () => {
    const { container } = render(<GameBoard pawns={pawns} />);

    const square = container.querySelector('.game-board-scene__board-object--width-driven-square');
    expect(square).not.toBeNull();
    expect(square?.querySelector('.game-board-scene__board-rail')).not.toBeNull();
    expect(square?.querySelector('.game-board-scene__board.premium-board-grid')).not.toBeNull();
    expect(square?.querySelectorAll('[role="gridcell"]')).toHaveLength(64);
    expect(square?.querySelectorAll('.game-board-scene__home-tile')).toHaveLength(16);
    expect(square?.querySelector('.game-board-scene__overlay')).not.toBeNull();
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

  it('does not render fixture room or chat content without real supplied panels', () => {
    render(<GameBoard pawns={pawns} />);

    expect(screen.queryByRole('heading', { name: 'О комнате' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Чат комнаты' })).not.toBeInTheDocument();
    expect(screen.queryByText('Всем удачи! 👋')).not.toBeInTheDocument();
    expect(screen.queryByText('Время на ход:')).not.toBeInTheDocument();
  });
  it('keeps victory reveal inside the board zone instead of duplicating it in the action rail', () => {
    const { container } = render(<GameBoard pawns={pawns} victoryPlayerId="p1" />);

    expect(screen.queryByText(/Р¤РёРЅР°Р»СЊРЅР°СЏ РїРѕР·РёС†РёСЏ СЃРѕС…СЂР°РЅРµРЅР°/i)).toBeNull();
    expect(container.querySelectorAll('.game-board-scene__victory-card')).toHaveLength(1);
  });

  it('marks the authoritative turn surface as the mobile primary gameplay bar', () => {
    render(
      <GameBoard
        pawns={pawns}
        turnPanel={{
          title: 'Ваш ход',
          primaryAction: <button type="button">Бросить кубик</button>,
        }}
      />,
    );

    expect(screen.getByTestId('mobile-gameplay-actions')).toHaveTextContent('Ваш ход');
    expect(screen.getByRole('button', { name: 'Бросить кубик' })).toBeVisible();
  });

  it('does not announce a committed dice result while the 3D die is still rolling', () => {
    render(
      <GameBoard
        pawns={pawns}
        dieValue={2}
        presentation={{
          pawnVisuals: {},
          hiddenPawnIds: [],
          cellCue: null,
          toast: null,
          dieRolling: true,
          dieValue: 6,
          victoryPlayerId: null,
          victoryReason: null,
          currentPlayerId: 'p1',
          interactionLocked: true,
        }}
      />,
    );

    expect(screen.queryByText(/Выпало:\s*6|Р’С‹РїР°Р»Рѕ:\s*6/u)).not.toBeInTheDocument();
    expect(screen.getByText(/Кубик вращается|РљСѓР±РёРє РІСЂР°С‰Р°РµС‚СЃСЏ/u)).toBeVisible();
  });
  it('projects participants and selectable local reserve pawns inside the mobile match frame', () => {
    const onPawnSelect = vi.fn();
    const localReservePawn: GameScreenPawnView = {
      pawnId: 'p1-off-board',
      playerId: 'p1',
      color: 'RED',
      position: { zone: 'OFF_BOARD' },
      coord: null,
      coordKey: null,
      isLocalPlayerPawn: true,
    };
    const localReservePawn2 = { ...localReservePawn, pawnId: 'p1-off-board-2' };
    const localHomePawn: GameScreenPawnView = {
      ...localReservePawn,
      pawnId: 'p1-home',
      position: { zone: 'HOME', homeIndex: 1 },
      coord: { row: 1, col: 1 },
      coordKey: '1:1',
    };

    render(
      <GameBoard
        pawns={[...pawns, localReservePawn, localReservePawn2, localHomePawn]}
        players={[
          {
            playerId: 'p1', color: 'RED', seatIndex: 0, status: 'ACTIVE',
            isLocalPlayer: true, isCurrentPlayer: true, isWinner: false, pawnCount: 2,
          },
          {
            playerId: 'p2', color: 'BLUE', seatIndex: 1, status: 'ACTIVE',
            isLocalPlayer: false, isCurrentPlayer: false, isWinner: false, pawnCount: 1,
          },
          {
            playerId: 'p3', color: 'GREEN', seatIndex: 2, status: 'ACTIVE',
            isLocalPlayer: false, isCurrentPlayer: false, isWinner: false, pawnCount: 0,
          },
          {
            playerId: 'p4', color: 'YELLOW', seatIndex: 3, status: 'ACTIVE',
            isLocalPlayer: false, isCurrentPlayer: false, isWinner: false, pawnCount: 0,
          },
        ]}
        playerNamesById={{ p1: 'Мария', p2: 'Дмитрий', p3: 'Ольга', p4: 'Алексей' }}
        actionablePawnIds={['p1-off-board']}
        pawnActionLabels={{ 'p1-off-board': 'Вывести красную пешку на поле' }}
        onPawnSelect={onPawnSelect}
        mobileLayout
        showMobilePawnTray
        turnPanel={{ title: 'Ваш ход' }}
      />,
    );

    const matchFrame = screen.getByTestId('mobile-gameplay-actions');
    const details = screen.getByTestId('mobile-match-details');
    expect(matchFrame).toContainElement(details);
    const participants = screen.getByRole('region', { name: 'Участники матча' });
    expect(matchFrame).not.toContainElement(participants);
    expect(participants).toHaveTextContent('Мария (Вы)');
    expect(participants).toHaveTextContent('Дмитрий');
    expect(participants).toHaveTextContent('Ольга');
    expect(participants).toHaveTextContent('Алексей');
    expect(participants.querySelectorAll('.game-board-scene__mobile-participant')).toHaveLength(4);
    expect(details).toHaveTextContent('Ваши пешки');

    fireEvent.click(within(details).getByRole('button', { name: 'Вывести красную пешку на поле' }));
    expect(onPawnSelect).toHaveBeenCalledWith('p1-off-board');
    expect(details.querySelectorAll('.game-board-scene__mobile-pawn-slot')).toHaveLength(4);
    expect(details.querySelectorAll('.game-pawn--tray')).toHaveLength(4);
    expect(details.querySelector('[data-zone="PERIMETER"]')).not.toBeNull();
    expect(details.querySelector('[data-zone="HOME"]')).not.toBeNull();
    expect(details.querySelector('[data-zone="OFF_BOARD"][data-actionable="true"]')).not.toBeNull();
  });

  it('keeps the mobile pawn tray out of pre-roll and opponent states', () => {
    render(
      <GameBoard
        pawns={pawns}
        mobileLayout
        turnPanel={{
          title: 'Ход соперника',
          tone: 'opponent',
          footer: <button type="button">Чат</button>,
        }}
      />,
    );

    expect(screen.getByRole('grid')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Участники матча' })).toBeVisible();
    expect(screen.queryByLabelText('Ваши пешки')).not.toBeInTheDocument();
    const turnCard = screen.getByText('Ход соперника').closest('.game-board-scene__turn-card');
    expect(turnCard).toHaveAttribute('data-turn-tone', 'opponent');
    expect(turnCard).not.toContainElement(screen.getByRole('button', { name: 'Чат' }));
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
    expect(screen.getByRole('grid').querySelector('[data-pawn-layer="static"] [data-pawn-id="p1-1"] .game-pawn__svg')).not.toBeNull();
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
    render(<GameBoard pawns={pawns} victoryPlayerId="p1" playerNamesById={{ p1: 'Мария' }} />);

    expect(screen.getByText('ПОБЕДА!')).toBeVisible();
    expect(screen.getByText(/Мария победил/i)).toBeVisible();
    expect(screen.getByText(/домашнюю диагональ/i)).toBeVisible();
  });
});
