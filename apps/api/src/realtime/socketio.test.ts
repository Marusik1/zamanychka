import { randomUUID } from 'node:crypto';

import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as createClient, type Socket } from 'socket.io-client';
import { createActiveGameState } from '@zamanushka/game-engine';

import { createRealtimeRuntime } from './socketio.js';

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
      throw new Error('AUTH_REQUIRED');
    },
  } as any;
}

function createMatchRepository(current = matchSnapshot()) {
  const match = {
    id: 'match-1',
    seatOrder: ['user-a', 'user-b'],
    snapshot: current,
    status: 'ACTIVE',
  };
  return {
    loadCurrentMatch: vi.fn(async (matchId: string) => (matchId === match.id ? structuredClone(match) : null)),
  } as any;
}

function createOutboxStore(row?: { id: string; matchId: string; resultingStateVersion: number; payload: unknown }) {
  const queue = row ? [structuredClone(row)] : [];
  return {
    claim: vi.fn(async () => queue.shift() ?? null),
    markPublished: vi.fn(async () => true),
    release: vi.fn(async () => undefined),
  } as any;
}

async function startRuntime(options?: {
  auth?: any;
  matchRepository?: ReturnType<typeof createMatchRepository>;
  outbox?: ReturnType<typeof createOutboxStore>;
  loadCommittedTransitions?: (...args: any[]) => Promise<any>;
  commandProcessor?: { process: (...args: any[]) => Promise<any> };
  redisUrl?: string;
}) {
  const app = Fastify();
  const runtime = createRealtimeRuntime({
    httpServer: app.server,
    auth: options?.auth ?? createAuthService(),
    matchRepository: options?.matchRepository ?? createMatchRepository(),
    outbox: options?.outbox ?? createOutboxStore(),
    ...(options?.loadCommittedTransitions ? { loadCommittedTransitions: options.loadCommittedTransitions } : {}),
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
      } as any),
    allowedOrigins: ['http://127.0.0.1'],
    ...(options?.redisUrl ? { redisUrl: options.redisUrl } : {}),
  });
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
  let servers: Array<Awaited<ReturnType<typeof startRuntime>>>;

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
    const server = await startRuntime({ matchRepository: finishedMatchRepository as any });
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
    const processor = { process: vi.fn(async (input) => ({ ok: true, ...input.command, stateVersion: 1, lastSequence: 1, snapshot: matchSnapshot(), events: [], ack: { actionId: input.command.actionId, stateVersion: 1, lastSequence: 1 } })) };
    const server = await startRuntime({ commandProcessor: processor });
    servers.push(server);

    const socket = connectClient(server.url, sessionHeader('session-b').cookie);
    await waitForEvent(socket, 'connect');
    const response = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
      socket.emit('game:command', {
        type: 'SURRENDER',
        matchId: 'match-1',
        actionId: 'action-1',
        expectedStateVersion: 0,
        actorPlayerId: 'attacker',
      } as never, resolve);
    });

    expect(response).toMatchObject({ ok: false, code: 'INVALID_ACTION', message: 'Request validation failed' });
    expect(processor.process).not.toHaveBeenCalled();
    socket.disconnect();
  });

  it('uses the authenticated session user as the command actor', async () => {
    const processor = { process: vi.fn(async () => ({
      ok: true,
      matchId: 'match-1',
      actionId: 'action-1',
      stateVersion: 1,
      lastSequence: 1,
      snapshot: matchSnapshot(),
      events: [],
      ack: { actionId: 'action-1', stateVersion: 1, lastSequence: 1 },
    })) };
    const server = await startRuntime({ commandProcessor: processor });
    servers.push(server);

    const socket = connectClient(server.url, sessionHeader('session-b').cookie);
    await waitForEvent(socket, 'connect');
    const response = await new Promise<Record<string, unknown>>((resolve) => {
      socket.emit('game:command', {
        type: 'SURRENDER',
        matchId: 'match-1',
        actionId: 'action-2',
        expectedStateVersion: 0,
      }, resolve);
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
          payload: { playerId: 'user-b' },
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
      matchRepository: matchRepository as any,
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
              payload: { playerId: 'user-b' },
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
    const result = await new Promise<{ mode: string; watermark: { stateVersion: number; lastSequence: number } }>((resolve) => {
      socket.emit('game:sync', { matchId: 'match-1', stateVersion: 0, lastSequence: 0 }, resolve);
    });

    expect(result.mode).toBe('events');
    expect(result.watermark).toEqual({ stateVersion: 1, lastSequence: 2 });
    socket.disconnect();
  });
});
