export class MotionCancelledError extends Error {
  constructor() {
    super('Motion cancelled');
    this.name = 'MotionCancelledError';
  }
}

export async function playAnimation(
  element: Element,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options: KeyframeAnimationOptions,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw new MotionCancelledError();
  const animation = element.animate(keyframes, options);
  const abort = () => animation.cancel();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    await animation.finished;
  } catch {
    if (signal?.aborted || animation.playState === 'idle') throw new MotionCancelledError();
    throw new Error('Animation failed');
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new MotionCancelledError();
  await new Promise<void>((resolve, reject) => {
    const id = window.setTimeout(resolve, ms);
    const abort = () => {
      window.clearTimeout(id);
      reject(new MotionCancelledError());
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export function cancelElementAnimations(element: Element | null | undefined) {
  element?.getAnimations().forEach((animation) => animation.cancel());
}
