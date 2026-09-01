import { describe, expect, it } from 'vitest';

import type { MatchSnapshot, TransitionEnvelope } from '@zamanushka/shared';

import {
  activateNextTransition,
  completeActiveTransition,
  createTransitionQueue,
  enqueueTransition,
  hasTransition,
  invalidateTransitionQueue,
} from './transition-queue.js';

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
    startedAt: '2026-09-01T10:00:00.000Z',
    finishedAt: null,
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
    stateVersion,
    fromSequence,
    toSequence,
    events: Array.from({ length: toSequence - fromSequence + 1 }, (_, index) => ({
      matchId,
      eventId: `${transitionId}:event-${index}`,
      sequence: fromSequence + index,
      stateVersion,
      type: 'diceRolled',
      payload: { playerId: 'p1', diceValue: 4 },
      createdAt: '2026-08-25T00:00:00.000Z',
    })),
    watermark: { stateVersion, lastSequence: toSequence },
    snapshot: snapshot(matchId, stateVersion, toSequence),
  };
}

describe('transition queue', () => {
  it('initializes empty from the current authoritative snapshot watermark', () => {
    const queue = createTransitionQueue(snapshot('match-1', 7, 22));

    expect(queue).toEqual({
      queued: [],
      active: null,
      presented: [],
      reconciledWatermark: { stateVersion: 7, lastSequence: 22 },
    });
  });

  it('enqueues transitions FIFO and activates one item at a time', () => {
    const first = transition('t1', 2, 2);
    const second = transition('t2', 3, 4, 3);
    let queue = createTransitionQueue(snapshot());

    const firstEnqueue = enqueueTransition(queue, first);
    expect(firstEnqueue.kind).toBe('enqueued');
    queue = firstEnqueue.queue;

    const secondEnqueue = enqueueTransition(queue, second);
    expect(secondEnqueue.kind).toBe('enqueued');
    queue = activateNextTransition(secondEnqueue.queue);

    expect(queue.active).toBe(first);
    expect(queue.queued).toEqual([second]);

    queue = completeActiveTransition(queue);
    expect(queue.active).toBe(second);
    expect(queue.queued).toEqual([]);
  });

  it('suppresses queued, active, presented, and reconciled duplicate transitions', () => {
    const current = snapshot('match-1', 2, 2);
    const duplicate = transition('t2', 2, 2, 2);
    const fresh = transition('t3', 3, 3, 3);
    let queue = createTransitionQueue(current);

    expect(hasTransition(queue, duplicate)).toBe(true);

    const enqueued = enqueueTransition(queue, fresh);
    expect(enqueued.kind).toBe('enqueued');
    queue = activateNextTransition(enqueued.queue);
    expect(hasTransition(queue, fresh)).toBe(true);
    expect(enqueueTransition(queue, fresh).kind).toBe('duplicate');

    queue = completeActiveTransition(queue);
    expect(hasTransition(queue, fresh)).toBe(true);
    expect(enqueueTransition(queue, fresh).kind).toBe('duplicate');
  });

  it('invalidates all pending presentation history on snapshot fallback', () => {
    const queue = activateNextTransition(
      enqueueTransition(createTransitionQueue(snapshot()), transition('t2', 2, 2, 2)).queue,
    );

    expect(queue.active?.transitionId).toBe('t2');

    const invalidated = invalidateTransitionQueue(snapshot('match-1', 9, 30));

    expect(invalidated.active).toBeNull();
    expect(invalidated.queued).toEqual([]);
    expect(invalidated.presented).toEqual([]);
    expect(invalidated.reconciledWatermark).toEqual({ stateVersion: 9, lastSequence: 30 });
  });
});
