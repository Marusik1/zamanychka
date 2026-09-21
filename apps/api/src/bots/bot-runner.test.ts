import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BotRunner } from './bot-runner.js';
import type { BotRuntimeAdapter, MatchLease } from './types.js';

describe('BotRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('retries a busy match lease instead of losing the bot turn wakeup', async () => {
    const runtime: BotRuntimeAdapter = {
      readTurn: vi.fn(async () => ({
        matchId: 'match-1',
        status: 'ACTIVE',
        stateVersion: 7,
        phase: 'WAITING_FOR_ROLL',
        activeParticipantId: 'bot-1',
        activeParticipantKind: 'BOT',
        legalActions: [{ type: 'ROLL_DICE' as const }],
      })),
      submitCommand: vi.fn(async () => ({
        ok: true,
        matchId: 'match-1',
        stateVersion: 8,
      })),
    };
    let attempts = 0;
    const lease: MatchLease = {
      runExclusive: vi.fn(async (_matchId, fn) => {
        attempts += 1;
        if (attempts === 1) return undefined;
        return fn();
      }),
    };

    const runner = new BotRunner(runtime, lease, {
      minDelayMs: 1,
      maxDelayMs: 1,
      random: () => 0,
    });

    runner.kick('match-1');
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(1);

    expect(lease.runExclusive).toHaveBeenCalledTimes(2);
    expect(runtime.submitCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ROLL_DICE',
        matchId: 'match-1',
        expectedStateVersion: 7,
      }),
    );
  });

  it('schedules delayed recovery when the lease stays busy beyond the immediate retry window', async () => {
    const runtime: BotRuntimeAdapter = {
      readTurn: vi.fn(async () => ({
        matchId: 'match-1',
        status: 'ACTIVE',
        stateVersion: 7,
        phase: 'WAITING_FOR_ROLL',
        activeParticipantId: 'bot-1',
        activeParticipantKind: 'BOT',
        legalActions: [{ type: 'ROLL_DICE' as const }],
      })),
      submitCommand: vi.fn(async () => ({
        ok: true,
        matchId: 'match-1',
        stateVersion: 8,
      })),
    };
    let attempts = 0;
    const lease: MatchLease = {
      runExclusive: vi.fn(async (_matchId, fn) => {
        attempts += 1;
        if (attempts <= 4) return undefined;
        return fn();
      }),
    };

    const runner = new BotRunner(runtime, lease, {
      minDelayMs: 1,
      maxDelayMs: 1,
      random: () => 0,
      leaseRetryDelayMs: 10,
      maxLeaseRetryAttempts: 3,
      recoveryDelayMs: 100,
    });

    runner.kick('match-1');
    await vi.advanceTimersByTimeAsync(30);
    expect(runtime.submitCommand).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(1);

    expect(lease.runExclusive).toHaveBeenCalledTimes(5);
    expect(runtime.submitCommand).toHaveBeenCalledTimes(1);
  });

  it('watchdog wakes a bot turn that stays active on the same state version', async () => {
    const runtime: BotRuntimeAdapter = {
      readTurn: vi
        .fn()
        .mockResolvedValueOnce({
          matchId: 'match-1',
          status: 'ACTIVE',
          stateVersion: 7,
          phase: 'WAITING_FOR_ROLL',
          activeParticipantId: 'bot-1',
          activeParticipantKind: 'BOT',
          legalActions: [{ type: 'ROLL_DICE' as const }],
        })
        .mockResolvedValue({
          matchId: 'match-1',
          status: 'ACTIVE',
          stateVersion: 7,
          phase: 'WAITING_FOR_ROLL',
          activeParticipantId: 'bot-1',
          activeParticipantKind: 'BOT',
          legalActions: [{ type: 'ROLL_DICE' as const }],
        }),
      submitCommand: vi.fn(async () => ({
        ok: true,
        matchId: 'match-1',
        stateVersion: 8,
      })),
    };
    let attempts = 0;
    const lease: MatchLease = {
      runExclusive: vi.fn(async (_matchId, fn) => {
        attempts += 1;
        if (attempts === 1) return undefined;
        return fn();
      }),
    };

    const runner = new BotRunner(runtime, lease, {
      minDelayMs: 1,
      maxDelayMs: 1,
      random: () => 0,
      maxLeaseRetryAttempts: 0,
      watchdogDelayMs: 3_000,
      recoveryDelayMs: 30_000,
    });

    runner.kick('match-1');
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(1);

    expect(lease.runExclusive).toHaveBeenCalledTimes(2);
    expect(runtime.submitCommand).toHaveBeenCalledTimes(1);
  });

  it('does not schedule duplicate watchdog wakeups for the same stalled bot turn', async () => {
    let botCommandApplied = false;
    const runtime: BotRuntimeAdapter = {
      readTurn: vi.fn(async () =>
        botCommandApplied
          ? {
              matchId: 'match-1',
              status: 'ACTIVE',
              stateVersion: 8,
              phase: 'WAITING_FOR_ROLL',
              activeParticipantId: 'human-1',
              activeParticipantKind: 'HUMAN',
              legalActions: [{ type: 'ROLL_DICE' as const }],
            }
          : {
              matchId: 'match-1',
              status: 'ACTIVE',
              stateVersion: 7,
              phase: 'WAITING_FOR_ROLL',
              activeParticipantId: 'bot-1',
              activeParticipantKind: 'BOT',
              legalActions: [{ type: 'ROLL_DICE' as const }],
            },
      ),
      submitCommand: vi.fn(async () => {
        botCommandApplied = true;
        return {
          ok: true,
          matchId: 'match-1',
          stateVersion: 8,
        };
      }),
    };
    let attempts = 0;
    const lease: MatchLease = {
      runExclusive: vi.fn(async (_matchId, fn) => {
        attempts += 1;
        if (attempts <= 3) return undefined;
        return fn();
      }),
    };

    const runner = new BotRunner(runtime, lease, {
      minDelayMs: 1,
      maxDelayMs: 1,
      random: () => 0,
      maxLeaseRetryAttempts: 2,
      leaseRetryDelayMs: 10,
      watchdogDelayMs: 3_000,
      recoveryDelayMs: 30_000,
    });

    runner.kick('match-1');
    await vi.advanceTimersByTimeAsync(20);
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(1);

    expect(runtime.submitCommand).toHaveBeenCalledTimes(1);
  });

  it('watchdog does nothing when the bot state version has already progressed', async () => {
    const runtime: BotRuntimeAdapter = {
      readTurn: vi
        .fn()
        .mockResolvedValueOnce({
          matchId: 'match-1',
          status: 'ACTIVE',
          stateVersion: 7,
          phase: 'WAITING_FOR_ROLL',
          activeParticipantId: 'bot-1',
          activeParticipantKind: 'BOT',
          legalActions: [{ type: 'ROLL_DICE' as const }],
        })
        .mockResolvedValue({
          matchId: 'match-1',
          status: 'ACTIVE',
          stateVersion: 8,
          phase: 'WAITING_FOR_ROLL',
          activeParticipantId: 'bot-1',
          activeParticipantKind: 'BOT',
          legalActions: [{ type: 'ROLL_DICE' as const }],
        }),
      submitCommand: vi.fn(async () => ({
        ok: true,
        matchId: 'match-1',
        stateVersion: 9,
      })),
    };
    const lease: MatchLease = {
      runExclusive: vi.fn(async () => undefined),
    };

    const runner = new BotRunner(runtime, lease, {
      minDelayMs: 1,
      maxDelayMs: 1,
      random: () => 0,
      maxLeaseRetryAttempts: 0,
      watchdogDelayMs: 3_000,
      recoveryDelayMs: 30_000,
    });

    runner.kick('match-1');
    await vi.advanceTimersByTimeAsync(3_000);

    expect(lease.runExclusive).toHaveBeenCalledTimes(1);
    expect(runtime.submitCommand).not.toHaveBeenCalled();
  });

  it('watchdog does nothing when the match has finished before recovery', async () => {
    const runtime: BotRuntimeAdapter = {
      readTurn: vi
        .fn()
        .mockResolvedValueOnce({
          matchId: 'match-1',
          status: 'ACTIVE',
          stateVersion: 7,
          phase: 'WAITING_FOR_ROLL',
          activeParticipantId: 'bot-1',
          activeParticipantKind: 'BOT',
          legalActions: [{ type: 'ROLL_DICE' as const }],
        })
        .mockResolvedValue({
          matchId: 'match-1',
          status: 'FINISHED',
          stateVersion: 8,
          phase: 'FINISHED',
          activeParticipantId: null,
          activeParticipantKind: null,
          legalActions: [],
        }),
      submitCommand: vi.fn(async () => ({
        ok: true,
        matchId: 'match-1',
        stateVersion: 9,
      })),
    };
    const lease: MatchLease = {
      runExclusive: vi.fn(async () => undefined),
    };

    const runner = new BotRunner(runtime, lease, {
      minDelayMs: 1,
      maxDelayMs: 1,
      random: () => 0,
      maxLeaseRetryAttempts: 0,
      watchdogDelayMs: 3_000,
      recoveryDelayMs: 30_000,
    });

    runner.kick('match-1');
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(lease.runExclusive).toHaveBeenCalledTimes(1);
    expect(runtime.submitCommand).not.toHaveBeenCalled();
  });

  it('delayed recovery re-reads authoritative state before submitting a command', async () => {
    let attempts = 0;
    const runtime: BotRuntimeAdapter = {
      readTurn: vi.fn(async () => ({
        matchId: 'match-1',
        status: 'ACTIVE',
        stateVersion: 8,
        phase: 'WAITING_FOR_ROLL',
        activeParticipantId: 'bot-1',
        activeParticipantKind: 'BOT',
        legalActions: [{ type: 'ROLL_DICE' as const }],
      })),
      submitCommand: vi.fn(async () => ({
        ok: true,
        matchId: 'match-1',
        stateVersion: 9,
      })),
    };
    const lease: MatchLease = {
      runExclusive: vi.fn(async (_matchId, fn) => {
        attempts += 1;
        if (attempts === 1) return undefined;
        return fn();
      }),
    };

    const runner = new BotRunner(runtime, lease, {
      minDelayMs: 1,
      maxDelayMs: 1,
      random: () => 0,
      maxLeaseRetryAttempts: 0,
      watchdogDelayMs: 30_000,
      recoveryDelayMs: 100,
    });

    runner.kick('match-1');
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(1);

    expect(runtime.submitCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStateVersion: 8,
      }),
    );
  });
});
