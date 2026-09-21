import type { Server as HttpServer } from 'node:http';
import { performance } from 'node:perf_hooks';

import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import {
  REALTIME_PROTOCOL_VERSION,
  gameCommandRequestSchema,
  gameEventEnvelopeSchema,
  gameSyncRequestSchema,
  gameSyncResponseSchema,
  matchSubscriptionRequestSchema,
  transitionEnvelopeSchema,
  type GameCommandRequest,
  type GameCommandResult,
  type TransitionEnvelope,
} from '@zamanushka/shared';

import type { AuthService } from '../auth/auth-service.js';
import { createRedisClient } from '../infrastructure/redis.js';
import type { MatchRepository } from '../match/match-repository.js';
import type { OutboxLeaseStore } from './outbox-dispatcher.js';
import { createOutboxDispatcher } from './outbox-dispatcher.js';
import { snapshotSyncResponse, snapshotWithTiming } from './snapshot-response.js';

interface SocketData {
  userId: string;
}

type SocketCommandAck = (
  result: GameCommandResult | { ok: false; code: string; message: string },
) => void;

export interface RealtimeRuntime {
  io: Server;
  ready: Promise<void>;
  publishCommittedTransition(input: { matchId: string; payload: unknown }): Promise<void>;
  dispatchOutboxOnce(): Promise<
    | { dispatched: true }
    | { dispatched: false; reason: 'EMPTY' | 'CLAIM_FAILED' | 'PUBLISH_FAILED' | 'MARK_FAILED' }
  >;
  close(): Promise<void>;
}

interface TransitionSeed {
  matchId: string;
  transitionId: string;
  actionId?: string;
  stateVersion: number;
  fromSequence: number;
  toSequence: number;
  events: unknown[];
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const trimmed = part.trim();
      const index = trimmed.indexOf('=');
      if (index < 0) return [trimmed, ''];
      return [trimmed.slice(0, index), decodeURIComponent(trimmed.slice(index + 1))];
    }),
  );
}

function roomName(matchId: string) {
  return `match:${matchId}`;
}

function telemetryEnabled() {
  return process.env.GAMEPLAY_TELEMETRY === 'true';
}

