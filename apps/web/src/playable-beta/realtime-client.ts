import { io, type Socket } from 'socket.io-client';
import {
  REALTIME_PROTOCOL_VERSION,
  gameCommandResultSchema,
  gameSyncResponseSchema,
  transitionEnvelopeSchema,
  type GameCommandRequest,
  type GameCommandResult,
  type GameSyncRequest,
  type GameSyncResponse,
  type MatchSubscriptionRequest,
  type TransitionEnvelope,
} from '@zamanushka/shared';

export type RealtimeSubscription = (transition: TransitionEnvelope) => void;

type ClientTelemetryEvent = Readonly<{
  event: string;
  at: string;
  clientNowMs?: number;
  [key: string]: unknown;
}>;

declare global {
  interface Window {
    __zGameplayTelemetry?: ClientTelemetryEvent[];
    __zActiveSocketInstances?: number;
  }
}

export interface RealtimeClient {
  ensureConnected(): Promise<void>;
  subscribe(listener: RealtimeSubscription): () => void;
  joinMatch(matchId: string): Promise<void>;
  sync(request: GameSyncRequest): Promise<GameSyncResponse>;
  sendCommand(command: GameCommandRequest): Promise<GameCommandResult>;
  skipDebugDummyTurn(input: { matchId: string; stateVersion: number }): Promise<GameCommandResult>;
  disconnect(): void;
  __emitTransition?(transition: TransitionEnvelope): void;
}

export class RealtimeClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'RealtimeClientError';
  }
}

