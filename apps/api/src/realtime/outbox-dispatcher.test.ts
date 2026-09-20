import { describe, expect, it, vi } from 'vitest';

import { createOutboxDispatcher } from './outbox-dispatcher.js';

const row = {
  id: 'outbox-1',
  matchId: 'match-1',
  resultingStateVersion: 3,
  createdAt: new Date('2026-09-20T12:00:00.000Z'),
  claimedAt: new Date('2026-09-20T12:00:00.125Z'),
  payload: {
    matchId: 'match-1',
    stateVersion: 3,
    lastSequence: 8,
    events: [{ eventId: 'match-1:8', sequence: 8 }],
  },
};

describe('transactional outbox dispatcher', () => {
  it('claims a row once across workers and marks it published only after transport success', async () => {
    const claims = [structuredClone(row), null];
    const claim = vi.fn(async () => claims.shift() ?? null);
    const publish = vi.fn(async () => undefined);
    const markPublished = vi.fn(async () => true);
    const release = vi.fn(async () => undefined);

    const workerA = createOutboxDispatcher({
      workerId: 'worker-a',
      outbox: { claim, markPublished, release },
      publish,
    });
    const workerB = createOutboxDispatcher({
      workerId: 'worker-b',
      outbox: { claim, markPublished, release },
      publish,
    });

    await workerA.dispatchOne();
    await workerB.dispatchOne();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(markPublished).toHaveBeenCalledWith({ outboxId: 'outbox-1', leaseToken: 'worker-a' });
    expect(release).not.toHaveBeenCalled();
  });

  it('releases a failed publication lease so another worker may retry the identical durable envelope', async () => {
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary transport failure'))
      .mockResolvedValueOnce(undefined);
    const firstOutbox = {
      claim: vi.fn(async () => structuredClone(row)),
      markPublished: vi.fn(async () => true),
      release: vi.fn(async () => undefined),
    };
    const retryOutbox = {
      claim: vi.fn(async () => structuredClone(row)),
      markPublished: vi.fn(async () => true),
      release: vi.fn(async () => undefined),
    };

    await expect(
      createOutboxDispatcher({ workerId: 'worker-a', outbox: firstOutbox, publish }).dispatchOne(),
    ).resolves.toEqual({ dispatched: false, reason: 'PUBLISH_FAILED' });
    await expect(
      createOutboxDispatcher({ workerId: 'worker-b', outbox: retryOutbox, publish }).dispatchOne(),
    ).resolves.toEqual({ dispatched: true });

    expect(firstOutbox.release).toHaveBeenCalledWith({
      outboxId: 'outbox-1',
      leaseToken: 'worker-a',
    });
    expect(publish.mock.calls.map(([payload]) => payload)).toEqual([row.payload, row.payload]);
    expect(retryOutbox.markPublished).toHaveBeenCalledWith({
      outboxId: 'outbox-1',
      leaseToken: 'worker-b',
    });
  });
});
