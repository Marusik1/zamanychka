import { config as loadEnv } from 'dotenv';

import { buildApp } from './app.js';
import { createAuthRepository } from './auth/auth-repository.js';
import { createAuthService } from './auth/auth-service.js';
import { verifyTelegramInitData } from './auth/telegram-init-data.js';
import { parseEnv } from './config/env.js';
import { createLiveDependencies } from './health/dependency-probes.js';

loadEnv({ path: new URL('../../../.env', import.meta.url), quiet: true });

const env = parseEnv(process.env);
const dependencies = createLiveDependencies(env);
const repository = createAuthRepository(dependencies.prisma);
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
});
app.addHook('onClose', async () => dependencies.close());

const shutdown = async () => {
  await app.close();
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

await app.listen({ host: env.API_HOST, port: env.API_PORT });
