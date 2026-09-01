import { afterEach, describe, expect, it, vi } from 'vitest';

import { PremiumAnimationBridge } from './PremiumAnimationBridge.js';

describe('PremiumAnimationBridge audio timing', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays normal move sound only at final destination contact', async () => {
    vi.useFakeTimers();
    const audio = { play: vi.fn() };
    const bridge = new PremiumAnimationBridge(
      { throwCommitted: vi.fn(), snapToValue: vi.fn() },
      { reveal: vi.fn(), clear: vi.fn() },
      audio as never,
    );

    const run = bridge.pawnMoved(
      {
        pawnId: 'pawn-1',
        path: [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
          { row: 0, col: 2 },
          { row: 0, col: 3 },
          { row: 0, col: 4 },
        ],
        capture: false,
      },
      new AbortController().signal,
    );

    await vi.advanceTimersByTimeAsync(489);
    expect(audio.play).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await run;
    expect(audio.play).toHaveBeenCalledWith('place', { playbackRate: 1.01 });
  });

  it('suppresses normal move sound on capture approach and does not play stale sound after cancellation', async () => {
    vi.useFakeTimers();
    const audio = { play: vi.fn() };
    const bridge = new PremiumAnimationBridge(
      { throwCommitted: vi.fn(), snapToValue: vi.fn() },
      { reveal: vi.fn(), clear: vi.fn() },
      audio as never,
    );
    const abort = new AbortController();

    const run = bridge.pawnMoved(
      {
        pawnId: 'pawn-1',
        path: [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
          { row: 0, col: 2 },
          { row: 0, col: 3 },
          { row: 0, col: 4 },
        ],
        capture: true,
      },
      abort.signal,
    );

    abort.abort();
    await vi.runAllTimersAsync();
    await run;

    expect(audio.play).not.toHaveBeenCalled();
  });

  it('plays capture sound immediately on collision phase', async () => {
    vi.useFakeTimers();
    const audio = { play: vi.fn() };
    const bridge = new PremiumAnimationBridge(
      { throwCommitted: vi.fn(), snapToValue: vi.fn() },
      { reveal: vi.fn(), clear: vi.fn() },
      audio as never,
    );

    const run = bridge.pawnCaptured(
      {
        attackerPawnId: 'green-1',
        victimPawnId: 'blue-1',
        destination: { row: 0, col: 3 },
      },
      new AbortController().signal,
    );

    expect(audio.play).toHaveBeenCalledWith('capture', { playbackRate: 0.99 });
    await vi.runAllTimersAsync();
    await run;
  });
});
