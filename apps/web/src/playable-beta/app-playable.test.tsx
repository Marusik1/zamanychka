import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthApi } from '../auth/api.js';
import { App } from '../app.js';
import type { ProfileApi } from '../profile/api.js';
import type { TelegramAdapter } from '../telegram/adapter.js';
import type { RealtimeClient, RealtimeSubscription } from './realtime-client.js';
import type { RoomApi, RoomView } from './room-api.js';

function adapter(): TelegramAdapter {
  return {
    isAvailable: false,
    isTelegram: false,
    initData: undefined,
    shellReady: vi.fn(),
    dispose: vi.fn(),
  };
}

function authenticatedApi(): AuthApi {
  return {
    me: vi.fn().mockResolvedValue({
      user: { id: 'user-1', displayName: 'Алексей', authProvider: 'DEVELOPMENT' },
      rulesOnboardingSeenAt: '2026-08-30T10:00:00.000Z',
    }),
    loginTelegram: vi.fn(),
    developmentCapability: vi.fn(),
    loginDevelopment: vi.fn(),
    logout: vi.fn(),
    markRulesOnboardingSeen: vi
      .fn()
      .mockResolvedValue({ rulesOnboardingSeenAt: '2026-08-30T10:00:00.000Z' }),
  };
}

function profileApi(): ProfileApi {
  return {
    profile: vi.fn(),
    history: vi.fn(),
  } as unknown as ProfileApi;
}

function roomView(overrides: Partial<RoomView> = {}): RoomView {
  return {
    roomId: 'single-room',
    version: 1,
    currentMatchId: null,
    participants: [],
    presence: [],
    participantViews: [],
    ...overrides,
  };
}

function activeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ACTIVE',
    stateVersion: 0,
    turnNumber: 1,
    turnPhase: 'WAITING_FOR_ROLL',
    currentPlayerId: 'user-1',
    diceValue: null,
    winnerPlayerId: null,
    winReason: null,
    players: [
      { playerId: 'user-1', color: 'RED', seatIndex: 0, status: 'ACTIVE' },
      { playerId: 'user-2', color: 'YELLOW', seatIndex: 1, status: 'ACTIVE' },
    ],
    pawns: [
      { pawnId: 'user-1-pawn-1', playerId: 'user-1', color: 'RED', position: { zone: 'OFF_BOARD' } },
      { pawnId: 'user-1-pawn-2', playerId: 'user-1', color: 'RED', position: { zone: 'OFF_BOARD' } },
      { pawnId: 'user-1-pawn-3', playerId: 'user-1', color: 'RED', position: { zone: 'OFF_BOARD' } },
      { pawnId: 'user-1-pawn-4', playerId: 'user-1', color: 'RED', position: { zone: 'OFF_BOARD' } },
      { pawnId: 'user-2-pawn-1', playerId: 'user-2', color: 'YELLOW', position: { zone: 'OFF_BOARD' } },
      { pawnId: 'user-2-pawn-2', playerId: 'user-2', color: 'YELLOW', position: { zone: 'OFF_BOARD' } },
      { pawnId: 'user-2-pawn-3', playerId: 'user-2', color: 'YELLOW', position: { zone: 'OFF_BOARD' } },
      { pawnId: 'user-2-pawn-4', playerId: 'user-2', color: 'YELLOW', position: { zone: 'OFF_BOARD' } },
    ],
    lastSequence: 0,
    ...overrides,
  };
}

function createRoomApi(overrides?: Partial<RoomApi>): RoomApi {
  const initialRoom = roomView({
    participantViews: [{ userId: 'user-1', seatIndex: 0, ready: false, connected: true }],
    participants: [{ userId: 'user-1', seatIndex: 0, ready: false }],
    presence: [{ userId: 'user-1', connected: true }],
  });

  const api: RoomApi = {
    view: vi.fn().mockResolvedValue(initialRoom),
    takeSeat: vi.fn(),
    leaveSeat: vi.fn(),
    setReady: vi.fn(),
    startMatch: vi.fn(),
    reconnect: vi.fn().mockResolvedValue(initialRoom),
  };

  if (overrides) {
    Object.assign(api, overrides);
    if (!overrides.reconnect && overrides.view) {
      api.reconnect = overrides.view;
    }
  }

  return api;
}

