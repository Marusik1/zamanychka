import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => void;

const socketHandlers = new Map<string, Handler[]>();
const managerHandlers = new Map<string, Handler[]>();
const emitCalls: unknown[][] = [];
const ioCalls: unknown[] = [];
const suppressAckEvents = new Set<string>();

function addHandler(store: Map<string, Handler[]>, event: string, handler: Handler) {
  store.set(event, [...(store.get(event) ?? []), handler]);
}

function dispatch(store: Map<string, Handler[]>, event: string, ...args: unknown[]) {
  for (const handler of store.get(event) ?? []) {
    handler(...args);
  }
}

vi.mock('socket.io-client', () => ({
  io: vi.fn((options: unknown) => {
    ioCalls.push(options);
    return {
    id: 'socket-1',
    connected: false,
    io: {
      engine: {
        transport: { name: 'websocket' },
        on: vi.fn(),
      },
      on: vi.fn((event: string, handler: Handler) => addHandler(managerHandlers, event, handler)),
    },
    on: vi.fn((event: string, handler: Handler) => addHandler(socketHandlers, event, handler)),
    off: vi.fn(),
    connect: vi.fn(function connect(this: { connected: boolean }) {
      this.connected = true;
      dispatch(socketHandlers, 'connect');
    }),
    disconnect: vi.fn(),
    emit: vi.fn((...args: unknown[]) => {
      emitCalls.push(args);
      if (typeof args[0] === 'string' && suppressAckEvents.has(args[0])) return;
      const ack = args.at(-1);
      if (typeof ack === 'function') {
        ack({ ok: true });
      }
    }),
  };
  }),
}));

describe('RealtimeClient', () => {
  beforeEach(() => {
    socketHandlers.clear();
    managerHandlers.clear();
    emitCalls.length = 0;
    ioCalls.length = 0;
    suppressAckEvents.clear();
    localStorage.clear();
    vi.useRealTimers();
  });

  it('allows polling fallback when production websocket transport is unavailable', async () => {
    const { createRealtimeClient } = await import('./realtime-client.js');
    const client = createRealtimeClient();

    await client.ensureConnected();

    expect(ioCalls[0]).toMatchObject({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: false,
    });
  });

  it('rejoins subscribed match rooms after socket reconnect', async () => {
    const { createRealtimeClient } = await import('./realtime-client.js');
    const client = createRealtimeClient();

    await client.joinMatch('match-1');
    emitCalls.length = 0;

    dispatch(managerHandlers, 'reconnect', 1);

    expect(emitCalls).toEqual([
      [
        'match:join',
        expect.objectContaining({
          matchId: 'match-1',
        }),
        expect.any(Function),
      ],
    ]);
  });

  it('times out a gameplay command when the socket ACK is lost', async () => {
    vi.useFakeTimers();
    suppressAckEvents.add('game:command');
    const { createRealtimeClient, RealtimeClientError } = await import('./realtime-client.js');
    const client = createRealtimeClient();

    const result = expect(client.sendCommand({
      type: 'ROLL_DICE',
      matchId: 'match-1',
      actionId: 'lost-ack',
      expectedStateVersion: 0,
    })).rejects.toMatchObject({
      name: RealtimeClientError.name,
      code: 'ACK_TIMEOUT',
      retryable: true,
    });

    await vi.advanceTimersByTimeAsync(8_000);
    await result;
  });
});
