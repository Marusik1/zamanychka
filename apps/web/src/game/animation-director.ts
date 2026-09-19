import { resolvePawnCoordinate, type BoardCoord, type PawnPosition, type PlayerState } from '@zamanushka/game-engine';
import type { MatchSnapshot, TransitionEnvelope } from '@zamanushka/shared';

import type { DieValue } from './dice.js';
import type { PawnMotion } from './pawns.js';

export const ANIMATION_TIMINGS = {
  moveBaseMs: 150,
  moveExtraMs: 126,
  moveMaxMs: 900,
  cornerSettleMs: 80,
  enterMs: 340,
  captureImpactMs: 120,
  captureHoldMs: 0,
  captureExitMs: 360,
  homeCueMs: 340,
  diceMs: 920,
  homeCompletePulseMs: 140,
  victoryMs: 680,
  resultDelayMs: 240,
  turnMs: 220,
  extraRollMs: 180,
  removedMs: 280,
  frameCommitMs: 16,
} as const;

type MatchPlayer = MatchSnapshot['players'][number];
type MatchPawn = MatchSnapshot['pawns'][number];

export type PresentationAnchor =
  | Readonly<{ kind: 'board'; coord: BoardCoord }>
  | Readonly<{ kind: 'reserve'; color: MatchPawn['color']; slot: number }>
  | Readonly<{ kind: 'removed'; color: MatchPawn['color']; slot: number }>;

export type PresentationCellCue = Readonly<{
  coord: BoardCoord;
  tone: 'destination' | 'capture' | 'home';
}>;

export type AnimatedPawnVisual = Readonly<{
  pawnId: string;
  playerId: string;
  color: MatchPawn['color'];
  motion: PawnMotion;
  anchor: PresentationAnchor;
  position: PawnPosition;
  transitionMs?: number;
  transitionEasing?: string;
  effectVars?: Readonly<Record<string, string>>;
}>;

export type GameplayAnimationRuntimeState = {
  pawnVisuals: Record<string, AnimatedPawnVisual>;
  hiddenPawnIds: string[];
  cellCue: PresentationCellCue | null;
  toast: Readonly<{
    tone: 'enter' | 'capture';
    message: string;
  }> | null;
  dieRolling: boolean;
  dieValue: DieValue;
  victoryPlayerId: string | null;
  victoryReason: MatchSnapshot['winReason'];
  currentPlayerId: string | null;
  interactionLocked: boolean;
};

export type GameplayAnimationFrame = Readonly<{
  durationMs: number;
  state: GameplayAnimationRuntimeState;
}>;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

function pawnOrdinal(pawnId: string): number {
  const match = pawnId.match(/-(\d+)$/);
  return Math.max(0, Number(match?.[1] ?? '1') - 1);
}

function initialDieValue(snapshot: MatchSnapshot): DieValue {
  return (snapshot.diceValue ?? 4) as DieValue;
}

function cloneState(state: GameplayAnimationRuntimeState): GameplayAnimationRuntimeState {
  return {
    ...state,
    pawnVisuals: { ...state.pawnVisuals },
    hiddenPawnIds: [...state.hiddenPawnIds],
    cellCue: state.cellCue ? { ...state.cellCue, coord: { ...state.cellCue.coord } } : null,
    toast: state.toast ? { ...state.toast } : null,
  };
}

function createState(snapshot: MatchSnapshot): GameplayAnimationRuntimeState {
  return {
    pawnVisuals: {},
    hiddenPawnIds: [],
    cellCue: null,
    toast: null,
    dieRolling: false,
    dieValue: initialDieValue(snapshot),
    victoryPlayerId: null,
    victoryReason: null,
    currentPlayerId: snapshot.currentPlayerId,
    interactionLocked: false,
  };
}

export function createIdleAnimationState(snapshot: MatchSnapshot): GameplayAnimationRuntimeState {
  return createState(snapshot);
}

function playerById(snapshot: MatchSnapshot, playerId: string): MatchPlayer | undefined {
  return snapshot.players.find((player) => player.playerId === playerId);
}

