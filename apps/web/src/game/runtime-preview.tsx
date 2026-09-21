import {
  createActiveGameState,
  resolvePawnCoordinate,
  type BoardCoord,
  type GameState,
  type PawnState,
  type PlayerState,
} from '@zamanushka/game-engine';
import type { MatchSnapshot, TransitionEnvelope } from '@zamanushka/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  buildGameplayAnimationFrames,
  createIdleAnimationState,
  runGameplayAnimationFrames,
  type GameplayAnimationRuntimeState,
} from './animation-director.js';
import { GameBoard } from './board.js';
import { projectGameScreenModel } from './domain.js';
import { createGameplayPresentationPlan } from './event-presentation.js';
import {
  recordGameplayTelemetry,
  type GameplayTelemetryEvent,
} from './gameplay-telemetry.js';
import {
  acceptCommittedTransition,
  completeActivePresentation,
  createPresentationController,
  getActivePresentationToken,
  reconcileAuthoritativeSnapshot,
  type PresentationControllerState,
} from './presentation-controller.js';
import type { PremiumPresentationHandle } from './premium-runtime.js';
import { playPremiumTransition } from './premium-runtime.js';

type PreviewFixture = Readonly<{
  initialSnapshot: MatchSnapshot;
  transitions: readonly TransitionEnvelope[];
  localPlayerId: string;
  scenarios: readonly PreviewScenario[];
}>;

type PreviewScenarioKey =
  | 'dice-1'
  | 'dice-2'
  | 'dice-3'
  | 'dice-4'
  | 'dice-5'
  | 'dice-6'
  | 'enter'
  | 'move-short'
  | 'move4'
  | 'capture'
  | 'dice-pawn'
  | 'dice-capture'
  | 'queue-3'
  | 'duplicate-event'
  | 'simulate-reconnect'
  | 'home-entry'
  | 'home-complete'
  | 'victory'
  | 'victory-last-active'
  | 'surrender'
  | 'turn-change'
  | 'snapshot-invalidate';

type PreviewScenario = Readonly<{
  key: PreviewScenarioKey;
  label: string;
  startSnapshot: MatchSnapshot;
  transitions: readonly TransitionEnvelope[];
  invalidateToSnapshot?: MatchSnapshot;
}>;

function localPawnId(localPlayerId: string, ordinal: 1 | 2 | 3 | 4): string {
  return `${localPlayerId}-pawn-${ordinal}`;
}

function snapshotToGameState(snapshot: MatchSnapshot): GameState {
  return {
    status: snapshot.status,
    stateVersion: snapshot.stateVersion,
    turnNumber: snapshot.turnNumber,
    turnPhase: snapshot.turnPhase,
    currentPlayerId: snapshot.currentPlayerId,
    diceValue: snapshot.diceValue as GameState['diceValue'],
    winnerPlayerId: snapshot.winnerPlayerId,
    winReason: snapshot.winReason,
    players: snapshot.players.map((player) => ({
      playerId: player.playerId,
      color: player.color,
      seatIndex: player.seatIndex,
      status: player.status,
    })),
    pawns: snapshot.pawns.map((pawn) => ({
      pawnId: pawn.pawnId,
      playerId: pawn.playerId,
      color: pawn.color,
      position: pawn.position,
    })),
  };
}

function toMatchSnapshot(
  state: GameState,
  {
    stateVersion,
    lastSequence,
    currentPlayerId = state.currentPlayerId,
    turnPhase = state.turnPhase,
    diceValue = state.diceValue,
    status = state.status,
    winnerPlayerId = state.winnerPlayerId,
    winReason = state.winReason,
    startedAt = null,
    finishedAt = null,
    turnNumber = state.turnNumber,
  }: {
    stateVersion: number;
    lastSequence: number;
    currentPlayerId?: string | null;
    turnPhase?: MatchSnapshot['turnPhase'];
    diceValue?: MatchSnapshot['diceValue'];
    status?: MatchSnapshot['status'];
    winnerPlayerId?: string | null;
    winReason?: MatchSnapshot['winReason'];
    startedAt?: MatchSnapshot['startedAt'];
    finishedAt?: MatchSnapshot['finishedAt'];
    turnNumber?: number;
  },
): MatchSnapshot {
  return {
    status,
    stateVersion,
    turnNumber,
    turnPhase,
    currentPlayerId,
    diceValue,
    winnerPlayerId,
    winReason,
    startedAt,
    finishedAt,
    players: state.players.map((player) => ({
      playerId: player.playerId,
      color: player.color,
      seatIndex: player.seatIndex,
      status: player.status,
    })),
    pawns: state.pawns.map((pawn) => ({
      pawnId: pawn.pawnId,
      playerId: pawn.playerId,
      color: pawn.color,
      position: pawn.position,
    })),
    lastSequence,
  };
}

function updatePawn(
  pawns: readonly PawnState[],
  pawnId: string,
  update: (pawn: PawnState) => PawnState,
): readonly PawnState[] {
  return pawns.map((pawn) => (pawn.pawnId === pawnId ? update(pawn) : pawn));
}

