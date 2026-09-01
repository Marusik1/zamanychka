import {
  forwardRef,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  AnimatedPawnVisual,
  GameplayAnimationRuntimeState,
  PresentationAnchor,
} from './animation-director.js';
import { GameAvatar } from './avatar.js';
import type { GameScreenPawnView, GameScreenPlayerView } from './domain.js';
import { GameDie, type DieValue, type GameDieHandle } from './dice.js';
import { GamePawn, type PawnMotion } from './pawns.js';
import {
  PremiumAnimationBridge,
  PremiumVictoryOverlay,
  type PremiumDice3DHandle,
  type PremiumVictoryOverlayHandle,
} from './premium3d/index.js';
import type { PremiumPresentationHandle } from './premium-runtime.js';

interface GameBoardProps {
  pawns: readonly GameScreenPawnView[];
  players?: readonly GameScreenPlayerView[];
  className?: string;
  children?: ReactNode;
  playerNamesById?: Readonly<Record<string, string>> | undefined;
  playerAvatarUrlsById?: Readonly<Record<string, string | null | undefined>> | undefined;
  previewGuides?: boolean;
  selectedPawnId?: string | undefined;
  pawnMotions?: Readonly<Record<string, PawnMotion>> | undefined;
  dieValue?: DieValue;
  dieRolling?: boolean;
  victoryPlayerId?: string | null | undefined;
  victoryReason?: 'HOME_DIAGONAL_COMPLETED' | 'LAST_ACTIVE_PLAYER' | null | undefined;
  presentation?: GameplayAnimationRuntimeState | undefined;
  mobileChatOpen?: boolean;
  onMobileChatClose?: (() => void) | undefined;
  rightPanel?: ReactNode | undefined;
  chatPanel?: ReactNode | undefined;
  hideChat?: boolean;
  turnPanel?: Readonly<{
    heading?: string | undefined;
    badge?: string | undefined;
    title?: string | undefined;
    subtitle?: string | undefined;
    dieLabel?: string | undefined;
    dieValueText?: string | undefined;
    primaryAction?: ReactNode | undefined;
    secondaryActions?: ReactNode | undefined;
    footer?: ReactNode | undefined;
    error?: ReactNode | undefined;
  }>;
  actionablePawnIds?: readonly string[] | undefined;
  pawnActionLabels?: Readonly<Record<string, string>> | undefined;
  onPawnSelect?: ((pawnId: string) => void) | undefined;
  interactionDisabled?: boolean;
}

interface BoardCell {
  row: number;
  col: number;
  key: string;
  tone: 'light' | 'dark';
  grain: number;
}

const previewHomeGuides = new Map<string, GameScreenPawnView['color']>([
  ['0:0', 'RED'],
  ['1:1', 'RED'],
  ['2:2', 'RED'],
  ['3:3', 'RED'],
  ['0:7', 'BLUE'],
  ['1:6', 'BLUE'],
  ['2:5', 'BLUE'],
  ['3:4', 'BLUE'],
  ['7:7', 'YELLOW'],
  ['6:6', 'YELLOW'],
  ['5:5', 'YELLOW'],
  ['4:4', 'YELLOW'],
  ['7:0', 'GREEN'],
  ['6:1', 'GREEN'],
  ['5:2', 'GREEN'],
  ['4:3', 'GREEN'],
]);

function createBoardCells(): BoardCell[] {
  const cells: BoardCell[] = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const index = row * 8 + col;
      cells.push({
        row,
        col,
        key: `${row}:${col}`,
        tone: (row + col) % 2 === 0 ? 'light' : 'dark',
        grain: (index * 17 + row * 9 + col * 5) % 37,
      });
    }
  }
  return cells;
}

function isBoardPawn(
  pawn: GameScreenPawnView,
): pawn is GameScreenPawnView & {
  coordKey: string;
} {
  return (
    pawn.position.zone !== 'OFF_BOARD' && pawn.position.zone !== 'REMOVED' && pawn.coordKey !== null
  );
}

