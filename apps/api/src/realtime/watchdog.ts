export function createVersionWatchdog(options: {
  intervalMs: number;
  now?: () => Date;
  loadMatches: () => Promise<{ matchId: string; stateVersion: number; lastSequence: number }[]>;
  loadClients: () => Promise<
    {
      socketId: string;
      matchId: string;
      stateVersion: number;
      lastSequence: number;
      syncInProgress: boolean;
    }[]
  >;
  onDivergence: (input: { matchId: string; lastSequence: number }) => Promise<void> | void;
}) {
  const now = options.now ?? (() => new Date());
  void now;
  return {
    async scanOnce() {
      const [matches, clients] = await Promise.all([options.loadMatches(), options.loadClients()]);
      for (const client of clients) {
        if (client.syncInProgress) continue;
        const match = matches.find((candidate) => candidate.matchId === client.matchId);
        if (!match) continue;
        if (client.stateVersion < match.stateVersion || client.lastSequence < match.lastSequence) {
          await options.onDivergence({
            matchId: client.matchId,
            lastSequence: client.lastSequence,
          });
        }
      }
    },
    start() {
      const handle = setInterval(() => {
        void this.scanOnce();
      }, options.intervalMs);
      return () => clearInterval(handle);
    },
  };
}
