import { clamp01 } from './easing.js';

function abortError() {
  return new DOMException('Animation aborted', 'AbortError');
}

export async function tween(
  durationMs: number,
  update: (t: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw abortError();

  await new Promise<void>((resolve, reject) => {
    const startedAt = performance.now();
    let frame = 0;

    const abort = () => {
      cancelAnimationFrame(frame);
      reject(abortError());
    };

    signal?.addEventListener('abort', abort, { once: true });

    const tick = (now: number) => {
      if (signal?.aborted) {
        abort();
        return;
      }

      const t = clamp01((now - startedAt) / Math.max(1, durationMs));
      update(t);
      if (t >= 1) {
        signal?.removeEventListener('abort', abort);
        resolve();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
  });
}

export async function wait(durationMs: number, signal?: AbortSignal): Promise<void> {
  await tween(durationMs, () => undefined, signal);
}
