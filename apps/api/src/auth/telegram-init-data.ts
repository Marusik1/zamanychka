import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

const INVALID = {
  ok: false,
  error: 'TELEGRAM_AUTH_INVALID',
} as const;

const TelegramSignedUserSchema = z
  .object({
    id: z.number().int().positive().safe(),
    first_name: z.string(),
    last_name: z.string().optional(),
    username: z.string().optional(),
    language_code: z.string().optional(),
    photo_url: z.string().optional(),
    is_bot: z.boolean().optional(),
    is_premium: z.boolean().optional(),
    added_to_attachment_menu: z.boolean().optional(),
    allows_write_to_pm: z.boolean().optional(),
  })
  .strip();

export interface TelegramVerifiedUser {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  photoUrl?: string;
}

export type TelegramInitDataResult = { ok: true; user: TelegramVerifiedUser } | typeof INVALID;

export interface TelegramInitDataOptions {
  botToken: string;
  maxBytes: number;
  maxAgeSeconds: number;
  futureSkewSeconds: number;
  now: () => Date;
}

function decodeQueryComponent(component: string): string | undefined {
  if (/%(?![0-9a-fA-F]{2})/.test(component)) {
    return undefined;
  }

  try {
    return decodeURIComponent(component.replace(/\+/g, ' '));
  } catch {
    return undefined;
  }
}

function parseStrictQuery(initData: string): Map<string, string> | undefined {
  const pairs = new Map<string, string>();

  for (const component of initData.split('&')) {
    const separator = component.indexOf('=');
    if (separator <= 0) {
      return undefined;
    }

    const key = decodeQueryComponent(component.slice(0, separator));
    const value = decodeQueryComponent(component.slice(separator + 1));
    if (key === undefined || value === undefined || pairs.has(key)) {
      return undefined;
    }
    pairs.set(key, value);
  }

  return pairs;
}

export function verifyTelegramInitData(
  initData: string,
  options: TelegramInitDataOptions,
): TelegramInitDataResult {
  if (initData.length === 0 || Buffer.byteLength(initData, 'utf8') > options.maxBytes) {
    return INVALID;
  }

  const pairs = parseStrictQuery(initData);
  const hash = pairs?.get('hash');
  const authDateRaw = pairs?.get('auth_date');
  const userRaw = pairs?.get('user');
  if (
    pairs === undefined ||
    hash === undefined ||
    authDateRaw === undefined ||
    userRaw === undefined ||
    !/^[0-9a-f]{64}$/.test(hash)
  ) {
    return INVALID;
  }

  const dataCheckString = [...pairs]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(options.botToken).digest();
  const expectedHash = createHmac('sha256', secret).update(dataCheckString).digest();
  const suppliedHash = Buffer.from(hash, 'hex');

  if (suppliedHash.length !== expectedHash.length || !timingSafeEqual(suppliedHash, expectedHash)) {
    return INVALID;
  }

  if (!/^\d+$/.test(authDateRaw)) {
    return INVALID;
  }
  const authDate = Number(authDateRaw);
  const now = Math.floor(options.now().getTime() / 1_000);
  if (
    !Number.isSafeInteger(authDate) ||
    authDate < now - options.maxAgeSeconds ||
    authDate > now + options.futureSkewSeconds
  ) {
    return INVALID;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(userRaw);
  } catch {
    return INVALID;
  }
  const parsedUser = TelegramSignedUserSchema.safeParse(parsedJson);
  if (!parsedUser.success) {
    return INVALID;
  }

  return {
    ok: true,
    user: {
      id: String(parsedUser.data.id),
      firstName: parsedUser.data.first_name,
      ...(parsedUser.data.last_name === undefined ? {} : { lastName: parsedUser.data.last_name }),
      ...(parsedUser.data.username === undefined ? {} : { username: parsedUser.data.username }),
      ...(parsedUser.data.language_code === undefined
        ? {}
        : { languageCode: parsedUser.data.language_code }),
      ...(parsedUser.data.photo_url === undefined ? {} : { photoUrl: parsedUser.data.photo_url }),
    },
  };
}
