export type BotCommandType = 'ROLL_DICE' | 'ENTER_PAWN' | 'MOVE_PAWN';

export interface BotLegalAction {
  type: BotCommandType;
  pawnId?: string;
  capturesOpponent?: boolean;
  progressScore?: number;
  payload?: Record<string, unknown>;
}

export interface BotTurnSnapshot {
  matchId: string;
  stateVersion: number;
  status: 'ACTIVE' | string;
  activeParticipantId: string | null;
  activeParticipantKind: 'HUMAN' | 'BOT' | string | null;
  legalActions: BotLegalAction[];
  phase?: string | null;
}

export interface BotCommand {
  type: BotCommandType;
  matchId: string;
  expectedStateVersion: number;
  actionId: string;
  pawnId?: string;
  payload?: Record<string, unknown>;
}

export interface BotCommandResult {
  ok: boolean;
  code?: string;
  stateVersion?: number;
}

export interface BotRuntimeAdapter {
  readTurn(matchId: string): Promise<BotTurnSnapshot | null>;
  submitCommand(command: BotCommand): Promise<BotCommandResult>;
}

export interface MatchLease {
  runExclusive<T>(matchId: string, fn: () => Promise<T>): Promise<T | undefined>;
}

export interface BotRunnerOptions {
  minDelayMs?: number;
  maxDelayMs?: number;
  followupMinDelayMs?: number;
  followupMaxDelayMs?: number;
  maxActionsPerKick?: number;
  maxLeaseRetryAttempts?: number;
  leaseRetryDelayMs?: number;
  recoveryDelayMs?: number;
  watchdogDelayMs?: number;
  stallTelemetryDelayMs?: number;
  logger?: Pick<Console, 'debug' | 'warn' | 'error'>;
  random?: () => number;
  onCommittedCommand?: (input: { matchId: string; actionId: string; type: BotCommandType }) => void | Promise<void>;
}
