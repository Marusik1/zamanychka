import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PremiumGameAudio } from './audio.js';

class FakeAudio {
  static instances: FakeAudio[] = [];

  preload = '';
  volume = 1;
  playbackRate = 1;
  currentTime = 0;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();

  constructor(readonly source: string) {
    FakeAudio.instances.push(this);
  }
}

describe('PremiumGameAudio', () => {
  const originalAudio = globalThis.Audio;

  beforeEach(() => {
    FakeAudio.instances = [];
    vi.stubGlobal('Audio', FakeAudio);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalAudio) {
      vi.stubGlobal('Audio', originalAudio);
    }
  });

  it('does not restart the same sound effect twice in the same presentation tick', () => {
    const audio = new PremiumGameAudio();

    audio.play('pawn-enter');
    audio.play('pawn-enter');

    const pawnEnter = FakeAudio.instances.find((candidate) =>
      candidate.source.includes('pawn-enter.mp3'),
    );
    expect(pawnEnter?.play).toHaveBeenCalledTimes(1);
  });
});
