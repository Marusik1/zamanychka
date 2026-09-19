import type { MatchSummary, ProfileSummary, RoomDetails, RoomSummary } from './types/ui';

export const demoRooms: RoomSummary[] = [
  { id: 'main', name: 'Комната MAIN', status: 'waiting', players: 0, maxPlayers: 4, readyCount: 0, imageUrl: '/assets/rooms/room-main.webp' },
  { id: '248c', name: 'Комната 248C', status: 'playing', players: 2, maxPlayers: 4, readyCount: 2, imageUrl: '/assets/rooms/room-248c.webp' },
  { id: 'lucky', name: 'Комната LUCKY', status: 'waiting', players: 1, maxPlayers: 4, readyCount: 1, imageUrl: '/assets/rooms/room-lucky.webp' },
  { id: 'friends', name: 'Комната FRIENDS', status: 'playing', players: 3, maxPlayers: 4, readyCount: 3, imageUrl: '/assets/rooms/room-friends.webp' },
];

export const demoMatches: MatchSummary[] = [
  { id: 'm1', result: 'win', roomName: 'Комната 248C', playerCount: 2, dateLabel: '31.08, 10:52' },
  { id: 'm2', result: 'surrender', roomName: 'Комната MAIN', playerCount: 2, dateLabel: '09.09, 17:25' },
  { id: 'm3', result: 'surrender', roomName: 'Комната LUCKY', playerCount: 4, dateLabel: '03.09, 14:11' },
];

export const demoProfile: ProfileSummary = {
  displayName: 'Player One', initials: 'PO', games: 5, wins: 2, winRate: 40, recentMatches: demoMatches,
};

export const demoRoom: RoomDetails = {
  id: '248c',
  name: 'Комната 248C',
  status: 'playing',
  players: 2,
  maxPlayers: 4,
  readyCount: 2,
  imageUrl: '/assets/rooms/room-248c.webp',
  code: '248C',
  playersList: [
    { id: 'p1', name: 'Player One', initials: 'PO', ready: true, isOwner: true },
    { id: 'p2', name: 'Анна', initials: 'А', ready: true },
  ],
};
