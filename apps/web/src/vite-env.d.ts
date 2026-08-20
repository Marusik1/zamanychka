/// <reference types="vite/client" />

import type { TelegramGlobal } from './telegram/types';

declare global {
  interface Window {
    Telegram?: TelegramGlobal;
  }
}
