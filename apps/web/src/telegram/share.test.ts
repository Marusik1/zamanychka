import { describe, expect, it, vi } from 'vitest';

import {
  createRoomDeepLink,
  createTelegramShareUrl,
  isMalformedRoomStartParam,
  parseRoomStartParam,
  shareRoomInvite,
} from './share.js';

const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHJKLMNPQR0123456789_-';

describe('Telegram room share helpers', () => {
  it('parses only strict room start params', () => {
    expect(parseRoomStartParam(`room_${token}`)).toBe(token);
    expect(parseRoomStartParam('room_')).toBeNull();
    expect(parseRoomStartParam('room_bad spaces')).toBeNull();
    expect(parseRoomStartParam('profile_abc')).toBeNull();
    expect(isMalformedRoomStartParam('room_bad spaces')).toBe(true);
    expect(isMalformedRoomStartParam('profile_abc')).toBe(false);
  });

  it('builds main and named Mini App links without double encoding', () => {
    expect(createRoomDeepLink(token, { botUsername: '@ZamanushkaBot' })).toBe(
      `https://t.me/ZamanushkaBot?startapp=room_${token}`,
    );
    expect(
      createRoomDeepLink(token, {
        botUsername: 'ZamanushkaBot',
        miniAppShortName: 'play',
      }),
    ).toBe(`https://t.me/ZamanushkaBot/play?startapp=room_${token}`);
    expect(createRoomDeepLink(token, { botUsername: '' })).toBeNull();
  });

  it('encodes Telegram share URL safely', () => {
    const deepLink = createRoomDeepLink(token, { botUsername: 'ZamanushkaBot' });
    expect(deepLink).not.toBeNull();

    const shareUrl = createTelegramShareUrl(deepLink!);
    const parsed = new URL(shareUrl);

    expect(parsed.origin).toBe('https://t.me');
    expect(parsed.pathname).toBe('/share/url');
    expect(parsed.searchParams.get('url')).toBe(deepLink);
    expect(parsed.searchParams.get('text')).toContain('Заманушку');
    expect(shareUrl).not.toContain(' ');
    expect(shareUrl).not.toContain('initData');
  });

  it('prefers Telegram native share and falls back to clipboard', async () => {
    const openTelegramLink = vi.fn((url: string) => {
      void url;
      return true;
    });
    await expect(
      shareRoomInvite({
        token,
        config: { botUsername: 'ZamanushkaBot' },
        openTelegramLink,
      }),
    ).resolves.toMatchObject({ ok: true, method: 'telegram' });
    expect(openTelegramLink.mock.calls[0]?.[0]).toContain('https://t.me/share/url');

    const clipboard = { writeText: vi.fn(async () => undefined) };
    await expect(
      shareRoomInvite({
        token,
        config: { botUsername: 'ZamanushkaBot' },
        openTelegramLink: () => false,
        clipboard,
      }),
    ).resolves.toMatchObject({ ok: true, method: 'clipboard' });
    expect(clipboard.writeText).toHaveBeenCalledWith(
      `https://t.me/ZamanushkaBot?startapp=room_${token}`,
    );
  });
});
