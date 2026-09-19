import { INTRO_PHASES, type IntroFrameName } from './introSequenceConfig';

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const smoothstep = (from: number, to: number, value: number) => {
  const t = clamp01((value - from) / Math.max(0.0001, to - from));
  return t * t * (3 - 2 * t);
};

export type IntroPhase = 'idle' | 'press' | 'approach' | 'impact' | 'result';

export function phaseAt(progress: number, started: boolean): IntroPhase {
  if (!started) return 'idle';
  const p = clamp01(progress);
  if (p < INTRO_PHASES.pressEnd) return 'press';
  if (p < INTRO_PHASES.approachEnd) return 'approach';
  if (p < INTRO_PHASES.impactEnd) return 'impact';
  return 'result';
}

/**
 * Returns one dominant authored keyframe at a time.
 * Human review rejected long full-frame crossfades because they created
 * duplicate semi-transparent pawns. The sequence now uses quick cuts between
 * authored frames while the fullscreen poster fade supplies the initial blend.
 */
export function frameWeights(progress: number, started: boolean): Record<IntroFrameName, number> {
  if (!started) {
    return { idle: 1, approach: 0, impact: 0, result: 0 };
  }

  const p = clamp01(progress);
  if (p < 0.15) return { idle: 1, approach: 0, impact: 0, result: 0 };
  if (p < 0.56) return { idle: 0, approach: 1, impact: 0, result: 0 };
  if (p < 0.76) return { idle: 0, approach: 0, impact: 1, result: 0 };
  return { idle: 0, approach: 0, impact: 0, result: 1 };
}

export function uiOpacity(progress: number, started: boolean) {
  if (!started) return 1;
  return 1 - smoothstep(0.00, 0.16, clamp01(progress));
}

export function sceneScale(progress: number, started: boolean) {
  if (!started) return 1;
  const p = clamp01(progress);
  return 1 + 0.01 * smoothstep(0.18, 0.88, p);
}

export function sceneTranslateY(progress: number, started: boolean) {
  if (!started) return 0;
  return -2 * smoothstep(0.18, 0.90, clamp01(progress));
}
