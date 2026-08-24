import { z } from 'zod';

const id = z.string().min(1);
const version = z.number().int().nonnegative();
const boardProgress = z.number().int().min(0).max(27);
const boardCoordSchema = z
  .object({
    row: z.number().int().min(0).max(7),
    col: z.number().int().min(0).max(7),
  })
  .strict();

const seatIndexSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const colorSchema = z.enum(['RED', 'BLUE', 'GREEN', 'YELLOW']);
const playerStatusSchema = z.enum(['ACTIVE', 'SURRENDERED', 'FINISHED']);

const commandIdentitySchema = z
  .object({
    matchId: id,
    actionId: id,
    expectedStateVersion: version,
  })
  .strict();

export const gameCommandErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'MATCH_NOT_FOUND',
  'MATCH_ACCESS_DENIED',
  'MATCH_FINISHED',
  'NOT_YOUR_TURN',
  'STALE_STATE_VERSION',
  'INVALID_ACTION',
  'PAWN_NOT_MOVABLE',
  'ACTION_ID_CONFLICT',
]);

export const gameCommandRequestSchema = z.discriminatedUnion('type', [
  commandIdentitySchema.extend({ type: z.literal('ROLL_DICE') }).strict(),
  commandIdentitySchema.extend({ type: z.literal('ENTER_PAWN'), pawnId: id }).strict(),
  commandIdentitySchema.extend({ type: z.literal('MOVE_PAWN'), pawnId: id }).strict(),
  commandIdentitySchema.extend({ type: z.literal('SURRENDER') }).strict(),
]);

const playerSchema = z
  .object({
    playerId: id,
    color: colorSchema,
    seatIndex: seatIndexSchema,
    status: playerStatusSchema,
  })
  .strict();

const pawnPositionSchema = z.discriminatedUnion('zone', [
  z.object({ zone: z.literal('OFF_BOARD') }).strict(),
  z.object({ zone: z.literal('PERIMETER'), progress: boardProgress }).strict(),
  z.object({ zone: z.literal('HOME'), homeIndex: seatIndexSchema }).strict(),
  z.object({ zone: z.literal('REMOVED') }).strict(),
]);

const pawnSchema = z
  .object({
    pawnId: id,
    playerId: id,
    color: colorSchema,
    position: pawnPositionSchema,
  })
  .strict();

export const gameSyncRequestSchema = z
  .object({
    matchId: id,
    stateVersion: version,
    lastSequence: version,
  })
  .strict();

export const gameWatermarkSchema = z
  .object({
    stateVersion: version,
    lastSequence: version,
  })
  .strict();

export const matchSnapshotSchema = z
  .object({
    status: z.enum(['ACTIVE', 'FINISHED', 'ABANDONED']),
    stateVersion: version,
    turnNumber: z.number().int().positive(),
    turnPhase: z.enum(['WAITING_FOR_ROLL', 'WAITING_FOR_ACTION']).nullable(),
    currentPlayerId: id.nullable(),
    diceValue: z.number().int().min(1).max(6).nullable(),
    winnerPlayerId: id.nullable(),
    winReason: z.enum(['HOME_DIAGONAL_COMPLETED', 'LAST_ACTIVE_PLAYER']).nullable(),
    players: z.array(playerSchema),
    pawns: z.array(pawnSchema),
    lastSequence: version,
  })
  .strict();

const diceRolledEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('diceRolled'),
    payload: z
      .object({
        playerId: id,
        diceValue: z.number().int().min(1).max(6),
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

const pawnEnteredEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('pawnEntered'),
    payload: z
      .object({
        pawnId: id,
        playerId: id,
        toCoord: boardCoordSchema,
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

const pawnMovedEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('pawnMoved'),
    payload: z
      .object({
        pawnId: id,
        playerId: id,
        fromCoord: boardCoordSchema,
        toCoord: boardCoordSchema,
        physicalPath: z.array(boardCoordSchema),
        capture: z
          .object({
            capturedPawnId: id,
            capturedPlayerId: id,
          })
          .strict()
          .nullable(),
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

const pawnCapturedEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('pawnCaptured'),
    payload: z
      .object({
        capturedPawnId: id,
        capturedPlayerId: id,
        byPawnId: id,
        byPlayerId: id,
        atCoord: boardCoordSchema,
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

const pawnEnteredHomeEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('pawnEnteredHome'),
    payload: z
      .object({
        pawnId: id,
        playerId: id,
        homeIndex: seatIndexSchema,
        fromCoord: boardCoordSchema,
        toCoord: boardCoordSchema,
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

const playerSurrenderedEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('playerSurrendered'),
    payload: z
      .object({
        playerId: id,
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

const pawnRemovedEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('pawnRemoved'),
    payload: z
      .object({
        pawnId: id,
        playerId: id,
        reason: z.enum(['OFF_BOARD_CAPTURED', 'HOME_CAPTURED', 'SURRENDERED', 'RESET']),
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

const participantJoinedEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('participantJoined'),
    payload: z
      .object({
        playerId: id,
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

const participantLeftEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('participantLeft'),
    payload: z
      .object({
        playerId: id,
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

const participantReadyChangedEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('participantReadyChanged'),
    payload: z
      .object({
        playerId: id,
        ready: z.boolean(),
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

const matchReadyEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('matchReady'),
    payload: z
      .object({
        matchId: id,
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

const matchWaitingEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('matchWaiting'),
    payload: z
      .object({
        matchId: id,
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

const matchStartedEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('matchStarted'),
    payload: z
      .object({
        matchId: id,
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

const matchAbandonedEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('matchAbandoned'),
    payload: z
      .object({
        matchId: id,
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

const extraRollGrantedEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('extraRollGranted'),
    payload: z
      .object({
        playerId: id,
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

const turnChangedEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('turnChanged'),
    payload: z
      .object({
        fromPlayerId: id,
        toPlayerId: id,
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

const gameWonEventSchema = z
  .object({
    matchId: id,
    eventId: id,
    sequence: version,
    stateVersion: version,
    type: z.literal('gameWon'),
    payload: z
      .object({
        winnerPlayerId: id,
        reason: z.enum(['HOME_DIAGONAL_COMPLETED', 'LAST_ACTIVE_PLAYER']),
      })
      .strict(),
    createdAt: z.string().min(1),
  })
  .strict();

export const gameEventEnvelopeSchema = z.discriminatedUnion('type', [
  participantJoinedEventSchema,
  participantLeftEventSchema,
  participantReadyChangedEventSchema,
  matchReadyEventSchema,
  matchWaitingEventSchema,
  matchStartedEventSchema,
  matchAbandonedEventSchema,
  diceRolledEventSchema,
  pawnEnteredEventSchema,
  pawnMovedEventSchema,
  pawnCapturedEventSchema,
  pawnEnteredHomeEventSchema,
  playerSurrenderedEventSchema,
  pawnRemovedEventSchema,
  extraRollGrantedEventSchema,
  turnChangedEventSchema,
  gameWonEventSchema,
]);

export const transitionEnvelopeSchema = z
  .object({
    matchId: id,
    transitionId: id,
    actionId: id.optional(),
    stateVersion: version,
    fromSequence: version,
    toSequence: version,
    events: z.array(gameEventEnvelopeSchema),
    watermark: gameWatermarkSchema,
    snapshot: z.object({}).passthrough(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.fromSequence > value.toSequence) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fromSequence must be less than or equal to toSequence',
      });
    }

    if (
      value.watermark.stateVersion !== value.stateVersion ||
      value.watermark.lastSequence !== value.toSequence
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'watermark must match transition range and stateVersion',
      });
    }

    if (value.events.length > 0) {
      const eventSequences = value.events.map((event) => event.sequence);
      const firstSequence = value.events[0]!.sequence;
      const lastSequence = value.events[value.events.length - 1]!.sequence;

      if (firstSequence !== value.fromSequence || lastSequence !== value.toSequence) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'events must span the declared sequence range',
        });
      }

      for (let index = 1; index < eventSequences.length; index += 1) {
        if (eventSequences[index] !== eventSequences[index - 1]! + 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'events must be strictly contiguous and ordered',
          });
          break;
        }
      }

      for (const event of value.events) {
        if (event.matchId !== value.matchId || event.stateVersion !== value.stateVersion) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'events must match the transition identity',
          });
          break;
        }
      }
    } else if (value.fromSequence !== value.toSequence) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'empty transitions must not claim a non-zero sequence range',
      });
    }
  });

export const gameAckMetadataSchema = z
  .object({
    actionId: id,
    stateVersion: version,
    lastSequence: version,
  })
  .strict();

const success = z
  .object({
    ok: z.literal(true),
    matchId: id,
    actionId: id,
    stateVersion: version,
    lastSequence: version,
    snapshot: matchSnapshotSchema,
    events: z.array(gameEventEnvelopeSchema),
    ack: gameAckMetadataSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.ack) {
      if (
        value.ack.actionId !== value.actionId ||
        value.ack.stateVersion !== value.stateVersion ||
        value.ack.lastSequence !== value.lastSequence
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'ack metadata must match the command result',
        });
      }
    }
  });

const failure = z
  .object({
    ok: z.literal(false),
    matchId: id,
    actionId: id,
    code: gameCommandErrorCodeSchema,
    message: z.string(),
    stateVersion: version,
    snapshot: matchSnapshotSchema.optional(),
  })
  .strict();

export const gameCommandResultSchema = z.discriminatedUnion('ok', [success, failure]);

export const gameSyncResponseSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('events'),
      transitions: z.array(transitionEnvelopeSchema),
      watermark: gameWatermarkSchema,
    })
    .strict(),
  z
    .object({
      mode: z.literal('snapshot'),
      snapshot: matchSnapshotSchema,
      watermark: gameWatermarkSchema,
    })
    .strict(),
]);

export type GameCommandErrorCode = z.infer<typeof gameCommandErrorCodeSchema>;
export type GameCommandRequest = z.infer<typeof gameCommandRequestSchema>;
export type GameCommand = GameCommandRequest;
export type GameSyncRequest = z.infer<typeof gameSyncRequestSchema>;
export type GameWatermark = z.infer<typeof gameWatermarkSchema>;
export type MatchSnapshot = z.infer<typeof matchSnapshotSchema>;
export type GameEventEnvelope = z.infer<typeof gameEventEnvelopeSchema>;
export type TransitionEnvelope = z.infer<typeof transitionEnvelopeSchema>;
export type GameAckMetadata = z.infer<typeof gameAckMetadataSchema>;
export type GameCommandResult = z.infer<typeof gameCommandResultSchema>;
export type GameSyncResponse = z.infer<typeof gameSyncResponseSchema>;

// Transport-neutral aliases used by callers that name the protocol artifact directly.
export const gameSnapshotSchema = matchSnapshotSchema;
export const gameTransitionEnvelopeSchema = transitionEnvelopeSchema;
export const gameAckSchema = gameAckMetadataSchema;
