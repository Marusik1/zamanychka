import { createActiveGameState } from '@zamanushka/game-engine';
import type { MatchSnapshot, TransitionEnvelope } from '@zamanushka/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildGameplayAnimationFrames,
  runGameplayAnimationFrames,
  type GameplayAnimationRuntimeState,
} from './animation-director.js';

function toSnapshot(stateVersion = 1, lastSequence = 1): MatchSnapshot {
  const state = createActiveGameState({
    playerCount: 4,
    seatOrder: ['red-seat', 'blue-seat', 'yellow-seat', 'green-seat'],
    firstPlayerId: 'green-seat',
  });

  const players = state.players.map((player) => ({
    playerId: player.playerId,
    color: player.color,
    seatIndex: player.seatIndex,
    status: player.status,
  }));

  const pawns = state.pawns.map((pawn) => ({
    pawnId: pawn.pawnId,
    playerId: pawn.playerId,
    color: pawn.color,
    position: pawn.position,
  }));

  return {
    status: 'ACTIVE',
    stateVersion,
    turnNumber: 1,
    turnPhase: 'WAITING_FOR_ACTION',
    currentPlayerId: 'green-seat',
    diceValue: 4,
    winnerPlayerId: null,
    winReason: null,
    players,
    pawns,
    lastSequence,
  };
}

function transition(
  events: TransitionEnvelope['events'],
  snapshot: MatchSnapshot,
  transitionId = 'tx-1',
): TransitionEnvelope {
  return {
    matchId: 'match-1',
    transitionId,
    actionId: `${transitionId}:action`,
    stateVersion: snapshot.stateVersion,
    fromSequence: events[0]?.sequence ?? 1,
    toSequence: events.at(-1)?.sequence ?? 1,
    events,
    watermark: { stateVersion: snapshot.stateVersion, lastSequence: snapshot.lastSequence },
    snapshot,
  };
}

function collectPawnPositions(
  states: readonly GameplayAnimationRuntimeState[],
  pawnId: string,
): string[] {
  return states
    .map((state) => state.pawnVisuals[pawnId])
    .filter((visual): visual is NonNullable<typeof visual> => Boolean(visual))
    .map((visual) =>
      visual.anchor.kind === 'board'
        ? `${visual.anchor.coord.row}:${visual.anchor.coord.col}`
        : `${visual.anchor.kind}:${visual.anchor.color}:${visual.anchor.slot}`,
    )
    .filter((position, index, positions) => position !== positions[index - 1]);
}

