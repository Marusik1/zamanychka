import { randomUUID } from 'node:crypto';

import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as createClient, type Socket } from 'socket.io-client';
import { createActiveGameState } from '@zamanushka/game-engine';
import type { TransitionEnvelope } from '@zamanushka/shared';

import { createRealtimeRuntime } from './socketio.js';

interface AuthServiceLike {
  me(token?: string): Promise<{ user: { id: string } }>;
}

interface MatchRepositoryLike {
  loadCurrentMatch(matchId: string): Promise<{
    id: string;
    seatOrder: string[];
    snapshot: ReturnType<typeof matchSnapshot>;
    status: string;
    stateVersion?: number;
    lastSequence?: number;
  } | null>;
}

interface OutboxStoreLike {
  claim(input: { leaseToken: string }): Promise<{ id: string } | null>;
  markPublished(input: { outboxId: string; leaseToken: string }): Promise<boolean>;
  release(input: { outboxId: string; leaseToken: string }): Promise<void>;
}

interface CommandProcessorLike {
  process(input: {
    authenticatedUserId: string | null | undefined;
    command: unknown;
  }): Promise<unknown>;
}

function sessionHeader(token?: string) {
  return token ? { cookie: `__Host-zamanushka-session=${encodeURIComponent(token)}` } : {};
}

function matchSnapshot() {
  return createActiveGameState({
    playerCount: 2,
    seatOrder: ['user-a', 'user-b'],
    firstPlayerId: 'user-a',
  });
}

function createAuthService() {
  return {
    async me(token?: string) {
      if (token === 'session-a') return { user: { id: 'user-a' } } as never;
      if (token === 'session-b') return { user: { id: 'user-b' } } as never;
      if (token === 'session-c') return { user: { id: 'user-c' } } as never;
      if (token === 'session-d') return { user: { id: 'user-d' } } as never;
      throw new Error('AUTH_REQUIRED');
    },
  } satisfies AuthServiceLike;
}

function createMatchRepository(current = matchSnapshot(), seatOrder = ['user-a', 'user-b']) {
  const match = {
    id: 'match-1',
    seatOrder,
    snapshot: current,
    status: 'ACTIVE',
  };
  return {
    loadCurrentMatch: vi.fn(async (matchId: string) =>
      matchId === match.id ? structuredClone(match) : null,
    ),
  } satisfies MatchRepositoryLike;
}

function withoutLastSequence<T extends Record<string, unknown>>(value: T): Omit<T, 'lastSequence'> {
  const clone = structuredClone(value);
  delete (clone as { lastSequence?: number }).lastSequence;
  return clone;
}

function createOutboxStore(row?: {
  id: string;
  matchId: string;
  resultingStateVersion: number;
  createdAt?: Date;
  claimedAt?: Date;
  payload: unknown;
}) {
  const queue = row
    ? [
        {
          ...structuredClone(row),
          createdAt: row.createdAt ?? new Date('2026-09-20T12:00:00.000Z'),
          claimedAt: row.claimedAt ?? new Date('2026-09-20T12:00:00.125Z'),
        },
      ]
    : [];
  return {
    claim: vi.fn(async () => queue.shift() ?? null),
    markPublished: vi.fn(async () => true),
    release: vi.fn(async () => undefined),
  } satisfies OutboxStoreLike;
}