function ackPromise<T>(emit: (ack: (value: unknown) => void) => void, parser: (value: unknown) => T) {
  return new Promise<T>((resolve, reject) => {
    emit((value) => {
      try {
        resolve(parser(value));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function telemetryEnabled() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('zamanushka:gameplayTelemetry') === 'true';
}

function recordTelemetry(event: string, payload: Record<string, unknown> = {}) {
  if (!telemetryEnabled()) return;
  const entry: ClientTelemetryEvent = {
    event,
    at: new Date().toISOString(),
    clientNowMs: Math.round(performance.now() * 100) / 100,
    ...payload,
  };
  window.__zGameplayTelemetry = [...(window.__zGameplayTelemetry ?? []), entry].slice(-500);
  console.info('[gameplay-realtime]', entry);
}

export function createRealtimeClient(): RealtimeClient {
  let socket: Socket | null = null;
  const listeners = new Set<RealtimeSubscription>();
  let disconnectCount = 0;
  let connectErrorCount = 0;
  let reconnectCount = 0;

  function currentSocket() {
    if (socket) return socket;
    socket = io({
      path: '/socket.io',
      transports: ['websocket'],
      withCredentials: true,
      autoConnect: false,
    });
    if (typeof window !== 'undefined') {
      window.__zActiveSocketInstances = (window.__zActiveSocketInstances ?? 0) + 1;
      recordTelemetry('socket-created', {
        activeSocketInstances: window.__zActiveSocketInstances,
      });
    }
    socket.on('connect', () => {
      recordTelemetry('socket-connect', {
        socketId: socket?.id,
        connected: socket?.connected,
        transport: socket?.io.engine.transport.name,
        socketUrl: `${window.location.origin}/socket.io`,
        disconnectCount,
        connectErrorCount,
        reconnectCount,
      });
    });
    socket.on('disconnect', (reason) => {
      disconnectCount += 1;
      recordTelemetry('socket-disconnect', { reason, disconnectCount });
    });
    socket.on('connect_error', (error) => {
      connectErrorCount += 1;
      recordTelemetry('socket-connect-error', { message: error.message, connectErrorCount });
    });
    socket.io.on('reconnect', (attempt) => {
      reconnectCount += 1;
      recordTelemetry('socket-reconnect', {
        attempt,
        reconnectCount,
        socketId: socket?.id,
        transport: socket?.io.engine.transport.name,
      });
    });
    socket.io.on('reconnect_attempt', (attempt) => {
      recordTelemetry('socket-reconnect-attempt', { attempt });
    });
    socket.io.engine.on('upgrade', (transport) => {
      recordTelemetry('socket-upgrade', { transport: transport.name });
    });
    socket.on('game:event', (payload: unknown) => {
      const receivedAt = performance.now();
      const parsed = transitionEnvelopeSchema.safeParse(payload);
      if (!parsed.success) return;
      recordTelemetry('game-event-received', {
        matchId: parsed.data.matchId,
        transitionId: parsed.data.transitionId,
        stateVersion: parsed.data.stateVersion,
        fromSequence: parsed.data.fromSequence,
        toSequence: parsed.data.toSequence,
        eventCount: parsed.data.events.length,
        listenerCount: listeners.size,
      });
      listeners.forEach((listener) => listener(parsed.data));
      recordTelemetry('game-event-dispatched-to-listeners', {
        matchId: parsed.data.matchId,
        transitionId: parsed.data.transitionId,
        listenerCount: listeners.size,
        receiveToDispatchMs: Math.round((performance.now() - receivedAt) * 100) / 100,
      });
    });
    return socket;
  }

  return {
    async ensureConnected() {
      const candidate = currentSocket();
      if (candidate.connected) return;
      await new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          cleanup();
          resolve();
        };
        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };
        const cleanup = () => {
          candidate.off('connect', onConnect);
          candidate.off('connect_error', onError);
        };
        candidate.on('connect', onConnect);
        candidate.on('connect_error', onError);
        candidate.connect();
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      recordTelemetry('listener-added', { listenerCount: listeners.size });
      return () => {
        listeners.delete(listener);
        recordTelemetry('listener-removed', { listenerCount: listeners.size });
      };
    },
    async joinMatch(matchId) {
      await this.ensureConnected();
      const request: MatchSubscriptionRequest = { matchId };
      await ackPromise(
        (ack) =>
          currentSocket().emit(
            'match:join',
            { ...request, realtimeProtocolVersion: REALTIME_PROTOCOL_VERSION },
            ack,
          ),
        (value) => {
          if (
            typeof value === 'object' &&
            value !== null &&
            'ok' in value &&
            (value as { ok: boolean }).ok === true
          ) {
            return undefined;
          }
          const code =
            typeof value === 'object' &&
            value !== null &&
            'code' in value &&
            typeof (value as { code: unknown }).code === 'string'
              ? (value as { code: string }).code
              : 'MATCH_JOIN_FAILED';
          throw new RealtimeClientError(code, `match:join failed with ${code}`, code === 'MATCH_NOT_FOUND');
        },
      );
    },
    async sync(request) {
      await this.ensureConnected();
      return ackPromise(
        (ack) => currentSocket().emit('game:sync', request, ack),
        (value) => gameSyncResponseSchema.parse(value),
      );
    },
    async sendCommand(command) {
      await this.ensureConnected();
      const sentAt = performance.now();
      recordTelemetry('command-sent', {
        matchId: command.matchId,
        actionId: command.actionId,
        type: command.type,
        expectedStateVersion: command.expectedStateVersion,
      });
      return ackPromise(
        (ack) => currentSocket().emit('game:command', command, ack),
        (value) => {
          const parsed = gameCommandResultSchema.parse(value);
          recordTelemetry('command-ack', {
            matchId: command.matchId,
            actionId: command.actionId,
            type: command.type,
            ok: parsed.ok,
            stateVersion: parsed.stateVersion,
            socketRoundTripMs: Math.round((performance.now() - sentAt) * 100) / 100,
          });
          return parsed;
        },
      );
    },
    async skipDebugDummyTurn(input) {
      await this.ensureConnected();
      return ackPromise(
        (ack) => currentSocket().emit('game:debug-skip-dummy-turn', input, ack),
        (value) => gameCommandResultSchema.parse(value),
      );
    },
    disconnect() {
      if (socket && typeof window !== 'undefined') {
        window.__zActiveSocketInstances = Math.max(0, (window.__zActiveSocketInstances ?? 1) - 1);
        recordTelemetry('socket-destroyed', {
          activeSocketInstances: window.__zActiveSocketInstances,
        });
      }
      socket?.disconnect();
      socket = null;
    },
  };
}