describe('animation director', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('represents every committed physicalPath coordinate in order without recalculation', async () => {
    const initial = toSnapshot(1, 1);
    const final = {
      ...toSnapshot(2, 2),
      pawns: toSnapshot(2, 2).pawns.map((pawn) =>
        pawn.pawnId === 'green-seat-pawn-1'
          ? { ...pawn, position: { zone: 'PERIMETER' as const, progress: 4 } }
          : pawn,
      ),
      lastSequence: 2,
    };

    const tx = transition(
      [
        {
          matchId: 'match-1',
          eventId: 'e1',
          sequence: 2,
          stateVersion: 2,
          type: 'pawnMoved',
          payload: {
            pawnId: 'green-seat-pawn-1',
            playerId: 'green-seat',
            fromCoord: { row: 7, col: 0 },
            toCoord: { row: 5, col: 1 },
            physicalPath: [
              { row: 6, col: 0 },
              { row: 5, col: 0 },
              { row: 5, col: 1 },
            ],
            capture: null,
          },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
      ],
      final,
    );

    const frames = buildGameplayAnimationFrames({
      transition: tx,
      initialSnapshot: initial,
      reducedMotion: false,
    });

    expect(
      frames
        .map((frame) => frame.state.pawnVisuals['green-seat-pawn-1'])
        .filter((visual): visual is NonNullable<typeof visual> => Boolean(visual))
        .filter((visual, index, visuals) => {
          const previous = visuals[index - 1];
          if (!previous) return true;
          if (visual.anchor.kind !== 'board' || previous.anchor.kind !== 'board') return true;
          return (
            visual.anchor.coord.row !== previous.anchor.coord.row ||
            visual.anchor.coord.col !== previous.anchor.coord.col
          );
        })
        .map((visual) =>
          visual.anchor.kind === 'board'
            ? `${visual.anchor.coord.row}:${visual.anchor.coord.col}`
            : visual.anchor.kind,
        ),
    ).toEqual(['7:0', '6:0', '5:0', '5:1']);

    const applied: GameplayAnimationRuntimeState[] = [];
    const run = runGameplayAnimationFrames(frames, {
      signal: new AbortController().signal,
      onFrame: (state) => applied.push(state),
    });

    await vi.runAllTimersAsync();
    await run;

    expect(collectPawnPositions(applied, 'green-seat-pawn-1')).toEqual(['7:0', '6:0', '5:0', '5:1']);
  });

  it('keeps pawnMoved as the only spatial owner when pawnEnteredHome follows in the same transition', () => {
    const initial = toSnapshot(10, 10);
    const final = {
      ...toSnapshot(11, 12),
      pawns: toSnapshot(11, 12).pawns.map((pawn) =>
        pawn.pawnId === 'green-seat-pawn-1'
          ? { ...pawn, position: { zone: 'HOME' as const, homeIndex: 0 as const } }
          : pawn,
      ),
      lastSequence: 12,
    };

    const tx = transition(
      [
        {
          matchId: 'match-1',
          eventId: 'e11',
          sequence: 11,
          stateVersion: 11,
          type: 'pawnMoved',
          payload: {
            pawnId: 'green-seat-pawn-1',
            playerId: 'green-seat',
            fromCoord: { row: 6, col: 1 },
            toCoord: { row: 7, col: 0 },
            physicalPath: [{ row: 7, col: 0 }],
            capture: null,
          },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
          matchId: 'match-1',
          eventId: 'e12',
          sequence: 12,
          stateVersion: 11,
          type: 'pawnEnteredHome',
          payload: {
            pawnId: 'green-seat-pawn-1',
            playerId: 'green-seat',
            homeIndex: 0,
            fromCoord: { row: 6, col: 1 },
            toCoord: { row: 7, col: 0 },
          },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
      ],
      final,
      'tx-home',
    );

    const frames = buildGameplayAnimationFrames({
      transition: tx,
      initialSnapshot: initial,
      reducedMotion: false,
    });

    const movingAnchors = frames
      .filter((frame) => frame.state.pawnVisuals['green-seat-pawn-1']?.motion === 'moving')
      .map((frame) => frame.state.pawnVisuals['green-seat-pawn-1']?.anchor)
      .filter((anchor): anchor is NonNullable<typeof anchor> => Boolean(anchor));

    expect(movingAnchors.at(-1)).toEqual({ kind: 'board', coord: { row: 7, col: 0 } });
    expect(
      frames.some((frame) => frame.state.pawnVisuals['green-seat-pawn-1']?.motion === 'home-cue'),
    ).toBe(true);
  });

  it('preserves capture order: attacker path, then victim exit', () => {
    const initial = toSnapshot(20, 20);
    const final = {
      ...toSnapshot(21, 22),
      pawns: toSnapshot(21, 22).pawns.map((pawn) => {
        if (pawn.pawnId === 'green-seat-pawn-1') {
          return { ...pawn, position: { zone: 'PERIMETER' as const, progress: 3 } };
        }
        if (pawn.pawnId === 'red-seat-pawn-1') {
          return { ...pawn, position: { zone: 'OFF_BOARD' as const } };
        }
        return pawn;
      }),
      lastSequence: 22,
    };

    const tx = transition(
      [
        {
          matchId: 'match-1',
          eventId: 'e21',
          sequence: 21,
          stateVersion: 21,
          type: 'pawnMoved',
          payload: {
            pawnId: 'green-seat-pawn-1',
            playerId: 'green-seat',
            fromCoord: { row: 7, col: 0 },
            toCoord: { row: 7, col: 3 },
            physicalPath: [{ row: 7, col: 1 }, { row: 7, col: 2 }, { row: 7, col: 3 }],
            capture: { capturedPawnId: 'red-seat-pawn-1', capturedPlayerId: 'red-seat' },
          },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
          matchId: 'match-1',
          eventId: 'e22',
          sequence: 22,
          stateVersion: 21,
          type: 'pawnCaptured',
          payload: {
            capturedPawnId: 'red-seat-pawn-1',
            capturedPlayerId: 'red-seat',
            byPawnId: 'green-seat-pawn-1',
            byPlayerId: 'green-seat',
            atCoord: { row: 7, col: 3 },
          },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
      ],
      final,
      'tx-capture',
    );

    const frames = buildGameplayAnimationFrames({
      transition: tx,
      initialSnapshot: initial,
      reducedMotion: false,
    });

    const attackerArrivalIndex = frames.findIndex(
      (frame) =>
        frame.state.pawnVisuals['green-seat-pawn-1']?.anchor.kind === 'board' &&
        frame.state.pawnVisuals['green-seat-pawn-1']?.anchor.coord.row === 7 &&
        frame.state.pawnVisuals['green-seat-pawn-1']?.anchor.coord.col === 3,
    );
    const victimExitIndex = frames.findIndex(
      (frame) => frame.state.pawnVisuals['red-seat-pawn-1']?.motion === 'captured',
    );

    expect(attackerArrivalIndex).toBeGreaterThan(-1);
    expect(victimExitIndex).toBeGreaterThan(attackerArrivalIndex);
  });

  it('keeps captured pawn lift-off on the destination cell instead of teleporting it into reserve mid-animation', () => {
    const initial = toSnapshot(30, 30);
    const final = {
      ...toSnapshot(31, 32),
      pawns: toSnapshot(31, 32).pawns.map((pawn) => {
        if (pawn.pawnId === 'green-seat-pawn-1') {
          return { ...pawn, position: { zone: 'PERIMETER' as const, progress: 3 } };
        }
        if (pawn.pawnId === 'red-seat-pawn-1') {
          return { ...pawn, position: { zone: 'OFF_BOARD' as const } };
        }
        return pawn;
      }),
      lastSequence: 32,
    };

    const tx = transition(
      [
        {
          matchId: 'match-1',
          eventId: 'e31',
          sequence: 31,
          stateVersion: 31,
          type: 'pawnMoved',
          payload: {
            pawnId: 'green-seat-pawn-1',
            playerId: 'green-seat',
            fromCoord: { row: 7, col: 0 },
            toCoord: { row: 7, col: 3 },
            physicalPath: [{ row: 7, col: 1 }, { row: 7, col: 2 }, { row: 7, col: 3 }],
            capture: { capturedPawnId: 'red-seat-pawn-1', capturedPlayerId: 'red-seat' },
          },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
          matchId: 'match-1',
          eventId: 'e32',
          sequence: 32,
          stateVersion: 31,
          type: 'pawnCaptured',
          payload: {
            capturedPawnId: 'red-seat-pawn-1',
            capturedPlayerId: 'red-seat',
            byPawnId: 'green-seat-pawn-1',
            byPlayerId: 'green-seat',
            atCoord: { row: 7, col: 3 },
          },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
      ],
      final,
      'tx-capture-liftoff',
    );

    const frames = buildGameplayAnimationFrames({
      transition: tx,
      initialSnapshot: initial,
      reducedMotion: false,
    });

    const capturedAnchors = frames
      .filter((frame) => frame.state.pawnVisuals['red-seat-pawn-1']?.motion === 'captured')
      .map((frame) => frame.state.pawnVisuals['red-seat-pawn-1']?.anchor)
      .filter((anchor): anchor is NonNullable<typeof anchor> => Boolean(anchor));

    expect(capturedAnchors).toHaveLength(2);
    expect(capturedAnchors.every((anchor) => anchor.kind === 'board')).toBe(true);
    expect(
      capturedAnchors.every(
        (anchor) => anchor.kind === 'board' && anchor.coord.row === 7 && anchor.coord.col === 3,
      ),
    ).toBe(true);
  });

  it('supports cancellation so snapshot fallback or match reset can invalidate stale callbacks', async () => {
    const initial = toSnapshot(1, 1);
    const final = toSnapshot(2, 2);
    const tx = transition(
      [
        {
          matchId: 'match-1',
          eventId: 'e1',
          sequence: 2,
          stateVersion: 2,
          type: 'diceRolled',
          payload: { playerId: 'green-seat', diceValue: 4 },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
      ],
      final,
      'tx-cancel',
    );

    const frames = buildGameplayAnimationFrames({
      transition: tx,
      initialSnapshot: initial,
      reducedMotion: false,
    });

    const abort = new AbortController();
    const applied: GameplayAnimationRuntimeState[] = [];
    const run = runGameplayAnimationFrames(frames, {
      signal: abort.signal,
      onFrame: (state) => applied.push(state),
    });

    await Promise.resolve();
    abort.abort();
    await vi.runAllTimersAsync();
    await expect(run).resolves.toBeUndefined();
    expect(applied).toHaveLength(1);
    expect(applied[0]?.dieRolling).toBe(true);
  });
});
