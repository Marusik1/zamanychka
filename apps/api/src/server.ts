import { config as loadEnv } from 'dotenv';

import { buildApp } from './app.js';
import { createAuthRepository } from './auth/auth-repository.js';
import { createAuthService } from './auth/auth-service.js';
import { verifyTelegramInitData } from './auth/telegram-init-data.js';
import { parseEnv } from './config/env.js';
import { createLiveDependencies } from './health/dependency-probes.js';
import { createMatchRepository } from './match/match-repository.js';
import { createMatchCompletionService } from './rooms/match-completion.js';
import { createRoomRepository } from './rooms/room-repository.js';
import { createRoomService } from './rooms/room-service.js';
import { createInMemoryRoomPresenceStore } from './rooms/presence-store.js';
import { createCommandProcessor } from './realtime/command-processor.js';
import { createPostgresOutboxLeaseStore } from './realtime/outbox.js';
import { createRealtimeRuntime } from './realtime/socketio.js';

loadEnv({ path: new URL('../../../.env', import.meta.url), quiet: true });

const env = parseEnv(process.env);
const dependencies = createLiveDependencies(env);
const repository = createAuthRepository(dependencies.prisma);
const roomRepository = createRoomRepository(dependencies.prisma);
const matchRepository = createMatchRepository(dependencies.prisma);
const roomService = createRoomService({
  repository: roomRepository,
  presenceStore: createInMemoryRoomPresenceStore(),
});
function createConfiguredAuthService() {
  if (env.auth.mode === 'development') {
    return createAuthService({
      repository,
      sessionTtlSeconds: env.auth.sessionTtlSeconds,
      devUsers: env.auth.users,
    });
  }
  const telegramAuth = env.auth;
  return createAuthService({
    repository,
    sessionTtlSeconds: telegramAuth.sessionTtlSeconds,
    verifyTelegram: (raw) =>
      verifyTelegramInitData(raw, {
        botToken: telegramAuth.botToken,
        maxBytes: telegramAuth.initDataMaxBytes,
        maxAgeSeconds: telegramAuth.initDataMaxAgeSeconds,
        futureSkewSeconds: telegramAuth.initDataFutureSkewSeconds,
        now: () => new Date(),
      }),
  });
}
const authService = createConfiguredAuthService();
const app = buildApp({
  probes: dependencies.probes,
  logger: true,
  auth: { config: env.auth, service: authService },
  rooms: { service: roomService },
});
const completion = createMatchCompletionService({ repository: roomRepository });
const commandProcessor = createCommandProcessor({
  repository: matchRepository,
  onTerminalMatch: async ({ tx, matchId }) => {
    await completion.completeTerminalMatchInTransaction(tx, matchId);
  },
});
const realtime = createRealtimeRuntime({
  httpServer: app.server,
  auth: authService,
  matchRepository,
  outbox: createPostgresOutboxLeaseStore(dependencies.prisma),
  commandProcessor,
  allowedOrigins: env.auth.allowedOrigins,
  redisUrl: env.REDIS_URL,
});
await realtime.ready;
let dispatching = false;
const dispatchTimer = setInterval(() => {
  if (dispatching) return;
  dispatching = true;
  void realtime.dispatchOutboxOnce().finally(() => {
    dispatching = false;
  });
}, 250);
app.addHook('onClose', async () => dependencies.close());
app.addHook('onClose', async () => clearInterval(dispatchTimer));
app.addHook('onClose', async () => realtime.close());

const shutdown = async () => {
  await app.close();
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

await app.listen({ host: env.API_HOST, port: env.API_PORT });
