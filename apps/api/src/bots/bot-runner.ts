import { randomUUID } from 'node:crypto';
import { chooseBotAction } from './bot-policy.js';
import type { BotCommand, BotRunnerOptions, BotRuntimeAdapter, MatchLease } from './types.js';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class BotRunner {
  private readonly localInFlight = new Set<string>();
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxActionsPerKick: number;
  private readonly logger: Pick<Console, 'debug' | 'warn' | 'error'>;
  private readonly random: () => number;

  constructor(
    private readonly runtime: BotRuntimeAdapter,
    private readonly lease: MatchLease,
    options: BotRunnerOptions = {},
  ) {
    this.minDelayMs = options.minDelayMs ?? 450;
    this.maxDelayMs = options.maxDelayMs ?? 850;
    this.maxActionsPerKick = options.maxActionsPerKick ?? 8;
    this.logger = options.logger ?? console;
    this.random = options.random ?? Math.random;
  }

  kick(matchId: string): void {
    if (this.localInFlight.has(matchId)) return;
    this.localInFlight.add(matchId);

    void this.lease
      .runExclusive(matchId, async () => {
        await this.runLoop(matchId);
      })
      .catch((error) => {
        this.logger.error('[bot-runner] failed', { matchId, error });
      })
      .finally(() => {
        this.localInFlight.delete(matchId);
      });
  }

  private async runLoop(matchId: string): Promise<void> {
    for (let step = 0; step < this.maxActionsPerKick; step += 1) {
      const beforeDelay = await this.runtime.readTurn(matchId);

      if (!beforeDelay || beforeDelay.status !== 'ACTIVE') return;
      if (beforeDelay.activeParticipantKind !== 'BOT') return;

      await sleep(this.pickDelay());

      const snapshot = await this.runtime.readTurn(matchId);
      if (!snapshot || snapshot.status !== 'ACTIVE') return;
      if (snapshot.activeParticipantKind !== 'BOT') return;

      const chosen = chooseBotAction(snapshot.legalActions, {
        random: this.random,
      });

      if (!chosen) {
        this.logger.debug('[bot-runner] no legal bot action', {
          matchId,
          stateVersion: snapshot.stateVersion,
          phase: snapshot.phase,
        });
        return;
      }

      const command: BotCommand = {
        type: chosen.type,
        matchId,
        expectedStateVersion: snapshot.stateVersion,
        actionId: `bot:${snapshot.activeParticipantId ?? 'unknown'}:${randomUUID()}`,
        ...(chosen.pawnId ? { pawnId: chosen.pawnId } : {}),
        ...(chosen.payload ? { payload: chosen.payload } : {}),
      };

      const result = await this.runtime.submitCommand(command);

      if (!result.ok) {
        this.logger.warn('[bot-runner] command rejected', {
          matchId,
          type: command.type,
          code: result.code,
          expectedStateVersion: command.expectedStateVersion,
        });
        return;
      }
    }

    this.logger.warn('[bot-runner] safety action limit reached', {
      matchId,
      maxActionsPerKick: this.maxActionsPerKick,
    });
  }

  private pickDelay(): number {
    const span = Math.max(0, this.maxDelayMs - this.minDelayMs);
    return this.minDelayMs + Math.floor(this.random() * (span + 1));
  }
}
