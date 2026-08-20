import { afterEach, describe, expect, it, vi } from 'vitest';

import indexHtml from '../../index.html?raw';
import { createTelegramAdapter } from './adapter';
import type { TelegramEvent, TelegramWebApp } from './types';

const cssVariables = [
  '--app-viewport-height',
  '--app-safe-area-top',
  '--app-safe-area-right',
  '--app-safe-area-bottom',
  '--app-safe-area-left',
  '--app-content-safe-area-top',
  '--app-content-safe-area-right',
  '--app-content-safe-area-bottom',
  '--app-content-safe-area-left',
] as const;

function fakeWebApp(overrides: Partial<TelegramWebApp> = {}) {
  const listeners = new Map<TelegramEvent, Set<() => void>>();
  const webApp: TelegramWebApp = {
    initData: 'signed-init-data',
    viewportStableHeight: 640,
    safeAreaInset: { top: 1, right: 2, bottom: 3, left: 4 },
    contentSafeAreaInset: { top: 5, right: 6, bottom: 7, left: 8 },
    ready: vi.fn(),
    onEvent: vi.fn((event, listener) => {
      const eventListeners = listeners.get(event) ?? new Set();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
    }),
    offEvent: vi.fn((event, listener) => listeners.get(event)?.delete(listener)),
    ...overrides,
  };

  return {
    emit(event: TelegramEvent) {
      listeners.get(event)?.forEach((listener) => listener());
    },
    webApp,
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected fake bridge method');
  return value;
}

afterEach(() => {
  delete window.Telegram;
  for (const variable of cssVariables) document.documentElement.style.removeProperty(variable);
});

describe('createTelegramAdapter', () => {
  it('loads the approved official Telegram bridge before the application module', () => {
    const bridge = '<script src="https://telegram.org/js/telegram-web-app.js?59"></script>';
    const application = '<script type="module" src="/src/main.tsx"></script>';

    expect(indexHtml).toContain(bridge);
    expect(indexHtml.indexOf(bridge)).toBeLessThan(indexHtml.indexOf(application));
  });

  it('falls back to browser viewport and zero insets when the bridge is absent', () => {
    const adapter = createTelegramAdapter();

    expect(adapter.isAvailable).toBe(false);
    expect(adapter.isTelegram).toBe(false);
    expect(adapter.initData).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue('--app-viewport-height')).toBe('100vh');
    for (const variable of cssVariables.slice(1)) {
      expect(document.documentElement.style.getPropertyValue(variable)).toBe('0px');
    }

    adapter.dispose();
  });

  it('does not identify an empty initData bridge as Telegram authentication', () => {
    const { webApp } = fakeWebApp({ initData: '' });
    window.Telegram = { WebApp: webApp };

    const adapter = createTelegramAdapter();

    expect(adapter.isAvailable).toBe(true);
    expect(adapter.isTelegram).toBe(false);
    expect(adapter.initData).toBeUndefined();
    adapter.dispose();
  });

  it('exposes only non-empty raw initData from the bridge', () => {
    const { webApp } = fakeWebApp({ initData: 'raw-signed-value' });
    window.Telegram = { WebApp: webApp };

    const adapter = createTelegramAdapter();

    expect(adapter.isAvailable).toBe(true);
    expect(adapter.isTelegram).toBe(true);
    expect(adapter.initData).toBe('raw-signed-value');
    expect(adapter).not.toHaveProperty('initDataUnsafe');
    adapter.dispose();
  });

  it('calls ready exactly once after the shell reports ready', () => {
    const { webApp } = fakeWebApp();
    window.Telegram = { WebApp: webApp };
    const adapter = createTelegramAdapter();

    expect(webApp.ready).not.toHaveBeenCalled();
    adapter.shellReady();
    adapter.shellReady();

    expect(webApp.ready).toHaveBeenCalledTimes(1);
    adapter.dispose();
  });

  it('subscribes to exactly the supported layout events and projects initial values', () => {
    const { webApp } = fakeWebApp();
    window.Telegram = { WebApp: webApp };

    const adapter = createTelegramAdapter();

    expect(webApp.onEvent).toHaveBeenCalledTimes(3);
    expect(vi.mocked(required(webApp.onEvent)).mock.calls.map(([event]) => event)).toEqual([
      'viewportChanged',
      'safeAreaChanged',
      'contentSafeAreaChanged',
    ]);
    expect(document.documentElement.style.getPropertyValue('--app-viewport-height')).toBe('640px');
    expect(document.documentElement.style.getPropertyValue('--app-safe-area-left')).toBe('4px');
    expect(document.documentElement.style.getPropertyValue('--app-content-safe-area-bottom')).toBe(
      '7px',
    );
    adapter.dispose();
  });

  it('updates CSS values when Telegram emits layout events', () => {
    const bridge = fakeWebApp();
    window.Telegram = { WebApp: bridge.webApp };
    const adapter = createTelegramAdapter();

    bridge.webApp.viewportStableHeight = 720;
    bridge.emit('viewportChanged');
    bridge.webApp.safeAreaInset = { top: 11, right: 12, bottom: 13, left: 14 };
    bridge.emit('safeAreaChanged');
    bridge.webApp.contentSafeAreaInset = { top: 15, right: 16, bottom: 17, left: 18 };
    bridge.emit('contentSafeAreaChanged');

    expect(document.documentElement.style.getPropertyValue('--app-viewport-height')).toBe('720px');
    expect(document.documentElement.style.getPropertyValue('--app-safe-area-top')).toBe('11px');
    expect(document.documentElement.style.getPropertyValue('--app-content-safe-area-right')).toBe(
      '16px',
    );
    adapter.dispose();
  });

  it('projects malformed layout values as finite non-negative CSS values', () => {
    const bridge = fakeWebApp({
      viewportStableHeight: Number.NaN,
      safeAreaInset: {
        top: -1,
        right: Number.POSITIVE_INFINITY,
        bottom: Number.NEGATIVE_INFINITY,
        left: Number.NaN,
      },
      contentSafeAreaInset: { top: -10, right: 20, bottom: 30, left: 40 },
    });
    window.Telegram = { WebApp: bridge.webApp };

    const adapter = createTelegramAdapter();

    expect(document.documentElement.style.getPropertyValue('--app-viewport-height')).toBe('100vh');
    expect(document.documentElement.style.getPropertyValue('--app-safe-area-top')).toBe('0px');
    expect(document.documentElement.style.getPropertyValue('--app-safe-area-right')).toBe('0px');
    expect(document.documentElement.style.getPropertyValue('--app-safe-area-bottom')).toBe('0px');
    expect(document.documentElement.style.getPropertyValue('--app-safe-area-left')).toBe('0px');
    expect(document.documentElement.style.getPropertyValue('--app-content-safe-area-top')).toBe(
      '0px',
    );
    expect(document.documentElement.style.getPropertyValue('--app-content-safe-area-right')).toBe(
      '20px',
    );

    bridge.webApp.viewportStableHeight = Number.POSITIVE_INFINITY;
    bridge.emit('viewportChanged');
    expect(document.documentElement.style.getPropertyValue('--app-viewport-height')).toBe('100vh');

    bridge.webApp.viewportStableHeight = Number.NEGATIVE_INFINITY;
    bridge.emit('viewportChanged');
    expect(document.documentElement.style.getPropertyValue('--app-viewport-height')).toBe('100vh');

    bridge.webApp.viewportStableHeight = -100;
    bridge.emit('viewportChanged');
    expect(document.documentElement.style.getPropertyValue('--app-viewport-height')).toBe('0px');
    adapter.dispose();
  });

  it('cleans up every subscription once and remains safe to dispose repeatedly', () => {
    const { webApp } = fakeWebApp();
    window.Telegram = { WebApp: webApp };
    const adapter = createTelegramAdapter();

    adapter.dispose();
    adapter.dispose();

    expect(webApp.offEvent).toHaveBeenCalledTimes(3);
    expect(vi.mocked(required(webApp.offEvent)).mock.calls.map(([event]) => event)).toEqual([
      'viewportChanged',
      'safeAreaChanged',
      'contentSafeAreaChanged',
    ]);
  });

  it('does not call ready when shell readiness is reported after disposal', () => {
    const { webApp } = fakeWebApp();
    window.Telegram = { WebApp: webApp };
    const adapter = createTelegramAdapter();

    adapter.dispose();
    adapter.shellReady();

    expect(webApp.ready).not.toHaveBeenCalled();
  });

  it('works with older bridges that do not support lifecycle subscriptions', () => {
    const { webApp } = fakeWebApp();
    delete webApp.onEvent;
    delete webApp.offEvent;
    window.Telegram = { WebApp: webApp };

    const adapter = createTelegramAdapter();
    expect(() => adapter.dispose()).not.toThrow();
  });

  it('does not subscribe when the bridge cannot unsubscribe', () => {
    const { webApp } = fakeWebApp();
    const onEvent = required(webApp.onEvent);
    delete webApp.offEvent;
    window.Telegram = { WebApp: webApp };

    const adapter = createTelegramAdapter();

    expect(onEvent).not.toHaveBeenCalled();
    expect(() => adapter.dispose()).not.toThrow();
  });
});
