import type { TelegramEvent, TelegramInsets, TelegramWebApp } from './types';

const zeroInsets: TelegramInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function pixels(value: number | undefined): string {
  return `${value !== undefined && Number.isFinite(value) ? Math.max(0, value) : 0}px`;
}

function setInsets(style: CSSStyleDeclaration, prefix: string, insets?: TelegramInsets) {
  const values = insets ?? zeroInsets;
  style.setProperty(`${prefix}-top`, pixels(values.top));
  style.setProperty(`${prefix}-right`, pixels(values.right));
  style.setProperty(`${prefix}-bottom`, pixels(values.bottom));
  style.setProperty(`${prefix}-left`, pixels(values.left));
}

function projectLayout(webApp: TelegramWebApp | undefined, root: HTMLElement) {
  const style = root.style;
  style.setProperty(
    '--app-viewport-height',
    webApp?.viewportStableHeight === undefined || !Number.isFinite(webApp.viewportStableHeight)
      ? '100dvh'
      : pixels(webApp.viewportStableHeight),
  );
  setInsets(style, '--app-safe-area', webApp?.safeAreaInset);
  setInsets(style, '--app-content-safe-area', webApp?.contentSafeAreaInset);
}

export interface TelegramAdapter {
  readonly isAvailable: boolean;
  readonly isTelegram: boolean;
  readonly initData: string | undefined;
  shellReady(): void;
  dispose(): void;
}

export function createTelegramAdapter(root = document.documentElement): TelegramAdapter {
  const webApp = window.Telegram?.WebApp;
  const initData = webApp?.initData || undefined;
  const onEvent = webApp?.onEvent?.bind(webApp);
  const offEvent = webApp?.offEvent?.bind(webApp);
  const supportsEvents = onEvent !== undefined && offEvent !== undefined;
  let didSignalReady = false;
  let disposed = false;

  projectLayout(webApp, root);

  const listeners: [TelegramEvent, () => void][] = [
    ['viewportChanged', () => projectLayout(webApp, root)],
    ['safeAreaChanged', () => projectLayout(webApp, root)],
    ['contentSafeAreaChanged', () => projectLayout(webApp, root)],
  ];

  if (supportsEvents) {
    for (const [event, listener] of listeners) onEvent(event, listener);
  }

  return {
    isAvailable: webApp !== undefined,
    isTelegram: initData !== undefined,
    initData,
    shellReady() {
      if (webApp && !didSignalReady && !disposed) {
        didSignalReady = true;
        webApp.expand?.();
        webApp.ready();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (supportsEvents) {
        for (const [event, listener] of listeners) offEvent(event, listener);
      }
    },
  };
}