async function startRuntime(options?: {
  auth?: AuthServiceLike;
  matchRepository?: MatchRepositoryLike;
  outbox?: OutboxStoreLike;
  loadCommittedTransitions?: (input: {
    matchId: string;
    stateVersion: number;
    lastSequence: number;
  }) => Promise<unknown[]>;
  commandProcessor?: CommandProcessorLike;
  cookieName?: string;
  redisUrl?: string;
}) {
  const app = Fastify();
  const runtimeOptions = {
    httpServer: app.server,
    auth: (options?.auth ?? createAuthService()) as unknown as Parameters<
      typeof createRealtimeRuntime
    >[0]['auth'],
    cookieName: options?.cookieName ?? '__Host-zamanushka-session',
    matchRepository: (options?.matchRepository ?? createMatchRepository()) as unknown as Parameters<
      typeof createRealtimeRuntime
    >[0]['matchRepository'],
    outbox: (options?.outbox ?? createOutboxStore()) as unknown as Parameters<
      typeof createRealtimeRuntime
    >[0]['outbox'],
    ...(options?.loadCommittedTransitions
      ? { loadCommittedTransitions: options.loadCommittedTransitions }
      : {}),
    commandProcessor:
      options?.commandProcessor ??
      ({
        process: vi.fn(async () => ({
          ok: true,
          matchId: 'match-1',
          actionId: 'action-1',
          stateVersion: 1,
          lastSequence: 1,
          snapshot: matchSnapshot(),
          events: [],
          ack: { actionId: 'action-1', stateVersion: 1, lastSequence: 1 },
        })),
      } as unknown as Parameters<typeof createRealtimeRuntime>[0]['commandProcessor']),
    allowedOrigins: ['http://127.0.0.1'],
    ...(options?.redisUrl ? { redisUrl: options.redisUrl } : {}),
  } as unknown as Parameters<typeof createRealtimeRuntime>[0];
  const runtime = createRealtimeRuntime(runtimeOptions);
  await runtime.ready;
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('failed to bind test server');
  return {
    app,
    runtime,
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      await runtime.close();
      await app.close();
    },
  };
}

function connectClient(url: string, cookie?: string) {
  const options = cookie ? { extraHeaders: { cookie } } : {};
  return createClient(url, {
    transports: ['websocket'],
    forceNew: true,
    ...options,
  });
}

async function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
  return await new Promise<T>((resolve) => socket.once(event, resolve));
}

