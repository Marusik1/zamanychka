#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* global URL, process */

const BOT_TOKEN = '123456:epic-01-production-guard-token';
const DATABASE_URL = 'postgresql://guard-user:guard-password@127.0.0.1:5432/guard-db';
const REDIS_URL = 'redis://:guard-redis-password@127.0.0.1:6379/0';
export const PRODUCTION_GUARD_EXIT_CODE = 86;
export const PRODUCTION_GUARD_SENTINEL = 'EPIC01_PRODUCTION_DEV_AUTH_GUARD_REJECTED';

export function evaluateProductionGuardResult(result, secrets) {
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  for (const secret of secrets) {
    if (secret && output.includes(secret))
      throw new Error('production guard output leaked a credential');
  }
  if (!Number.isInteger(result.status))
    throw new Error('production config check did not return an exit status');
  if (result.status === 0) throw new Error('production config accepted DEV_AUTH_ENABLED=true');
  if (result.status !== PRODUCTION_GUARD_EXIT_CODE)
    throw new Error('production config check did not return the dedicated rejection exit code');
  if (result.stdout !== '' || result.stderr !== `${PRODUCTION_GUARD_SENTINEL}\n`)
    throw new Error('production config check did not emit the exact rejection sentinel');
}

export function runProductionGuard() {
  const source = `
    import { parseEnv } from './src/config/env.ts';
    const expected = 'DEV_AUTH_ENABLED=true is forbidden in production';
    try {
      parseEnv(process.env);
    } catch (error) {
      const direct = error instanceof Error && error.message === expected;
      const issues = error && typeof error === 'object' && Array.isArray(error.issues)
        ? error.issues
        : [];
      const zodIssue = issues.some((issue) =>
        issue && typeof issue === 'object' && issue.message === expected &&
        Array.isArray(issue.path) && issue.path.join('.') === 'DEV_AUTH_ENABLED'
      );
      if (direct || zodIssue) {
        process.stderr.write('${PRODUCTION_GUARD_SENTINEL}\\n');
        process.exit(${PRODUCTION_GUARD_EXIT_CODE});
      }
      process.exit(87);
    }
  `;
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
