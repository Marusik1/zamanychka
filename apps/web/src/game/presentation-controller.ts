import type { GameWatermark, MatchSnapshot } from '@zamanushka/shared';

import {
  createGameplayPresentationPlan,
  type GameplayPresentationPlan,
} from './event-presentation.js';
import {
  activateNextTransition,
  completeActiveTransition,
  createTransitionQueue,
  enqueueTransition,
  getSnapshotWatermark,
  getTransitionIdentity,
  hasTransition,
  type PresentationTransition,
  type TransitionQueueState,
} from './transition-queue.js';

export type PresentationRecoveryReason = 'SEQUENCE_GAP' | 'SEQUENCE_OVERLAP' | 'MATCH_MISMATCH';

export type PresentationCallbackToken = Readonly<{
  matchId: string;
  generation: number;
  transitionId: string;
  stateVersion: number;
  toSequence: number;
}>;

export type PresentationControllerState = Readonly<{
  matchId: string;
  generation: number;
  authoritativeSnapshot: MatchSnapshot;
  presentationSnapshot: MatchSnapshot;
  authoritativeWatermark: GameWatermark;
  presentationWatermark: GameWatermark;
  queue: TransitionQueueState;
  recoveryRequired: PresentationRecoveryReason | null;
}>;

export type AcceptTransitionResult =
  | Readonly<{ kind: 'queued'; state: PresentationControllerState }>
  | Readonly<{ kind: 'duplicate_ignored'; state: PresentationControllerState }>
  | Readonly<{
      kind: 'recovery_required';
      reason: PresentationRecoveryReason;
      state: PresentationControllerState;
    }>;

export type PresentationCompletionResult =
  | Readonly<{ kind: 'completed'; state: PresentationControllerState }>
  | Readonly<{ kind: 'stale_callback_ignored'; state: PresentationControllerState }>
  | Readonly<{ kind: 'no_active_transition'; state: PresentationControllerState }>;

export function createPresentationController(
  matchId: string,
  snapshot: MatchSnapshot,
): PresentationControllerState {
  const watermark = getSnapshotWatermark(snapshot);
  return {
    matchId,
    generation: 0,
    authoritativeSnapshot: snapshot,
    presentationSnapshot: snapshot,
    authoritativeWatermark: watermark,
    presentationWatermark: watermark,
    queue: createTransitionQueue(snapshot),
    recoveryRequired: null,
  };
}

export function acceptCommittedTransition(
  state: PresentationControllerState,
  transition: PresentationTransition,
): AcceptTransitionResult {
  if (transition.matchId !== state.matchId) {
    const paused = pauseForRecovery(state, 'MATCH_MISMATCH');
    return {
      kind: 'recovery_required',
      reason: 'MATCH_MISMATCH',
      state: paused,
    };
  }

  if (
    transition.watermark.lastSequence <= state.presentationWatermark.lastSequence ||
    transition.stateVersion <= state.presentationWatermark.stateVersion
  ) {
    return { kind: 'duplicate_ignored', state };
  }

  if (hasTransition(state.queue, transition)) {
    return { kind: 'duplicate_ignored', state };
  }

  if (transition.fromSequence > state.authoritativeWatermark.lastSequence + 1) {
    const paused = pauseForRecovery(state, 'SEQUENCE_GAP');
    return {
      kind: 'recovery_required',
      reason: 'SEQUENCE_GAP',
      state: paused,
    };
  }

  if (transition.fromSequence <= state.authoritativeWatermark.lastSequence) {
    const paused = pauseForRecovery(state, 'SEQUENCE_OVERLAP');
    return {
      kind: 'recovery_required',
      reason: 'SEQUENCE_OVERLAP',
      state: paused,
    };
  }

  const enqueued = enqueueTransition(state.queue, transition);
  if (enqueued.kind === 'duplicate') {
    return { kind: 'duplicate_ignored', state };
  }

  return {
    kind: 'queued',
    state: {
      ...state,
      authoritativeSnapshot: transition.snapshot,
      authoritativeWatermark: transition.watermark,
      queue: activateNextTransition(enqueued.queue),
      recoveryRequired: null,
    },
  };
}

function pauseForRecovery(
  state: PresentationControllerState,
  recoveryRequired: PresentationRecoveryReason,
): PresentationControllerState {
  return {
    ...state,
    generation: state.generation + 1,
    queue: createTransitionQueue(state.presentationSnapshot),
    recoveryRequired,
  };
}

export function getActivePresentationToken(
  state: PresentationControllerState,
): PresentationCallbackToken | null {
  if (!state.queue.active) {
    return null;
  }

  const identity = getTransitionIdentity(state.queue.active);
  return {
    matchId: identity.matchId,
    generation: state.generation,
    transitionId: identity.transitionId,
    stateVersion: identity.stateVersion,
    toSequence: identity.toSequence,
  };
}

export function getActivePresentationPlan(
  state: PresentationControllerState,
): GameplayPresentationPlan | null {
  return state.queue.active ? createGameplayPresentationPlan(state.queue.active) : null;
}

export function completeActivePresentation(
  state: PresentationControllerState,
  token: PresentationCallbackToken,
): PresentationCompletionResult {
  const active = state.queue.active;
  if (!active) {
    return { kind: 'no_active_transition', state };
  }

  const activeIdentity = getTransitionIdentity(active);
  const isCurrentToken =
    token.matchId === state.matchId &&
    token.generation === state.generation &&
    token.transitionId === activeIdentity.transitionId &&
    token.stateVersion === activeIdentity.stateVersion &&
    token.toSequence === activeIdentity.toSequence;

  if (!isCurrentToken) {
    return { kind: 'stale_callback_ignored', state };
  }

  const queue = completeActiveTransition(state.queue);

  return {
    kind: 'completed',
    state: {
      ...state,
      presentationSnapshot: active.snapshot,
      presentationWatermark: active.watermark,
      queue,
    },
  };
}

export function reconcileAuthoritativeSnapshot(
  state: PresentationControllerState,
  matchId: string,
  snapshot: MatchSnapshot,
): PresentationControllerState {
  const nextGeneration = state.generation + 1;
  const watermark = getSnapshotWatermark(snapshot);

  return {
    matchId,
    generation: nextGeneration,
    authoritativeSnapshot: snapshot,
    presentationSnapshot: snapshot,
    authoritativeWatermark: watermark,
    presentationWatermark: watermark,
    queue: createTransitionQueue(snapshot),
    recoveryRequired: null,
  };
}