describe('Socket.IO realtime publication and subscriptions', () => {
  let servers: Awaited<ReturnType<typeof startRuntime>>[];

  beforeEach(() => {
    servers = [];
  });

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      await server.close();
    }
  });

  it('authenticates a participant socket and allows joining the immutable Match room', async () => {
    const server = await startRuntime();
    servers.push(server);

    const socket = connectClient(server.url, sessionHeader('session-a').cookie);
    await waitForEvent(socket, 'connect');

    const result = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
      socket.emit('match:join', { matchId: 'match-1' }, resolve);
    });

    expect(result).toEqual({ ok: true });
    socket.disconnect();
  });

  it('uses the configured session cookie for socket auth when stale host-prefixed cookies also exist', async () => {
    const server = await startRuntime({ cookieName: 'zamanushka-session' });
    servers.push(server);

    const socket = connectClient(
      server.url,
      '__Host-zamanushka-session=session-c; zamanushka-session=session-a',
    );
    await waitForEvent(socket, 'connect');

    const result = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
      socket.emit('match:join', { matchId: 'match-1' }, resolve);
    });

    expect(result).toEqual({ ok: true });
    socket.disconnect();
  });

  it('rejects an unauthenticated socket before it can subscribe', async () => {
    const server = await startRuntime();
    servers.push(server);

    const socket = connectClient(server.url);
    const error = await waitForEvent<Error>(socket as never, 'connect_error');
    expect(error.message).toBe('AUTH_REQUIRED');
    socket.disconnect();
  });

  it('rejects a non-participant trying to join a Match', async () => {
    const server = await startRuntime();
    servers.push(server);

    const socket = connectClient(server.url, sessionHeader('session-c').cookie);
    await waitForEvent(socket, 'connect');
    const result = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
      socket.emit('match:join', { matchId: 'match-1' }, resolve);
    });

    expect(result).toEqual({ ok: false, code: 'MATCH_ACCESS_DENIED' });
    socket.disconnect();
  });

  it('keeps Match subscription authorization after room reset for a finished Match participant', async () => {
    const finishedMatchRepository = {
      loadCurrentMatch: vi.fn(async (matchId: string) =>
        matchId === 'match-1'
          ? {
              id: 'match-1',
              seatOrder: ['user-a', 'user-b'],
              snapshot: matchSnapshot(),
              status: 'FINISHED',
            }
          : null,
      ),
    };
    const server = await startRuntime({
      matchRepository: finishedMatchRepository as MatchRepositoryLike,
    });
    servers.push(server);

    const socket = connectClient(server.url, sessionHeader('session-a').cookie);
    await waitForEvent(socket, 'connect');
    const result = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
      socket.emit('match:join', { matchId: 'match-1' }, resolve);
    });

    expect(result).toEqual({ ok: true });
    socket.disconnect();
  });

  it('derives command actor identity from the server session and ignores client-supplied extras', async () => {
    const processor = {
      process: vi.fn(async (input) => ({
        ok: true,
        ...input.command,
        stateVersion: 1,
        lastSequence: 1,
        snapshot: matchSnapshot(),
        events: [],
        ack: { actionId: input.command.actionId, stateVersion: 1, lastSequence: 1 },
      })),
    };
    const server = await startRuntime({ commandProcessor: processor });
    servers.push(server);

    const socket = connectClient(server.url, sessionHeader('session-b').cookie);
    await waitForEvent(socket, 'connect');
    const response = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
      socket.emit(
        'game:command',
        {
          type: 'SURRENDER',
          matchId: 'match-1',
          actionId: 'action-1',
          expectedStateVersion: 0,
          actorPlayerId: 'attacker',
        } as never,
        resolve,
      );
    });

    expect(response).toMatchObject({
      ok: false,
      code: 'INVALID_ACTION',
      message: 'Request validation failed',
    });
    expect(processor.process).not.toHaveBeenCalled();
    socket.disconnect();
  });

  it('uses the authenticated session user as the command actor', async () => {
    const processor = {
      process: vi.fn(async () => ({
        ok: true,
        matchId: 'match-1',
        actionId: 'action-1',
        stateVersion: 1,
        lastSequence: 1,
        snapshot: matchSnapshot(),
        events: [],
        ack: { actionId: 'action-1', stateVersion: 1, lastSequence: 1 },
      })),
    };
    const server = await startRuntime({ commandProcessor: processor });
    servers.push(server);

    const socket = connectClient(server.url, sessionHeader('session-b').cookie);
    await waitForEvent(socket, 'connect');
    const response = await new Promise<Record<string, unknown>>((resolve) => {
      socket.emit(
        'game:command',
        {
          type: 'SURRENDER',
          matchId: 'match-1',
          actionId: 'action-2',
          expectedStateVersion: 0,
        },
        resolve,
      );
    });

    expect(response).toMatchObject({ ok: true, actionId: 'action-1' });
    expect(processor.process).toHaveBeenCalledWith({
      authenticatedUserId: 'user-b',
      command: {
        type: 'SURRENDER',
        matchId: 'match-1',
        actionId: 'action-2',
        expectedStateVersion: 0,
      },
    });
    socket.disconnect();
  });

  it('dispatches a committed command outbox row immediately instead of waiting for the polling loop', async () => {
    const payload = {
      matchId: 'match-1',
      transitionId: 'action-1',
      stateVersion: 1,
      fromSequence: 1,
      toSequence: 1,
      events: [
        {
          matchId: 'match-1',
          eventId: 'match-1:1',
          sequence: 1,
          stateVersion: 1,
          type: 'diceRolled',
          payload: { playerId: 'user-a', diceValue: 4 },
          createdAt: '2026-08-25T00:00:00.000Z',
        },
      ],
    };
    const outbox = createOutboxStore({
      id: 'outbox-1',
      matchId: 'match-1',
      resultingStateVersion: 1,
      payload,
    });
    const processor = {
      process: vi.fn(async () => ({
        ok: true,
        matchId: 'match-1',
        actionId: 'action-1',
        stateVersion: 1,
        lastSequence: 1,
        snapshot: matchSnapshot(),
        events: payload.events,
        ack: { actionId: 'action-1', stateVersion: 1, lastSequence: 1 },
      })),
    };
    const server = await startRuntime({ commandProcessor: processor, outbox });
    servers.push(server);

    const socket = connectClient(server.url, sessionHeader('session-a').cookie);
    await waitForEvent(socket, 'connect');
    await new Promise((resolve) => socket.emit('match:join', { matchId: 'match-1' }, resolve));

    const eventPromise = waitForEvent(socket, 'game:event');
    const ack = await new Promise<{ ok: boolean; actionId: string }>((resolve) => {
      socket.emit(
        'game:command',
        {
          type: 'ROLL_DICE',
          matchId: 'match-1',
          actionId: 'action-1',
          expectedStateVersion: 0,
        },
        resolve,
      );
    });

    expect(ack).toMatchObject({ ok: true, actionId: 'action-1' });
    await expect(eventPromise).resolves.toMatchObject({
      matchId: 'match-1',
      transitionId: 'action-1',
      stateVersion: 1,
      events: [expect.objectContaining({ type: 'diceRolled' })],
    });
    expect(outbox.claim).toHaveBeenCalledTimes(1);
    expect(outbox.markPublished).toHaveBeenCalledWith({
      outboxId: 'outbox-1',
      leaseToken: expect.stringMatching(/^socketio-/),
    });
    socket.disconnect();
  }, 10_000);

  it('routes a committed outbox transition to match room subscribers', async () => {
    const payload = {
      matchId: 'match-1',
      transitionId: randomUUID(),
      stateVersion: 2,
      fromSequence: 7,
      toSequence: 8,
      events: [
        {
          matchId: 'match-1',
          eventId: 'match-1:7',
          sequence: 7,
          stateVersion: 2,
          type: 'turnChanged',
          payload: { fromPlayerId: 'user-a', toPlayerId: 'user-b' },
          createdAt: '2026-08-25T00:00:00.000Z',
        },
        {
          matchId: 'match-1',
          eventId: 'match-1:8',
          sequence: 8,
          stateVersion: 2,
          type: 'extraRollGranted',
          payload: { playerId: 'user-b', reason: 'ROLLED_SIX' },
          createdAt: '2026-08-25T00:00:00.000Z',
        },
      ],
    };
    const outbox = createOutboxStore({
      id: 'outbox-1',
      matchId: 'match-1',
      resultingStateVersion: 2,
      payload,
    });
    const server = await startRuntime({ outbox });
    servers.push(server);

    const socket = connectClient(server.url, sessionHeader('session-a').cookie);
    await waitForEvent(socket, 'connect');
    await new Promise((resolve) => socket.emit('match:join', { matchId: 'match-1' }, resolve));

    const eventPromise = waitForEvent(socket, 'game:event');
    await server.runtime.dispatchOutboxOnce();
    await expect(eventPromise).resolves.toMatchObject({
      matchId: 'match-1',
      stateVersion: 2,
      fromSequence: 7,
      toSequence: 8,
      events: [
        expect.objectContaining({ sequence: 7, type: 'turnChanged' }),
        expect.objectContaining({ sequence: 8, type: 'extraRollGranted' }),
      ],
    });
    socket.disconnect();
  }, 10_000);

  it('keeps manual and immediate outbox dispatch single-flight within one runtime', async () => {
    const payload = {
      matchId: 'match-1',
      transitionId: randomUUID(),
      stateVersion: 2,
      fromSequence: 7,
      toSequence: 7,
      events: [
        {
          matchId: 'match-1',
          eventId: 'match-1:7',
          sequence: 7,
          stateVersion: 2,
          type: 'turnChanged',
          payload: { fromPlayerId: 'user-a', toPlayerId: 'user-b' },
          createdAt: '2026-08-25T00:00:00.000Z',
        },
      ],
    };
    let activeClaims = 0;
    let maxActiveClaims = 0;
    const rows = [
      {
        id: 'outbox-1',
        matchId: 'match-1',
        resultingStateVersion: 2,
        createdAt: new Date('2026-09-20T12:00:00.000Z'),
        claimedAt: new Date('2026-09-20T12:00:00.125Z'),
        payload,
      },
    ];
    const outbox = {
      claim: vi.fn(async () => {
        activeClaims += 1;
        maxActiveClaims = Math.max(maxActiveClaims, activeClaims);
        await new Promise((resolve) => setTimeout(resolve, 20));
        activeClaims -= 1;
        return rows.shift() ?? null;
      }),
      markPublished: vi.fn(async () => true),
      release: vi.fn(async () => undefined),
    };
    const server = await startRuntime({ outbox });
    servers.push(server);

    await Promise.all([server.runtime.dispatchOutboxOnce(), server.runtime.dispatchOutboxOnce()]);

    expect(maxActiveClaims).toBe(1);
    expect(outbox.claim).toHaveBeenCalledTimes(2);
    expect(outbox.markPublished).toHaveBeenCalledTimes(1);
  }, 10_000);

  it('delivers one ordered committed event identity to every 4-player subscriber', async () => {
    const payload = {
      matchId: 'match-1',
      transitionId: 'action-4p-1',
      actionId: 'action-4p-1',
      stateVersion: 4,
      fromSequence: 10,
      toSequence: 10,
      events: [
        {
          matchId: 'match-1',
          eventId: 'match-1:10',
          sequence: 10,
          stateVersion: 4,
          type: 'turnChanged',
          payload: { fromPlayerId: 'user-a', toPlayerId: 'user-b' },
          createdAt: '2026-08-25T00:00:00.000Z',
        },
      ],
    };
    const outbox = createOutboxStore({
      id: 'outbox-1',
      matchId: 'match-1',
      resultingStateVersion: 4,
      payload,
    });
    const server = await startRuntime({
      outbox,
      matchRepository: createMatchRepository(matchSnapshot(), [
        'user-a',
        'user-b',
        'user-c',
        'user-d',
      ]),
    });
    servers.push(server);

    const sockets = ['session-a', 'session-b', 'session-c', 'session-d'].map((session) =>
      connectClient(server.url, sessionHeader(session).cookie),
    );
    await Promise.all(sockets.map((socket) => waitForEvent(socket, 'connect')));
    await Promise.all(
      sockets.map(
        (socket) =>
          new Promise((resolve) => socket.emit('match:join', { matchId: 'match-1' }, resolve)),
      ),
    );

    const deliveries = sockets.map((socket) =>
      waitForEvent<TransitionEnvelope>(socket, 'game:event'),
    );
    await server.runtime.dispatchOutboxOnce();
    const received = await Promise.all(deliveries);

    expect(received).toHaveLength(4);
    for (const envelope of received) {
      expect(envelope).toMatchObject({
        matchId: 'match-1',
        transitionId: 'action-4p-1',
        actionId: 'action-4p-1',
        stateVersion: 4,
        fromSequence: 10,
        toSequence: 10,
      });
      expect(envelope.events).toHaveLength(1);
      expect(envelope.events[0]).toMatchObject({
        eventId: 'match-1:10',
        sequence: 10,
        stateVersion: 4,
        type: 'turnChanged',
      });
    }

    sockets.forEach((socket) => socket.disconnect());
  }, 10_000);

  it('fans out a committed transition across instances through the Redis adapter', async () => {
    const redisUrl = 'redis://127.0.0.1:6379';
    const payload = {
      matchId: 'match-1',
      transitionId: randomUUID(),
      stateVersion: 3,
      fromSequence: 9,
      toSequence: 9,
      events: [
        {
          matchId: 'match-1',
          eventId: 'match-1:9',
          sequence: 9,
          stateVersion: 3,
          type: 'playerSurrendered',
          payload: { playerId: 'user-a' },
          createdAt: '2026-08-25T00:00:00.000Z',
        },
      ],
    };
    const outboxA = createOutboxStore({
      id: 'outbox-1',
      matchId: 'match-1',
      resultingStateVersion: 3,
      payload,
    });
    const serverA = await startRuntime({ outbox: outboxA, redisUrl });
    const serverB = await startRuntime({ redisUrl });
    servers.push(serverA, serverB);

    const socket = connectClient(serverB.url, sessionHeader('session-a').cookie);
    await waitForEvent(socket, 'connect');
    await new Promise((resolve) => socket.emit('match:join', { matchId: 'match-1' }, resolve));

    const eventPromise = waitForEvent(socket, 'game:event');
    await serverA.runtime.dispatchOutboxOnce();
    await expect(eventPromise).resolves.toMatchObject({
      matchId: 'match-1',
      stateVersion: 3,
      fromSequence: 9,
      toSequence: 9,
    });
    socket.disconnect();
  }, 10_000);

  it('serves game sync from committed transition ranges when the client watermark is contiguous', async () => {
    const matchRepository = {
      loadCurrentMatch: vi.fn(async (matchId: string) =>
        matchId === 'match-1'
          ? {
              id: 'match-1',
              seatOrder: ['user-a', 'user-b'],
              stateVersion: 2,
              lastSequence: 3,
              snapshot: matchSnapshot(),
              status: 'ACTIVE',
            }
          : null,
      ),
    };
    const server = await startRuntime({
      matchRepository: matchRepository as MatchRepositoryLike,
      loadCommittedTransitions: vi.fn(async () => [
        {
          matchId: 'match-1',
          transitionId: 'transition-1',
          stateVersion: 1,
          fromSequence: 1,
          toSequence: 2,
          events: [
            {
              matchId: 'match-1',
              eventId: 'match-1:1',
              sequence: 1,
              stateVersion: 1,
              type: 'turnChanged',
              payload: { fromPlayerId: 'user-a', toPlayerId: 'user-b' },
              createdAt: '2026-08-25T00:00:00.000Z',
            },
            {
              matchId: 'match-1',
              eventId: 'match-1:2',
              sequence: 2,
              stateVersion: 1,
              type: 'extraRollGranted',
              payload: { playerId: 'user-b', reason: 'ROLLED_SIX' },
              createdAt: '2026-08-25T00:00:00.000Z',
            },
          ],
          watermark: { stateVersion: 1, lastSequence: 2 },
          snapshot: { ...matchSnapshot(), lastSequence: 2 },
        },
      ]),
    });
    servers.push(server);

    const socket = connectClient(server.url, sessionHeader('session-a').cookie);
    await waitForEvent(socket, 'connect');
    const result = await new Promise<{
      mode: string;
      watermark: { stateVersion: number; lastSequence: number };
    }>((resolve) => {
      socket.emit('game:sync', { matchId: 'match-1', stateVersion: 0, lastSequence: 0 }, resolve);
    });

    expect(result.mode).toBe('events');
    expect(result.watermark).toEqual({ stateVersion: 1, lastSequence: 2 });
    socket.disconnect();
  });

  it('returns a valid snapshot sync for a newly started active match before the first gameplay event', async () => {
    const current = matchSnapshot();
    const matchRepository = {
      loadCurrentMatch: vi.fn(async (matchId: string) =>
        matchId === 'match-1'
          ? {
              id: 'match-1',
              seatOrder: ['user-a', 'user-b'],
              stateVersion: 0,
              lastSequence: 0,
              snapshot: withoutLastSequence(current),
              status: 'ACTIVE',
            }
          : null,
      ),
    };
    const server = await startRuntime({
      matchRepository: matchRepository as MatchRepositoryLike,
      loadCommittedTransitions: vi.fn(async () => []),
    });
    servers.push(server);

    const socketA = connectClient(server.url, sessionHeader('session-a').cookie);
    await waitForEvent(socketA, 'connect');
    await new Promise((resolve) => socketA.emit('match:join', { matchId: 'match-1' }, resolve));

    const firstSync = await new Promise<{
      mode: string;
      snapshot: { lastSequence: number; stateVersion: number };
      watermark: { stateVersion: number; lastSequence: number };
    }>((resolve) => {
      socketA.emit('game:sync', { matchId: 'match-1', stateVersion: 0, lastSequence: 0 }, resolve);
    });

    expect(firstSync.mode).toBe('snapshot');
    expect(firstSync.snapshot.lastSequence).toBe(0);
    expect(firstSync.watermark).toEqual({ stateVersion: 0, lastSequence: 0 });

    const socketB = connectClient(server.url, sessionHeader('session-b').cookie);
    await waitForEvent(socketB, 'connect');
    await new Promise((resolve) => socketB.emit('match:join', { matchId: 'match-1' }, resolve));
    socketB.disconnect();

    const reconnectedB = connectClient(server.url, sessionHeader('session-b').cookie);
    await waitForEvent(reconnectedB, 'connect');
    await new Promise((resolve) => reconnectedB.emit('match:join', { matchId: 'match-1' }, resolve));

    const reconnectSync = await new Promise<{
      mode: string;
      snapshot: { lastSequence: number; stateVersion: number };
      watermark: { stateVersion: number; lastSequence: number };
    }>((resolve) => {
      reconnectedB.emit(
        'game:sync',
        { matchId: 'match-1', stateVersion: 0, lastSequence: 0 },
        resolve,
      );
    });

    expect(reconnectSync.mode).toBe('snapshot');
    expect(reconnectSync.snapshot.lastSequence).toBe(0);
    expect(reconnectSync.watermark).toEqual({ stateVersion: 0, lastSequence: 0 });
    socketA.disconnect();
    reconnectedB.disconnect();
  });

  it('keeps the Socket.IO server alive when sync computation fails for one request', async () => {
    const server = await startRuntime({
      matchRepository: {
        loadCurrentMatch: vi.fn(async (matchId: string) =>
          matchId === 'match-1'
            ? {
                id: 'match-1',
                seatOrder: ['user-a', 'user-b'],
                stateVersion: 0,
                lastSequence: 0,
                snapshot: withoutLastSequence(matchSnapshot()),
                status: 'ACTIVE',
              }
            : null,
        ),
      } as MatchRepositoryLike,
      loadCommittedTransitions: vi.fn(async () => {
        throw new Error('SYNC_FAILURE');
      }),
    });
    servers.push(server);

    const socketA = connectClient(server.url, sessionHeader('session-a').cookie);
    await waitForEvent(socketA, 'connect');
    await new Promise((resolve) => socketA.emit('match:join', { matchId: 'match-1' }, resolve));

    const failureAck = await new Promise<{
      mode: string;
      snapshot: { lastSequence: number };
      watermark: { stateVersion: number; lastSequence: number };
    }>((resolve) => {
      socketA.emit('game:sync', { matchId: 'match-1', stateVersion: 0, lastSequence: 0 }, resolve);
    });

    expect(failureAck.mode).toBe('snapshot');
    expect(failureAck.snapshot.lastSequence).toBe(0);
    expect(failureAck.watermark).toEqual({ stateVersion: 0, lastSequence: 0 });

    const socketB = connectClient(server.url, sessionHeader('session-b').cookie);
    await waitForEvent(socketB, 'connect');
    const joinResult = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
      socketB.emit('match:join', { matchId: 'match-1' }, resolve);
    });

    expect(joinResult).toEqual({ ok: true });
    socketA.disconnect();
    socketB.disconnect();
  });
});
