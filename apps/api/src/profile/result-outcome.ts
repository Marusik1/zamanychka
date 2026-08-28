import type { PlayerMatchOutcome, VictoryReason } from '@zamanushka/shared';

type PersistableVictoryReason = VictoryReason;

interface TerminalResultLike {
  winnerPlayerId: string | null;
  reason: PersistableVictoryReason | null;
}

interface MatchLike {
  status: string;
  terminalResult: TerminalResultLike | null;
}

interface ParticipantLike {
  userId: string;
  status: 'ACTIVE' | 'SURRENDERED' | 'FINISHED';
}

export function derivePlayerMatchOutcome(
  participant: ParticipantLike,
  terminalResult: TerminalResultLike,
): PlayerMatchOutcome {
  if (participant.userId === terminalResult.winnerPlayerId) return 'WIN';
  return participant.status === 'SURRENDERED' ? 'SURRENDERED' : 'LOSS';
}

export function isPersistableFinishedMatch(match: MatchLike): boolean {
  const terminalResult = match.terminalResult;
  return (
    match.status === 'FINISHED' &&
    terminalResult !== null &&
    terminalResult.winnerPlayerId !== null &&
    (terminalResult.reason === 'HOME_DIAGONAL_COMPLETED' ||
      terminalResult.reason === 'LAST_ACTIVE_PLAYER')
  );
}