function pawnById(snapshot: MatchSnapshot, pawnId: string): MatchPawn | undefined {
  return snapshot.pawns.find((pawn) => pawn.pawnId === pawnId);
}

const FIXTURE_PLAYER_NAMES = {
  RED: 'Мария',
  BLUE: 'Дмитрий',
  YELLOW: 'Ольга',
  GREEN: 'Алексей',
} as const;

const CAPTURE_COLOR_LABEL = {
  RED: 'красную пешку',
  BLUE: 'синюю пешку',
  YELLOW: 'жёлтую пешку',
  GREEN: 'зелёную пешку',
} as const;

function captureToast(
  snapshot: MatchSnapshot,
  attackerPlayerId: string,
  capturedPawnId: string,
): NonNullable<GameplayAnimationRuntimeState['toast']> {
  const attacker = snapshot.players.find((player) => player.playerId === attackerPlayerId);
  const capturedPawn = snapshot.pawns.find((pawn) => pawn.pawnId === capturedPawnId);

  return {
    tone: 'capture',
    message: `${attacker ? FIXTURE_PLAYER_NAMES[attacker.color] : 'Игрок'} сбил ${
      capturedPawn ? CAPTURE_COLOR_LABEL[capturedPawn.color] : 'пешку соперника'
    }`,
  };
}

function boardAnchor(coord: BoardCoord): PresentationAnchor {
  return { kind: 'board', coord };
}

function reserveAnchor(pawn: MatchPawn): PresentationAnchor {
  return { kind: 'reserve', color: pawn.color, slot: pawnOrdinal(pawn.pawnId) };
}

function removedAnchor(pawn: MatchPawn): PresentationAnchor {
  return { kind: 'removed', color: pawn.color, slot: pawnOrdinal(pawn.pawnId) };
}

function resolvedAnchor(
  snapshot: MatchSnapshot,
  pawn: MatchPawn,
  fallback: PresentationAnchor = reserveAnchor(pawn),
): PresentationAnchor {
  const owner = playerById(snapshot, pawn.playerId) as PlayerState | undefined;
  if (!owner) return fallback;
  const coord = resolvePawnCoordinate(pawn.position, owner);
  if (!coord) return fallback;
  return boardAnchor(coord);
}

function withHidden(state: GameplayAnimationRuntimeState, pawnId: string): GameplayAnimationRuntimeState {
  const next = cloneState(state);
  if (!next.hiddenPawnIds.includes(pawnId)) {
    next.hiddenPawnIds = [...next.hiddenPawnIds, pawnId];
  }
  return next;
}

function withCue(
  state: GameplayAnimationRuntimeState,
  cue: PresentationCellCue | null,
): GameplayAnimationRuntimeState {
  const next = cloneState(state);
  next.cellCue = cue ? { ...cue, coord: { ...cue.coord } } : null;
  return next;
}

function withToast(
  state: GameplayAnimationRuntimeState,
  toast: GameplayAnimationRuntimeState['toast'],
): GameplayAnimationRuntimeState {
  const next = cloneState(state);
  next.toast = toast ? { ...toast } : null;
  return next;
}

function withPawnVisual(
  state: GameplayAnimationRuntimeState,
  visual: AnimatedPawnVisual,
): GameplayAnimationRuntimeState {
  const next = cloneState(state);
  next.pawnVisuals[visual.pawnId] = {
    ...visual,
    ...(visual.effectVars ? { effectVars: { ...visual.effectVars } } : {}),
  };
  return next;
}

function withoutPawnVisual(state: GameplayAnimationRuntimeState, pawnId: string): GameplayAnimationRuntimeState {
  const next = cloneState(state);
  const { [pawnId]: _removed, ...rest } = next.pawnVisuals;
  next.pawnVisuals = rest;
  return next;
}

function pushFrame(
  frames: GameplayAnimationFrame[],
  state: GameplayAnimationRuntimeState,
  durationMs: number,
): GameplayAnimationRuntimeState {
  const snapshot = cloneState(state);
  frames.push({ durationMs, state: snapshot });
  return snapshot;
}

