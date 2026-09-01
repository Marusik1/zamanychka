import { describe, expect, it } from 'vitest';

import type { MatchSnapshot, TransitionEnvelope } from '@zamanushka/shared';

import {
  acceptCommittedTransition,
  completeActivePresentation,
  createPresentationController,
  getActivePresentationPlan,
  getActivePresentationToken,
  reconcileAuthoritativeSnapshot,
} from './presentation-controller.js';

function snapshot(_matchId = 'match-1', stateVersion = 1, lastSequence = 1): MatchSnapshot {
  return {
    status: 'ACTIVE',
    stateVersion,
    turnNumber: 1,
    turnPhase: 'WAITING_FOR_ROLL',
    currentPlayerId: 'p1',
    diceValue: null,
    winnerPlayerId: null,
    winReason: null,
    players: [],
    pawns: [],
    lastSequence,
  };
}

function transition(
  transitionId: string,
  fromSequence: number,
  toSequence: number,
  stateVersion = toSequence,
  matchId = 'match-1',
): TransitionEnvelope {
  return {
    matchId,
    transitionId,
    actionId: `${transitionId}:action`,
    stateVersion,
    fromSequence,
    toSequence,
    events: Array.from({ length: toSequence - fromSequence + 1 }, (_, index) => ({
      matchId,
      eventId: `${transitionId}:event-${index}`,
      sequence: fromSequence + index,
      stateVersion,
      type: 'pawnMoved',
      payload: {
        pawnId: 'p1-1',
        playerId: 'p1',
        fromCoord: { row: 0, col: 1 },
        toCoord: { row: 0, col: 2 },
        physicalPath: [{ row: 0, col: 2 }],
        capture: null,
      },
      createdAt: '2026-08-25T00:00:00.000Z',
    })),
    watermark: { stateVersion, lastSequence: toSequence },
    snapshot: snapshot(matchId, stateVersion, toSequence),
  };
}

