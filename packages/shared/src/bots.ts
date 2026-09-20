export const PARTICIPANT_KINDS = ['HUMAN', 'BOT'] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];

export type BotDifficulty = 'SIMPLE';

export interface BotParticipantMeta {
  participantKind: 'BOT';
  difficulty: BotDifficulty;
}

export function isBotParticipant(
  participant: { participantKind?: string | null } | null | undefined,
): participant is { participantKind: 'BOT' } {
  return participant?.participantKind === 'BOT';
}

export function buildBotParticipantId(roomId: string, seatIndex: number): string {
  return `bot:${roomId}:${seatIndex}`;
}
