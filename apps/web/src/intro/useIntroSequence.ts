import { useCallback, useEffect, useRef, useState } from 'react';
import { INTRO_DURATION_MS } from './introSequenceConfig';

interface UseIntroSequenceOptions {
  onComplete: () => void;
  reducedMotion?: boolean;
}

export function useIntroSequence({ onComplete, reducedMotion = false }: UseIntroSequenceOptions) {
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const completedRef = useRef(false);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setProgress(1);
    onComplete();
  }, [onComplete]);

  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);

    if (reducedMotion) {
      setProgress(1);
      timeoutRef.current = window.setTimeout(finish, 220);
      return;
    }

    const startedAt = performance.now();
    const tick = (now: number) => {
      const next = Math.min(1, (now - startedAt) / INTRO_DURATION_MS);
      setProgress(next);
      if (next < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        finish();
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [finish, reducedMotion]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  return { progress, started, start };
}
