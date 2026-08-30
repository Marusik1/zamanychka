import {
  gameSyncResponseSchema,
  matchSnapshotSchema,
  type GameSyncResponse,
  type MatchSnapshot,
} from '@zamanushka/shared';

function snapshotWithLastSequence(snapshot: unknown, lastSequence: number): MatchSnapshot {
  return matchSnapshotSchema.parse({
    ...(snapshot as Record<string, unknown>),
    lastSequence,
  });
}

export function snapshotSyncResponse(input: {
  snapshot: unknown;
  stateVersion: number;
  lastSequence: number;
}): GameSyncResponse {
  return gameSyncResponseSchema.parse({
    mode: 'snapshot',
    snapshot: snapshotWithLastSequence(input.snapshot, input.lastSequence),
    watermark: {
      stateVersion: input.stateVersion,
      lastSequence: input.lastSequence,
    },
  });
}

