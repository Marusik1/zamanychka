export type TelegramEvent = 'viewportChanged' | 'safeAreaChanged' | 'contentSafeAreaChanged';

export interface TelegramInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TelegramWebApp {
  initData: string;
  viewportStableHeight?: number;
  safeAreaInset?: TelegramInsets;
  contentSafeAreaInset?: TelegramInsets;
  ready(): void;
  onEvent?(event: TelegramEvent, listener: () => void): void;
  offEvent?(event: TelegramEvent, listener: () => void): void;
}

export interface TelegramGlobal {
  WebApp?: TelegramWebApp;
}
