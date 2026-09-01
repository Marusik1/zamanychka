import type { GameWatermark, MatchSnapshot, TransitionEnvelope } from '@zamanushka/shared';

export type PresentationTransition = TransitionEnvelope;

export type PresentedTransitionIdentity = Readonly<{
  matchId: string;
  transitionId: string;
  stateVersion: number;
  fromSequence: number;
  toSequence: number;
}>;

export type TransitionQueueState = Readonly<{
  queued: readonly PresentationTransition[];
  active: PresentationTransition | null;
  presented: readonly PresentedTransitionIdentity[];
  reconciledWatermark: Readonly<{
    stateVersion: number;
    lastSequence: number;
  }>;
}>;

export type QueueEnqueueResult =
  | Readonly<{ kind: 'enqueued'; queue: TransitionQueueState }>
  | Readonly<{ kind: 'duplicate'; queue: TransitionQueueState }>;

export function createTransitionQueue(snapshot: MatchSnapshot): TransitionQueueState {
  return {
    queued: [],
    active: null,
    presented: [],
    reconciledWatermark: getSnapshotWatermark(snapshot),
  };
}

export function getSnapshotWatermark(snapshot: MatchSnapshot): GameWatermark {
  return {
    stateVersion: snapshot.stateVersion,
    lastSequence: snapshot.lastSequence,
  };
}

export function getTransitionIdentity(
  transition: PresentationTransition,
): PresentedTransitionIdentity {
  return {
    matchId: transition.matchId,
    transitionId: transition.transitionId,
    stateVersion: transition.stateVersion,
    fromSequence: transition.fromSequence,
    toSequence: transition.toSequence,
  };
}

export function isSameTransitionIdentity(
  left: PresentedTransitionIdentity,
  right: PresentedTransitionIdentity,
): boolean {
  return (
    left.matchId === right.matchId &&
    left.transitionId === right.transitionId &&
    left.stateVersion === right.stateVersion &&
    left.fromSequence === right.fromSequence &&
    left.toSequence === right.toSequence
  );
}

export function hasTransition(
  queue: TransitionQueueState,
  transition: PresentationTransition,
): boolean {
  const identity = getTransitionIdentity(transition);
  if (
    transition.watermark.lastSequence <= queue.reconciledWatermark.lastSequence ||
    transition.stateVersion <= queue.reconciledWatermark.stateVersion
  ) {
    return true;
  }

  if (queue.active && isSameTransitionIdentity(getTransitionIdentity(queue.active), identity)) {
    return true;
  }

  return (
    queue.queued.some((queued) =>
      isSameTransitionIdentity(getTransitionIdentity(queued), identity),
    ) || queue.presented.some((presented) => isSameTransitionIdentity(presented, identity))
  );
}

export function enqueueTransition(
  queue: TransitionQueueState,
  transition: PresentationTransition,
): QueueEnqueueResult {
  if (hasTransition(queue, transition)) {
    return { kind: 'duplicate', queue };
  }

  return {
    kind: 'enqueued',
    queue: {
      ...queue,
      queued: [...queue.queued, transition],
    },
  };
}

export function activateNextTransition(queue: TransitionQueueState): TransitionQueueState {
  if (queue.active || queue.queued.length === 0) {
    return queue;
  }

  const [active, ...queued] = queue.queued;
  if (!active) {
    return queue;
  }

  return {
    ...queue,
    active,
    queued,
  };
}

export function completeActiveTransition(queue: TransitionQueueState): TransitionQueueState {
  if (!queue.active) {
    return queue;
  }

  const completed = getTransitionIdentity(queue.active);

  return activateNextTransition({
    ...queue,
    active: null,
    presented: [...queue.presented, completed],
    reconciledWatermark: queue.active.watermark,
  });
}

export function invalidateTransitionQueue(snapshot: MatchSnapshot): TransitionQueueState {
  return createTransitionQueue(snapshot);
}
