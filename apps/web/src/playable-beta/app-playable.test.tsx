import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthApi } from '../auth/api.js';
import { App } from '../app.js';
import type { ProfileApi } from '../profile/api.js';
import type { TelegramAdapter } from '../telegram/adapter.js';
import type { RealtimeClient, RealtimeSubscription } from './realtime-client.js';
import type { RoomApi } from './room-api.js';

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

function roomState(overrides: Record<string, unknown> = {}) {
  return {
    id: 'room-1',
    code: 'ABCD',
    status: 'WAITING',
    version: 1,
    currentMatchId: null,
    members: [
      {
        userId: 'user-1',
        displayName: 'Алексей',
        joinedAt: '2026-08-30T10:00:00.000Z',
      },
    ],
    seats: [
      { seatIndex: 0, userId: 'user-1', ready: false },
      { seatIndex: 1, userId: null, ready: false },
      { seatIndex: 2, userId: null, ready: false },
      { seatIndex: 3, userId: null, ready: false },
    ],
    counts: {
      memberCount: 1,
      seatedCount: 1,
      readyCount: 0,
    },
    currentUser: {
      isMember: true,
      seatIndex: 0,
      ready: false,
      canLeave: true,
      canStart: false,
      startBlockedReason: 'Нужно минимум 2 игрока.',
    },
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
  const currentRoom = roomState();
  const rooms = {
    rooms: [
      {
        id: 'room-1',
        code: 'ABCD',
        status: 'WAITING',
        currentMatchId: null,
        counts: {
          memberCount: 1,
          seatedCount: 1,
          readyCount: 0,
        },
      },
    ],
  };

  const api: RoomApi = {
    listRooms: vi.fn().mockResolvedValue(rooms),
    createRoom: vi.fn(),
    getRoom: vi.fn().mockResolvedValue(currentRoom),
    joinRoom: vi.fn().mockResolvedValue({ ok: true, room: currentRoom }),
    takeSeat: vi.fn(),
    leaveSeat: vi.fn(),
    leaveRoom: vi.fn(),
    setReady: vi.fn(),
    startMatch: vi.fn(),
    reconnect: vi.fn().mockResolvedValue(currentRoom),
  };

  if (overrides) {
    Object.assign(api, overrides);
    if (!overrides.reconnect && overrides.getRoom) {
      api.reconnect = overrides.getRoom;
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

function renderAuthenticated(hash = '#/rooms', options?: { roomApi?: RoomApi; realtime?: RealtimeClient }) {
  window.location.hash = hash;
  const props = {
    ...(options?.roomApi ? { roomApi: options.roomApi } : {}),
    ...(options?.realtime ? { realtimeClient: options.realtime } : {}),
  };

  return render(
    <App
      createAdapter={adapter}
      api={authenticatedApi()}
      profileApi={profileApi()}
      {...props}
    />,
  );
}

afterEach(() => {
  window.location.hash = '';
});

describe('playable beta room flow', () => {
  it('renders the room list on #/rooms and opens a room through the canonical route', async () => {
    const api = createRoomApi();
    renderAuthenticated('#/rooms', { roomApi: api });

    expect(await screen.findByRole('heading', { name: 'Комнаты' })).toBeVisible();
    expect(screen.getByText('Комната ABCD')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Открыть комнату' }));

    await waitFor(() => expect(window.location.hash).toBe('#/rooms/room-1'));
    expect(await screen.findByRole('heading', { name: 'Комната ABCD' })).toBeVisible();
    expect(api.reconnect).toHaveBeenCalledWith('room-1', expect.any(AbortSignal));
  });

  it('creates a room, joins it, and shows room-scoped seat controls', async () => {
    const createdRoom = roomState({
      id: 'room-2',
      code: 'WXYZ',
      members: [],
      seats: [
        { seatIndex: 0, userId: null, ready: false },
        { seatIndex: 1, userId: null, ready: false },
        { seatIndex: 2, userId: null, ready: false },
        { seatIndex: 3, userId: null, ready: false },
      ],
      counts: { memberCount: 0, seatedCount: 0, readyCount: 0 },
      currentUser: {
        isMember: false,
        seatIndex: null,
        ready: false,
        canLeave: false,
        canStart: false,
        startBlockedReason: 'Сначала войдите в комнату.',
      },
    });
    const joinedRoom = roomState({
      id: 'room-2',
      code: 'WXYZ',
      members: [
        {
          userId: 'user-1',
          displayName: 'Алексей',
          joinedAt: '2026-08-30T10:00:00.000Z',
        },
      ],
      seats: [
        { seatIndex: 0, userId: null, ready: false },
        { seatIndex: 1, userId: null, ready: false },
        { seatIndex: 2, userId: null, ready: false },
        { seatIndex: 3, userId: null, ready: false },
      ],
      counts: { memberCount: 1, seatedCount: 0, readyCount: 0 },
      currentUser: {
        isMember: true,
        seatIndex: null,
        ready: false,
        canLeave: true,
        canStart: false,
        startBlockedReason: 'Нужно занять место.',
      },
    });
    const api = createRoomApi({
      listRooms: vi.fn().mockResolvedValue({ rooms: [] }),
      createRoom: vi.fn().mockResolvedValue({ ok: true, room: createdRoom }),
      joinRoom: vi.fn().mockResolvedValue({ ok: true, room: joinedRoom }),
      getRoom: vi.fn().mockResolvedValue(joinedRoom),
    });

    renderAuthenticated('#/rooms', { roomApi: api });

    fireEvent.click(await screen.findByRole('button', { name: 'Создать комнату' }));

    await waitFor(() => expect(api.createRoom).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(api.joinRoom).toHaveBeenCalledWith('room-2', expect.any(AbortSignal)));
    expect(await screen.findByRole('heading', { name: 'Комната WXYZ' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Занять место 1' })).toBeVisible();
  });

  it('uses room-scoped expectedRoomVersion for seat and readiness mutations', async () => {
    const room = roomState({
      version: 7,
      counts: { memberCount: 2, seatedCount: 2, readyCount: 1 },
      members: [
        { userId: 'user-1', displayName: 'Алексей', joinedAt: '2026-08-30T10:00:00.000Z' },
        { userId: 'user-2', displayName: 'Мария', joinedAt: '2026-08-30T10:01:00.000Z' },
      ],
      seats: [
        { seatIndex: 0, userId: 'user-1', ready: false },
        { seatIndex: 1, userId: 'user-2', ready: true },
        { seatIndex: 2, userId: null, ready: false },
        { seatIndex: 3, userId: null, ready: false },
      ],
      currentUser: {
        isMember: true,
        seatIndex: 0,
        ready: false,
        canLeave: true,
        canStart: false,
        startBlockedReason: 'Ожидаем вашу готовность.',
      },
    });
    const refreshed = roomState({
      ...room,
      version: 8,
      counts: { memberCount: 2, seatedCount: 2, readyCount: 2 },
      seats: [
        { seatIndex: 0, userId: 'user-1', ready: true },
        { seatIndex: 1, userId: 'user-2', ready: true },
        { seatIndex: 2, userId: null, ready: false },
        { seatIndex: 3, userId: null, ready: false },
      ],
      currentUser: {
        isMember: true,
        seatIndex: 0,
        ready: true,
        canLeave: true,
        canStart: true,
        startBlockedReason: null,
      },
    });
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValueOnce(room).mockResolvedValueOnce(refreshed),
      setReady: vi.fn().mockResolvedValue({ ok: true, room: refreshed }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api });

    fireEvent.click(await screen.findByRole('button', { name: 'Готов' }));

    await waitFor(() => expect(api.setReady).toHaveBeenCalledWith('room-1', true, 7, expect.any(AbortSignal)));
    expect(await screen.findByText('Готовы: 2 / 2')).toBeVisible();
  });

  it('starts a room-scoped match and hands off into existing gameplay sync', async () => {
    const startRoom = roomState({
      version: 4,
      counts: { memberCount: 2, seatedCount: 2, readyCount: 2 },
      members: [
        { userId: 'user-1', displayName: 'Алексей', joinedAt: '2026-08-30T10:00:00.000Z' },
        { userId: 'user-2', displayName: 'Таисия', joinedAt: '2026-08-30T10:01:00.000Z' },
      ],
      seats: [
        { seatIndex: 0, userId: 'user-1', ready: true },
        { seatIndex: 1, userId: 'user-2', ready: true },
        { seatIndex: 2, userId: null, ready: false },
        { seatIndex: 3, userId: null, ready: false },
      ],
      currentUser: {
        isMember: true,
        seatIndex: 0,
        ready: true,
        canLeave: true,
        canStart: true,
        startBlockedReason: null,
      },
    });
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(startRoom),
      startMatch: vi.fn().mockResolvedValue({
        ok: true,
        matchId: 'match-2',
        room: {
          ...startRoom,
          version: 5,
          status: 'ACTIVE',
          currentMatchId: 'match-2',
          currentUser: { ...startRoom.currentUser, canStart: false, startBlockedReason: 'Матч уже идет.' },
        },
      }),
    });
    const realtime = createRealtimeClient();

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    const button = await screen.findByRole('button', { name: 'Начать матч' });
    fireEvent.click(button);

    await waitFor(() => expect(api.startMatch).toHaveBeenCalledWith('room-1', 4, expect.any(AbortSignal)));
    expect(realtime.ensureConnected).toHaveBeenCalled();
    expect(realtime.joinMatch).toHaveBeenCalledWith('match-2');
    expect(await screen.findByRole('heading', { name: 'Матч' })).toBeVisible();
  });
});
