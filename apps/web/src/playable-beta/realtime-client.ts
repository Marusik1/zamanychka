import { io, type Socket } from 'socket.io-client';
import {
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

export interface RealtimeClient {
  ensureConnected(): Promise<void>;
  subscribe(listener: RealtimeSubscription): () => void;
  joinMatch(matchId: string): Promise<void>;
  sync(request: GameSyncRequest): Promise<GameSyncResponse>;
  sendCommand(command: GameCommandRequest): Promise<GameCommandResult>;
  disconnect(): void;
  __emitTransition?(transition: TransitionEnvelope): void;
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

export function createRealtimeClient(): RealtimeClient {
  let socket: Socket | null = null;
  const listeners = new Set<RealtimeSubscription>();

  function currentSocket() {
    if (socket) return socket;
    socket = io({
      path: '/socket.io',
      transports: ['websocket'],
      withCredentials: true,
      autoConnect: false,
    });
    socket.on('game:event', (payload: unknown) => {
      const parsed = transitionEnvelopeSchema.safeParse(payload);
      if (!parsed.success) return;
      listeners.forEach((listener) => listener(parsed.data));
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
      return () => listeners.delete(listener);
    },
    async joinMatch(matchId) {
      await this.ensureConnected();
      const request: MatchSubscriptionRequest = { matchId };
      await ackPromise(
        (ack) => currentSocket().emit('match:join', request, ack),
        (value) => {
          if (
            typeof value === 'object' &&
            value !== null &&
            'ok' in value &&
            (value as { ok: boolean }).ok === true
          ) {
            return undefined;
          }
          throw new Error('MATCH_JOIN_FAILED');
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
      return ackPromise(
        (ack) => currentSocket().emit('game:command', command, ack),
        (value) => gameCommandResultSchema.parse(value),
      );
    },
    disconnect() {
      socket?.disconnect();
      socket = null;
    },
  };
}
