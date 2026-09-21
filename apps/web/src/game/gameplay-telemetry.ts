export type GameplayTelemetryEvent = Readonly<{
  event: string;
  at: string;
  clientNowMs?: number;
  [key: string]: unknown;
}>;

declare global {
  interface Window {
    __zGameplayTelemetry?: GameplayTelemetryEvent[];
  }
}

export function gameplayTelemetryEnabled() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('zamanushka:gameplayTelemetry') === 'true';
}

export function recordGameplayTelemetry(event: string, payload: Record<string, unknown> = {}) {
  if (!gameplayTelemetryEnabled()) return;
  const entry: GameplayTelemetryEvent = {
    event,
    at: new Date().toISOString(),
    clientNowMs: Math.round(performance.now() * 100) / 100,
    ...payload,
  };
  window.__zGameplayTelemetry = [...(window.__zGameplayTelemetry ?? []), entry].slice(-800);
  console.info('[gameplay-presentation]', entry);
}

export function latestGameplayTelemetryEvent(predicate: (event: GameplayTelemetryEvent) => boolean) {
  if (typeof window === 'undefined') return null;
  return [...(window.__zGameplayTelemetry ?? [])].reverse().find(predicate) ?? null;
}
