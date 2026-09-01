import type { GameEventEnvelope, TransitionEnvelope } from '@zamanushka/shared';

import type { PawnMotion } from './pawns.js';
import { movementDurationMs } from './animation-director.js';

type BoardCoord = Readonly<{ row: number; col: number }>;

export type GameplayPresentationStep =
  | Readonly<{
      kind: 'dice';
      playerId: string;
      diceValue: 1 | 2 | 3 | 4 | 5 | 6;
      durationMs: number;
    }>
  | Readonly<{
      kind: 'pawn';
      pawnId: string;
      playerId: string;
      motion: PawnMotion;
      fromCoord: BoardCoord | null;
      toCoord: BoardCoord | null;
      path: readonly BoardCoord[];
      durationMs: number;
    }>
  | Readonly<{
      kind: 'cell';
      coord: BoardCoord;
      tone: 'destination' | 'capture' | 'home';
      durationMs: number;
    }>
  | Readonly<{
      kind: 'toast';
      tone: 'enter' | 'capture';
      message: string;
      durationMs: number;
    }>
  | Readonly<{
      kind: 'turn';
      fromPlayerId?: string;
      toPlayerId: string;
      extraRoll: boolean;
      durationMs: number;
    }>
  | Readonly<{
      kind: 'victory';
      winnerPlayerId: string;
      reason: 'HOME_DIAGONAL_COMPLETED' | 'LAST_ACTIVE_PLAYER';
      durationMs: number;
    }>;

export type GameplayPresentationPlan = Readonly<{
  transitionId: string;
  matchId: string;
  steps: readonly GameplayPresentationStep[];
  estimatedDurationMs: number;
}>;

function committedDiceValue(value: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (value < 1 || value > 6) {
    throw new Error('committed dice value must be 1..6');
  }
  return value as 1 | 2 | 3 | 4 | 5 | 6;
}

function eventSteps(event: GameEventEnvelope): readonly GameplayPresentationStep[] {
  switch (event.type) {
    case 'diceRolled':
      return [
        {
          kind: 'dice',
          playerId: event.payload.playerId,
          diceValue: committedDiceValue(event.payload.diceValue),
          durationMs: 620,
        },
      ];
    case 'pawnEntered':
      return [
        {
          kind: 'pawn',
          pawnId: event.payload.pawnId,
          playerId: event.payload.playerId,
          motion: 'entering',
          fromCoord: null,
          toCoord: event.payload.toCoord,
          path: [event.payload.toCoord],
          durationMs: 190,
        },
      ];
    case 'pawnMoved':
      return [
        {
          kind: 'pawn',
          pawnId: event.payload.pawnId,
          playerId: event.payload.playerId,
          motion: 'moving',
          fromCoord: event.payload.fromCoord,
          toCoord: event.payload.toCoord,
          path: event.payload.physicalPath,
          durationMs: movementDurationMs(event.payload.physicalPath.length),
        },
        {
          kind: 'cell',
          coord: event.payload.toCoord,
          tone: event.payload.capture ? 'capture' : 'destination',
          durationMs: event.payload.capture ? 320 : 220,
        },
      ];
    case 'pawnCaptured':
      return [
        { kind: 'cell', coord: event.payload.atCoord, tone: 'capture', durationMs: 140 },
        {
          kind: 'pawn',
          pawnId: event.payload.capturedPawnId,
          playerId: event.payload.capturedPlayerId,
          motion: 'captured',
          fromCoord: event.payload.atCoord,
          toCoord: null,
          path: [event.payload.atCoord],
          durationMs: 240,
        },
        {
          kind: 'toast',
          tone: 'capture',
          message: 'Игрок сбил пешку соперника',
          durationMs: 1400,
        },
      ];
    case 'pawnEnteredHome':
      return [
        { kind: 'cell', coord: event.payload.toCoord, tone: 'home', durationMs: 360 },
        {
          kind: 'pawn',
          pawnId: event.payload.pawnId,
          playerId: event.payload.playerId,
          motion: 'home-cue',
          fromCoord: event.payload.fromCoord,
          toCoord: event.payload.toCoord,
          path: [],
          durationMs: 260,
        },
      ];
    case 'pawnRemoved':
      return [
        {
          kind: 'pawn',
          pawnId: event.payload.pawnId,
          playerId: event.payload.playerId,
          motion: 'removed',
          fromCoord: null,
          toCoord: null,
          path: [],
          durationMs: 300,
        },
      ];
    case 'extraRollGranted':
      return [
        { kind: 'turn', toPlayerId: event.payload.playerId, extraRoll: true, durationMs: 280 },
      ];
    case 'turnChanged':
      return [
        {
          kind: 'turn',
          fromPlayerId: event.payload.fromPlayerId,
          toPlayerId: event.payload.toPlayerId,
          extraRoll: false,
          durationMs: 320,
        },
      ];
    case 'gameWon':
      return [
        {
          kind: 'victory',
          winnerPlayerId: event.payload.winnerPlayerId,
          reason: event.payload.reason,
          durationMs: 920,
        },
      ];
    case 'playerSurrendered':
      return [];
  }
}

export function createGameplayPresentationPlan(
  transition: TransitionEnvelope,
): GameplayPresentationPlan {
  const steps = transition.events.flatMap(eventSteps);

  return {
    transitionId: transition.transitionId,
    matchId: transition.matchId,
    steps,
    estimatedDurationMs: steps.reduce((total, step) => total + step.durationMs, 0),
  };
}

export function getPawnMotions(
  plan: GameplayPresentationPlan | null,
): Readonly<Record<string, PawnMotion>> {
  if (!plan) return {};

  return plan.steps.reduce<Record<string, PawnMotion>>((motions, step) => {
    if (step.kind === 'pawn') motions[step.pawnId] = step.motion;
    return motions;
  }, {});
}
