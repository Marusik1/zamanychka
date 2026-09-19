import { createActiveGameState } from '@zamanushka/game-engine';
import type { MatchSnapshot, TransitionEnvelope } from '@zamanushka/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ANIMATION_TIMINGS,
  buildGameplayAnimationFrames,
  movementDurationMs,
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
    startedAt: '2026-09-01T10:00:00.000Z',
    finishedAt: null,
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

  it('keeps one-to-six-cell movement inside the approved physical timing budget', () => {
    expect(movementDurationMs(1)).toBeGreaterThanOrEqual(130);
    expect(movementDurationMs(1)).toBeLessThanOrEqual(170);
    expect(movementDurationMs(3)).toBeGreaterThanOrEqual(400);
    expect(movementDurationMs(3)).toBeLessThanOrEqual(500);
    expect(movementDurationMs(6)).toBeGreaterThanOrEqual(750);
    expect(movementDurationMs(6)).toBeLessThanOrEqual(950);
  });

  it('adds a short settle frame on an exact perimeter corner before continuing', () => {
    const initial = toSnapshot(1, 1);
    const tx = transition([
      {
        matchId: 'match-1', eventId: 'corner-move', sequence: 2, stateVersion: 2,
        type: 'pawnMoved',
        payload: {
          pawnId: 'green-seat-pawn-1', playerId: 'green-seat',
          fromCoord: { row: 1, col: 0 }, toCoord: { row: 0, col: 1 },
          physicalPath: [{ row: 0, col: 0 }, { row: 0, col: 1 }], capture: null,
        },
        createdAt: '2026-09-08T00:00:00.000Z',
      },
    ], toSnapshot(2, 2), 'corner-settle');

    const frames = buildGameplayAnimationFrames({ transition: tx, initialSnapshot: initial, reducedMotion: false });
    const cornerFrames = frames.filter((frame) => {
      const visual = frame.state.pawnVisuals['green-seat-pawn-1'];
      return visual?.anchor.kind === 'board' && visual.anchor.coord.row === 0 && visual.anchor.coord.col === 0;
    });

    expect(cornerFrames.some((frame) => frame.durationMs === ANIMATION_TIMINGS.cornerSettleMs)).toBe(true);
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

    expect(collectPawnPositions(applied, 'green-seat-pawn-1')).toEqual([
      '7:0',
      '6:0',
      '5:0',
      '5:1',
    ]);
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

  it('uses a distinct stronger settle only for the final HOME(3) slot', () => {
    const initial = toSnapshot(12, 12);
    const final = {
      ...toSnapshot(13, 13),
      pawns: toSnapshot(13, 13).pawns.map((pawn) =>
        pawn.pawnId === 'green-seat-pawn-1'
          ? { ...pawn, position: { zone: 'HOME' as const, homeIndex: 3 as const } }
          : pawn,
      ),
    };
    const tx = transition([
      {
        matchId: 'match-1', eventId: 'e13', sequence: 13, stateVersion: 13,
        type: 'pawnEnteredHome',
        payload: {
          pawnId: 'green-seat-pawn-1', playerId: 'green-seat', homeIndex: 3,
          fromCoord: { row: 4, col: 3 }, toCoord: { row: 4, col: 4 },
        },
        createdAt: '2026-09-08T00:00:00.000Z',
      },
    ], final, 'tx-home-final');

    const frames = buildGameplayAnimationFrames({ transition: tx, initialSnapshot: initial, reducedMotion: false });

    expect(frames.some((frame) => frame.state.pawnVisuals['green-seat-pawn-1']?.motion === 'home-final')).toBe(true);
    expect(frames.some((frame) => frame.state.pawnVisuals['green-seat-pawn-1']?.motion === 'home-cue')).toBe(false);
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
            physicalPath: [
              { row: 7, col: 1 },
              { row: 7, col: 2 },
              { row: 7, col: 3 },
            ],
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

  it('keeps captured pawn on the impact cell before returning it to its reserve anchor', () => {
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
            physicalPath: [
              { row: 7, col: 1 },
              { row: 7, col: 2 },
              { row: 7, col: 3 },
            ],
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
      .filter((frame) => Boolean(frame.state.pawnVisuals['red-seat-pawn-1']))
      .map((frame) => frame.state.pawnVisuals['red-seat-pawn-1']?.anchor)
      .filter((anchor): anchor is NonNullable<typeof anchor> => Boolean(anchor));

    expect(capturedAnchors.length).toBeGreaterThanOrEqual(2);
    expect(capturedAnchors[0]).toEqual({ kind: 'board', coord: { row: 7, col: 3 } });
    expect(capturedAnchors.at(-1)).toEqual({ kind: 'reserve', color: 'RED', slot: 0 });
  });

  it('shows attacker impact before the captured pawn starts its reserve return', () => {
    const initial = toSnapshot(40, 40);
    const tx = transition([
      {
        matchId: 'match-1', eventId: 'move-impact', sequence: 41, stateVersion: 41,
        type: 'pawnMoved',
        payload: {
          pawnId: 'green-seat-pawn-1', playerId: 'green-seat',
          fromCoord: { row: 7, col: 0 }, toCoord: { row: 7, col: 1 },
          physicalPath: [{ row: 7, col: 1 }],
          capture: { capturedPawnId: 'red-seat-pawn-1', capturedPlayerId: 'red-seat' },
        }, createdAt: '2026-09-08T00:00:00.000Z',
      },
      {
        matchId: 'match-1', eventId: 'capture-impact', sequence: 42, stateVersion: 41,
        type: 'pawnCaptured',
        payload: {
          capturedPawnId: 'red-seat-pawn-1', capturedPlayerId: 'red-seat',
          byPawnId: 'green-seat-pawn-1', byPlayerId: 'green-seat', atCoord: { row: 7, col: 1 },
        }, createdAt: '2026-09-08T00:00:00.000Z',
      },
    ], toSnapshot(41, 42), 'tx-impact');

    const frames = buildGameplayAnimationFrames({ transition: tx, initialSnapshot: initial, reducedMotion: false });
    const impactIndex = frames.findIndex(
      (frame) => frame.state.pawnVisuals['green-seat-pawn-1']?.motion === 'capture-impact',
    );
    const returnIndex = frames.findIndex(
      (frame) => frame.state.pawnVisuals['red-seat-pawn-1']?.motion === 'capture-return',
    );
    expect(impactIndex).toBeGreaterThan(-1);
    expect(returnIndex).toBeGreaterThan(impactIndex);
  });

  it('keeps the terminal result hidden for a causal pause after the final pawn presentation', () => {
    const initial = toSnapshot(50, 50);
    const tx = transition([
      {
        matchId: 'match-1', eventId: 'win', sequence: 51, stateVersion: 51,
        type: 'gameWon',
        payload: { winnerPlayerId: 'green-seat', reason: 'LAST_ACTIVE_PLAYER' },
        createdAt: '2026-09-08T00:00:00.000Z',
      },
    ], { ...toSnapshot(51, 51), status: 'FINISHED', winnerPlayerId: 'green-seat', winReason: 'LAST_ACTIVE_PLAYER' }, 'tx-win');

    const frames = buildGameplayAnimationFrames({ transition: tx, initialSnapshot: initial, reducedMotion: false });
    const victoryIndex = frames.findIndex((frame) => frame.state.victoryPlayerId === 'green-seat');

    expect(victoryIndex).toBeGreaterThan(0);
    expect(frames[victoryIndex - 1]?.durationMs).toBe(ANIMATION_TIMINGS.resultDelayMs);
    expect(frames[victoryIndex - 1]?.state.victoryPlayerId).toBeNull();
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
