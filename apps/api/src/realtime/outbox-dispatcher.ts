export interface ClaimedOutboxRow {
  id: string;
  matchId: string;
  resultingStateVersion: number;
  payload: unknown;
  createdAt: Date;
  claimedAt: Date;
}

export interface OutboxLeaseStore {
  claim(input: { leaseToken: string }): Promise<ClaimedOutboxRow | null>;
  markPublished(input: { outboxId: string; leaseToken: string }): Promise<boolean>;
  release(input: { outboxId: string; leaseToken: string }): Promise<void>;
}

export function createOutboxDispatcher(options: {
  workerId: string;
  outbox: OutboxLeaseStore;
  publish: (payload: unknown, row: ClaimedOutboxRow) => Promise<void>;
  claimRetryDelaysMs?: readonly number[];
}) {
  const claimRetryDelaysMs = options.claimRetryDelaysMs ?? [100, 250, 500];
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  return {
    async dispatchOne(): Promise<
      | { dispatched: true }
      | { dispatched: false; reason: 'EMPTY' | 'CLAIM_FAILED' | 'PUBLISH_FAILED' | 'MARK_FAILED' }
    > {
      let row: ClaimedOutboxRow | null = null;
      let claimFailed = false;
      for (let attempt = 0; attempt <= claimRetryDelaysMs.length; attempt += 1) {
        try {
          row = await options.outbox.claim({ leaseToken: options.workerId });
          claimFailed = false;
          break;
        } catch {
          claimFailed = true;
          const delay = claimRetryDelaysMs[attempt];
          if (delay === undefined) break;
          if (delay > 0) await wait(delay);
        }
      }
      if (claimFailed) {
        return { dispatched: false, reason: 'CLAIM_FAILED' };
      }
      if (!row) return { dispatched: false, reason: 'EMPTY' };
      try {
        await options.publish(row.payload, row);
      } catch {
        await options.outbox.release({ outboxId: row.id, leaseToken: options.workerId });
        return { dispatched: false, reason: 'PUBLISH_FAILED' };
      }
      try {
        await options.outbox.markPublished({ outboxId: row.id, leaseToken: options.workerId });
      } catch {
        return { dispatched: false, reason: 'MARK_FAILED' };
      }
      return { dispatched: true };
    },
  };
}
