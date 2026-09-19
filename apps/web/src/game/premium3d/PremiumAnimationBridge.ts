import type { PremiumDice3DHandle } from './PremiumDice3D.js';
import type { PremiumVictoryOverlayHandle } from './PremiumVictoryOverlay.js';
import {
  ANIMATION_TIMINGS,
  isPerimeterCorner,
  movementDurationMs,
} from '../animation-director.js';
import { PremiumGameAudio } from './audio.js';
import type {
  PremiumCaptureAnimation,
  PremiumEnterAnimation,
  PremiumHomeCompletionAnimation,
  PremiumMoveAnimation,
  PremiumVictoryAnimation,
} from './types.js';

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!ms || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

export class PremiumAnimationBridge {
  constructor(
    private readonly dice: PremiumDice3DHandle,
    private readonly victory: PremiumVictoryOverlayHandle,
    private readonly audio = new PremiumGameAudio(),
  ) {}

  private soundRate(name: 'pawn-step' | 'pawn-capture'): number {
    if (name === 'pawn-capture') return 0.99;
    return 1.01;
  }

  unlockAudio() {
    this.audio.unlock();
  }

  async diceRolled(value: 1 | 2 | 3 | 4 | 5 | 6, signal?: AbortSignal) {
    this.audio.play('dice-roll');
    await this.dice.throwCommitted(value, signal);
  }

  async pawnEntered(animation: PremiumEnterAnimation, signal?: AbortSignal) {
    void animation;
    await sleep(ANIMATION_TIMINGS.frameCommitMs + ANIMATION_TIMINGS.enterMs, signal);
    if (signal?.aborted) return;
    this.audio.play('pawn-enter');
  }

  async pawnMoved(animation: PremiumMoveAnimation, signal?: AbortSignal) {
    const steps = Math.max(0, animation.path.length - 1);
    const cadence = steps ? movementDurationMs(steps) / steps : 0;
    for (let index = 0; index < steps; index += 1) {
      await sleep(cadence, signal);
      if (signal?.aborted || (animation.capture && index === steps - 1)) return;
      this.audio.play('pawn-step', { playbackRate: this.soundRate('pawn-step') });
      const landedCoord = animation.path[index + 1];
      if (landedCoord && isPerimeterCorner(landedCoord) && index < steps - 1) {
        await sleep(ANIMATION_TIMINGS.cornerSettleMs, signal);
      }
    }
  }

  async pawnCaptured(animation: PremiumCaptureAnimation, signal?: AbortSignal) {
    void animation;
    if (signal?.aborted) return;
    await sleep(ANIMATION_TIMINGS.frameCommitMs, signal);
    if (signal?.aborted) return;
    this.audio.play('pawn-capture', { playbackRate: this.soundRate('pawn-capture') });
    await sleep(ANIMATION_TIMINGS.captureImpactMs + ANIMATION_TIMINGS.captureExitMs, signal);
  }

  async pawnEnteredHome(pawnId: string, signal?: AbortSignal) {
    void pawnId;
    if (signal?.aborted) return;
    this.audio.play('pawn-home');
    await sleep(ANIMATION_TIMINGS.homeCueMs, signal);
  }

  async homeCompleted(animation: PremiumHomeCompletionAnimation, signal?: AbortSignal) {
    void animation;
    void signal;
  }

  async playerSurrendered(pawnIds: readonly string[], signal?: AbortSignal) {
    void pawnIds;
    void signal;
  }

  async gameWon(animation: PremiumVictoryAnimation & { isLocalWinner?: boolean }, signal?: AbortSignal) {
    await sleep(ANIMATION_TIMINGS.resultDelayMs, signal);
    if (signal?.aborted) return;
    this.audio.play(animation.isLocalWinner === false ? 'defeat' : 'victory');
    await this.victory.reveal(animation, signal);
  }

  snapToAuthoritativeState() {
    this.victory.clear();
  }
}
