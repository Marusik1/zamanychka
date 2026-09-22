export type TelegramShareConfig = Readonly<{
  botUsername?: string;
  miniAppShortName?: string;
}>;

export type ShareRoomInviteResult =
  | Readonly<{ ok: true; method: 'telegram' | 'clipboard' | 'popup'; deepLink: string }>
  | Readonly<{ ok: false; code: 'MISSING_BOT_USERNAME' | 'COPY_FAILED'; deepLink?: string }>;

const roomTokenPattern = /^[A-Za-z0-9_-]{32,128}$/;
const shareText = 'Заходи в комнату — сыграем в Заманушку.';

function cleanBotUsername(username?: string) {
  const value = username?.trim().replace(/^@/, '');
  return value && /^[A-Za-z0-9_]{5,32}$/.test(value) ? value : null;
}

function cleanShortName(shortName?: string) {
  const value = shortName?.trim();
  return value && /^[A-Za-z0-9_]{1,64}$/.test(value) ? value : null;
}

export function parseRoomStartParam(startParam?: string): string | null {
  if (!startParam?.startsWith('room_')) return null;
  const token = startParam.slice('room_'.length);
  return roomTokenPattern.test(token) ? token : null;
}

export function isMalformedRoomStartParam(startParam?: string): boolean {
  return Boolean(startParam?.startsWith('room_') && !parseRoomStartParam(startParam));
}

export function createRoomDeepLink(token: string, config: TelegramShareConfig) {
  if (!roomTokenPattern.test(token)) throw new Error('Invalid room invite token');
  const botUsername = cleanBotUsername(config.botUsername);
  if (!botUsername) return null;
  const miniAppShortName = cleanShortName(config.miniAppShortName);
  const appPath = miniAppShortName ? `/${miniAppShortName}` : '';
  return `https://t.me/${botUsername}${appPath}?startapp=room_${encodeURIComponent(token)}`;
}

export function createTelegramShareUrl(deepLink: string) {
  const url = new URL('https://t.me/share/url');
  url.searchParams.set('url', deepLink);
  url.searchParams.set('text', shareText);
  return url.toString();
}

export async function shareRoomInvite(input: {
  token: string;
  config: TelegramShareConfig;
  openTelegramLink?: (url: string) => boolean;
  clipboard?: Pick<Clipboard, 'writeText'>;
  openPopup?: (url: string) => Window | null;
}): Promise<ShareRoomInviteResult> {
  const deepLink = createRoomDeepLink(input.token, input.config);
  if (!deepLink) return { ok: false, code: 'MISSING_BOT_USERNAME' };

  const shareUrl = createTelegramShareUrl(deepLink);
  if (input.openTelegramLink?.(shareUrl)) return { ok: true, method: 'telegram', deepLink };

  try {
    if (input.clipboard) {
      await input.clipboard.writeText(deepLink);
      return { ok: true, method: 'clipboard', deepLink };
    }
  } catch {
    // Fall through to popup before reporting a copy failure.
  }

  if (input.openPopup?.(shareUrl)) return { ok: true, method: 'popup', deepLink };
  return { ok: false, code: 'COPY_FAILED', deepLink };
}

export const defaultTelegramShareConfig: TelegramShareConfig = {
  botUsername: import.meta.env.VITE_TELEGRAM_BOT_USERNAME,
  miniAppShortName: import.meta.env.VITE_TELEGRAM_MINI_APP_SHORT_NAME,
};
