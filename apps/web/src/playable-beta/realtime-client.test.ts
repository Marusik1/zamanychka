import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => void;

const socketHandlers = new Map<string, Handler[]>();
const managerHandlers = new Map<string, Handler[]>();
const emitCalls: unknown[][] = [];

function addHandler(store: Map<string, Handler[]>, event: string, handler: Handler) {
  store.set(event, [...(store.get(event) ?? []), handler]);
}

function dispatch(store: Map<string, Handler[]>, event: string, ...args: unknown[]) {
  for (const handler of store.get(event) ?? []) {
    handler(...args);
  }
}

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
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
      const ack = args.at(-1);
      if (typeof ack === 'function') {
        ack({ ok: true });
      }
    }),
  })),
}));

describe('RealtimeClient', () => {
  beforeEach(() => {
    socketHandlers.clear();
    managerHandlers.clear();
    emitCalls.length = 0;
    localStorage.clear();
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
});