describe('presentation controller', () => {
  it('keeps authoritative state ahead while contiguous presentation transitions drain FIFO', () => {
    let controller = createPresentationController('match-1', snapshot());
    const first = transition('t2', 2, 2, 2);
    const second = transition('t3', 3, 3, 3);

    const acceptedFirst = acceptCommittedTransition(controller, first);
    expect(acceptedFirst.kind).toBe('queued');
    controller = acceptedFirst.state;
    expect(controller.authoritativeSnapshot).toBe(first.snapshot);
    expect(controller.presentationSnapshot).not.toBe(first.snapshot);
    expect(controller.queue.active).toBe(first);

    const acceptedSecond = acceptCommittedTransition(controller, second);
    expect(acceptedSecond.kind).toBe('queued');
    controller = acceptedSecond.state;
    expect(controller.authoritativeSnapshot).toBe(second.snapshot);
    expect(controller.presentationSnapshot).not.toBe(second.snapshot);
    expect(controller.queue.active).toBe(first);
    expect(controller.queue.queued).toEqual([second]);

    const firstToken = getActivePresentationToken(controller);
    expect(firstToken).not.toBeNull();
    const completedFirst = completeActivePresentation(controller, firstToken!);
    expect(completedFirst.kind).toBe('completed');
    controller = completedFirst.state;
    expect(controller.presentationSnapshot).toBe(first.snapshot);
    expect(controller.queue.active).toBe(second);

    const secondToken = getActivePresentationToken(controller);
    expect(secondToken).not.toBeNull();
    const completedSecond = completeActivePresentation(controller, secondToken!);
    expect(completedSecond.kind).toBe('completed');
    controller = completedSecond.state;
    expect(controller.presentationSnapshot).toBe(second.snapshot);
    expect(controller.queue.active).toBeNull();
  });

  it('ignores duplicate and already reconciled transitions without replaying them', () => {
    let controller = createPresentationController('match-1', snapshot('match-1', 2, 2));
    const stale = transition('t2', 2, 2, 2);
    const fresh = transition('t3', 3, 3, 3);

    expect(acceptCommittedTransition(controller, stale).kind).toBe('duplicate_ignored');

    const acceptedFresh = acceptCommittedTransition(controller, fresh);
    expect(acceptedFresh.kind).toBe('queued');
    controller = acceptedFresh.state;
    expect(acceptCommittedTransition(controller, fresh).kind).toBe('duplicate_ignored');

    const token = getActivePresentationToken(controller);
    expect(token).not.toBeNull();
    const completed = completeActivePresentation(controller, token!);
    expect(completed.kind).toBe('completed');
    controller = completed.state;
    expect(acceptCommittedTransition(controller, fresh).kind).toBe('duplicate_ignored');
  });

  it('delegates gaps and unsafe overlaps to recovery without advancing presentation', () => {
    const controller = createPresentationController('match-1', snapshot());
    const gap = transition('t4', 4, 4, 4);
    const gapResult = acceptCommittedTransition(controller, gap);

    expect(gapResult.kind).toBe('recovery_required');
    expect(gapResult.state.recoveryRequired).toBe('SEQUENCE_GAP');
    expect(gapResult.state.presentationSnapshot).toBe(controller.presentationSnapshot);
    expect(gapResult.state.queue.active).toBeNull();

    const first = acceptCommittedTransition(controller, transition('t2', 2, 2, 2));
    expect(first.kind).toBe('queued');
    const overlap = transition('overlap', 2, 3, 3);
    const overlapResult = acceptCommittedTransition(first.state, overlap);

    expect(overlapResult.kind).toBe('recovery_required');
    expect(overlapResult.state.recoveryRequired).toBe('SEQUENCE_OVERLAP');
    expect(overlapResult.state.queue.active).toBeNull();
    expect(overlapResult.state.queue.queued).toEqual([]);
  });

  it('snapshot fallback cancels active work, clears stale queue, and rejects stale callbacks', () => {
    let controller = createPresentationController('match-1', snapshot());
    const accepted = acceptCommittedTransition(controller, transition('t2', 2, 2, 2));
    expect(accepted.kind).toBe('queued');
    controller = accepted.state;
    const staleToken = getActivePresentationToken(controller);
    expect(staleToken).not.toBeNull();

    controller = reconcileAuthoritativeSnapshot(controller, 'match-1', snapshot('match-1', 10, 20));

    expect(controller.generation).toBe(1);
    expect(controller.queue.active).toBeNull();
    expect(controller.queue.queued).toEqual([]);
    expect(controller.presentationWatermark).toEqual({ stateVersion: 10, lastSequence: 20 });

    const staleCompletion = completeActivePresentation(controller, staleToken!);
    expect(staleCompletion.kind).toBe('no_active_transition');
    expect(staleCompletion.state).toBe(controller);
  });

  it('match identity changes reset presentation and reject stale match transitions', () => {
    let controller = createPresentationController('match-a', snapshot('match-a'));
    const wrongMatch = acceptCommittedTransition(controller, transition('b2', 2, 2, 2, 'match-b'));
    expect(wrongMatch.kind).toBe('recovery_required');
    expect(wrongMatch.state.recoveryRequired).toBe('MATCH_MISMATCH');

    controller = reconcileAuthoritativeSnapshot(controller, 'match-b', snapshot('match-b', 1, 1));
    expect(controller.matchId).toBe('match-b');
    expect(controller.queue.active).toBeNull();

    const staleMatch = acceptCommittedTransition(controller, transition('a2', 2, 2, 2, 'match-a'));
    expect(staleMatch.kind).toBe('recovery_required');
    expect(staleMatch.state.recoveryRequired).toBe('MATCH_MISMATCH');
  });

  it('is immutable and contains no legal-action authority', () => {
    const controller = createPresentationController('match-1', snapshot());
    const accepted = acceptCommittedTransition(controller, transition('t2', 2, 2, 2));

    expect(accepted.state).not.toBe(controller);
    expect(controller.authoritativeWatermark).toEqual({ stateVersion: 1, lastSequence: 1 });
    expect(JSON.stringify(accepted.state)).not.toContain('legalActions');
    expect(JSON.stringify(accepted.state)).not.toContain('expectedStateVersion');
  });

  it('exposes the active committed transition as a presentation-only animation plan', () => {
    const controller = createPresentationController('match-1', snapshot());
    const accepted = acceptCommittedTransition(controller, transition('t2', 2, 2, 2));
    expect(accepted.kind).toBe('queued');

    const plan = getActivePresentationPlan(accepted.state);

    expect(plan?.matchId).toBe('match-1');
    expect(plan?.transitionId).toBe('t2');
    expect(plan?.steps[0]).toMatchObject({ kind: 'pawn', pawnId: 'p1-1', motion: 'moving' });
  });

  it('reconciles captured pawns to the committed OFF_BOARD snapshot only after the queued capture drains', () => {
    const initial: MatchSnapshot = {
      ...snapshot('match-1', 1, 1),
      players: [
        { playerId: 'p1', color: 'RED', seatIndex: 0, status: 'ACTIVE' },
        { playerId: 'p2', color: 'BLUE', seatIndex: 1, status: 'ACTIVE' },
      ],
      pawns: [
        { pawnId: 'p1-1', playerId: 'p1', color: 'RED', position: { zone: 'PERIMETER', progress: 1 } },
        { pawnId: 'p2-1', playerId: 'p2', color: 'BLUE', position: { zone: 'PERIMETER', progress: 4 } },
      ],
    };
    const committed: MatchSnapshot = {
      ...snapshot('match-1', 2, 3),
      currentPlayerId: 'p2',
      players: initial.players,
      pawns: [
        { pawnId: 'p1-1', playerId: 'p1', color: 'RED', position: { zone: 'PERIMETER', progress: 4 } },
        { pawnId: 'p2-1', playerId: 'p2', color: 'BLUE', position: { zone: 'OFF_BOARD' } },
      ],
    };
    const captureTransition: TransitionEnvelope = {
      matchId: 'match-1',
      transitionId: 'capture-1',
      actionId: 'action-capture-1',
      stateVersion: 2,
      fromSequence: 2,
      toSequence: 3,
      events: [
        {
          matchId: 'match-1',
          eventId: 'e2',
          sequence: 2,
          stateVersion: 2,
          type: 'pawnMoved',
          payload: {
            pawnId: 'p1-1',
            playerId: 'p1',
            fromCoord: { row: 0, col: 1 },
            toCoord: { row: 0, col: 4 },
            physicalPath: [
              { row: 0, col: 2 },
              { row: 0, col: 3 },
              { row: 0, col: 4 },
            ],
            capture: { capturedPawnId: 'p2-1', capturedPlayerId: 'p2' },
          },
          createdAt: '2026-08-31T12:00:00.000Z',
        },
        {
          matchId: 'match-1',
          eventId: 'e3',
          sequence: 3,
          stateVersion: 2,
          type: 'pawnCaptured',
          payload: {
            capturedPawnId: 'p2-1',
            capturedPlayerId: 'p2',
            byPawnId: 'p1-1',
            byPlayerId: 'p1',
            atCoord: { row: 0, col: 4 },
          },
          createdAt: '2026-08-31T12:00:00.000Z',
        },
      ],
      watermark: { stateVersion: 2, lastSequence: 3 },
      snapshot: committed,
    };

    const accepted = acceptCommittedTransition(
      createPresentationController('match-1', initial),
      captureTransition,
    );
    expect(accepted.kind).toBe('queued');
    expect(accepted.state.presentationSnapshot.pawns.find((pawn) => pawn.pawnId === 'p2-1')?.position).toEqual({
      zone: 'PERIMETER',
      progress: 4,
    });

    const token = getActivePresentationToken(accepted.state);
    expect(token).not.toBeNull();
    const completed = completeActivePresentation(accepted.state, token!);
    expect(completed.kind).toBe('completed');
    expect(completed.state.presentationSnapshot.pawns.find((pawn) => pawn.pawnId === 'p2-1')?.position).toEqual({
      zone: 'OFF_BOARD',
    });
  });
});