function byteLength(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function logTelemetry(event: string, payload: Record<string, unknown>) {
  if (!telemetryEnabled()) return;
  console.info(
    JSON.stringify({
      scope: 'gameplay-realtime',
      event,
      at: new Date().toISOString(),
      ...payload,
    }),
  );
}

async function resolveTransitionEnvelope(
  matchRepository: MatchRepository,
  payload: unknown,
): Promise<TransitionEnvelope> {
  const seed = payload as TransitionSeed;
  const match = await matchRepository.loadCurrentMatch(seed.matchId);
  if (!match) throw new Error(`match ${seed.matchId} is missing for committed transition`);
  const events = seed.events;
  if (events.length === 0) throw new Error('committed transition must include events');
  const parsedEvents = events.map((event) => gameEventEnvelopeSchema.parse(event));
  const snapshot = snapshotWithTiming({
    snapshot: match.snapshot,
    lastSequence: seed.toSequence,
    startedAt: match.createdAt,
    finishedAt: match.finishedAt,
  });
  return transitionEnvelopeSchema.parse({
    matchId: seed.matchId,
    transitionId: seed.transitionId,
    ...(seed.actionId ? { actionId: seed.actionId } : {}),
    stateVersion: seed.stateVersion,
    fromSequence: seed.fromSequence,
    toSequence: seed.toSequence,
    events: parsedEvents,
    watermark: {
      stateVersion: seed.stateVersion,
      lastSequence: seed.toSequence,
    },
    snapshot,
  });
}

export function createRealtimeRuntime(options: {
  httpServer: HttpServer;
  auth: AuthService;
  cookieName: string;
  matchRepository: MatchRepository;
  outbox: OutboxLeaseStore;
  loadCommittedTransitions?: (input: {
    matchId: string;
    stateVersion: number;
    lastSequence: number;
  }) => Promise<TransitionEnvelope[]>;
  commandProcessor: {
    process(input: {
      authenticatedUserId: string | null | undefined;
      command: GameCommandRequest;
    }): Promise<GameCommandResult>;
    skipDebugDummyTurn?(input: {
      authenticatedUserId: string | null | undefined;
      matchId: string;
      expectedStateVersion: number;
    }): Promise<unknown>;
  };
  botRunner?: { kick(matchId: string): void };
  allowedOrigins: string[];
  redisUrl?: string;
}) {
  const io = new Server(options.httpServer, {
    path: '/socket.io',
    cors: {
      origin: options.allowedOrigins,
      credentials: true,
    },
  });

  const maybeRedis =
    options.redisUrl == null
      ? null
      : {
          pub: createRedisClient(options.redisUrl),
          sub: createRedisClient(options.redisUrl),
        };
  const ready = maybeRedis
    ? Promise.all([maybeRedis.pub.connect(), maybeRedis.sub.connect()]).then(() => {
        io.adapter(createAdapter(maybeRedis.pub, maybeRedis.sub));
      })
    : Promise.resolve();

  const dispatcher = createOutboxDispatcher({
    workerId: `socketio-${process.pid}`,
    outbox: options.outbox,
    publish: async (payload, row) => {
      const startedAt = performance.now();
      const broadcastStartedAt = Date.now();
      const envelope = await resolveTransitionEnvelope(options.matchRepository, payload);
      const room = roomName(envelope.matchId);
      const telemetry = telemetryEnabled();
      const sockets = telemetry ? await io.in(room).fetchSockets() : [];
      const payloadBytes = telemetry ? byteLength(envelope) : 0;
      io.to(room).emit('game:event', envelope);
      logTelemetry('EVENT_BROADCAST', {
        matchId: envelope.matchId,
        transitionId: envelope.transitionId,
        actionId: envelope.actionId,
        stateVersion: envelope.stateVersion,
        fromSequence: envelope.fromSequence,
        toSequence: envelope.toSequence,
        socketCount: sockets.length,
        outboxId: row.id,
        outboxCreatedAt: row.createdAt.toISOString(),
        outboxClaimedAt: row.claimedAt.toISOString(),
        commitToBroadcastMs: broadcastStartedAt - row.createdAt.getTime(),
      });
      logTelemetry('broadcast', {
        matchId: envelope.matchId,
        transitionId: envelope.transitionId,
        stateVersion: envelope.stateVersion,
        fromSequence: envelope.fromSequence,
        toSequence: envelope.toSequence,
        socketCount: sockets.length,
        payloadBytes,
        outboxId: row.id,
        outboxCreatedAt: row.createdAt.toISOString(),
        outboxClaimedAt: row.claimedAt.toISOString(),
        outboxCreateToClaimMs: row.claimedAt.getTime() - row.createdAt.getTime(),
        commitToBroadcastMs: broadcastStartedAt - row.createdAt.getTime(),
        elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });
    },
  });
  let activeOutboxDispatches = 0;
  let outboxDispatchRunning = false;
  let outboxWakeRequested = false;
  let outboxDispatchPromise: Promise<
    | { dispatched: true }
    | { dispatched: false; reason: 'EMPTY' | 'CLAIM_FAILED' | 'PUBLISH_FAILED' | 'MARK_FAILED' }
  > | null = null;

  const dispatchOutboxOnce = (source: 'immediate' | 'manual' = 'manual') => {
    if (outboxDispatchRunning && outboxDispatchPromise) {
      outboxWakeRequested = true;
      logTelemetry('OUTBOX_DISPATCH_ALREADY_RUNNING', {
        source,
        activeDispatchers: activeOutboxDispatches,
      });
      return outboxDispatchPromise;
    }

    const startedAt = performance.now();
    outboxDispatchRunning = true;
    activeOutboxDispatches += 1;
    logTelemetry('OUTBOX_DISPATCH_START', { source, activeDispatchers: activeOutboxDispatches });

    outboxDispatchPromise = (async () => {
      let latest:
        | { dispatched: true }
        | { dispatched: false; reason: 'EMPTY' | 'CLAIM_FAILED' | 'PUBLISH_FAILED' | 'MARK_FAILED' } = {
        dispatched: false,
        reason: 'EMPTY',
      };
      do {
        outboxWakeRequested = false;
        latest = await dispatcher.dispatchOne();
        if (!latest.dispatched && latest.reason === 'CLAIM_FAILED') {
          logTelemetry('OUTBOX_CLAIM_FAILED', { source, activeDispatchers: activeOutboxDispatches });
        }
        if (!latest.dispatched && latest.reason === 'MARK_FAILED') {
          logTelemetry('OUTBOX_MARK_FAILED', { source, activeDispatchers: activeOutboxDispatches });
        }
      } while (outboxWakeRequested);
      return latest;
    })().then((result) => {
      logTelemetry(source === 'immediate' ? 'immediate-dispatch' : 'fallback-dispatch', {
        dispatched: result.dispatched,
        reason: result.dispatched ? null : result.reason,
        activeDispatchers: activeOutboxDispatches,
        elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });
      return result;
    }).finally(() => {
      activeOutboxDispatches -= 1;
      logTelemetry('OUTBOX_DISPATCH_END', {
        source,
        activeDispatchers: activeOutboxDispatches,
        elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });
      outboxDispatchRunning = false;
      outboxDispatchPromise = null;
    });

    return outboxDispatchPromise;
  };

  const dispatchOutboxSoon = () => {
    void dispatchOutboxOnce('immediate');
  };

  const emptySnapshot = {
    status: 'ABANDONED',
    stateVersion: 0,
    turnNumber: 1,
    turnPhase: null,
    currentPlayerId: null,
    diceValue: null,
    winnerPlayerId: null,
    winReason: null,
    players: [],
    pawns: [],
  } as const;

  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const token = cookies[options.cookieName];
      const result = await options.auth.me(token);
      (socket.data as SocketData).userId = result.user.id;
      next();
    } catch {
      next(new Error('AUTH_REQUIRED'));
    }
  });

  io.on('connection', (socket) => {
    socket.on(
      'match:join',
      async (
        input: unknown,
        ack?: (result: { ok: true } | { ok: false; code: string }) => void,
      ) => {
        const parsed = matchSubscriptionRequestSchema.safeParse(input);
        if (!parsed.success) {
          ack?.({ ok: false, code: 'VALIDATION_ERROR' });
          return;
        }
        if (
          parsed.data.realtimeProtocolVersion &&
          parsed.data.realtimeProtocolVersion !== REALTIME_PROTOCOL_VERSION
        ) {
          ack?.({ ok: false, code: 'REALTIME_PROTOCOL_MISMATCH' });
          return;
        }
        const match = await options.matchRepository.loadCurrentMatch(parsed.data.matchId);
        if (!match) {
          ack?.({ ok: false, code: 'MATCH_NOT_FOUND' });
          return;
        }
        const participants = match.seatOrder as unknown;
        const allowed =
          Array.isArray(participants) && participants.includes((socket.data as SocketData).userId);
        if (!allowed) {
          ack?.({ ok: false, code: 'MATCH_ACCESS_DENIED' });
          return;
        }
        await socket.join(roomName(parsed.data.matchId));
        ack?.({ ok: true });
      },
    );

    socket.on('game:command', async (input: unknown, ack?: SocketCommandAck) => {
      const receivedAt = performance.now();
      const parsed = gameCommandRequestSchema.safeParse(input);
      if (!parsed.success) {
        ack?.({
          ok: false,
          matchId: '',
          actionId: '',
          code: 'INVALID_ACTION',
          message: 'Request validation failed',
          stateVersion: 0,
        });
        return;
      }
      logTelemetry('command-received', {
        socketId: socket.id,
        matchId: parsed.data.matchId,
        actionId: parsed.data.actionId,
        type: parsed.data.type,
        expectedStateVersion: parsed.data.expectedStateVersion,
      });
      const result = await options.commandProcessor.process({
        authenticatedUserId: (socket.data as SocketData).userId,
        command: parsed.data,
      });
      const serverMs = Math.round((performance.now() - receivedAt) * 100) / 100;
      logTelemetry('command-processed', {
        socketId: socket.id,
        matchId: parsed.data.matchId,
        actionId: parsed.data.actionId,
        type: parsed.data.type,
        ok: result.ok,
        stateVersion: result.stateVersion,
        serverMs,
        ackBytes: byteLength(result),
      });
      if (result.ok) {
        dispatchOutboxSoon();
        options.botRunner?.kick(parsed.data.matchId);
      }
      ack?.(result);
    });

    socket.on(
      'game:debug-skip-dummy-turn',
      async (
        input: unknown,
        ack?: (result: unknown) => void,
      ) => {
        if (!options.commandProcessor.skipDebugDummyTurn) {
          ack?.({
            ok: false,
            matchId: '',
            code: 'SOLO_DEBUG_DISABLED',
            message: 'Solo debug mode is disabled',
            stateVersion: 0,
          });
          return;
        }
        const parsed = gameSyncRequestSchema.pick({ matchId: true, stateVersion: true }).safeParse(
          input,
        );
        if (!parsed.success) {
          ack?.({
            ok: false,
            matchId: '',
            code: 'INVALID_ACTION',
            message: 'Request validation failed',
            stateVersion: 0,
          });
          return;
        }
        const result = await options.commandProcessor.skipDebugDummyTurn({
          authenticatedUserId: (socket.data as SocketData).userId,
          matchId: parsed.data.matchId,
          expectedStateVersion: parsed.data.stateVersion,
        });
        if (typeof result === 'object' && result !== null && 'ok' in result && result.ok) {
          dispatchOutboxSoon();
          options.botRunner?.kick(parsed.data.matchId);
        }
        ack?.(result);
      },
    );

    socket.on('game:sync', async (input: unknown, ack?: (result: unknown) => void) => {
      const parsed = gameSyncRequestSchema.safeParse(input);
      if (!parsed.success) {
        ack?.(snapshotSyncResponse({ snapshot: emptySnapshot, stateVersion: 0, lastSequence: 0 }));
        return;
      }

      let match: Awaited<ReturnType<MatchRepository['loadCurrentMatch']>> | null = null;

      try {
        match = await options.matchRepository.loadCurrentMatch(parsed.data.matchId);
        if (!match) {
          ack?.(
            snapshotSyncResponse({ snapshot: emptySnapshot, stateVersion: 0, lastSequence: 0 }),
          );
          return;
        }

        if (!options.loadCommittedTransitions) {
          ack?.(
            snapshotSyncResponse({
              snapshot: match.snapshot,
              stateVersion: match.stateVersion ?? 0,
              lastSequence: match.lastSequence ?? 0,
              startedAt: match.createdAt,
              finishedAt: match.finishedAt,
            }),
          );
          return;
        }

        const transitions = await options.loadCommittedTransitions({
          matchId: parsed.data.matchId,
          stateVersion: parsed.data.stateVersion,
          lastSequence: parsed.data.lastSequence,
        });
        if (Array.isArray(transitions) && transitions.length > 0) {
          const lastTransition = transitions[transitions.length - 1];
          if (!lastTransition) {
            ack?.(
              snapshotSyncResponse({
                snapshot: match.snapshot,
                stateVersion: match.stateVersion ?? 0,
                lastSequence: match.lastSequence ?? 0,
                startedAt: match.createdAt,
                finishedAt: match.finishedAt,
              }),
            );
            return;
          }
          const response = gameSyncResponseSchema.parse({
            mode: 'events',
            transitions,
            watermark: {
              stateVersion: lastTransition.stateVersion,
              lastSequence: lastTransition.toSequence,
            },
          });
          ack?.(response);
          return;
        }

        ack?.(
          snapshotSyncResponse({
            snapshot: match.snapshot,
            stateVersion: match.stateVersion ?? 0,
            lastSequence: match.lastSequence ?? 0,
            startedAt: match.createdAt,
            finishedAt: match.finishedAt,
          }),
        );
      } catch (error) {
        console.error('game:sync failed', error);
        if (!match) return;
        try {
          ack?.(
            snapshotSyncResponse({
              snapshot: match.snapshot,
              stateVersion: match.stateVersion ?? 0,
              lastSequence: match.lastSequence ?? 0,
              startedAt: match.createdAt,
              finishedAt: match.finishedAt,
            }),
          );
        } catch (fallbackError) {
          console.error('game:sync fallback failed', fallbackError);
        }
      }
    });
  });

  return {
    io,
    ready,
    async publishCommittedTransition(input: { matchId: string; payload: unknown }) {
      const envelope = await resolveTransitionEnvelope(options.matchRepository, input.payload);
      io.to(roomName(input.matchId)).emit('game:event', envelope);
    },
    dispatchOutboxOnce: () => dispatchOutboxOnce('manual'),
    async close() {
      io.removeAllListeners();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (maybeRedis) {
        if (maybeRedis.pub.isOpen) await maybeRedis.pub.quit();
        if (maybeRedis.sub.isOpen) await maybeRedis.sub.quit();
      }
    },
  } satisfies RealtimeRuntime;
}
