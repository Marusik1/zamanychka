import type { PremiumDice3DHandle } from './PremiumDice3D.js';
import type { PremiumVictoryOverlayHandle } from './PremiumVictoryOverlay.js';
import { movementDurationMs } from '../animation-director.js';
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

  private soundRate(name: 'place' | 'capture'): number {
    if (name === 'capture') return 0.99;
    return 1.01;
  }

  async diceRolled(value: 1 | 2 | 3 | 4 | 5 | 6, signal?: AbortSignal) {
    this.audio.play('dice');
    await this.dice.throwCommitted(value, signal);
  }

  async pawnEntered(animation: PremiumEnterAnimation, signal?: AbortSignal) {
    void animation;
    void signal;
    this.audio.play('place');
  }

  async pawnMoved(animation: PremiumMoveAnimation, signal?: AbortSignal) {
    const travelMs = movementDurationMs(Math.max(0, animation.path.length - 1));
    await sleep(travelMs, signal);
    if (signal?.aborted || animation.capture) return;
    this.audio.play('place', { playbackRate: this.soundRate('place') });
  }

  async pawnCaptured(animation: PremiumCaptureAnimation, signal?: AbortSignal) {
    void animation;
    if (signal?.aborted) return;
    this.audio.play('capture', { playbackRate: this.soundRate('capture') });
    await sleep(280, signal);
  }

  async pawnEnteredHome(pawnId: string, signal?: AbortSignal) {
    void pawnId;
    void signal;
  }

  async homeCompleted(animation: PremiumHomeCompletionAnimation, signal?: AbortSignal) {
    void animation;
    void signal;
  }

  async playerSurrendered(pawnIds: readonly string[], signal?: AbortSignal) {
    void pawnIds;
    void signal;
  }

  async gameWon(animation: PremiumVictoryAnimation, signal?: AbortSignal) {
    this.audio.play('victory');
    await this.victory.reveal(animation, signal);
  }

  snapToAuthoritativeState() {
    this.victory.clear();
  }
}
