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
}) {
  return {
    async dispatchOne(): Promise<
      { dispatched: true } | { dispatched: false; reason: 'EMPTY' | 'PUBLISH_FAILED' }
    > {
      const row = await options.outbox.claim({ leaseToken: options.workerId });
      if (!row) return { dispatched: false, reason: 'EMPTY' };
      try {
        await options.publish(row.payload, row);
      } catch {
        await options.outbox.release({ outboxId: row.id, leaseToken: options.workerId });
        return { dispatched: false, reason: 'PUBLISH_FAILED' };
      }
      await options.outbox.markPublished({ outboxId: row.id, leaseToken: options.workerId });
      return { dispatched: true };
    },
  };
}
