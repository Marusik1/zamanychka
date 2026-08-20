#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* global URL, process */

const BOT_TOKEN = '123456:epic-01-production-guard-token';
const DATABASE_URL = 'postgresql://guard-user:guard-password@127.0.0.1:5432/guard-db';
const REDIS_URL = 'redis://:guard-redis-password@127.0.0.1:6379/0';

export function evaluateProductionGuardResult(result, secrets) {
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (!Number.isInteger(result.status))
    throw new Error('production config check did not return an exit status');
  if (result.status === 0) throw new Error('production config accepted DEV_AUTH_ENABLED=true');
  for (const secret of secrets) {
    if (secret && output.includes(secret))
      throw new Error('production guard output leaked a credential');
  }
}

export function runProductionGuard() {
  const source = "import { parseEnv } from './src/config/env.ts'; parseEnv(process.env);";
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    DEV_AUTH_ENABLED: 'true',
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    APP_ORIGINS: 'https://guard.example',
    DATABASE_URL,
    REDIS_URL,
  };
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--eval', source], {
    cwd: fileURLToPath(new URL('../apps/api/', import.meta.url)),
    env,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  evaluateProductionGuardResult(result, [
    BOT_TOKEN,
    DATABASE_URL,
    REDIS_URL,
    'guard-user',
    'guard-password',
    'guard-redis-password',
  ]);
  process.stdout.write('EPIC-01 production auth guard smoke passed\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runProductionGuard();
  } catch (error) {
    process.stderr.write(`EPIC-01 production guard smoke failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
