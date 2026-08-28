import { derivePlayerMatchOutcome, isPersistableFinishedMatch } from './result-outcome.js';

interface ResultDraftParticipantInput {
  userId: string;
  displayName: string;
  color: 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';
  surrendered: boolean;
}

interface MatchResultDraftInput {
  matchId: string;
  roomId: string;
  status: string;
  winnerUserId: string | null;
  victoryReason: 'HOME_DIAGONAL_COMPLETED' | 'LAST_ACTIVE_PLAYER' | null;
  startedAt: Date;
  finishedAt: Date;
  participants: readonly ResultDraftParticipantInput[];
}

export interface MatchResultDraft {
  matchId: string;
  roomId: string;
  winnerUserId: string;
  victoryReason: 'HOME_DIAGONAL_COMPLETED' | 'LAST_ACTIVE_PLAYER';
  startedAt: Date;
  finishedAt: Date;
  participantCount: number;
  participants: Array<{
    userId: string;
    displayName: string;
    color: 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';
    outcome: 'WIN' | 'LOSS' | 'SURRENDERED';
  }>;
}

export function buildMatchResultDraft(input: MatchResultDraftInput): MatchResultDraft | null {
  if (
    !isPersistableFinishedMatch({
      status: input.status,
      terminalResult: {
        winnerPlayerId: input.winnerUserId,
        reason: input.victoryReason,
      },
    })
  ) {
    return null;
  }

  const winner = input.participants.find((participant) => participant.userId === input.winnerUserId);
  if (!winner) {
    throw new Error('MATCH_RESULT_WINNER_NOT_PARTICIPANT');
  }

  const winnerUserId = input.winnerUserId;
  const victoryReason = input.victoryReason;
  if (winnerUserId === null || victoryReason === null) {
    throw new Error('MATCH_RESULT_PERSISTABLE_STATE_INVALID');
  }

  return {
    matchId: input.matchId,
    roomId: input.roomId,
    winnerUserId,
    victoryReason,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    participantCount: input.participants.length,
    participants: input.participants.map((participant) => ({
      userId: participant.userId,
      displayName: participant.displayName,
      color: participant.color,
      outcome: derivePlayerMatchOutcome(
        {
          userId: participant.userId,
          status: participant.surrendered ? 'SURRENDERED' : 'ACTIVE',
        },
        {
          winnerPlayerId: winnerUserId,
          reason: victoryReason,
        },
      ),
    })),
  };
}