export function movementDurationMs(stepCount: number): number {
  if (stepCount <= 0) return 0;

  return Math.min(
    ANIMATION_TIMINGS.moveMaxMs,
    ANIMATION_TIMINGS.moveBaseMs +
      Math.max(0, stepCount - 1) * ANIMATION_TIMINGS.moveExtraMs,
  );
}

function compressedMoveSegmentMs(pathLength: number): number {
  if (pathLength <= 0) return 0;
  return Math.round(movementDurationMs(pathLength) / pathLength);
}

export function isPerimeterCorner(coord: Readonly<{ row: number; col: number }>): boolean {
  return (coord.row === 0 || coord.row === 7) && (coord.col === 0 || coord.col === 7);
}

function captureVectorVars(
  fromCoord: BoardCoord | null,
  toCoord: BoardCoord,
): Readonly<Record<string, string>> {
  const dx = fromCoord ? Math.sign(toCoord.col - fromCoord.col) : 0;
  const dy = fromCoord ? Math.sign(toCoord.row - fromCoord.row) : -1;

  return {
    '--capture-shift-x': `${dx * 0.18}rem`,
    '--capture-shift-y': `${(-0.54 + dy * 0.06).toFixed(2)}rem`,
    '--capture-rotate': `${dx === 0 ? (dy >= 0 ? -4 : 4) : dx * 4}deg`,
  };
}

function buildHomeCompletionFrames(
  frames: GameplayAnimationFrame[],
  state: GameplayAnimationRuntimeState,
  finalSnapshot: MatchSnapshot,
  winnerPlayerId: string,
): GameplayAnimationRuntimeState {
  const pawns = finalSnapshot.pawns
    .filter(
      (pawn) => pawn.playerId === winnerPlayerId && pawn.position.zone === 'HOME',
    )
    .sort(
      (left, right) =>
        (left.position.zone === 'HOME' ? left.position.homeIndex : 0) -
        (right.position.zone === 'HOME' ? right.position.homeIndex : 0),
    );

  let nextState = state;
  for (const pawn of pawns) {
    nextState = withHidden(nextState, pawn.pawnId);
    nextState = withPawnVisual(nextState, {
      pawnId: pawn.pawnId,
      playerId: pawn.playerId,
      color: pawn.color,
      motion: 'home-complete',
      anchor: resolvedAnchor(finalSnapshot, pawn, reserveAnchor(pawn)),
      position: pawn.position,
    });
    nextState = pushFrame(frames, nextState, ANIMATION_TIMINGS.homeCompletePulseMs);
  }

  return nextState;
}