function createRealtimeClient(overrides?: Partial<RealtimeClient>): RealtimeClient {
  let subscription: RealtimeSubscription | null = null;
  return {
    ensureConnected: vi.fn().mockResolvedValue(undefined),
    subscribe(listener) {
      subscription = listener;
      return () => {
        if (subscription === listener) subscription = null;
      };
    },
    joinMatch: vi.fn().mockResolvedValue(undefined),
    sync: vi.fn().mockResolvedValue({
      mode: 'snapshot',
      snapshot: activeSnapshot(),
      watermark: { stateVersion: 0, lastSequence: 0 },
    }),
    sendCommand: vi.fn(),
    disconnect: vi.fn(),
    __emitTransition(transition) {
      subscription?.(transition);
    },
    ...overrides,
  } as RealtimeClient;
}

function renderAuthenticatedRooms(options?: {
  roomApi?: RoomApi;
  realtime?: RealtimeClient;
}) {
  window.location.hash = '#/rooms';
  const optionalProps = {
    ...(options?.roomApi ? { roomApi: options.roomApi } : {}),
    ...(options?.realtime ? { realtimeClient: options.realtime } : {}),
  };
  return render(
    <App
      createAdapter={adapter}
      api={authenticatedApi()}
      profileApi={profileApi()}
      {...optionalProps}
    />,
  );
}

afterEach(() => {
  window.location.hash = '';
});

describe('playable beta room flow', () => {
  it('renders a real singleton room surface instead of the placeholder shell', async () => {
    renderAuthenticatedRooms();

    expect(await screen.findByRole('heading', { name: 'Комната' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Занять место 2' })).toBeVisible();
    expect(screen.getByText('Место 1')).toBeVisible();
    expect(screen.queryByText('Раздел появится в следующем этапе.')).not.toBeInTheDocument();
  });

  it('opens the active match and allows rolling dice through the realtime command path', async () => {
    const roomApi = createRoomApi({
      view: vi.fn().mockResolvedValue(
        roomView({
          currentMatchId: 'match-1',
          participants: [
            { userId: 'user-1', seatIndex: 0, ready: true },
            { userId: 'user-2', seatIndex: 1, ready: true },
          ],
          presence: [
            { userId: 'user-1', connected: true },
            { userId: 'user-2', connected: true },
          ],
          participantViews: [
            { userId: 'user-1', seatIndex: 0, ready: true, connected: true },
            { userId: 'user-2', seatIndex: 1, ready: true, connected: true },
          ],
        }),
      ),
    });
    const realtime = createRealtimeClient({
      sendCommand: vi.fn().mockResolvedValue({
        ok: true,
        matchId: 'match-1',
        actionId: 'action-1',
        stateVersion: 1,
        lastSequence: 1,
        snapshot: activeSnapshot({
          stateVersion: 1,
          turnPhase: 'WAITING_FOR_ACTION',
          diceValue: 6,
          lastSequence: 1,
        }),
        events: [
          {
            matchId: 'match-1',
            eventId: 'event-1',
            sequence: 1,
            stateVersion: 1,
            type: 'diceRolled',
            payload: { playerId: 'user-1', diceValue: 6 },
            createdAt: '2026-08-30T10:00:00.000Z',
          },
        ],
        ack: { actionId: 'action-1', stateVersion: 1, lastSequence: 1 },
      }),
    });

    renderAuthenticatedRooms({ roomApi, realtime });

    expect(await screen.findByRole('heading', { name: 'Матч' })).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Бросить кубик' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Бросить кубик' }));

    expect(realtime.ensureConnected).toHaveBeenCalled();
    expect(realtime.joinMatch).toHaveBeenCalledWith('match-1');
    expect(realtime.sendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ROLL_DICE',
        matchId: 'match-1',
        expectedStateVersion: 0,
      }),
    );
    expect(await screen.findByText('Выпало: 6')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Вывести пешку' }).length).toBeGreaterThan(0);
  });
});
