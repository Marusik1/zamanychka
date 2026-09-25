import { afterEach, describe, expect, it, vi } from 'vitest';

import { PremiumAnimationBridge } from './PremiumAnimationBridge.js';

describe('PremiumAnimationBridge audio timing', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays one restrained step sound for each physical movement cell', async () => {
    vi.useFakeTimers();
    const audio = { play: vi.fn() };
    const bridge = new PremiumAnimationBridge(
      { beginRoll: vi.fn(), throwCommitted: vi.fn(), snapToValue: vi.fn() },
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

    await vi.runAllTimersAsync();
    await run;
    expect(audio.play).toHaveBeenCalledTimes(4);
    expect(audio.play).toHaveBeenCalledWith('pawn-step', { playbackRate: 1.01 });
  });

  it('suppresses normal move sound on capture approach and does not play stale sound after cancellation', async () => {
    vi.useFakeTimers();
    const audio = { play: vi.fn() };
    const bridge = new PremiumAnimationBridge(
      { beginRoll: vi.fn(), throwCommitted: vi.fn(), snapToValue: vi.fn() },
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

  it('plays capture sound at the committed impact frame rather than before it', async () => {
    vi.useFakeTimers();
    const audio = { play: vi.fn() };
    const bridge = new PremiumAnimationBridge(
      { beginRoll: vi.fn(), throwCommitted: vi.fn(), snapToValue: vi.fn() },
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

    expect(audio.play).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(16);
    expect(audio.play).toHaveBeenCalledWith('pawn-capture', { playbackRate: 0.99 });
    await vi.runAllTimersAsync();
    await run;
  });

  it('maps dice, enter, and first home entry to their semantic clips', async () => {
    vi.useFakeTimers();
    const audio = { play: vi.fn() };
    const bridge = new PremiumAnimationBridge(
      { beginRoll: vi.fn(), throwCommitted: vi.fn(), snapToValue: vi.fn() },
      { reveal: vi.fn(), clear: vi.fn() },
      audio as never,
    );
    await bridge.diceRolled(6);
    const enter = bridge.pawnEntered({ pawnId: 'pawn-1', destination: { row: 0, col: 0 } });
    expect(audio.play).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    await enter;
    const home = bridge.pawnEnteredHome('pawn-1');
    await vi.runAllTimersAsync();
    await home;
    expect(audio.play).toHaveBeenNthCalledWith(1, 'dice-roll');
    expect(audio.play).toHaveBeenNthCalledWith(2, 'pawn-enter');
    expect(audio.play).toHaveBeenNthCalledWith(3, 'pawn-home');
  });

  it('uses victory for the local winner and defeat for another winner', async () => {
    vi.useFakeTimers();
    const audio = { play: vi.fn() };
    const bridge = new PremiumAnimationBridge(
      { beginRoll: vi.fn(), throwCommitted: vi.fn(), snapToValue: vi.fn() },
      { reveal: vi.fn(), clear: vi.fn() },
      audio as never,
    );
    const animation = { winnerName: 'Алексей', winnerColor: 'GREEN' as const, reason: 'LAST_ACTIVE_PLAYER' as const };
    const win = bridge.gameWon({ ...animation, isLocalWinner: true });
    expect(audio.play).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    await win;
    const defeat = bridge.gameWon({ ...animation, isLocalWinner: false });
    await vi.runAllTimersAsync();
    await defeat;
    expect(audio.play).toHaveBeenNthCalledWith(1, 'victory');
    expect(audio.play).toHaveBeenNthCalledWith(2, 'defeat');
  });
});
