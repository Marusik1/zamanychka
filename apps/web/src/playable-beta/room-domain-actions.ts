import type { RoomState } from '@zamanushka/shared';

export function canShowRoomSettings(room: RoomState | null, _finishedPresentationVisible: boolean): boolean {
  return Boolean(room && room.status === 'WAITING' && !room.currentMatchId && room.currentUser.isMember);
}
