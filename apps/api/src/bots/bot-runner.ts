import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { chooseBotAction } from './bot-policy.js';
import {
  isAutomatedParticipantKind,
  type BotCommand,
  type BotRunnerOptions,
  type BotRuntimeAdapter,
  type MatchLease,
} from './types.js';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const VISIBLE_DICE_PRESENTATION_MS = 810;

function telemetryEnabled() {
  return process.env.GAMEPLAY_TELEMETRY === 'true';
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function logBotTelemetry(event: string, payload: Record<string, unknown>) {
  if (!telemetryEnabled()) return;
  console.info(
    JSON.stringify({
      scope: 'gameplay-bot',
      event,
      at: new Date().toISOString(),
      ...payload,
    }),
  );
}

export class BotRunner {
  private readonly localInFlight = new Set<string>();
  private readonly watchdogs = new Set<string>();
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly followupMinDelayMs: number;
  private readonly followupMaxDelayMs: number;
  private readonly maxActionsPerKick: number;
  private readonly maxLeaseRetryAttempts: number;
  private readonly leaseRetryDelayMs: number;
  private readonly recoveryDelayMs: number;
  private readonly watchdogDelayMs: number;
  private readonly stallTelemetryDelayMs: number;
  private readonly logger: Pick<Console, 'debug' | 'warn' | 'error'>;
  private readonly random: () => number;
  private readonly onCommittedCommand?: BotRunnerOptions['onCommittedCommand'];

  constructor(
    private readonly runtime: BotRuntimeAdapter,
    private readonly lease: MatchLease,
    options: BotRunnerOptions = {},
  ) {
    this.minDelayMs = options.minDelayMs ?? 250;
    this.maxDelayMs = options.maxDelayMs ?? 600;
    this.followupMinDelayMs = options.followupMinDelayMs ?? VISIBLE_DICE_PRESENTATION_MS + 100;
    this.followupMaxDelayMs = options.followupMaxDelayMs ?? VISIBLE_DICE_PRESENTATION_MS + 500;
    this.maxActionsPerKick = options.maxActionsPerKick ?? 8;
    this.maxLeaseRetryAttempts = options.maxLeaseRetryAttempts ?? 3;
    this.leaseRetryDelayMs = options.leaseRetryDelayMs ?? 250;
    this.recoveryDelayMs = options.recoveryDelayMs ?? 3_000;
    this.watchdogDelayMs = options.watchdogDelayMs ?? 3_000;
    this.stallTelemetryDelayMs = options.stallTelemetryDelayMs ?? 10_000;
    this.logger = options.logger ?? console;
    this.random = options.random ?? Math.random;
    this.onCommittedCommand = options.onCommittedCommand;
  }

  kick(matchId: string): void {
    this.kickWithRetry(matchId, 0);
  }

  private kickWithRetry(matchId: string, attempt: number): void {
    if (this.localInFlight.has(matchId)) return;
    this.localInFlight.add(matchId);

    void this.lease
      .runExclusive(matchId, async () => {
        await this.runLoop(matchId);
        return 'executed' as const;
      })
      .then((result) => {
        if (result === 'executed') return;
        this.scheduleWatchdog(matchId);
        if (attempt >= this.maxLeaseRetryAttempts) {
          this.logger.warn('[bot-runner] lease busy retry limit reached', {
            matchId,
            maxLeaseRetryAttempts: this.maxLeaseRetryAttempts,
          });
          this.scheduleRecovery(matchId);
          return;
        }
        setTimeout(() => this.kickWithRetry(matchId, attempt + 1), this.leaseRetryDelayMs);
      })
      .catch((error) => {
        this.logger.error('[bot-runner] failed', { matchId, error });
      })
      .finally(() => {
        this.localInFlight.delete(matchId);
      });
  }

  private scheduleRecovery(matchId: string): void {
    setTimeout(() => this.kick(matchId), this.recoveryDelayMs);
  }

  private scheduleWatchdog(matchId: string): void {
    void this.runtime
      .readTurn(matchId)
      .then((snapshot) => {
        if (!snapshot || snapshot.status !== 'ACTIVE' || !isAutomatedParticipantKind(snapshot.activeParticipantKind)) return;
        const observed = {
          stateVersion: snapshot.stateVersion,
          participantId: snapshot.activeParticipantId,
          phase: snapshot.phase ?? null,
        };
        const watchdogKey = `${matchId}:${observed.stateVersion}:${observed.participantId ?? 'unknown'}`;
        if (this.watchdogs.has(watchdogKey)) return;
        this.watchdogs.add(watchdogKey);
        setTimeout(() => {
          void this.reconcileBotProgress(matchId, observed).finally(() => {
            this.watchdogs.delete(watchdogKey);
          });
        }, this.watchdogDelayMs);
        setTimeout(() => {
          void this.logIfStillStalled(matchId, observed);
        }, this.stallTelemetryDelayMs);
      })
      .catch((error) => {
        this.logger.warn('[bot-runner] watchdog snapshot failed', { matchId, error });
      });
  }

  private async reconcileBotProgress(
    matchId: string,
    observed: { stateVersion: number; participantId: string | null; phase: string | null },
  ): Promise<void> {
    const snapshot = await this.runtime.readTurn(matchId);
    if (!snapshot || snapshot.status !== 'ACTIVE' || !isAutomatedParticipantKind(snapshot.activeParticipantKind)) return;
    if (snapshot.stateVersion !== observed.stateVersion) return;
    if (snapshot.activeParticipantId !== observed.participantId) return;
    this.kick(matchId);
  }

  private async logIfStillStalled(
    matchId: string,
    observed: { stateVersion: number; participantId: string | null; phase: string | null },
  ): Promise<void> {
    const snapshot = await this.runtime.readTurn(matchId);
    if (!snapshot || snapshot.status !== 'ACTIVE' || !isAutomatedParticipantKind(snapshot.activeParticipantKind)) return;
    if (snapshot.stateVersion !== observed.stateVersion) return;
    if (snapshot.activeParticipantId !== observed.participantId) return;
    logBotTelemetry('BOT_TURN_STALLED', {
      matchId,
      stateVersion: snapshot.stateVersion,
      phase: snapshot.phase ?? observed.phase,
      participantId: snapshot.activeParticipantId,
      leaseAttempts: this.maxLeaseRetryAttempts + 1,
    });
    this.logger.warn('[bot-runner] BOT_TURN_STALLED', {
      matchId,
      stateVersion: snapshot.stateVersion,
      phase: snapshot.phase ?? observed.phase,
      participantId: snapshot.activeParticipantId,
      leaseAttempts: this.maxLeaseRetryAttempts + 1,
    });
  }

  private async runLoop(matchId: string): Promise<void> {
    for (let step = 0; step < this.maxActionsPerKick; step += 1) {
      const beforeDelay = await this.runtime.readTurn(matchId);

      if (!beforeDelay) {
        this.logStop(matchId, 'MATCH_NOT_FOUND', { step });
        return;
      }
      if (beforeDelay.status !== 'ACTIVE') {
        this.logStop(matchId, 'MATCH_NOT_ACTIVE', {
          step,
          status: beforeDelay.status,
          stateVersion: beforeDelay.stateVersion,
        });
        return;
      }
      if (!isAutomatedParticipantKind(beforeDelay.activeParticipantKind)) {
        this.logStop(matchId, 'ACTIVE_PARTICIPANT_NOT_AUTOMATED', {
          step,
          stateVersion: beforeDelay.stateVersion,
          activeParticipantId: beforeDelay.activeParticipantId,
          activeParticipantKind: beforeDelay.activeParticipantKind,
          phase: beforeDelay.phase,
        });
        return;
      }

      const thinkDelayMs = step === 0 ? this.pickDelay() : this.pickFollowupDelay();
      logBotTelemetry('bot-turn-detected', {
        matchId,
        step,
        activeParticipantId: beforeDelay.activeParticipantId,
        phase: beforeDelay.phase,
        stateVersion: beforeDelay.stateVersion,
        artificialThinkDelayMs: thinkDelayMs,
      });

      const thinkStartedAt = performance.now();
      await sleep(thinkDelayMs);
      logBotTelemetry('bot-think-complete', {
        matchId,
        step,
        artificialThinkDelayMs: thinkDelayMs,
        actualThinkDelayMs: roundMs(performance.now() - thinkStartedAt),
      });

      const snapshot = await this.runtime.readTurn(matchId);
      if (!snapshot) {
        this.logStop(matchId, 'MATCH_NOT_FOUND_AFTER_DELAY', { step });
        return;
      }
      if (snapshot.status !== 'ACTIVE') {
        this.logStop(matchId, 'MATCH_NOT_ACTIVE_AFTER_DELAY', {
          step,
          status: snapshot.status,
          stateVersion: snapshot.stateVersion,
        });
        return;
      }
      if (!isAutomatedParticipantKind(snapshot.activeParticipantKind)) {
        this.logStop(matchId, 'ACTIVE_PARTICIPANT_NOT_AUTOMATED_AFTER_DELAY', {
          step,
          stateVersion: snapshot.stateVersion,
          activeParticipantId: snapshot.activeParticipantId,
          activeParticipantKind: snapshot.activeParticipantKind,
          phase: snapshot.phase,
        });
        return;
      }

      const chosen = chooseBotAction(snapshot.legalActions, {
        random: this.random,
      });

      if (!chosen) {
        this.logStop(matchId, 'NO_LEGAL_BOT_ACTION', {
          matchId,
          step,
          stateVersion: snapshot.stateVersion,
          phase: snapshot.phase,
          activeParticipantId: snapshot.activeParticipantId,
          legalActionCount: snapshot.legalActions.length,
          legalActionTypes: snapshot.legalActions.map((action) =>
            action.pawnId ? `${action.type}:${action.pawnId}` : action.type,
          ),
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

      const commandStartedAt = performance.now();
      logBotTelemetry('bot-command-submitted', {
        matchId,
        step,
        actionId: command.actionId,
        type: command.type,
        expectedStateVersion: command.expectedStateVersion,
        pawnId: command.pawnId,
      });
      const result = await this.runtime.submitCommand(command);
      logBotTelemetry('bot-command-result', {
        matchId,
        step,
        actionId: command.actionId,
        type: command.type,
        ok: result.ok,
        code: result.ok ? undefined : result.code,
        commandRoundTripMs: roundMs(performance.now() - commandStartedAt),
      });

      if (!result.ok) {
        this.logger.warn('[bot-runner] command rejected', {
          matchId,
          type: command.type,
          code: result.code,
          expectedStateVersion: command.expectedStateVersion,
          pawnId: command.pawnId,
        });
        return;
      }

      await this.onCommittedCommand?.({
        matchId,
        actionId: command.actionId,
        type: command.type,
      });
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

  private pickFollowupDelay(): number {
    const span = Math.max(0, this.followupMaxDelayMs - this.followupMinDelayMs);
    return this.followupMinDelayMs + Math.floor(this.random() * (span + 1));
  }

  private logStop(matchId: string, reason: string, payload: Record<string, unknown> = {}): void {
    this.logger.debug('[bot-runner] stopped', {
      matchId,
      reason,
      ...payload,
    });
  }
}
