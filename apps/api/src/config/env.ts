import { z } from 'zod';

const infrastructureSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z.url().startsWith('postgresql://'),
  REDIS_URL: z.url().startsWith('redis://'),
});

const devUserSchema = z
  .object({
    devUserKey: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9_-]*$/i),
    displayName: z.string().trim().min(1).max(100),
  })
  .strict();

export type DevUserConfig = z.infer<typeof devUserSchema>;
export type CookiePolicy = {
  name: '__Host-zamanushka-session' | 'zamanushka-session';
  path: '/';
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
};
export type AuthRuntimeConfig =
  | {
      mode: 'telegram';
      botToken: string;
      allowedOrigins: string[];
      cookie: CookiePolicy;
      sessionTtlSeconds: number;
      initDataMaxBytes: number;
      initDataMaxAgeSeconds: number;
      initDataFutureSkewSeconds: number;
    }
  | {
      mode: 'development';
      users: DevUserConfig[];
      allowedOrigins: string[];
      cookie: CookiePolicy;
      sessionTtlSeconds: number;
    };
export type AppEnv = z.infer<typeof infrastructureSchema> & { auth: AuthRuntimeConfig };

function required(input: Record<string, string | undefined>, key: string): string {
  const value = input[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function boundedInteger(
  input: Record<string, string | undefined>,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = input[key] ?? String(fallback);
  if (!/^\d+$/.test(raw)) throw new Error(`${key} must be an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`${key} must be between ${minimum} and ${maximum}`);
  return value;
}

function parseFlag(
  input: Record<string, string | undefined>,
  nodeEnv: AppEnv['NODE_ENV'],
): boolean {
  const raw = input.DEV_AUTH_ENABLED;
  if (nodeEnv !== 'production' && raw === undefined)
    throw new Error('DEV_AUTH_ENABLED must be explicitly set outside production');
  if (raw !== undefined && raw !== 'true' && raw !== 'false')
    throw new Error('DEV_AUTH_ENABLED must be true or false');
  if (nodeEnv === 'production' && raw === 'true')
    throw new Error('DEV_AUTH_ENABLED=true is forbidden in production');
  return raw === 'true';
}

function parseOrigins(
  input: Record<string, string | undefined>,
  nodeEnv: AppEnv['NODE_ENV'],
): string[] {
  const origins = required(input, 'APP_ORIGINS')
    .split(',')
    .map((entry) => {
      const candidate = entry.trim();
      let url: URL;
      try {
        url = new URL(candidate);
      } catch {
        throw new Error('APP_ORIGINS must contain valid canonical origins');
      }
      if (
        candidate === '*' ||
        url.origin === 'null' ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash ||
        candidate !== url.origin
      ) {
        throw new Error('APP_ORIGINS must contain canonical origins only');
      }
      if (nodeEnv === 'production') {
        if (url.protocol !== 'https:') throw new Error('APP_ORIGINS must use HTTPS in production');
      } else {
        const loopback =
          url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
        if (url.protocol !== 'http:' || !loopback)
          throw new Error('APP_ORIGINS must use loopback HTTP outside production');
      }
      return url.origin;
    });
  return [...new Set(origins)];
}

function parseDevUsers(input: Record<string, string | undefined>): DevUserConfig[] {
  const raw = required(input, 'DEV_AUTH_USERS_JSON');
  if (Buffer.byteLength(raw, 'utf8') > 8_192) throw new Error('DEV_AUTH_USERS_JSON is too large');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('DEV_AUTH_USERS_JSON must be valid JSON');
  }
  const users = z.array(devUserSchema).min(2).max(16).parse(json);
  if (new Set(users.map((user) => user.devUserKey)).size !== users.length)
    throw new Error('DEV_AUTH_USERS_JSON must contain distinct devUserKey values');
  return users;
}

export function parseEnv(input: Record<string, string | undefined>): AppEnv {
  const infrastructure = infrastructureSchema.parse(input);
  const devAuthEnabled = parseFlag(input, infrastructure.NODE_ENV);
  const allowedOrigins = parseOrigins(input, infrastructure.NODE_ENV);
  const sessionTtlSeconds = boundedInteger(
    input,
    'SESSION_TTL_SECONDS',
    2_592_000,
    300,
    31_536_000,
  );
  const cookie: CookiePolicy = {
    name:
      infrastructure.NODE_ENV === 'production' ? '__Host-zamanushka-session' : 'zamanushka-session',
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: infrastructure.NODE_ENV === 'production',
  };
  const auth: AuthRuntimeConfig = devAuthEnabled
    ? {
        mode: 'development',
        users: parseDevUsers(input),
        allowedOrigins,
        cookie,
        sessionTtlSeconds,
      }
    : {
        mode: 'telegram',
        botToken: required(input, 'TELEGRAM_BOT_TOKEN'),
        allowedOrigins,
        cookie,
        sessionTtlSeconds,
        initDataMaxBytes: boundedInteger(
          input,
          'TELEGRAM_INIT_DATA_MAX_BYTES',
          16_384,
          256,
          65_536,
        ),
        initDataMaxAgeSeconds: boundedInteger(
          input,
          'TELEGRAM_INIT_DATA_MAX_AGE_SECONDS',
          300,
          30,
          86_400,
        ),
        initDataFutureSkewSeconds: boundedInteger(
          input,
          'TELEGRAM_INIT_DATA_FUTURE_SKEW_SECONDS',
          30,
          0,
          300,
        ),
      };
  return { ...infrastructure, auth };
}
