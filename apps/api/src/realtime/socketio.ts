import type { Server as HttpServer } from 'node:http';

import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import {
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
import { snapshotSyncResponse } from './snapshot-response.js';

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
    { dispatched: true } | { dispatched: false; reason: 'EMPTY' | 'PUBLISH_FAILED' }
  >;
  close(): Promise<void>;
}

interface TransitionSeed {
  matchId: string;
  transitionId: string;
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
  const snapshot = {
    ...(match.snapshot as Record<string, unknown>),
    lastSequence: seed.toSequence,
  };
  return transitionEnvelopeSchema.parse({
    matchId: seed.matchId,
    transitionId: seed.transitionId,
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
  };
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
    publish: async (payload) => {
      const envelope = await resolveTransitionEnvelope(options.matchRepository, payload);
      io.to(roomName(envelope.matchId)).emit('game:event', envelope);
    },
  });

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
      const token = cookies['__Host-zamanushka-session'] ?? cookies['zamanushka-session'];
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
      const result = await options.commandProcessor.process({
        authenticatedUserId: (socket.data as SocketData).userId,
        command: parsed.data,
      });
      ack?.(result);
    });

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
          ack?.(snapshotSyncResponse({ snapshot: emptySnapshot, stateVersion: 0, lastSequence: 0 }));
          return;
        }

        if (!options.loadCommittedTransitions) {
          ack?.(
            snapshotSyncResponse({
              snapshot: match.snapshot,
              stateVersion: match.stateVersion ?? 0,
              lastSequence: match.lastSequence ?? 0,
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
    dispatchOutboxOnce: () => dispatcher.dispatchOne(),
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
