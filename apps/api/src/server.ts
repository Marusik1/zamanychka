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
const telegramConfig = env.auth.mode === 'telegram' ? env.auth : undefined;
const authService = createAuthService({
  repository,
  sessionTtlSeconds: env.auth.sessionTtlSeconds,
  ...(env.auth.mode === 'development'
    ? { devUsers: env.auth.users }
    : {
        verifyTelegram: (raw) =>
          verifyTelegramInitData(raw, {
            botToken: telegramConfig!.botToken,
            maxBytes: telegramConfig!.initDataMaxBytes,
            maxAgeSeconds: telegramConfig!.initDataMaxAgeSeconds,
            futureSkewSeconds: telegramConfig!.initDataFutureSkewSeconds,
            now: () => new Date(),
          }),
      }),
});
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
