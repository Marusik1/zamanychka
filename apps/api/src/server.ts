import { config as loadEnv } from 'dotenv';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApp } from './app.js';
import { createAuthRepository } from './auth/auth-repository.js';
import { createAuthService } from './auth/auth-service.js';
import { verifyTelegramInitData } from './auth/telegram-init-data.js';
import { getApiBuildInfo } from './build-info.js';
import { BotRunner } from './bots/bot-runner.js';
import { RedisBotMatchLease } from './bots/redis-lease.js';
import { createBotRuntimeAdapter } from './bots/runtime-adapter.js';
import { parseEnv } from './config/env.js';
import { createLiveDependencies } from './health/dependency-probes.js';
import { createRedisClient } from './infrastructure/redis.js';
import { createMatchRepository } from './match/match-repository.js';
import { createProfileRepository } from './profile/profile-repository.js';
import { createProfileService } from './profile/profile-service.js';
import { createMatchCompletionService } from './rooms/match-completion.js';
import { createRoomChatService } from './rooms/room-chat.js';
import { createRoomInviteService } from './rooms/room-invite-service.js';
import { createRoomRepository } from './rooms/room-repository.js';
import { createRoomService } from './rooms/room-service.js';
import { createInMemoryRoomPresenceStore } from './rooms/presence-store.js';
import { createCommandProcessor } from './realtime/command-processor.js';
import { createPostgresOutboxLeaseStore } from './realtime/outbox.js';
import { createRealtimeRuntime } from './realtime/socketio.js';

loadEnv({ path: new URL('../../../.env', import.meta.url), quiet: true });

const serverDir = dirname(fileURLToPath(import.meta.url));
const productionWebRoot = join(serverDir, '../../web/dist');
await access(join(productionWebRoot, 'index.html'));

const env = parseEnv(process.env);
const buildInfo = getApiBuildInfo();
const dependencies = createLiveDependencies(env);
const repository = createAuthRepository(dependencies.prisma);
const roomRepository = createRoomRepository(dependencies.prisma);
const matchRepository = createMatchRepository(dependencies.prisma);
let botRunner: BotRunner | null = null;
const profileService = createProfileService({
  repository: createProfileRepository(dependencies.prisma),
});
const roomService = createRoomService({
  repository: roomRepository,
  presenceStore: createInMemoryRoomPresenceStore(),
  enableSoloGameDebug: env.enableSoloGameDebug,
  onMatchStarted: (matchId) => botRunner?.kick(matchId),
});
const roomChatService = createRoomChatService(dependencies.prisma);
const roomInviteService = createRoomInviteService(dependencies.prisma);
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
  rooms: { service: roomService, chat: roomChatService, invites: roomInviteService },
  profile: { service: profileService },
  productionWebRoot,
  buildInfo,
});
const completion = createMatchCompletionService({ repository: roomRepository });
const commandProcessor = createCommandProcessor({
  repository: matchRepository,
  enableSoloGameDebug: env.enableSoloGameDebug,
  onTerminalMatch: async ({ tx, matchId }) => {
    await completion.completeTerminalMatchInTransaction(tx, matchId);
  },
});
const botLeaseRedis = createRedisClient(env.REDIS_URL);
await botLeaseRedis.connect();
const botRuntime = createBotRuntimeAdapter({
  matchRepository,
  processCommand: (input) => commandProcessor.process(input),
});
botRunner = new BotRunner(botRuntime, new RedisBotMatchLease(botLeaseRedis));
const realtime = createRealtimeRuntime({
  httpServer: app.server,
  auth: authService,
  cookieName: env.auth.cookie.name,
  matchRepository,
  outbox: createPostgresOutboxLeaseStore(dependencies.prisma),
  commandProcessor,
  botRunner,
  allowedOrigins: env.auth.allowedOrigins,
  redisUrl: env.REDIS_URL,
});
await realtime.ready;
console.info('[REALTIME BUILD]', {
  buildId: buildInfo.buildId,
  protocolVersion: buildInfo.realtimeProtocolVersion,
  immediateOutboxDispatch: true,
});
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
app.addHook('onClose', async () => {
  await botLeaseRedis.quit();
});

const shutdown = async () => {
  await app.close();
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

await app.listen({
  host: env.NODE_ENV === 'production' ? '0.0.0.0' : env.API_HOST,
  port: env.API_PORT,
});
