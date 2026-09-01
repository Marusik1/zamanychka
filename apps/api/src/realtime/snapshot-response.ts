import {
  gameSyncResponseSchema,
  matchSnapshotSchema,
  type GameSyncResponse,
  type MatchSnapshot,
} from '@zamanushka/shared';

export function snapshotWithTiming(input: {
  snapshot: unknown;
  lastSequence: number;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
}): MatchSnapshot {
  return matchSnapshotSchema.parse({
    ...(input.snapshot as Record<string, unknown>),
    lastSequence: input.lastSequence,
    startedAt: input.startedAt instanceof Date ? input.startedAt.toISOString() : input.startedAt,
    finishedAt:
      input.finishedAt instanceof Date ? input.finishedAt.toISOString() : input.finishedAt,
  });
}

export function snapshotSyncResponse(input: {
  snapshot: unknown;
  stateVersion: number;
  lastSequence: number;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
}): GameSyncResponse {
  return gameSyncResponseSchema.parse({
    mode: 'snapshot',
    snapshot: snapshotWithTiming(input),
    watermark: {
      stateVersion: input.stateVersion,
      lastSequence: input.lastSequence,
    },
  });
}
