export const PREMIUM_MOTION = Object.freeze({
  moveCellMs: 155,
  moveCellFastMs: 112,
  pawnEnterMs: 390,
  captureImpactMs: 105,
  captureExitMs: 320,
  homeCueMs: 220,
  homePulseMs: 125,
  removedMs: 285,
  removedStaggerMs: 72,
  diceMs: 620,
  victoryRevealMs: 480,
  turnHandoffMs: 240,
  liftPx: 8,
  captureLiftPx: 18,
});

export const PREMIUM_EASING = Object.freeze({
  travel: 'cubic-bezier(.22,.72,.22,1)',
  settle: 'cubic-bezier(.16,1,.3,1)',
  impact: 'cubic-bezier(.2,.9,.28,1.25)',
  exit: 'cubic-bezier(.4,0,.75,.28)',
  soft: 'cubic-bezier(.22,.61,.36,1)',
});

export type MotionProfile = 'full' | 'reduced';

export function getMotionProfile(): MotionProfile {
  if (typeof window === 'undefined') return 'full';
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
}
