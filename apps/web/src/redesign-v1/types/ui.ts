export type NavTab = 'home' | 'rooms' | 'profile';
export type RoomStatus = 'waiting' | 'playing';
export type MatchResult = 'win' | 'loss' | 'surrender';

export interface RoomSummary {
  id: string;
  name: string;
  status: RoomStatus;
  players: number;
  maxPlayers: number;
  readyCount: number;
  imageUrl: string;
}

export interface PlayerSlot {
  id?: string;
  seatIndex?: 0 | 1 | 2 | 3;
  name?: string;
  initials?: string;
  avatarUrl?: string;
  ready?: boolean;
  isOwner?: boolean;
  participantKind?: 'HUMAN' | 'BOT' | null;
}

export interface RoomDetails extends RoomSummary {
  code: string;
  playersList: PlayerSlot[];
}

export interface MatchSummary {
  id: string;
  result: MatchResult;
  roomName: string;
  playerCount: number;
  dateLabel: string;
}

export interface ProfileSummary {
  displayName: string;
  initials: string;
  games: number;
  wins: number;
  winRate: number;
  recentMatches: MatchSummary[];
}