function coordFor(snapshot: MatchSnapshot, pawnId: string): BoardCoord {
  const pawn = snapshot.pawns.find((candidate) => candidate.pawnId === pawnId);
  if (!pawn) throw new Error(`Missing pawn ${pawnId}`);
  const player = snapshot.players.find((candidate) => candidate.playerId === pawn.playerId);
  if (!player) throw new Error(`Missing player ${pawn.playerId}`);
  const coord = resolvePawnCoordinate(pawn.position, player as PlayerState);
  if (!coord) throw new Error(`Pawn ${pawnId} has no coordinate`);
  return coord;
}

export function createRuntimePreviewFixture(localPlayerId: string): PreviewFixture {
  const state = createActiveGameState({
    playerCount: 4,
    seatOrder: ['red-seat', 'blue-seat', 'yellow-seat', localPlayerId],
    firstPlayerId: 'red-seat',
  });
  const localPawn1 = localPawnId(localPlayerId, 1);
  const localPawn2 = localPawnId(localPlayerId, 2);
  const localPawn3 = localPawnId(localPlayerId, 3);
  const localPawn4 = localPawnId(localPlayerId, 4);

  let pawns = state.pawns;
  const assign = (pawnId: string, position: PawnState['position']) => {
    pawns = updatePawn(pawns, pawnId, (pawn) => ({ ...pawn, position }));
  };

  assign('red-seat-pawn-1', { zone: 'PERIMETER', progress: 0 });
  assign('red-seat-pawn-2', { zone: 'PERIMETER', progress: 6 });
  assign('red-seat-pawn-3', { zone: 'PERIMETER', progress: 26 });
  assign('red-seat-pawn-4', { zone: 'PERIMETER', progress: 27 });

  assign('blue-seat-pawn-1', { zone: 'PERIMETER', progress: 4 });
  assign('blue-seat-pawn-2', { zone: 'PERIMETER', progress: 1 });
  assign('blue-seat-pawn-3', { zone: 'PERIMETER', progress: 2 });
  assign('blue-seat-pawn-4', { zone: 'OFF_BOARD' });

  assign('yellow-seat-pawn-1', { zone: 'PERIMETER', progress: 0 });
  assign('yellow-seat-pawn-2', { zone: 'PERIMETER', progress: 1 });
  assign('yellow-seat-pawn-3', { zone: 'PERIMETER', progress: 2 });
  assign('yellow-seat-pawn-4', { zone: 'PERIMETER', progress: 27 });

  assign(localPawn1, { zone: 'HOME', homeIndex: 1 as const });
  assign(localPawn2, { zone: 'PERIMETER', progress: 27 });
  assign(localPawn3, { zone: 'HOME', homeIndex: 2 as const });
  assign(localPawn4, { zone: 'HOME', homeIndex: 3 as const });

  const base = { ...state, pawns };

  const initialSnapshot = toMatchSnapshot(base, {
    stateVersion: 1,
    lastSequence: 1,
    currentPlayerId: 'red-seat',
    turnPhase: 'WAITING_FOR_ROLL',
    diceValue: null,
  });

  const redMoveSnapshot = toMatchSnapshot(
    {
      ...base,
      pawns: updatePawn(base.pawns, 'red-seat-pawn-1', (pawn) => ({
        ...pawn,
        position: { zone: 'PERIMETER', progress: 4 },
      })),
    },
    {
      stateVersion: 2,
      lastSequence: 3,
      currentPlayerId: 'blue-seat',
      turnPhase: 'WAITING_FOR_ROLL',
      diceValue: null,
    },
  );

  const redDiceOnlySnapshot = toMatchSnapshot(base, {
    stateVersion: 2,
    lastSequence: 2,
    currentPlayerId: 'red-seat',
    turnPhase: 'WAITING_FOR_ACTION',
    diceValue: 4,
  });

  const redMoveOnlyStartSnapshot = toMatchSnapshot(base, {
    stateVersion: 2,
    lastSequence: 2,
    currentPlayerId: 'red-seat',
    turnPhase: 'WAITING_FOR_ACTION',
    diceValue: 4,
  });

  const blueRollSnapshot = toMatchSnapshot(base, {
    stateVersion: 3,
    lastSequence: 4,
    currentPlayerId: 'blue-seat',
    turnPhase: 'WAITING_FOR_ACTION',
    diceValue: 6,
  });

  const blueEnterSnapshot = toMatchSnapshot(
    {
      ...base,
      pawns: updatePawn(base.pawns, 'blue-seat-pawn-4', (pawn) => ({
        ...pawn,
        position: { zone: 'PERIMETER', progress: 0 },
      })),
    },
    {
      stateVersion: 4,
      lastSequence: 6,
      currentPlayerId: 'blue-seat',
      turnPhase: 'WAITING_FOR_ROLL',
      diceValue: null,
    },
  );

  const blueCaptureSnapshot = toMatchSnapshot(
    {
      ...base,
      pawns: updatePawn(
        updatePawn(base.pawns, 'blue-seat-pawn-1', (pawn) => ({
          ...pawn,
          position: { zone: 'PERIMETER', progress: 6 },
        })),
        'red-seat-pawn-2',
        (pawn) => ({ ...pawn, position: { zone: 'OFF_BOARD' } }),
      ),
    },
    {
      stateVersion: 5,
      lastSequence: 9,
      currentPlayerId: localPlayerId,
      turnPhase: 'WAITING_FOR_ROLL',
      diceValue: null,
    },
  );

  const greenRollSnapshot = toMatchSnapshot(base, {
    stateVersion: 6,
    lastSequence: 10,
    currentPlayerId: localPlayerId,
    turnPhase: 'WAITING_FOR_ACTION',
    diceValue: 1,
  });

  const greenVictorySnapshot = toMatchSnapshot(
    {
      ...base,
      pawns: updatePawn(base.pawns, localPawn2, (pawn) => ({
        ...pawn,
        position: { zone: 'HOME', homeIndex: 0 as const },
      })),
    },
    {
      stateVersion: 7,
      lastSequence: 13,
      currentPlayerId: null,
      turnPhase: null,
      diceValue: null,
      status: 'FINISHED',
      winnerPlayerId: localPlayerId,
      winReason: 'HOME_DIAGONAL_COMPLETED',
    },
  );

  const greenHomeEntrySnapshot = toMatchSnapshot(
    {
      ...base,
      pawns: updatePawn(base.pawns, localPawn2, (pawn) => ({
        ...pawn,
        position: { zone: 'HOME', homeIndex: 0 as const },
      })),
    },
    {
      stateVersion: 7,
      lastSequence: 12,
      currentPlayerId: localPlayerId,
      turnPhase: 'WAITING_FOR_ROLL',
      diceValue: null,
    },
  );

  const greenSurrenderSnapshot = toMatchSnapshot(
    {
      ...base,
      players: base.players.map((player) =>
        player.playerId === localPlayerId ? { ...player, status: 'SURRENDERED' as const } : player,
      ),
      pawns: base.pawns.map((pawn) =>
        pawn.playerId === localPlayerId
          ? { ...pawn, position: { zone: 'REMOVED' as const } }
          : pawn,
      ),
    },
    {
      stateVersion: 8,
      lastSequence: 18,
      currentPlayerId: 'red-seat',
      turnPhase: 'WAITING_FOR_ROLL',
      diceValue: null,
    },
  );

  const turnChangeSnapshot = toMatchSnapshot(base, {
    stateVersion: 9,
    lastSequence: 19,
    currentPlayerId: 'blue-seat',
    turnPhase: 'WAITING_FOR_ROLL',
    diceValue: null,
  });

  const lastActiveVictorySnapshot = toMatchSnapshot(
    {
      ...base,
      players: base.players.map((player) =>
        player.playerId === 'red-seat' || player.playerId === 'blue-seat'
          ? { ...player, status: 'SURRENDERED' as const }
          : player.playerId === localPlayerId
            ? { ...player, status: 'FINISHED' as const }
            : player,
      ),
    },
    {
      stateVersion: 10,
      lastSequence: 21,
      currentPlayerId: null,
      turnPhase: null,
      diceValue: null,
      status: 'FINISHED',
      winnerPlayerId: localPlayerId,
      winReason: 'LAST_ACTIVE_PLAYER',
    },
  );

  const invalidateSnapshot = toMatchSnapshot(base, {
    stateVersion: 11,
    lastSequence: 24,
    currentPlayerId: 'blue-seat',
    turnPhase: 'WAITING_FOR_ROLL',
    diceValue: null,
  });

  const transitions: readonly TransitionEnvelope[] = [
    {
      matchId: 'epic-06-preview',
      transitionId: 'red-roll',
      actionId: 'red-roll-action',
      stateVersion: 2,
      fromSequence: 2,
      toSequence: 3,
      events: [
        {
          matchId: 'epic-06-preview',
          eventId: 'e2',
          sequence: 2,
          stateVersion: 2,
          type: 'diceRolled',
          payload: { playerId: 'red-seat', diceValue: 4 },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
          matchId: 'epic-06-preview',
          eventId: 'e3',
          sequence: 3,
          stateVersion: 2,
          type: 'pawnMoved',
          payload: {
            pawnId: 'red-seat-pawn-1',
            playerId: 'red-seat',
            fromCoord: coordFor(initialSnapshot, 'red-seat-pawn-1'),
            toCoord: coordFor(redMoveSnapshot, 'red-seat-pawn-1'),
            physicalPath: [
              { row: 0, col: 1 },
              { row: 0, col: 2 },
              { row: 0, col: 3 },
              { row: 0, col: 4 },
            ],
            capture: null,
          },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
      ],
      watermark: { stateVersion: 2, lastSequence: 3 },
      snapshot: redMoveSnapshot,
    },
    {
      matchId: 'epic-06-preview',
      transitionId: 'blue-roll',
      actionId: 'blue-roll-action',
      stateVersion: 3,
      fromSequence: 4,
      toSequence: 4,
      events: [
        {
          matchId: 'epic-06-preview',
          eventId: 'e4',
          sequence: 4,
          stateVersion: 3,
          type: 'diceRolled',
          payload: { playerId: 'blue-seat', diceValue: 6 },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
      ],
      watermark: { stateVersion: 3, lastSequence: 4 },
      snapshot: blueRollSnapshot,
    },
    {
      matchId: 'epic-06-preview',
      transitionId: 'blue-enter',
      actionId: 'blue-enter-action',
      stateVersion: 4,
      fromSequence: 5,
      toSequence: 6,
      events: [
        {
          matchId: 'epic-06-preview',
          eventId: 'e5',
          sequence: 5,
          stateVersion: 4,
          type: 'pawnEntered',
          payload: {
            pawnId: 'blue-seat-pawn-4',
            playerId: 'blue-seat',
            toCoord: coordFor(blueEnterSnapshot, 'blue-seat-pawn-4'),
          },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
          matchId: 'epic-06-preview',
          eventId: 'e6',
          sequence: 6,
          stateVersion: 4,
          type: 'extraRollGranted',
          payload: { playerId: 'blue-seat', reason: 'ROLLED_SIX' as const },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
      ],
      watermark: { stateVersion: 4, lastSequence: 6 },
      snapshot: blueEnterSnapshot,
    },
    {
      matchId: 'epic-06-preview',
      transitionId: 'blue-capture',
      actionId: 'blue-capture-action',
      stateVersion: 5,
      fromSequence: 7,
      toSequence: 9,
      events: [
        {
          matchId: 'epic-06-preview',
          eventId: 'e7',
          sequence: 7,
          stateVersion: 5,
          type: 'pawnMoved',
          payload: {
            pawnId: 'blue-seat-pawn-1',
            playerId: 'blue-seat',
            fromCoord: coordFor(blueEnterSnapshot, 'blue-seat-pawn-1'),
            toCoord: coordFor(blueCaptureSnapshot, 'blue-seat-pawn-1'),
            physicalPath: [
              { row: 1, col: 7 },
              { row: 2, col: 7 },
            ],
            capture: { capturedPawnId: 'red-seat-pawn-2', capturedPlayerId: 'red-seat' },
          },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
          matchId: 'epic-06-preview',
          eventId: 'e8',
          sequence: 8,
          stateVersion: 5,
          type: 'pawnCaptured',
          payload: {
            capturedPawnId: 'red-seat-pawn-2',
            capturedPlayerId: 'red-seat',
            byPawnId: 'blue-seat-pawn-1',
            byPlayerId: 'blue-seat',
            atCoord: coordFor(initialSnapshot, 'red-seat-pawn-2'),
          },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
          matchId: 'epic-06-preview',
          eventId: 'e9',
          sequence: 9,
          stateVersion: 5,
          type: 'turnChanged',
          payload: { fromPlayerId: 'blue-seat', toPlayerId: localPlayerId },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
      ],
      watermark: { stateVersion: 5, lastSequence: 9 },
      snapshot: blueCaptureSnapshot,
    },
    {
      matchId: 'epic-06-preview',
      transitionId: 'green-roll',
      actionId: 'green-roll-action',
      stateVersion: 6,
      fromSequence: 10,
      toSequence: 10,
      events: [
        {
          matchId: 'epic-06-preview',
          eventId: 'e10',
          sequence: 10,
          stateVersion: 6,
          type: 'diceRolled',
          payload: { playerId: localPlayerId, diceValue: 1 },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
      ],
      watermark: { stateVersion: 6, lastSequence: 10 },
      snapshot: greenRollSnapshot,
    },
    {
      matchId: 'epic-06-preview',
      transitionId: 'green-victory',
      actionId: 'green-victory-action',
      stateVersion: 7,
      fromSequence: 11,
      toSequence: 13,
      events: [
        {
          matchId: 'epic-06-preview',
          eventId: 'e11',
          sequence: 11,
          stateVersion: 7,
          type: 'pawnMoved',
          payload: {
            pawnId: localPawn2,
            playerId: localPlayerId,
            fromCoord: coordFor(greenRollSnapshot, localPawn2),
            toCoord: coordFor(greenVictorySnapshot, localPawn2),
            physicalPath: [{ row: 7, col: 0 }],
            capture: null,
          },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
          matchId: 'epic-06-preview',
          eventId: 'e12',
          sequence: 12,
          stateVersion: 7,
          type: 'pawnEnteredHome',
          payload: {
            pawnId: localPawn2,
            playerId: localPlayerId,
            homeIndex: 0,
            fromCoord: coordFor(greenRollSnapshot, localPawn2),
            toCoord: coordFor(greenVictorySnapshot, localPawn2),
          },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
          matchId: 'epic-06-preview',
          eventId: 'e13',
          sequence: 13,
          stateVersion: 7,
          type: 'gameWon',
          payload: { winnerPlayerId: localPlayerId, reason: 'HOME_DIAGONAL_COMPLETED' },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
      ],
      watermark: { stateVersion: 7, lastSequence: 13 },
      snapshot: greenVictorySnapshot,
    },
    {
      matchId: 'epic-06-preview',
      transitionId: 'green-surrender',
      actionId: 'green-surrender-action',
      stateVersion: 8,
      fromSequence: 14,
      toSequence: 18,
      events: [
        {
          matchId: 'epic-06-preview',
          eventId: 'e14',
          sequence: 14,
          stateVersion: 8,
          type: 'playerSurrendered',
          payload: { playerId: localPlayerId },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
          matchId: 'epic-06-preview',
          eventId: 'e15',
          sequence: 15,
          stateVersion: 8,
          type: 'pawnRemoved',
          payload: { pawnId: localPawn1, playerId: localPlayerId, reason: 'SURRENDERED' },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
          matchId: 'epic-06-preview',
          eventId: 'e16',
          sequence: 16,
          stateVersion: 8,
          type: 'pawnRemoved',
          payload: { pawnId: localPawn2, playerId: localPlayerId, reason: 'SURRENDERED' },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
          matchId: 'epic-06-preview',
          eventId: 'e17',
          sequence: 17,
          stateVersion: 8,
          type: 'pawnRemoved',
          payload: { pawnId: localPawn3, playerId: localPlayerId, reason: 'SURRENDERED' },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
          matchId: 'epic-06-preview',
          eventId: 'e18',
          sequence: 18,
          stateVersion: 8,
          type: 'pawnRemoved',
          payload: { pawnId: localPawn4, playerId: localPlayerId, reason: 'SURRENDERED' },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
      ],
      watermark: { stateVersion: 8, lastSequence: 18 },
      snapshot: greenSurrenderSnapshot,
    },
  ];

  const diceScenario: TransitionEnvelope = {
    matchId: 'epic-06-preview',
    transitionId: 'dice-only',
    actionId: 'dice-only-action',
    stateVersion: 2,
    fromSequence: 2,
    toSequence: 2,
    events: [
      {
        matchId: 'epic-06-preview',
        eventId: 'dice-only-e2',
        sequence: 2,
        stateVersion: 2,
        type: 'diceRolled',
        payload: { playerId: 'red-seat', diceValue: 4 },
        createdAt: '2026-08-26T00:00:00.000Z',
      },
    ],
    watermark: { stateVersion: 2, lastSequence: 2 },
    snapshot: redDiceOnlySnapshot,
  };

  const diceScenarioFor = (value: 1 | 2 | 3 | 4 | 5 | 6): TransitionEnvelope => ({
    ...diceScenario,
    transitionId: `dice-${value}`,
    actionId: `dice-${value}-action`,
    events: diceScenario.events.map((event) =>
      event.type === 'diceRolled'
        ? {
            ...event,
            eventId: `dice-${value}-e2`,
            payload: { playerId: 'red-seat', diceValue: value },
          }
        : event,
    ),
    snapshot: {
      ...redDiceOnlySnapshot,
      diceValue: value,
    },
  });

  const moveOnlyScenario: TransitionEnvelope = {
    matchId: 'epic-06-preview',
    transitionId: 'move-only',
    actionId: 'move-only-action',
    stateVersion: 3,
    fromSequence: 3,
    toSequence: 3,
    events: [
      {
        matchId: 'epic-06-preview',
        eventId: 'move-only-e3',
        sequence: 3,
        stateVersion: 3,
        type: 'pawnMoved',
        payload: {
          pawnId: 'red-seat-pawn-1',
          playerId: 'red-seat',
          fromCoord: coordFor(redMoveOnlyStartSnapshot, 'red-seat-pawn-1'),
          toCoord: coordFor(redMoveSnapshot, 'red-seat-pawn-1'),
          physicalPath: [
            { row: 0, col: 1 },
            { row: 0, col: 2 },
            { row: 0, col: 3 },
            { row: 0, col: 4 },
          ],
          capture: null,
        },
        createdAt: '2026-08-26T00:00:00.000Z',
      },
    ],
    watermark: { stateVersion: 3, lastSequence: 3 },
    snapshot: redMoveSnapshot,
  };

  const moveShortSnapshot = toMatchSnapshot(
    {
      ...base,
      pawns: updatePawn(base.pawns, 'red-seat-pawn-1', (pawn) => ({
        ...pawn,
        position: { zone: 'PERIMETER', progress: 1 },
      })),
    },
    {
      stateVersion: 3,
      lastSequence: 3,
      currentPlayerId: 'red-seat',
      turnPhase: 'WAITING_FOR_ACTION',
      diceValue: 1,
    },
  );

  const moveShortScenario: TransitionEnvelope = {
    ...moveOnlyScenario,
    transitionId: 'move-short',
    actionId: 'move-short-action',
    events: moveOnlyScenario.events.map((event) =>
      event.type === 'pawnMoved'
        ? {
            ...event,
            eventId: 'move-short-e3',
            payload: {
              ...event.payload,
              toCoord: coordFor(moveShortSnapshot, 'red-seat-pawn-1'),
              physicalPath: [{ row: 0, col: 1 }],
            },
          }
        : event,
    ),
    snapshot: moveShortSnapshot,
  };

  const homeEntryScenario: TransitionEnvelope = {
    matchId: 'epic-06-preview',
    transitionId: 'green-home-entry',
    actionId: 'green-home-entry-action',
    stateVersion: 7,
    fromSequence: 11,
    toSequence: 12,
    events: [
      {
        matchId: 'epic-06-preview',
        eventId: 'green-home-entry-e11',
        sequence: 11,
        stateVersion: 7,
        type: 'pawnMoved',
        payload: {
          pawnId: localPawn2,
          playerId: localPlayerId,
          fromCoord: coordFor(greenRollSnapshot, localPawn2),
          toCoord: coordFor(greenHomeEntrySnapshot, localPawn2),
          physicalPath: [{ row: 7, col: 0 }],
          capture: null,
        },
        createdAt: '2026-08-26T00:00:00.000Z',
      },
      {
        matchId: 'epic-06-preview',
        eventId: 'green-home-entry-e12',
        sequence: 12,
        stateVersion: 7,
        type: 'pawnEnteredHome',
        payload: {
          pawnId: localPawn2,
          playerId: localPlayerId,
          homeIndex: 0,
          fromCoord: coordFor(greenRollSnapshot, localPawn2),
          toCoord: coordFor(greenHomeEntrySnapshot, localPawn2),
        },
        createdAt: '2026-08-26T00:00:00.000Z',
      },
    ],
    watermark: { stateVersion: 7, lastSequence: 12 },
    snapshot: greenHomeEntrySnapshot,
  };

  const turnChangeScenario: TransitionEnvelope = {
    matchId: 'epic-06-preview',
    transitionId: 'turn-change-only',
    actionId: 'turn-change-only-action',
    stateVersion: 9,
    fromSequence: 19,
    toSequence: 19,
    events: [
      {
        matchId: 'epic-06-preview',
        eventId: 'turn-change-e19',
        sequence: 19,
        stateVersion: 9,
        type: 'turnChanged',
        payload: { fromPlayerId: 'red-seat', toPlayerId: 'blue-seat' },
        createdAt: '2026-08-26T00:00:00.000Z',
      },
    ],
    watermark: { stateVersion: 9, lastSequence: 19 },
    snapshot: turnChangeSnapshot,
  };

  const lastActiveVictoryScenario: TransitionEnvelope = {
    matchId: 'epic-06-preview',
    transitionId: 'green-last-active-victory',
    actionId: 'green-last-active-victory-action',
    stateVersion: 10,
    fromSequence: 20,
    toSequence: 21,
    events: [
      {
        matchId: 'epic-06-preview',
        eventId: 'last-active-e20',
        sequence: 20,
        stateVersion: 10,
        type: 'playerSurrendered',
        payload: { playerId: 'yellow-seat' },
        createdAt: '2026-08-27T00:00:00.000Z',
      },
      {
        matchId: 'epic-06-preview',
        eventId: 'last-active-e21',
        sequence: 21,
        stateVersion: 10,
        type: 'gameWon',
        payload: { winnerPlayerId: localPlayerId, reason: 'LAST_ACTIVE_PLAYER' },
        createdAt: '2026-08-27T00:00:00.000Z',
      },
    ],
    watermark: { stateVersion: 10, lastSequence: 21 },
    snapshot: lastActiveVictorySnapshot,
  };

  const scenarios: readonly PreviewScenario[] = [
    { key: 'dice-1', label: 'Roll → 1', startSnapshot: initialSnapshot, transitions: [diceScenarioFor(1)] },
    { key: 'dice-2', label: 'Roll → 2', startSnapshot: initialSnapshot, transitions: [diceScenarioFor(2)] },
    { key: 'dice-3', label: 'Roll → 3', startSnapshot: initialSnapshot, transitions: [diceScenarioFor(3)] },
    { key: 'dice-4', label: 'Roll → 4', startSnapshot: initialSnapshot, transitions: [diceScenarioFor(4)] },
    { key: 'dice-5', label: 'Roll → 5', startSnapshot: initialSnapshot, transitions: [diceScenarioFor(5)] },
    { key: 'dice-6', label: 'Roll → 6', startSnapshot: initialSnapshot, transitions: [diceScenarioFor(6)] },
    {
      key: 'enter',
      label: 'Pawn Enter',
      startSnapshot: blueRollSnapshot,
      transitions: [transitions[2]!],
    },
    {
      key: 'move-short',
      label: 'Pawn Move Short',
      startSnapshot: redMoveOnlyStartSnapshot,
      transitions: [moveShortScenario],
    },
    {
      key: 'move4',
      label: 'Pawn Move Long',
      startSnapshot: redMoveOnlyStartSnapshot,
      transitions: [moveOnlyScenario],
    },
    {
      key: 'capture',
      label: 'Pawn Capture',
      startSnapshot: blueEnterSnapshot,
      transitions: [transitions[3]!],
    },
    {
      key: 'dice-pawn',
      label: 'Dice → Pawn',
      startSnapshot: initialSnapshot,
      transitions: [transitions[0]!],
    },
    {
      key: 'dice-capture',
      label: 'Dice → Capture',
      startSnapshot: blueEnterSnapshot,
      transitions: [transitions[1]!, transitions[3]!],
    },
    {
      key: 'queue-3',
      label: 'Queue 3 Events',
      startSnapshot: initialSnapshot,
      transitions: [transitions[0]!, transitions[1]!, transitions[2]!],
    },
    {
      key: 'duplicate-event',
      label: 'Duplicate Event',
      startSnapshot: initialSnapshot,
      transitions: [diceScenarioFor(4), diceScenarioFor(4)],
    },
    {
      key: 'simulate-reconnect',
      label: 'Simulate Reconnect',
      startSnapshot: redMoveOnlyStartSnapshot,
      transitions: [moveOnlyScenario],
      invalidateToSnapshot: invalidateSnapshot,
    },
    {
      key: 'home-entry',
      label: 'HOME ENTRY',
      startSnapshot: greenRollSnapshot,
      transitions: [homeEntryScenario],
    },
    {
      key: 'home-complete',
      label: 'HOME COMPLETE',
      startSnapshot: greenRollSnapshot,
      transitions: [transitions[5]!],
    },
    {
      key: 'victory',
      label: 'VICTORY',
      startSnapshot: greenRollSnapshot,
      transitions: [transitions[5]!],
    },
    {
      key: 'victory-last-active',
      label: 'VICTORY LAST ACTIVE',
      startSnapshot: greenSurrenderSnapshot,
      transitions: [lastActiveVictoryScenario],
    },
    {
      key: 'surrender',
      label: 'SURRENDER',
      startSnapshot: base ? initialSnapshot : initialSnapshot,
      transitions: [transitions[6]!],
    },
    {
      key: 'turn-change',
      label: 'TURN CHANGE',
      startSnapshot: initialSnapshot,
      transitions: [turnChangeScenario],
    },
    {
      key: 'snapshot-invalidate',
      label: 'SNAPSHOT INVALIDATE',
      startSnapshot: redMoveOnlyStartSnapshot,
      transitions: [moveOnlyScenario],
      invalidateToSnapshot: invalidateSnapshot,
    },
  ];

  return {
    initialSnapshot,
    transitions,
    localPlayerId,
    scenarios,
  };
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return reduced;
}

function useGameplayAnimationRuntime(
  controller: PresentationControllerState,
  boardRef: { current: PremiumPresentationHandle | null },
  players: ReturnType<typeof projectGameScreenModel>['players'],
  onComplete: (state: PresentationControllerState) => void,
  controllerInstanceId: number,
) {
  const reducedMotion = usePrefersReducedMotion();
  const [runtime, setRuntime] = useState(() =>
    createIdleAnimationState(controller.presentationSnapshot),
  );
  const active = controller.queue.active;
  const token = getActivePresentationToken(controller);
  const activePresentationRunKey = active && token
    ? [
        token.matchId,
        token.generation,
        token.transitionId,
        token.stateVersion,
        token.toSequence,
      ].join(':')
    : null;

  useEffect(() => {
    if (!active || !token) {
      setRuntime(createIdleAnimationState(controller.presentationSnapshot));
      return;
    }

    const abort = new AbortController();
    recordGameplayTelemetry('PRESENTATION_START', {
      matchId: active.matchId,
      eventId: active.transitionId,
      actionId: active.actionId,
      sequence: active.toSequence,
      stateVersion: active.stateVersion,
      transitionType: active.events.map((event) => event.type).join('+'),
      controllerInstanceId,
      reason: 'debug-harness',
    });
    const frames = buildGameplayAnimationFrames({
      transition: active,
      initialSnapshot: controller.presentationSnapshot,
      reducedMotion,
    });
    const plan = createGameplayPresentationPlan(active);

    void Promise.all([
      runGameplayAnimationFrames(frames, {
        signal: abort.signal,
        onFrame: setRuntime,
      }),
      playPremiumTransition(
        boardRef.current,
        active,
        controller.presentationSnapshot,
        players,
        plan,
        abort.signal,
      ),
    ]).then(() => {
      if (!abort.signal.aborted) {
        const completion = completeActivePresentation(controller, token);
        if (completion.kind === 'completed') {
          recordGameplayTelemetry('PRESENTATION_COMPLETE', {
            matchId: active.matchId,
            eventId: active.transitionId,
            actionId: active.actionId,
            sequence: active.toSequence,
            stateVersion: active.stateVersion,
            transitionType: active.events.map((event) => event.type).join('+'),
            controllerInstanceId,
            reason: 'debug-harness',
          });
          onComplete(completion.state);
        }
      }
    });

    return () => {
      recordGameplayTelemetry('PRESENTATION_CANCEL', {
        matchId: active.matchId,
        eventId: active.transitionId,
        actionId: active.actionId,
        sequence: active.toSequence,
        stateVersion: active.stateVersion,
        transitionType: active.events.map((event) => event.type).join('+'),
        controllerInstanceId,
        reason: 'debug-harness-effect-cleanup',
      });
      abort.abort();
      recordGameplayTelemetry('SNAP_TO_AUTHORITATIVE', {
        matchId: controller.matchId,
        stateVersion: controller.authoritativeSnapshot.stateVersion,
        controllerInstanceId,
        reason: 'debug-harness-effect-cleanup',
      });
      boardRef.current?.snapToAuthoritativeState(controller.authoritativeSnapshot);
    };
  }, [activePresentationRunKey, reducedMotion]);

  return runtime;
}

export function GameplayRuntimePreview({
  localPlayerId,
  mode = 'auto',
  mobileChatOpen = false,
  onRequestMobileChatClose,
}: {
  localPlayerId: string;
  mode?: 'auto' | 'manual';
  mobileChatOpen?: boolean;
  onRequestMobileChatClose?: (() => void) | undefined;
}) {
  const fixture = useMemo(() => createRuntimePreviewFixture(localPlayerId), [localPlayerId]);
  const nextControllerInstanceId = useRef(1);
  const [controllerInstanceId, setControllerInstanceId] = useState(1);
  const [controller, setController] = useState(() =>
    createPresentationController('epic-06-preview', fixture.initialSnapshot),
  );
  const [playlist, setPlaylist] = useState<readonly TransitionEnvelope[]>(() =>
    mode === 'auto' ? fixture.transitions : [],
  );
  const [nextIndex, setNextIndex] = useState(0);
  const screen = useMemo(
    () =>
      projectGameScreenModel(
        snapshotToGameState(controller.presentationSnapshot),
        fixture.localPlayerId,
      ),
    [controller.presentationSnapshot, fixture.localPlayerId],
  );
  const boardRef = useRef<PremiumPresentationHandle | null>(null);
  const [telemetryVersion, setTelemetryVersion] = useState(0);
  const runtime = useGameplayAnimationRuntime(
    controller,
    boardRef,
    screen.players,
    setController,
    controllerInstanceId,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('zamanushka:gameplayTelemetry', 'true');
    const interval = window.setInterval(() => setTelemetryVersion((value) => value + 1), 250);
    return () => window.clearInterval(interval);
  }, []);

  function createController(reason: string, snapshot: MatchSnapshot) {
    const nextId = nextControllerInstanceId.current + 1;
    nextControllerInstanceId.current = nextId;
    setControllerInstanceId(nextId);
    recordGameplayTelemetry('PRESENTATION_CONTROLLER_CREATE', {
      matchId: 'epic-06-preview',
      stateVersion: snapshot.stateVersion,
      controllerInstanceId: nextId,
      reason,
    });
    return createPresentationController('epic-06-preview', snapshot);
  }

  useEffect(() => {
    setController(createController('debug-harness-fixture-reset', fixture.initialSnapshot));
    setPlaylist(mode === 'auto' ? fixture.transitions : []);
    setNextIndex(0);
  }, [fixture, mode]);

  useEffect(() => {
    if (
      controller.recoveryRequired ||
      controller.queue.active ||
      controller.queue.queued.length > 0
    ) {
      return;
    }

    if (nextIndex >= playlist.length) {
      if (mode !== 'auto') return;
      const timeout = window.setTimeout(() => {
        setController(createController('debug-harness-auto-loop', fixture.initialSnapshot));
        setPlaylist(fixture.transitions);
        setNextIndex(0);
      }, 1400);
      return () => window.clearTimeout(timeout);
    }

    const accepted = acceptCommittedTransition(controller, playlist[nextIndex]!);
    if (accepted.kind === 'queued') {
      const transition = playlist[nextIndex]!;
      recordGameplayTelemetry('PRESENTATION_TRANSITION_ENQUEUE', {
        matchId: transition.matchId,
        eventId: transition.transitionId,
        actionId: transition.actionId,
        sequence: transition.toSequence,
        stateVersion: transition.stateVersion,
        transitionType: transition.events.map((event) => event.type).join('+'),
        controllerInstanceId,
        reason: 'debug-harness-playlist',
      });
      setController(accepted.state);
      setNextIndex((value) => value + 1);
    }
  }, [controller, fixture, mode, nextIndex, playlist]);

  function playScenario(scenario: PreviewScenario) {
    setController(createController(`debug-harness-scenario:${scenario.key}`, scenario.startSnapshot));
    setPlaylist(scenario.transitions);
    setNextIndex(0);
    if (scenario.invalidateToSnapshot) {
      window.setTimeout(() => {
        setController((current) =>
          reconcileAuthoritativeSnapshot(
            current,
            'epic-06-preview',
            scenario.invalidateToSnapshot!,
          ),
        );
      }, 260);
    }
  }

  function resetPreview() {
    setController(createController('debug-harness-reset-button', fixture.initialSnapshot));
    setPlaylist(mode === 'auto' ? fixture.transitions : []);
    setNextIndex(0);
  }

  const telemetry = typeof window === 'undefined'
    ? []
    : [...(window.__zGameplayTelemetry ?? [])].slice(-40).reverse();
  void telemetryVersion;
  const current = controller.queue.active;

  return (
    <div className="epic06-runtime-preview" data-testid="epic06-runtime-preview">
      {mode === 'manual' ? (
        <div className="epic06-runtime-preview__controls" aria-label="EPIC-06 animation scenarios">
          {fixture.scenarios.map((scenario) => (
            <button
              key={scenario.key}
              type="button"
              className="epic06-runtime-preview__button"
              onClick={() => playScenario(scenario)}
            >
              {scenario.label}
            </button>
          ))}
          <button
            type="button"
            className="epic06-runtime-preview__button epic06-runtime-preview__button--secondary"
            onClick={resetPreview}
          >
            RESET
          </button>
        </div>
      ) : null}
      {mode === 'manual' ? (
        <section className="epic06-runtime-preview__telemetry" aria-label="Gameplay presentation telemetry">
          <h2>Presentation telemetry</h2>
          <dl>
            <dt>controller instance id</dt>
            <dd>{controllerInstanceId}</dd>
            <dt>current eventId</dt>
            <dd>{current?.transitionId ?? 'none'}</dd>
            <dt>sequence</dt>
            <dd>{current?.toSequence ?? controller.presentationWatermark.lastSequence}</dd>
            <dt>stateVersion</dt>
            <dd>{current?.stateVersion ?? controller.presentationSnapshot.stateVersion}</dd>
          </dl>
          <ol>
            {telemetry.map((entry: GameplayTelemetryEvent, index) => (
              <li key={`${entry.event}-${entry.clientNowMs ?? entry.at}-${index}`}>
                <code>{entry.event}</code>
                {' '}
                <span>{String(entry.transitionType ?? entry.eventId ?? entry.reason ?? '')}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <GameBoard
        ref={boardRef}
        pawns={screen.pawns}
        players={screen.players}
        previewGuides
        mobileChatOpen={mobileChatOpen}
        onMobileChatClose={onRequestMobileChatClose}
        presentation={runtime}
        dieValue={runtime.dieValue}
        dieRolling={runtime.dieRolling}
        victoryPlayerId={runtime.victoryPlayerId}
      />
    </div>
  );
}