export function buildGameplayAnimationFrames({
  transition,
  initialSnapshot,
  reducedMotion,
}: {
  transition: TransitionEnvelope;
  initialSnapshot: MatchSnapshot;
  reducedMotion: boolean;
}): readonly GameplayAnimationFrame[] {
  const frames: GameplayAnimationFrame[] = [];
  let state = createState(initialSnapshot);
  state = { ...state, interactionLocked: true };

  for (const event of transition.events) {
    switch (event.type) {
      case 'diceRolled': {
        state = { ...cloneState(state), dieValue: event.payload.diceValue as DieValue, dieRolling: true };
        state = pushFrame(frames, state, reducedMotion ? 120 : ANIMATION_TIMINGS.diceMs);
        state = { ...cloneState(state), dieRolling: false };
        state = pushFrame(frames, state, 0);
        break;
      }
      case 'pawnEntered': {
        const pawn = pawnById(initialSnapshot, event.payload.pawnId) ?? pawnById(transition.snapshot, event.payload.pawnId);
        if (!pawn) break;
        state = withPawnVisual(state, {
          pawnId: pawn.pawnId,
          playerId: pawn.playerId,
          color: pawn.color,
          motion: 'entering',
          anchor: reserveAnchor(pawn),
          position: { zone: 'OFF_BOARD' },
        });
        state = pushFrame(frames, state, reducedMotion ? 0 : ANIMATION_TIMINGS.frameCommitMs);
        state = withPawnVisual(state, {
          pawnId: pawn.pawnId,
          playerId: pawn.playerId,
          color: pawn.color,
          motion: 'entering',
          anchor: boardAnchor(event.payload.toCoord as BoardCoord),
          position: { zone: 'PERIMETER', progress: 0 },
          transitionMs: reducedMotion ? 0 : ANIMATION_TIMINGS.enterMs,
          transitionEasing: 'cubic-bezier(0.24, 0.72, 0.24, 1)',
        });
        state = pushFrame(frames, state, reducedMotion ? 100 : ANIMATION_TIMINGS.enterMs);
        break;
      }
      case 'pawnMoved': {
        const pawn = pawnById(initialSnapshot, event.payload.pawnId) ?? pawnById(transition.snapshot, event.payload.pawnId);
        if (!pawn) break;
        state = withHidden(state, pawn.pawnId);
        state = withPawnVisual(state, {
          pawnId: pawn.pawnId,
          playerId: pawn.playerId,
          color: pawn.color,
          motion: 'moving',
          anchor: boardAnchor(event.payload.fromCoord as BoardCoord),
          position: pawn.position,
        });
        state = pushFrame(frames, state, reducedMotion ? 0 : ANIMATION_TIMINGS.frameCommitMs);
        const pathLength = event.payload.physicalPath.length;
        const segmentMs = reducedMotion ? 70 : compressedMoveSegmentMs(pathLength);
        for (const [index, coord] of event.payload.physicalPath.entries()) {
          state = withPawnVisual(state, {
            pawnId: pawn.pawnId,
            playerId: pawn.playerId,
            color: pawn.color,
            motion: 'moving',
            anchor: boardAnchor(coord as BoardCoord),
            position: pawn.position,
            transitionMs: segmentMs,
            transitionEasing: 'cubic-bezier(0.18, 0.82, 0.22, 1)',
          });
          state = pushFrame(frames, state, segmentMs);
          if (
            !reducedMotion &&
            index < event.payload.physicalPath.length - 1 &&
            isPerimeterCorner(coord as BoardCoord)
          ) {
            state = pushFrame(frames, state, ANIMATION_TIMINGS.cornerSettleMs);
          }
        }
        break;
      }
      case 'pawnCaptured': {
        const pawn = pawnById(initialSnapshot, event.payload.capturedPawnId);
        if (!pawn) break;
        const attacker =
          pawnById(initialSnapshot, event.payload.byPawnId) ??
          pawnById(transition.snapshot, event.payload.byPawnId);
        const attackerMove = [...transition.events].reverse().find(
          (candidate) =>
            candidate.type === 'pawnMoved' &&
            candidate.payload.pawnId === event.payload.byPawnId &&
            candidate.payload.toCoord.row === event.payload.atCoord.row &&
            candidate.payload.toCoord.col === event.payload.atCoord.col,
        );
        const effectVars =
          attackerMove?.type === 'pawnMoved'
            ? captureVectorVars(
                attackerMove.payload.fromCoord as BoardCoord,
                event.payload.atCoord as BoardCoord,
              )
            : null;
        state = withToast(
          state,
          captureToast(initialSnapshot, event.payload.byPlayerId, event.payload.capturedPawnId),
        );
        state = withCue(state, { coord: event.payload.atCoord as BoardCoord, tone: 'capture' });
        if (attacker) {
          state = withPawnVisual(state, {
            pawnId: attacker.pawnId,
            playerId: attacker.playerId,
            color: attacker.color,
            motion: 'capture-impact',
            anchor: boardAnchor(event.payload.atCoord as BoardCoord),
            position: attacker.position,
          });
        }
        state = withHidden(state, pawn.pawnId);
        state = withPawnVisual(state, {
          pawnId: pawn.pawnId,
          playerId: pawn.playerId,
          color: pawn.color,
          motion: 'captured',
          anchor: boardAnchor(event.payload.atCoord as BoardCoord),
          position: pawn.position,
          ...(effectVars ? { effectVars } : {}),
        });
        state = pushFrame(frames, state, reducedMotion ? 0 : ANIMATION_TIMINGS.captureImpactMs);
        state = withPawnVisual(state, {
          pawnId: pawn.pawnId,
          playerId: pawn.playerId,
          color: pawn.color,
          motion: 'capture-return',
          anchor: reserveAnchor(pawn),
          position: { zone: 'OFF_BOARD' },
          transitionMs: reducedMotion ? 140 : ANIMATION_TIMINGS.captureExitMs,
          transitionEasing: 'cubic-bezier(0.22, 0.72, 0.2, 1)',
        });
        state = pushFrame(frames, state, reducedMotion ? 140 : ANIMATION_TIMINGS.captureExitMs);
        state = withoutPawnVisual(state, pawn.pawnId);
        state = pushFrame(frames, withCue(state, null), 0);
        break;
      }
      case 'pawnEnteredHome': {
        const pawn = pawnById(transition.snapshot, event.payload.pawnId) ?? pawnById(initialSnapshot, event.payload.pawnId);
        if (!pawn) break;
        state = withCue(state, { coord: event.payload.toCoord as BoardCoord, tone: 'home' });
        state = withHidden(state, pawn.pawnId);
        state = withPawnVisual(state, {
          pawnId: pawn.pawnId,
          playerId: pawn.playerId,
          color: pawn.color,
          motion: event.payload.homeIndex === 3 ? 'home-final' : 'home-cue',
          anchor: boardAnchor(event.payload.toCoord as BoardCoord),
          position: { zone: 'HOME', homeIndex: event.payload.homeIndex },
        });
        state = pushFrame(frames, state, reducedMotion ? 120 : ANIMATION_TIMINGS.homeCueMs);
        state = withCue(state, null);
        state = pushFrame(frames, state, 0);
        break;
      }
      case 'pawnRemoved': {
        const pawn = pawnById(initialSnapshot, event.payload.pawnId) ?? pawnById(transition.snapshot, event.payload.pawnId);
        if (!pawn) break;
        state = withHidden(state, pawn.pawnId);
        state = withPawnVisual(state, {
          pawnId: pawn.pawnId,
          playerId: pawn.playerId,
          color: pawn.color,
          motion: 'removed',
          anchor: resolvedAnchor(initialSnapshot, pawn, removedAnchor(pawn)),
          position: pawn.position,
        });
        state = pushFrame(frames, state, reducedMotion ? 100 : ANIMATION_TIMINGS.removedMs);
        state = withoutPawnVisual(state, pawn.pawnId);
        state = pushFrame(frames, state, 0);
        break;
      }
      case 'extraRollGranted': {
        state = { ...cloneState(state), currentPlayerId: event.payload.playerId };
        state = pushFrame(frames, state, reducedMotion ? 80 : ANIMATION_TIMINGS.extraRollMs);
        break;
      }
      case 'turnChanged': {
        state = { ...cloneState(state), currentPlayerId: event.payload.toPlayerId };
        state = pushFrame(frames, state, reducedMotion ? 90 : ANIMATION_TIMINGS.turnMs);
        break;
      }
      case 'gameWon': {
        if (event.payload.reason === 'HOME_DIAGONAL_COMPLETED') {
          state = buildHomeCompletionFrames(frames, state, transition.snapshot, event.payload.winnerPlayerId);
        }
        state = pushFrame(frames, state, reducedMotion ? 120 : ANIMATION_TIMINGS.resultDelayMs);
        state = {
          ...cloneState(state),
          victoryPlayerId: event.payload.winnerPlayerId,
          victoryReason: event.payload.reason,
        };
        state = pushFrame(frames, state, reducedMotion ? 120 : ANIMATION_TIMINGS.victoryMs);
        break;
      }
      case 'playerSurrendered':
        break;
    }
  }

  state = {
    ...cloneState(state),
    interactionLocked: false,
    cellCue: null,
    toast: null,
    dieRolling: false,
  };
  frames.push({ durationMs: 0, state });

  return frames;
}

export async function runGameplayAnimationFrames(
  frames: readonly GameplayAnimationFrame[],
  {
    signal,
    onFrame,
  }: {
    signal: AbortSignal;
    onFrame: (state: GameplayAnimationRuntimeState) => void;
  },
): Promise<void> {
  for (const frame of frames) {
    if (signal.aborted) return;
    onFrame(frame.state);
    if (frame.durationMs > 0) {
      await sleep(frame.durationMs, signal);
    }
  }
}
