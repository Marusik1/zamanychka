import type { RoomState } from '@zamanushka/shared';
import { describe, expect, it } from 'vitest';

import { canShowRoomSettings } from './room-domain-actions.js';

function waitingRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    id: 'room-1',
    code: 'ABCD',
    status: 'WAITING',
    version: 1,
    currentMatchId: null,
    members: [],
    seats: [],
    counts: { memberCount: 1, seatedCount: 1, readyCount: 0 },
    currentUser: {
      isMember: true,
      seatIndex: 0,
      ready: false,
      canLeave: true,
      canStart: false,
      canManageBots: true,
    },
    ...overrides,
  } as RoomState;
}

describe('room domain actions', () => {
  it('keeps room settings visible from canonical WAITING room state even if a finished presentation is still visible', () => {
    expect(canShowRoomSettings(waitingRoom(), true)).toBe(true);
  });

  it('does not expose room settings while an authoritative active match is attached', () => {
    expect(
      canShowRoomSettings(
        waitingRoom({
          status: 'ACTIVE',
          currentMatchId: 'match-1',
        }),
        false,
      ),
    ).toBe(false);
  });
});