function reserveTitle(color: GameScreenPawnView['color']): string {
  switch (color) {
    case 'RED':
      return 'Красные';
    case 'BLUE':
      return 'Синие';
    case 'GREEN':
      return 'Зелёные';
    case 'YELLOW':
      return 'Жёлтые';
  }
}

function colorClass(color: GameScreenPawnView['color']): string {
  return color.toLowerCase();
}

function fallbackPlayers(pawns: readonly GameScreenPawnView[]): readonly GameScreenPlayerView[] {
  return [...new Map(pawns.map((pawn) => [pawn.playerId, pawn])).values()].map((pawn, index) => ({
    playerId: pawn.playerId,
    color: pawn.color,
    seatIndex: index as GameScreenPlayerView['seatIndex'],
    status: 'ACTIVE' as const,
    isLocalPlayer: pawn.isLocalPlayerPawn,
    isCurrentPlayer: index === 0,
    isWinner: false,
    pawnCount: pawns.filter((candidate) => candidate.playerId === pawn.playerId).length,
  }));
}

function SignalBars() {
  return (
    <span className="game-board-scene__signal" aria-label="Стабильное соединение">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function BoardHardware() {
  const interiorStuds = Array.from({ length: 7 }, (_, index) => index + 1);

  return (
    <div className="game-board-scene__hardware" aria-hidden="true">
      {(['top', 'right', 'bottom', 'left'] as const).flatMap((edge) =>
        interiorStuds.map((index) => (
          <span
            key={`${edge}-${index}`}
            className={`game-board-scene__stud game-board-scene__stud--${edge}`}
            style={{ '--stud-index': index } as CSSProperties}
          />
        )),
      )}
      {(['tl', 'tr', 'br', 'bl'] as const).map((corner) => (
        <span
          key={corner}
          className={`game-board-scene__corner-cap game-board-scene__corner-cap--${corner}`}
        />
      ))}
    </div>
  );
}

function previewGuideClass(cell: BoardCell, enabled: boolean): string {
  if (!enabled) return '';
  const guide = previewHomeGuides.get(cell.key);
  return guide
    ? `game-board-scene__cell--guide game-board-scene__cell--guide-${guide.toLowerCase()}`
    : '';
}

function anchorStyle(anchor: PresentationAnchor): CSSProperties {
  const inset = 0;
  const span = 100 - inset * 2;
  const boardPoint = (value: number) => inset + ((value + 0.5) / 8) * span;
  const reserveSlots: Record<GameScreenPawnView['color'], readonly [number, number][]> = {
    RED: [
      [12, -4],
      [24, -4],
      [-4, 12],
      [-4, 24],
    ],
    BLUE: [
      [104, 12],
      [104, 24],
      [88, -4],
      [76, -4],
    ],
    GREEN: [
      [-4, 76],
      [-4, 88],
      [12, 104],
      [24, 104],
    ],
    YELLOW: [
      [76, 104],
      [88, 104],
      [104, 76],
      [104, 88],
    ],
  };

  if (anchor.kind === 'board') {
    return {
      left: `${boardPoint(anchor.coord.col)}%`,
      top: `${boardPoint(anchor.coord.row)}%`,
    };
  }

  if (anchor.kind === 'reserve') {
    const [left, top] =
      reserveSlots[anchor.color][anchor.slot] ?? reserveSlots[anchor.color][0] ?? [50, 50];
    return { left: `${left}%`, top: `${top}%` };
  }

  return {
    left: `${42 + anchor.slot * 6}%`,
    top: '108%',
  };
}

function overlayPawnStyle(visual: AnimatedPawnVisual): CSSProperties {
  const anchor = anchorStyle(visual.anchor);

  return {
    ...anchor,
    '--pawn-transition-ms': `${visual.transitionMs ?? 150}ms`,
    '--pawn-transition-easing': visual.transitionEasing ?? 'cubic-bezier(0.22, 0.78, 0.18, 1)',
    ...(visual.effectVars ?? {}),
  } as CSSProperties;
}

function overlayPawnView(visual: AnimatedPawnVisual): GameScreenPawnView {
  return {
    pawnId: visual.pawnId,
    playerId: visual.playerId,
    color: visual.color,
    position: visual.position,
    coord: visual.anchor.kind === 'board' ? visual.anchor.coord : null,
    coordKey:
      visual.anchor.kind === 'board'
        ? `${visual.anchor.coord.row}:${visual.anchor.coord.col}`
        : null,
    isLocalPlayerPawn: false,
  };
}

type BoardToast = NonNullable<NonNullable<GameBoardProps['presentation']>['toast']>;

function ChatPanel({
  mobile = false,
  onClose,
  content,
}: {
  mobile?: boolean;
  onClose?: (() => void) | undefined;
  content?: ReactNode;
}) {
  if (!content) return null;

  return (
    <section
      className={[
        'game-board-scene__chat-card',
        mobile ? 'game-board-scene__chat-card--mobile-sheet' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Чат комнаты"
    >
      {mobile && onClose ? (
        <button
          type="button"
          className="game-board-scene__chat-close"
          onClick={onClose}
          aria-label="Вернуться к игре"
        >
          Назад
        </button>
      ) : null}
      {content}
    </section>
  );
}

export const GameBoard = forwardRef<PremiumPresentationHandle, GameBoardProps>(function GameBoard({
  pawns,
  players = [],
  className,
  children,
  playerNamesById = {},
  playerAvatarUrlsById = {},
  previewGuides = true,
  selectedPawnId,
  pawnMotions = {},
  dieValue = 4,
  dieRolling = false,
  victoryPlayerId = null,
  victoryReason = 'HOME_DIAGONAL_COMPLETED',
  presentation,
  mobileChatOpen = false,
  onMobileChatClose,
  rightPanel,
  chatPanel,
  hideChat = false,
  turnPanel,
  actionablePawnIds = [],
  pawnActionLabels = {},
  onPawnSelect,
  interactionDisabled = false,
}: GameBoardProps, forwardedRef) {
  const cells = createBoardCells();
  const hiddenPawnIds = new Set(presentation?.hiddenPawnIds ?? []);
  const activePawns = pawns.filter((pawn) => isBoardPawn(pawn) && !hiddenPawnIds.has(pawn.pawnId));
  const reservePawns = pawns.filter(
    (pawn) => pawn.position.zone === 'OFF_BOARD' && !hiddenPawnIds.has(pawn.pawnId),
  );
  const removedPawns = pawns.filter(
    (pawn) => pawn.position.zone === 'REMOVED' && !hiddenPawnIds.has(pawn.pawnId),
  );
  const visiblePlayers = players.length > 0 ? players : fallbackPlayers(pawns);
  const effectiveCurrentPlayerId = presentation?.currentPlayerId ?? null;
  const effectiveDieValue = presentation?.dieValue ?? dieValue;
  const effectiveDieRolling = presentation?.dieRolling ?? dieRolling;
  const effectiveVictoryPlayerId = presentation?.victoryPlayerId ?? victoryPlayerId;
  const effectiveVictoryReason = presentation?.victoryReason ?? victoryReason;
  const victoryPlayer = effectiveVictoryPlayerId
    ? visiblePlayers.find((player) => player.playerId === effectiveVictoryPlayerId) ?? null
    : null;
  const victoryName = victoryPlayer
    ? playerNamesById[victoryPlayer.playerId] ?? reserveTitle(victoryPlayer.color)
    : 'Игрок';
  const victorySubtitle =
    effectiveVictoryReason === 'LAST_ACTIVE_PLAYER'
      ? 'Остался последним активным игроком'
      : 'Первым заполнил домашнюю диагональ';
  const victoryColor = victoryPlayer ? colorClass(victoryPlayer.color) : 'green';
  const dieRef = useRef<GameDieHandle | null>(null);
  const victoryRef = useRef<PremiumVictoryOverlayHandle | null>(null);
  const [toast, setToast] = useState<BoardToast | null>(null);
  const actionablePawnIdSet = useMemo(() => new Set(actionablePawnIds), [actionablePawnIds]);

  useEffect(() => {
    if (!presentation?.toast) return;
    setToast(presentation.toast);
    const timeout = window.setTimeout(() => setToast(null), 1450);
    return () => window.clearTimeout(timeout);
  }, [presentation?.toast]);

  function createPremiumBridge() {
    if (!dieRef.current || !victoryRef.current) {
      return null;
    }

    return new PremiumAnimationBridge(
      dieRef.current as unknown as PremiumDice3DHandle,
      victoryRef.current,
    );
  }

  const pawnsByCell = new Map<string, GameScreenPawnView[]>();
  for (const pawn of activePawns) {
    const coordKey = pawn.coordKey;
    if (!coordKey) continue;
    const occupants = pawnsByCell.get(coordKey) ?? [];
    occupants.push(pawn);
    pawnsByCell.set(coordKey, occupants);
  }

  useImperativeHandle(
    forwardedRef,
    () => ({
      ready: Boolean(dieRef.current?.ready),
      syncToSnapshot(_snapshot) {},
      snapToAuthoritativeState(snapshot) {
        dieRef.current?.snapToValue((snapshot.diceValue ?? effectiveDieValue) as DieValue);
        victoryRef.current?.clear();
      },
      async diceRolled(value, signal) {
        await createPremiumBridge()?.diceRolled(value, signal);
      },
      async pawnEntered(animation, signal) {
        await createPremiumBridge()?.pawnEntered(animation, signal);
      },
      async pawnMoved(animation, signal) {
        await createPremiumBridge()?.pawnMoved(animation, signal);
      },
      async pawnCaptured(animation, signal) {
        await createPremiumBridge()?.pawnCaptured(animation, signal);
      },
      async pawnEnteredHome(pawnId, signal) {
        await createPremiumBridge()?.pawnEnteredHome(pawnId, signal);
      },
      async homeCompleted(animation, signal) {
        await createPremiumBridge()?.homeCompleted(animation, signal);
      },
      async playerSurrendered(pawnIds, signal) {
        await createPremiumBridge()?.playerSurrendered(pawnIds, signal);
      },
      async gameWon(animation, signal) {
        await createPremiumBridge()?.gameWon(animation, signal);
      },
    }),
    [effectiveDieValue],
  );

  function renderPawn(
    pawn: GameScreenPawnView,
    motion: PawnMotion,
    size: 'reserve' | 'panel' | 'board',
  ) {
    const actionable = actionablePawnIdSet.has(pawn.pawnId) && Boolean(onPawnSelect);
    const content = <GamePawn pawn={pawn} motion={motion} size={size} />;

    if (!actionable) return content;

    return (
      <button
        key={`${pawn.pawnId}-${size}`}
        type="button"
        className="game-board-scene__pawn-button"
        onClick={(event) => {
          // The authoritative transition can replace this button immediately.
          // Do not leave a disappearing pawn control focused on mobile WebViews:
          // their focus-preservation scroll otherwise shifts the gameplay viewport.
          event.currentTarget.blur();
          onPawnSelect?.(pawn.pawnId);
        }}
        aria-label={pawnActionLabels[pawn.pawnId] ?? `Пешка ${pawn.pawnId}`}
        disabled={interactionDisabled}
      >
        {content}
      </button>
    );
  }

  return (
    <section
      className={['game-board-scene', effectiveVictoryPlayerId ? 'game-board-scene--victory' : '', className]
        .filter(Boolean)
        .join(' ')}
      data-victory-player-id={effectiveVictoryPlayerId ?? undefined}
    >
      <div className="game-board-scene__frame" data-layout="gameplay-three-column">
        <aside
          className="game-board-scene__panel game-board-scene__panel--left"
          data-region="left-rail"
          aria-label="Игроки"
        >
          <div className="game-board-scene__panel-heading">
            <h2>Игроки</h2>
            <span
              className="game-board-scene__player-count"
              aria-label={`${visiblePlayers.length} игроков из ${Math.max(visiblePlayers.length, 1)}`}
            >
              <span aria-hidden="true">♙</span> {visiblePlayers.length} / {Math.max(visiblePlayers.length, 1)}
            </span>
          </div>

          <div className="game-board-scene__players">
            {visiblePlayers.map((player) => {
              const reserve = reservePawns.filter((pawn) => pawn.playerId === player.playerId);
              const marker = pawns.find((pawn) => pawn.playerId === player.playerId) ?? reserve[0];
              const color = colorClass(player.color);
              const isCurrent = effectiveCurrentPlayerId
                ? player.playerId === effectiveCurrentPlayerId
                : player.isCurrentPlayer;

              return (
                <section
                  key={player.playerId}
                  className={[
                    'game-board-scene__player-row',
                    player.isLocalPlayer ? 'game-board-scene__player-row--local' : '',
                    isCurrent ? 'game-board-scene__player-row--current' : '',
                    player.playerId === effectiveVictoryPlayerId
                      ? 'game-board-scene__player-row--winner'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {marker ? (
                    <GamePawn pawn={{ ...marker, position: { zone: 'OFF_BOARD' } }} size="panel" />
                  ) : null}

                    <GameAvatar
                      color={player.color}
                      name={playerNamesById[player.playerId] ?? reserveTitle(player.color)}
                      photoUrl={playerAvatarUrlsById[player.playerId]}
                      index={player.seatIndex}
                    />

                  <div className="game-board-scene__player-copy">
                    <strong>
                      {playerNamesById[player.playerId] ?? reserveTitle(player.color)}
                      {player.isLocalPlayer ? ' (вы)' : ''}
                    </strong>
                    <span>
                      <i
                        className={`game-board-scene__color-dot game-board-scene__color-dot--${color}`}
                      />
                      {reserveTitle(player.color)}
                    </span>
                    {reserve.length > 0 ? (
                      <span
                        className="game-board-scene__reserve-mini"
                        data-reserve-color={player.color}
                      >
                        {reserve.map((pawn) =>
                          renderPawn(pawn, pawnMotions[pawn.pawnId] ?? 'idle', 'reserve'),
                        )}
                      </span>
                    ) : null}
                  </div>

                  <div className="game-board-scene__player-meta">
                    <SignalBars />
                  </div>
                </section>
              );
            })}
          </div>

        </aside>

        <div className="game-board-scene__board-shell premium-board-frame">
          <div className="game-board-scene__board-object game-board-scene__board-object--width-driven-square">
            <div className="game-board-scene__board-rail" data-animation-layer="board-contained">
              {toast ? (
                <div
                  className="game-board-scene__micro-toast"
                  data-tone={toast.tone}
                  aria-live="polite"
                >
                  {toast.message}
                </div>
              ) : null}
              <BoardHardware />
              <div
                className="game-board-scene__board premium-board-grid"
                role="grid"
                aria-label="Игровое поле"
              >
                {cells.map((cell) => {
                  const occupants = pawnsByCell.get(cell.key) ?? [];
                  const guideColor = previewHomeGuides.get(cell.key);

                  return (
                    <div
                      key={cell.key}
                      className={[
                        'game-board-scene__cell',
                        `game-board-scene__cell--${cell.tone}`,
                        `premium-cell--${cell.tone}`,
                        previewGuideClass(cell, previewGuides),
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      role="gridcell"
                      data-cell={cell.key}
                      data-tone={cell.tone}
                      data-guide={previewGuides ? guideColor?.toLowerCase() : undefined}
                      style={
                        {
                          '--grain-shift': `${cell.grain % 7}px`,
                          '--grain-angle': `${88 + (cell.grain % 7)}deg`,
                        } as CSSProperties
                      }
                    >
                      {previewGuides && guideColor ? (
                        <span
                          className={`game-board-scene__home-tile game-board-scene__home-tile--${guideColor.toLowerCase()}`}
                          aria-hidden="true"
                        />
                      ) : null}

                      {previewGuides && cell.key === '5:1' ? (
                        <span className="game-board-scene__destination-dot game-board-scene__destination-dot--green" />
                      ) : null}

                      {occupants.map((pawn) => {
                        const isSelected = pawn.pawnId === selectedPawnId;
                        const motion: PawnMotion =
                          pawnMotions[pawn.pawnId] ?? (isSelected ? 'selected' : 'idle');

                        return renderPawn(pawn, motion, 'board');
                      })}
                    </div>
                  );
                })}
                <div className="game-board-scene__overlay" aria-hidden="true">
                  {presentation?.cellCue ? (
                    <span
                      className={
                        presentation.cellCue.tone === 'capture'
                          ? 'game-board-scene__impact-ring premium-impact-ring'
                          : `game-board-scene__cell-marker premium-legal-destination game-board-scene__cell-marker--${presentation.cellCue.tone}`
                      }
                      style={anchorStyle({ kind: 'board', coord: presentation.cellCue.coord })}
                    />
                  ) : null}

                  {Object.values(presentation?.pawnVisuals ?? {}).map((visual) => (
                    <div
                      key={visual.pawnId}
                      className="game-board-scene__overlay-pawn"
                      data-anchor={
                        visual.anchor.kind === 'board'
                          ? `board:${visual.anchor.coord.row}:${visual.anchor.coord.col}`
                          : `${visual.anchor.kind}:${visual.anchor.color}:${visual.anchor.slot}`
                      }
                      style={overlayPawnStyle(visual)}
                    >
                      <GamePawn pawn={overlayPawnView(visual)} motion={visual.motion} size="board" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {effectiveVictoryPlayerId ? (
              <div
                className={`game-board-scene__victory-overlay premium-victory-overlay game-board-scene__victory-overlay--${victoryColor}`}
                aria-live="polite"
              >
                {effectiveVictoryReason === 'HOME_DIAGONAL_COMPLETED' ? (
                  <span
                    className={`game-board-scene__victory-diagonal game-board-scene__victory-diagonal--${victoryColor}`}
                    aria-hidden="true"
                  />
                ) : null}
                <section className="game-board-scene__victory-card premium-victory-card">
                  <p>ПОБЕДА!</p>
                  <strong>{victoryName} победил</strong>
                  <span>{victorySubtitle}</span>
                </section>
              </div>
            ) : null}
            <PremiumVictoryOverlay ref={victoryRef} />
            {children}
          </div>
        </div>

        <aside
          className="game-board-scene__panel game-board-scene__panel--right"
          data-region="right-rail"
          data-testid="mobile-gameplay-actions"
          aria-label="Действия"
        >
          {rightPanel ?? <section className="game-board-scene__turn-card">
            {turnPanel?.heading || turnPanel?.badge ? (
              <div className="game-board-scene__panel-heading">
                {turnPanel?.heading ? <h2>{turnPanel.heading}</h2> : <span />}
                {turnPanel?.badge ? <span>{turnPanel.badge}</span> : null}
              </div>
            ) : null}
            <p>{turnPanel?.title ?? 'Ваш ход'}</p>
            <span>{turnPanel?.dieValueText ?? `Выпало: ${effectiveDieValue}`}</span>
            <GameDie
              ref={dieRef}
              value={effectiveDieValue}
              label={turnPanel?.dieLabel ?? `Кубик: ${effectiveDieValue}`}
              rolling={effectiveDieRolling}
            />
            <strong>{turnPanel?.subtitle ?? 'Выберите пешку'}</strong>
            {turnPanel && 'primaryAction' in turnPanel ? turnPanel.primaryAction ?? null : <button type="button">Бросить кубик</button>}
            {turnPanel && 'secondaryActions' in turnPanel ? (
              <div className="game-board-scene__secondary-actions">{turnPanel.secondaryActions}</div>
            ) : (
              <div className="game-board-scene__secondary-actions">
                <button type="button">Сдаться</button>
                <button type="button" aria-label="Ещё">
                  •••
                </button>
              </div>
            )}
            {turnPanel?.footer}
            {turnPanel?.error}
          </section>}

          {hideChat ? null : <ChatPanel content={chatPanel} />}

          {removedPawns.length > 0 ? (
            <section className="game-board-scene__reserve game-board-scene__reserve--removed">
              <p className="game-board-scene__reserve-label">Снятые</p>
              <div className="game-board-scene__reserve-stack">
                {removedPawns.map((pawn) => renderPawn(pawn, 'removed', 'panel'))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>

      {mobileChatOpen ? <ChatPanel mobile onClose={onMobileChatClose} content={chatPanel} /> : null}
    </section>
  );
});
