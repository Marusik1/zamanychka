import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MatchSnapshot, RoomState, TransitionEnvelope } from '@zamanushka/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthApi } from '../auth/api.js';
import { App } from '../app.js';
import type { ProfileApi } from '../profile/api.js';
import type { TelegramAdapter } from '../telegram/adapter.js';
import { RealtimeClientError, type RealtimeClient, type RealtimeSubscription } from './realtime-client.js';
import { RoomApiError, type RoomApi } from './room-api.js';

function transitionEnvelope(overrides: Record<string, unknown> = {}): TransitionEnvelope {
  return {
    matchId: 'match-1',
    transitionId: 'transition-1',
    actionId: 'action-1',
    stateVersion: 1,
    fromSequence: 1,
    toSequence: 1,
    events: [],
    watermark: { stateVersion: 1, lastSequence: 1 },
    snapshot: activeSnapshot({ stateVersion: 1, lastSequence: 1 }),
    ...overrides,
  } as TransitionEnvelope;
}

function adapter(): TelegramAdapter {
  return {
    isAvailable: false,
    isTelegram: false,
    initData: undefined,
    startParam: undefined,
    openTelegramLink: vi.fn(() => false),
    openLink: vi.fn(() => false),
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

function profileApi(profile = vi.fn()): ProfileApi {
  return {
    profile,
    history: vi.fn(),
  } as unknown as ProfileApi;
}

function roomState(overrides: Record<string, unknown> = {}): RoomState {
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
  } as RoomState;
}

function activeSnapshot(overrides: Record<string, unknown> = {}): MatchSnapshot {
  return {
    status: 'ACTIVE',
    stateVersion: 0,
    turnNumber: 1,
    turnPhase: 'WAITING_FOR_ROLL',
    currentPlayerId: 'user-1',
    diceValue: null,
    winnerPlayerId: null,
    winReason: null,
    startedAt: '2026-09-01T10:00:00.000Z',
    finishedAt: null,
    players: [
      { playerId: 'user-1', color: 'RED', seatIndex: 0, status: 'ACTIVE' },
      { playerId: 'user-2', color: 'YELLOW', seatIndex: 1, status: 'ACTIVE' },
    ],
    pawns: [
      {
        pawnId: 'user-1-pawn-1',
        playerId: 'user-1',
        color: 'RED',
        position: { zone: 'OFF_BOARD' },
      },
      {
        pawnId: 'user-1-pawn-2',
        playerId: 'user-1',
        color: 'RED',
        position: { zone: 'OFF_BOARD' },
      },
      {
        pawnId: 'user-1-pawn-3',
        playerId: 'user-1',
        color: 'RED',
        position: { zone: 'OFF_BOARD' },
      },
      {
        pawnId: 'user-1-pawn-4',
        playerId: 'user-1',
        color: 'RED',
        position: { zone: 'OFF_BOARD' },
      },
      {
        pawnId: 'user-2-pawn-1',
        playerId: 'user-2',
        color: 'YELLOW',
        position: { zone: 'OFF_BOARD' },
      },
      {
        pawnId: 'user-2-pawn-2',
        playerId: 'user-2',
        color: 'YELLOW',
        position: { zone: 'OFF_BOARD' },
      },
      {
        pawnId: 'user-2-pawn-3',
        playerId: 'user-2',
        color: 'YELLOW',
        position: { zone: 'OFF_BOARD' },
      },
      {
        pawnId: 'user-2-pawn-4',
        playerId: 'user-2',
        color: 'YELLOW',
        position: { zone: 'OFF_BOARD' },
      },
    ],
    lastSequence: 0,
    ...overrides,
  } as MatchSnapshot;
}

function activeRoom(overrides: Record<string, unknown> = {}) {
  return roomState({
    status: 'ACTIVE',
    currentMatchId: 'match-1',
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
      canLeave: false,
      canStart: false,
      startBlockedReason: 'Матч уже идёт.',
    },
    ...overrides,
  });
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
    deleteRoom: vi.fn(),
    setReady: vi.fn(),
    startMatch: vi.fn(),
    reconnect: vi.fn().mockResolvedValue(currentRoom),
    createInvite: vi.fn(),
    resolveInvite: vi.fn(),
    getChat: vi.fn().mockResolvedValue({ messages: [] }),
    sendChat: vi.fn().mockResolvedValue({
      id: 'message-1',
      roomId: 'room-1',
      userId: 'user-1',
      displayName: 'Алексей',
      text: 'Привет',
      createdAt: '2026-08-30T10:00:00.000Z',
    }),
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function renderAuthenticated(
  hash = '#/rooms',
  options?: { roomApi?: RoomApi; realtime?: RealtimeClient; profileApi?: ProfileApi },
) {
  window.location.hash = hash;
  const props = {
    ...(options?.roomApi ? { roomApi: options.roomApi } : {}),
    ...(options?.realtime ? { realtimeClient: options.realtime } : {}),
  };

  return render(
    <App
      createAdapter={adapter}
      api={authenticatedApi()}
      profileApi={options?.profileApi ?? profileApi()}
      {...props}
    />,
  );
}

function useMobileViewport() {
  vi.stubGlobal('innerWidth', 390);
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query === '(max-width: 768px)',
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}

afterEach(() => {
  window.location.hash = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('playable beta room flow', () => {
  it('renders the current Home entry point and only existing destinations', async () => {
    const currentProfile = profileApi(vi.fn().mockResolvedValue({
      user: {
        id: 'user-1',
        displayName: 'Алексей',
        telegramUsername: null,
        avatarUrl: null,
      },
      stats: { gamesPlayed: 5, wins: 2, losses: 3, winRate: 0.4 },
      recentResults: [],
    }));

    renderAuthenticated('#/', { profileApi: currentProfile });

    expect(await screen.findByRole('heading', { name: 'Готовы к партии?' })).toBeVisible();
    expect(screen.getByText('Алексей')).toBeVisible();
    expect(screen.getByRole('button', { name: /Найти игру/i })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Найти игру/i }));
    expect(window.location.hash).toBe('#/rooms');
    expect(screen.queryByText(/PRO|Рейтинг|Турнир|Быстрая игра/i)).not.toBeInTheDocument();
  });

  it('does not fabricate a current membership row on Home', async () => {
    const api = createRoomApi({
      listRooms: vi.fn().mockResolvedValue({
        rooms: [],
        currentMembershipRoom: {
          roomId: 'room-1',
          code: '248C',
          status: 'ACTIVE',
          version: 7,
          currentMatchId: 'match-1',
        },
      }),
    });

    renderAuthenticated('#/', { roomApi: api });

    expect(await screen.findByRole('heading', { name: 'Готовы к партии?' })).toBeVisible();
    expect(screen.getByText('У вас активна Комната 248C')).toBeVisible();
    expect(screen.getByRole('button', { name: /Продолжить/i })).toBeVisible();
  });

  it('renders the room list on #/rooms and opens a room through the canonical route', async () => {
    const api = createRoomApi();
    renderAuthenticated('#/rooms', { roomApi: api });

    expect(await screen.findByRole('heading', { name: 'Комнаты' })).toBeVisible();
    expect(await screen.findByText('Комната ABCD')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Открыть комнату ABCD' }));

    await waitFor(() => expect(window.location.hash).toBe('#/rooms/room-1'));
    expect(await screen.findByRole('heading', { name: 'Комната ABCD' })).toBeVisible();
    expect(api.reconnect).toHaveBeenCalledWith('room-1', expect.any(AbortSignal));
  });

  it('does not expose the raw room id in the room header when a canonical room code exists', async () => {
    const api = createRoomApi({
      reconnect: vi.fn().mockResolvedValue(roomState({ id: 'single-room', code: 'MAIN' })),
    });

    renderAuthenticated('#/rooms/single-room', { roomApi: api });

    expect(await screen.findByRole('heading', { name: 'Комната MAIN' })).toBeVisible();
    expect(screen.queryByText('Room single-room')).not.toBeInTheDocument();
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
    const seatedRoom = roomState({
      id: 'room-2',
      code: 'WXYZ',
      members: joinedRoom.members,
      seats: [
        { seatIndex: 0, userId: 'user-1', ready: false },
        { seatIndex: 1, userId: null, ready: false },
        { seatIndex: 2, userId: null, ready: false },
        { seatIndex: 3, userId: null, ready: false },
      ],
      counts: { memberCount: 1, seatedCount: 1, readyCount: 0 },
      currentUser: {
        isMember: true,
        seatIndex: 0,
        ready: false,
        canLeave: true,
        canStart: false,
        startBlockedReason: 'РќСѓР¶РЅРѕ РґРѕР¶РґР°С‚СЊСЃСЏ РёРіСЂРѕРєРѕРІ.',
      },
    });
    const api = createRoomApi({
      listRooms: vi.fn().mockResolvedValue({ rooms: [] }),
      createRoom: vi.fn().mockResolvedValue({ ok: true, room: createdRoom }),
      joinRoom: vi.fn().mockResolvedValue({ ok: true, room: joinedRoom }),
      takeSeat: vi.fn().mockResolvedValue({ ok: true, room: seatedRoom }),
      getRoom: vi.fn().mockResolvedValue(seatedRoom),
    });

    renderAuthenticated('#/rooms', { roomApi: api });

    fireEvent.click(await screen.findByRole('button', { name: 'Создать комнату' }));

    await waitFor(() => expect(api.createRoom).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(api.joinRoom).toHaveBeenCalledWith('room-2', expect.any(AbortSignal)),
    );
    await waitFor(() =>
      expect(api.takeSeat).toHaveBeenCalledWith('room-2', 0, joinedRoom.version, expect.any(AbortSignal)),
    );
    expect(await screen.findByRole('heading', { name: 'Комната WXYZ' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Покинуть место' })).toBeVisible();
  });

  it('keeps create and room navigation wired on the mobile rooms surface', async () => {
    useMobileViewport();
    const createdRoom = roomState({ id: 'room-2', code: 'WXYZ' });
    const api = createRoomApi({
      listRooms: vi.fn().mockResolvedValue({ rooms: [{
        id: 'room-1', code: 'ABCD', status: 'WAITING', version: 1, currentMatchId: null,
        counts: { memberCount: 1, seatedCount: 1, readyCount: 0 },
      }], currentMembershipRoom: null }),
      createRoom: vi.fn().mockResolvedValue({ ok: true, room: createdRoom }),
      joinRoom: vi.fn().mockResolvedValue({ ok: true, room: createdRoom }),
      getRoom: vi.fn().mockResolvedValue(createdRoom),
      reconnect: vi.fn().mockResolvedValue(createdRoom),
    });

    renderAuthenticated('#/rooms', { roomApi: api });
    await screen.findByText('Комната ABCD');
    fireEvent.click(screen.getByRole('button', { name: /Комната ABCD/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/rooms/room-1'));

    window.location.hash = '#/rooms';
    fireEvent.click(await screen.findByRole('button', { name: 'Создать комнату' }));
    await waitFor(() => expect(api.createRoom).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(api.joinRoom).toHaveBeenCalledWith('room-2', expect.any(AbortSignal)));
    await waitFor(() => expect(window.location.hash).toBe('#/rooms/room-2'));
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
      getRoom: vi
        .fn()
        .mockResolvedValueOnce(room)
        .mockResolvedValueOnce(refreshed)
        .mockResolvedValue(refreshed),
      reconnect: vi.fn().mockResolvedValue(room),
      setReady: vi.fn().mockResolvedValue({ ok: true, room: refreshed }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api });

    fireEvent.click(await screen.findByRole('button', { name: 'Готов' }));

    await waitFor(() =>
      expect(api.setReady).toHaveBeenCalledWith('room-1', true, 7, expect.any(AbortSignal)),
    );
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
      reconnect: vi.fn().mockResolvedValue(startRoom),
      startMatch: vi.fn().mockResolvedValue({
        ok: true,
        matchId: 'match-2',
        room: {
          ...startRoom,
          version: 5,
          status: 'ACTIVE',
          currentMatchId: 'match-2',
          currentUser: {
            ...startRoom.currentUser,
            canStart: false,
            startBlockedReason: 'Матч уже идёт.',
          },
        },
      }),
    });
    const realtime = createRealtimeClient();

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    const startButton = await screen.findByRole('button', { name: 'Начать матч' });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);

    await waitFor(() =>
      expect(api.startMatch).toHaveBeenCalledWith('room-1', 4, expect.any(AbortSignal)),
    );
    expect(realtime.ensureConnected).toHaveBeenCalled();
    expect(realtime.joinMatch).toHaveBeenCalledWith('match-2');
    expect(await screen.findByRole('heading', { name: 'Матч' })).toBeVisible();
    expect(document.querySelector('[data-layout="gameplay-three-column"]')).not.toBeNull();
    expect(document.querySelector('.game-board-scene')).not.toBeNull();
    expect(document.querySelector('.game-board-scene__room')).toBeNull();
    expect(document.querySelector('.game-board-scene__turn-card')).not.toBeNull();
    expect(document.querySelector('.game-board-scene__chat-card')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'О комнате' })).not.toBeInTheDocument();
    expect(document.querySelector('.beta-board')).toBeNull();
    expect(screen.queryByText(/match\/realtime/i)).toBeNull();
  });

  it('retries the initial match sync after a committed start instead of showing a transient unavailable state', async () => {
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
    const activeStartedRoom = {
      ...startRoom,
      version: 5,
      status: 'ACTIVE',
      currentMatchId: 'match-2',
      currentUser: {
        ...startRoom.currentUser,
        canStart: false,
        startBlockedReason: 'Матч уже идёт.',
      },
    } as RoomState;
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(startRoom),
      reconnect: vi.fn().mockResolvedValue(startRoom),
      startMatch: vi.fn().mockResolvedValue({
        ok: true,
        matchId: 'match-2',
        room: activeStartedRoom,
      }),
    });
    const realtime = createRealtimeClient({
      joinMatch: vi
        .fn()
        .mockRejectedValueOnce(new Error('MATCH_NOT_FOUND_TRANSIENT'))
        .mockResolvedValue(undefined),
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot(),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    const startButton = await screen.findByRole('button', { name: 'Начать матч' });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);

    await waitFor(() => expect(realtime.joinMatch).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { name: 'Матч' })).toBeVisible();
    expect(screen.queryByText('Не удалось подключить матч.')).not.toBeInTheDocument();
  });

  it('does not claim start-match ACK watermark before applying the initial snapshot', async () => {
    const startRoom = roomState({
      version: 4,
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
      counts: { memberCount: 2, seatedCount: 2, readyCount: 2 },
      currentUser: {
        isMember: true,
        seatIndex: 0,
        ready: true,
        canLeave: true,
        canStart: true,
        startBlockedReason: null,
      },
    });
    const activeStartedRoom = {
      ...startRoom,
      version: 5,
      status: 'ACTIVE',
      currentMatchId: 'match-canonical',
      currentUser: {
        ...startRoom.currentUser,
        canStart: false,
        startBlockedReason: 'Матч уже идёт.',
      },
    } as RoomState;
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(startRoom),
      reconnect: vi.fn().mockResolvedValue(startRoom),
      startMatch: vi.fn().mockResolvedValue({
        ok: true,
        matchId: 'match-canonical',
        status: 'ACTIVE',
        stateVersion: 3,
        lastSequence: 9,
        room: activeStartedRoom,
      }),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot({
          stateVersion: 3,
          lastSequence: 9,
        }),
        watermark: { stateVersion: 3, lastSequence: 9 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    const startButton = await screen.findByRole('button', { name: /Начать матч/ });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);

    await waitFor(() =>
      expect(realtime.sync).toHaveBeenCalledWith({
        matchId: 'match-canonical',
        stateVersion: 0,
        lastSequence: 0,
      }),
    );
  });
  it('reconstructs an already active match from initial sync with no local snapshot', async () => {
    const active = activeRoom({ currentMatchId: 'match-direct' });
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(active),
      reconnect: vi.fn().mockResolvedValue(active),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot({
          stateVersion: 5,
          lastSequence: 11,
        }),
        watermark: { stateVersion: 5, lastSequence: 11 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    await waitFor(() =>
      expect(realtime.sync).toHaveBeenCalledWith({
        matchId: 'match-direct',
        stateVersion: 0,
        lastSequence: 0,
      }),
    );
    expect(await screen.findByRole('heading', { name: /Матч/ })).toBeVisible();
  });

  it('shows the exact realtime join error code with clean UTF-8 copy', async () => {
    const active = activeRoom({ currentMatchId: 'match-denied' });
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(active),
      reconnect: vi.fn().mockResolvedValue(active),
    });
    const realtime = createRealtimeClient({
      joinMatch: vi
        .fn()
        .mockRejectedValue(new RealtimeClientError('MATCH_ACCESS_DENIED', 'match:join failed')),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    expect(await screen.findByText('Вы не участник этого матча. Код: MATCH_ACCESS_DENIED.')).toBeVisible();
    expect(screen.queryByText(new RegExp(`\\u0420\\u00A0\\u0421\\u045A|MATCH_JOIN_FAILED`))).not.toBeInTheDocument();
  });

  it('keeps server-committed dice events in the presentation rolling layer', async () => {
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom({ currentMatchId: 'match-presentation' })),
      reconnect: vi.fn().mockResolvedValue(activeRoom({ currentMatchId: 'match-presentation' })),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot({ stateVersion: 0, lastSequence: 0 }),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    expect(await screen.findByRole('heading', { name: /Матч/ })).toBeVisible();

    realtime.__emitTransition?.(
      transitionEnvelope({
        matchId: 'match-presentation',
        transitionId: 'dice-1',
        stateVersion: 1,
        fromSequence: 1,
        toSequence: 1,
        events: [
          {
            matchId: 'match-presentation',
            eventId: 'dice-event-1',
            sequence: 1,
            stateVersion: 1,
            type: 'diceRolled',
            payload: { playerId: 'user-1', diceValue: 6 },
            createdAt: '2026-09-01T10:00:01.000Z',
          },
        ],
        watermark: { stateVersion: 1, lastSequence: 1 },
        snapshot: activeSnapshot({
          stateVersion: 1,
          lastSequence: 1,
          turnPhase: 'WAITING_FOR_ACTION',
          diceValue: 6,
        }),
      }),
    );

    await waitFor(() => {
      expect(document.querySelector('.game-die--rolling')).not.toBeNull();
      expect(screen.getByLabelText('Кубик: 6')).toBeVisible();
    });
  });

  it('keeps server-committed pawn entry events in the board overlay animation layer', async () => {
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom({ currentMatchId: 'match-presentation' })),
      reconnect: vi.fn().mockResolvedValue(activeRoom({ currentMatchId: 'match-presentation' })),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot({
          stateVersion: 0,
          lastSequence: 0,
          turnPhase: 'WAITING_FOR_ACTION',
          diceValue: 6,
        }),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    expect(await screen.findByRole('heading', { name: /Матч/ })).toBeVisible();

    realtime.__emitTransition?.(
      transitionEnvelope({
        matchId: 'match-presentation',
        transitionId: 'enter-1',
        stateVersion: 1,
        fromSequence: 1,
        toSequence: 1,
        events: [
          {
            matchId: 'match-presentation',
            eventId: 'enter-event-1',
            sequence: 1,
            stateVersion: 1,
            type: 'pawnEntered',
            payload: {
              pawnId: 'user-1-pawn-1',
              playerId: 'user-1',
              toCoord: { row: 0, col: 0 },
            },
            createdAt: '2026-09-01T10:00:02.000Z',
          },
        ],
        watermark: { stateVersion: 1, lastSequence: 1 },
        snapshot: activeSnapshot({
          stateVersion: 1,
          lastSequence: 1,
          turnPhase: 'WAITING_FOR_ROLL',
          diceValue: null,
          pawns: activeSnapshot().pawns.map((pawn) =>
            pawn.pawnId === 'user-1-pawn-1'
              ? { ...pawn, position: { zone: 'PERIMETER', progress: 0 } }
              : pawn,
          ),
        }),
      }),
    );

    await waitFor(() => {
      expect(document.querySelector('.game-board-scene__overlay-pawn [data-pawn-id="user-1-pawn-1"]')).not.toBeNull();
      expect(document.querySelector('.game-pawn--motion-entering')).not.toBeNull();
    });
  });

  it('applies a realtime event that arrives while initial sync is in flight after the synced snapshot', async () => {
    const sync = deferred<{
      mode: 'snapshot';
      snapshot: MatchSnapshot;
      watermark: { stateVersion: number; lastSequence: number };
    }>();
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom({ currentMatchId: 'match-race' })),
      reconnect: vi.fn().mockResolvedValue(activeRoom({ currentMatchId: 'match-race' })),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockReturnValue(sync.promise),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    await waitFor(() =>
      expect(realtime.sync).toHaveBeenCalledWith({
        matchId: 'match-race',
        stateVersion: 0,
        lastSequence: 0,
      }),
    );

    realtime.__emitTransition?.(
      transitionEnvelope({
        matchId: 'match-race',
        transitionId: 'transition-6',
        stateVersion: 6,
        fromSequence: 6,
        toSequence: 6,
        watermark: { stateVersion: 6, lastSequence: 6 },
        snapshot: activeSnapshot({ stateVersion: 6, lastSequence: 6 }),
      }),
    );
    sync.resolve({
      mode: 'snapshot',
      snapshot: activeSnapshot({ stateVersion: 5, lastSequence: 5 }),
      watermark: { stateVersion: 5, lastSequence: 5 },
    });

    expect(await screen.findByRole('heading', { name: /Матч/ })).toBeVisible();

    realtime.__emitTransition?.(
      transitionEnvelope({
        matchId: 'match-race',
        transitionId: 'transition-7',
        stateVersion: 7,
        fromSequence: 7,
        toSequence: 7,
        watermark: { stateVersion: 7, lastSequence: 7 },
        snapshot: activeSnapshot({ stateVersion: 7, lastSequence: 7 }),
      }),
    );

    await waitFor(() => expect(realtime.sync).toHaveBeenCalledTimes(1));
  });

  it('discards a realtime event already represented by the initial sync snapshot', async () => {
    const sync = deferred<{
      mode: 'snapshot';
      snapshot: MatchSnapshot;
      watermark: { stateVersion: number; lastSequence: number };
    }>();
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom({ currentMatchId: 'match-race' })),
      reconnect: vi.fn().mockResolvedValue(activeRoom({ currentMatchId: 'match-race' })),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockReturnValue(sync.promise),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    await waitFor(() => expect(realtime.sync).toHaveBeenCalledTimes(1));
    realtime.__emitTransition?.(
      transitionEnvelope({
        matchId: 'match-race',
        transitionId: 'transition-5',
        stateVersion: 5,
        fromSequence: 5,
        toSequence: 5,
        watermark: { stateVersion: 5, lastSequence: 5 },
        snapshot: activeSnapshot({ stateVersion: 5, lastSequence: 5 }),
      }),
    );
    sync.resolve({
      mode: 'snapshot',
      snapshot: activeSnapshot({ stateVersion: 5, lastSequence: 5 }),
      watermark: { stateVersion: 5, lastSequence: 5 },
    });

    expect(await screen.findByRole('heading', { name: /Матч/ })).toBeVisible();

    realtime.__emitTransition?.(
      transitionEnvelope({
        matchId: 'match-race',
        transitionId: 'transition-6',
        stateVersion: 6,
        fromSequence: 6,
        toSequence: 6,
        watermark: { stateVersion: 6, lastSequence: 6 },
        snapshot: activeSnapshot({ stateVersion: 6, lastSequence: 6 }),
      }),
    );

    await waitFor(() => expect(realtime.sync).toHaveBeenCalledTimes(1));
  });

  it('triggers authoritative resync when a buffered realtime event has a sequence gap', async () => {
    const sync = deferred<{
      mode: 'snapshot';
      snapshot: MatchSnapshot;
      watermark: { stateVersion: number; lastSequence: number };
    }>();
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom({ currentMatchId: 'match-race' })),
      reconnect: vi.fn().mockResolvedValue(activeRoom({ currentMatchId: 'match-race' })),
    });
    const realtime = createRealtimeClient({
      sync: vi
        .fn()
        .mockReturnValueOnce(sync.promise)
        .mockResolvedValue({
          mode: 'snapshot',
          snapshot: activeSnapshot({ stateVersion: 7, lastSequence: 7 }),
          watermark: { stateVersion: 7, lastSequence: 7 },
        }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    await waitFor(() => expect(realtime.sync).toHaveBeenCalledTimes(1));
    realtime.__emitTransition?.(
      transitionEnvelope({
        matchId: 'match-race',
        transitionId: 'transition-7',
        stateVersion: 7,
        fromSequence: 7,
        toSequence: 7,
        watermark: { stateVersion: 7, lastSequence: 7 },
        snapshot: activeSnapshot({ stateVersion: 7, lastSequence: 7 }),
      }),
    );
    sync.resolve({
      mode: 'snapshot',
      snapshot: activeSnapshot({ stateVersion: 5, lastSequence: 5 }),
      watermark: { stateVersion: 5, lastSequence: 5 },
    });

    await waitFor(() =>
      expect(realtime.sync).toHaveBeenLastCalledWith({
        matchId: 'match-race',
        stateVersion: 5,
        lastSequence: 5,
      }),
    );
    expect(realtime.sync).toHaveBeenCalledTimes(2);
  });

  it('keeps authoritative resync single-flight when several sequence gaps arrive', async () => {
    const resync = deferred<{
      mode: 'snapshot';
      snapshot: MatchSnapshot;
      watermark: { stateVersion: number; lastSequence: number };
    }>();
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom({ currentMatchId: 'match-gap' })),
      reconnect: vi.fn().mockResolvedValue(activeRoom({ currentMatchId: 'match-gap' })),
    });
    const realtime = createRealtimeClient({
      sync: vi
        .fn()
        .mockResolvedValueOnce({
          mode: 'snapshot',
          snapshot: activeSnapshot({ stateVersion: 5, lastSequence: 5 }),
          watermark: { stateVersion: 5, lastSequence: 5 },
        })
        .mockReturnValue(resync.promise),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    expect(await screen.findByRole('heading', { name: /Матч/ })).toBeVisible();

    for (const sequence of [7, 8, 9]) {
      realtime.__emitTransition?.(
        transitionEnvelope({
          matchId: 'match-gap',
          transitionId: `transition-${sequence}`,
          stateVersion: sequence,
          fromSequence: sequence,
          toSequence: sequence,
          watermark: { stateVersion: sequence, lastSequence: sequence },
          snapshot: activeSnapshot({ stateVersion: sequence, lastSequence: sequence }),
        }),
      );
    }

    await waitFor(() => expect(realtime.sync).toHaveBeenCalledTimes(2));
  });

  it('applies a duplicate realtime event received during hydration only once', async () => {
    const sync = deferred<{
      mode: 'snapshot';
      snapshot: MatchSnapshot;
      watermark: { stateVersion: number; lastSequence: number };
    }>();
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom({ currentMatchId: 'match-duplicate' })),
      reconnect: vi.fn().mockResolvedValue(activeRoom({ currentMatchId: 'match-duplicate' })),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockReturnValue(sync.promise),
    });
    const transition = transitionEnvelope({
      matchId: 'match-duplicate',
      transitionId: 'transition-6',
      stateVersion: 6,
      fromSequence: 6,
      toSequence: 6,
      watermark: { stateVersion: 6, lastSequence: 6 },
      snapshot: activeSnapshot({ stateVersion: 6, lastSequence: 6 }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    await waitFor(() => expect(realtime.sync).toHaveBeenCalledTimes(1));
    realtime.__emitTransition?.(transition);
    realtime.__emitTransition?.(transition);
    sync.resolve({
      mode: 'snapshot',
      snapshot: activeSnapshot({ stateVersion: 5, lastSequence: 5 }),
      watermark: { stateVersion: 5, lastSequence: 5 },
    });

    expect(await screen.findByRole('heading', { name: /Матч/ })).toBeVisible();

    realtime.__emitTransition?.(
      transitionEnvelope({
        matchId: 'match-duplicate',
        transitionId: 'transition-7',
        stateVersion: 7,
        fromSequence: 7,
        toSequence: 7,
        watermark: { stateVersion: 7, lastSequence: 7 },
        snapshot: activeSnapshot({ stateVersion: 7, lastSequence: 7 }),
      }),
    );

    await waitFor(() => expect(realtime.sync).toHaveBeenCalledTimes(1));
  });

  it('does not let a later stale sync response roll the applied realtime watermark backwards', async () => {
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom({ currentMatchId: 'match-race' })),
      reconnect: vi.fn().mockResolvedValue(activeRoom({ currentMatchId: 'match-race' })),
    });
    const realtime = createRealtimeClient({
      sync: vi
        .fn()
        .mockResolvedValueOnce({
          mode: 'snapshot',
          snapshot: activeSnapshot({ stateVersion: 5, lastSequence: 5 }),
          watermark: { stateVersion: 5, lastSequence: 5 },
        })
        .mockResolvedValueOnce({
          mode: 'snapshot',
          snapshot: activeSnapshot({ stateVersion: 5, lastSequence: 5 }),
          watermark: { stateVersion: 5, lastSequence: 5 },
        }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    expect(await screen.findByRole('heading', { name: /Матч/ })).toBeVisible();
    realtime.__emitTransition?.(
      transitionEnvelope({
        matchId: 'match-race',
        transitionId: 'transition-6',
        stateVersion: 6,
        fromSequence: 6,
        toSequence: 6,
        watermark: { stateVersion: 6, lastSequence: 6 },
        snapshot: activeSnapshot({ stateVersion: 6, lastSequence: 6 }),
      }),
    );
    realtime.__emitTransition?.(
      transitionEnvelope({
        matchId: 'match-race',
        transitionId: 'transition-8',
        stateVersion: 8,
        fromSequence: 8,
        toSequence: 8,
        watermark: { stateVersion: 8, lastSequence: 8 },
        snapshot: activeSnapshot({ stateVersion: 8, lastSequence: 8 }),
      }),
    );

    await waitFor(() => expect(realtime.sync).toHaveBeenCalledTimes(2));

    realtime.__emitTransition?.(
      transitionEnvelope({
        matchId: 'match-race',
        transitionId: 'transition-7',
        stateVersion: 7,
        fromSequence: 7,
        toSequence: 7,
        watermark: { stateVersion: 7, lastSequence: 7 },
        snapshot: activeSnapshot({ stateVersion: 7, lastSequence: 7 }),
      }),
    );

    await waitFor(() => expect(realtime.sync).toHaveBeenCalledTimes(2));
  });

  it('shows an obvious roll action on my turn during WAITING_FOR_ROLL', async () => {
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom()),
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot(),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    expect(await screen.findByRole('button', { name: 'Бросить кубик' })).toBeVisible();
    expect(screen.getByText('Ваш ход')).toBeVisible();
    expect(screen.getByLabelText('Кубик: ожидание броска')).toBeVisible();
    expect(screen.getByText('Кубик ещё не брошен')).toBeVisible();
    expect(screen.getByRole('button', { name: /Правила игры/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /История ходов/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Настройки комнаты/ })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Чат комнаты' })).toBeVisible();
  });

  it('opens Rules, History, and Settings from real secondary gameplay controls', async () => {
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom()),
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot(),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    fireEvent.click(await screen.findByRole('button', { name: /Правила игры/ }));
    expect(await screen.findByText('ПРАВИЛА ИГРЫ')).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: /История ходов/ }));
    expect(await screen.findByText('История появится после первых событий матча.')).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: /Настройки комнаты/ }));
    expect(await screen.findByText('Код комнаты: ABCD')).toBeVisible();
    expect(document.querySelector('.beta-room-page__settings-panel')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Покинуть комнату' })).not.toBeInTheDocument();
  });

  it('renders compact live chat, disables an empty send, and shows the committed post immediately', async () => {
    const message = {
      id: 'message-2',
      roomId: 'room-1',
      userId: 'user-1',
      displayName: 'Алексей',
      text: 'Готов к игре',
      createdAt: '2026-08-30T10:00:00.000Z',
    };
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom()),
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
      getChat: vi.fn().mockResolvedValue({ messages: [] }),
      sendChat: vi.fn().mockResolvedValue(message),
    });
    const realtime = createRealtimeClient();

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    const input = await screen.findByPlaceholderText('Сообщение');
    const send = screen.getByRole('button', { name: 'Отправить' });
    expect(send).toBeDisabled();

    fireEvent.change(input, { target: { value: '  Готов к игре  ' } });
    expect(send).toBeEnabled();
    fireEvent.click(send);

    await waitFor(() =>
      expect(api.sendChat).toHaveBeenCalledWith('room-1', 'Готов к игре', expect.any(AbortSignal)),
    );
    expect(await screen.findByText('Готов к игре')).toBeVisible();
    expect(input).toHaveValue('');
  });

  it('does not surface raw room or turn error codes in the gameplay UI', async () => {
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom()),
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot({ currentPlayerId: 'user-2' }),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    await waitFor(() =>
      expect(document.querySelector('.game-board-scene__turn-card')).not.toBeNull(),
    );
    expect(screen.queryByText('ROOM_ALREADY_ACTIVE')).not.toBeInTheDocument();
    expect(screen.queryByText('NOT_CURRENT_PLAYER')).not.toBeInTheDocument();
  });

  it('maps an unavailable room response to Russian UI copy', async () => {
    const api = createRoomApi({
      reconnect: vi.fn().mockRejectedValue(new RoomApiError(409, 'ROOM_CLOSED', 'ROOM_CLOSED')),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api });

    expect(await screen.findByText('Эта комната сейчас недоступна.')).toBeVisible();
    expect(screen.queryByText('ROOM_CLOSED')).not.toBeInTheDocument();
  });

  it('does not render duplicate generic enter buttons and uses selectable pawns instead', async () => {
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom()),
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot({ turnPhase: 'WAITING_FOR_ACTION', diceValue: 6 }),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    await screen.findByRole('heading', { name: 'Матч' });
    expect(screen.queryAllByRole('button', { name: 'Вывести пешку' })).toHaveLength(0);
    expect(screen.getByText('Выберите пешку')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Вывести красную пешку на поле' })).toHaveLength(
      4,
    );
  });

  it('submits the selected pawn move with the canonical command payload', async () => {
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom()),
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot({
          turnPhase: 'WAITING_FOR_ACTION',
          diceValue: 3,
          pawns: [
            {
              pawnId: 'user-1-pawn-1',
              playerId: 'user-1',
              color: 'RED',
              position: { zone: 'PERIMETER', progress: 1 },
            },
            {
              pawnId: 'user-1-pawn-2',
              playerId: 'user-1',
              color: 'RED',
              position: { zone: 'OFF_BOARD' },
            },
            {
              pawnId: 'user-1-pawn-3',
              playerId: 'user-1',
              color: 'RED',
              position: { zone: 'OFF_BOARD' },
            },
            {
              pawnId: 'user-1-pawn-4',
              playerId: 'user-1',
              color: 'RED',
              position: { zone: 'OFF_BOARD' },
            },
            {
              pawnId: 'user-2-pawn-1',
              playerId: 'user-2',
              color: 'YELLOW',
              position: { zone: 'OFF_BOARD' },
            },
            {
              pawnId: 'user-2-pawn-2',
              playerId: 'user-2',
              color: 'YELLOW',
              position: { zone: 'OFF_BOARD' },
            },
            {
              pawnId: 'user-2-pawn-3',
              playerId: 'user-2',
              color: 'YELLOW',
              position: { zone: 'OFF_BOARD' },
            },
            {
              pawnId: 'user-2-pawn-4',
              playerId: 'user-2',
              color: 'YELLOW',
              position: { zone: 'OFF_BOARD' },
            },
          ],
        }),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
      sendCommand: vi.fn().mockResolvedValue({
        ok: true,
        matchId: 'match-1',
        snapshot: activeSnapshot({
          stateVersion: 1,
          turnPhase: 'WAITING_FOR_ROLL',
          diceValue: 3,
          lastSequence: 1,
          pawns: [
            {
              pawnId: 'user-1-pawn-1',
              playerId: 'user-1',
              color: 'RED',
              position: { zone: 'PERIMETER', progress: 4 },
            },
            {
              pawnId: 'user-1-pawn-2',
              playerId: 'user-1',
              color: 'RED',
              position: { zone: 'OFF_BOARD' },
            },
            {
              pawnId: 'user-1-pawn-3',
              playerId: 'user-1',
              color: 'RED',
              position: { zone: 'OFF_BOARD' },
            },
            {
              pawnId: 'user-1-pawn-4',
              playerId: 'user-1',
              color: 'RED',
              position: { zone: 'OFF_BOARD' },
            },
            {
              pawnId: 'user-2-pawn-1',
              playerId: 'user-2',
              color: 'YELLOW',
              position: { zone: 'OFF_BOARD' },
            },
            {
              pawnId: 'user-2-pawn-2',
              playerId: 'user-2',
              color: 'YELLOW',
              position: { zone: 'OFF_BOARD' },
            },
            {
              pawnId: 'user-2-pawn-3',
              playerId: 'user-2',
              color: 'YELLOW',
              position: { zone: 'OFF_BOARD' },
            },
            {
              pawnId: 'user-2-pawn-4',
              playerId: 'user-2',
              color: 'YELLOW',
              position: { zone: 'OFF_BOARD' },
            },
          ],
        }),
        lastSequence: 1,
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    const movePawn = await screen.findByRole('button', { name: 'Переместить красную пешку 1' });
    fireEvent.click(movePawn);

    await waitFor(() =>
      expect(realtime.sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'MOVE_PAWN',
          matchId: 'match-1',
          pawnId: 'user-1-pawn-1',
          expectedStateVersion: 0,
        }),
      ),
    );
  });

  it('prevents duplicate gameplay submissions while a command is pending', async () => {
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom()),
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
    });
    let resolveCommand: ((value: unknown) => void) | null = null;
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot(),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
      sendCommand: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCommand = resolve;
          }),
      ),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    const rollButton = await screen.findByRole('button', { name: 'Бросить кубик' });
    fireEvent.click(rollButton);
    fireEvent.click(rollButton);

    await waitFor(() => expect(realtime.sendCommand).toHaveBeenCalledTimes(1));
    expect(resolveCommand).not.toBeNull();
    resolveCommand!({
      ok: true,
      matchId: 'match-1',
      snapshot: activeSnapshot({
        stateVersion: 1,
        diceValue: 6,
        turnPhase: 'WAITING_FOR_ACTION',
        lastSequence: 1,
      }),
      lastSequence: 1,
    });
  });

  it('applies successful command ACK events without waiting for a socket echo', async () => {
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom()),
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
    });
    const ackSnapshot = activeSnapshot({
      stateVersion: 1,
      lastSequence: 1,
      turnPhase: 'WAITING_FOR_ACTION',
      diceValue: 6,
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot(),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
      sendCommand: vi.fn().mockResolvedValue({
        ok: true,
        matchId: 'match-1',
        actionId: 'roll-action-1',
        stateVersion: 1,
        lastSequence: 1,
        snapshot: ackSnapshot,
        events: [
          {
            matchId: 'match-1',
            eventId: 'roll-event-1',
            sequence: 1,
            stateVersion: 1,
            type: 'diceRolled',
            payload: { playerId: 'user-1', diceValue: 6 },
            createdAt: '2026-09-01T10:00:01.000Z',
          },
        ],
        ack: {
          actionId: 'roll-action-1',
          stateVersion: 1,
          lastSequence: 1,
        },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    const rollButton = await screen.findByRole('button', { name: /Бросить кубик/ });
    fireEvent.click(rollButton);

    await waitFor(() => {
      expect(document.querySelector('.game-die--rolling')).not.toBeNull();
      expect(screen.getByLabelText(/Кубик: 6/)).toBeVisible();
    });
  });

  it('shows the finished match state with a return-to-room action instead of gameplay controls', async () => {
    const api = createRoomApi({
      getRoom: vi
        .fn()
        .mockResolvedValueOnce(activeRoom())
        .mockResolvedValueOnce(
          roomState({ version: 2, counts: { memberCount: 2, seatedCount: 0, readyCount: 0 } }),
        )
        .mockResolvedValue(
          roomState({ version: 2, counts: { memberCount: 2, seatedCount: 0, readyCount: 0 } }),
        ),
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot({
          status: 'FINISHED',
          currentPlayerId: null,
          winnerPlayerId: 'user-1',
          winReason: 'HOME_DIAGONAL_COMPLETED',
          startedAt: '2026-09-01T10:00:00.000Z',
          finishedAt: '2026-09-01T10:18:42.000Z',
        }),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    expect(await screen.findByText('Матч завершён')).toBeVisible();
    expect(screen.getByText('Алексей Ты победил(а)! Время игры 18:42')).toBeVisible();
    expect(screen.queryByText('Все 4 пешки дома.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вернуться в комнату' })).toBeVisible();
    expect(screen.queryAllByRole('button', { name: 'Бросить кубик' })).toHaveLength(0);
  });

  it('shows the winner summary without a personal victory claim to a losing player', async () => {
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom()),
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot({
          status: 'FINISHED',
          currentPlayerId: null,
          winnerPlayerId: 'user-2',
          winReason: 'LAST_ACTIVE_PLAYER',
          startedAt: '2026-09-01T10:00:00.000Z',
          finishedAt: '2026-09-01T10:18:42.000Z',
        }),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    expect(await screen.findByText('Победитель — Таисия. Время игры 18:42')).toBeVisible();
    expect(screen.queryByText(/Ты победил\(а\)!/)).not.toBeInTheDocument();
    expect(screen.queryByText('Соперники выбыли из матча.')).not.toBeInTheDocument();
  });

  it('shows elapsed time instead of the user-facing move number during an active match', async () => {
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom()),
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot({ startedAt: '2026-09-01T10:00:00.000Z' }),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    expect(await screen.findByText(/^Время (?:\d{2}:\d{2}|\d+:\d{2}:\d{2})$/)).toBeVisible();
    expect(screen.queryByText(/^Ход #/)).not.toBeInTheDocument();
  });

  it('renders an explicit die face for waiting-to-roll and committed dice states', async () => {
    const waitingApi = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom()),
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
    });
    const waitingRealtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot(),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
    });

    const waitingView = renderAuthenticated('#/rooms/room-1', {
      roomApi: waitingApi,
      realtime: waitingRealtime,
    });

    expect(await screen.findByLabelText('Кубик: ожидание броска')).toBeVisible();

    waitingView.unmount();

    const rolledApi = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom()),
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
    });
    const rolledRealtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot({ turnPhase: 'WAITING_FOR_ACTION', diceValue: 6 }),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: rolledApi, realtime: rolledRealtime });

    expect(await screen.findByLabelText('Кубик: 6')).toBeVisible();
    expect(document.querySelectorAll('.game-die__pip.is-on')).toHaveLength(6);
  });

  it('asks for surrender confirmation before sending the canonical command', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom()),
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot({ turnPhase: 'WAITING_FOR_ACTION', diceValue: 6 }),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
      sendCommand: vi.fn(),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    fireEvent.click(await screen.findByRole('button', { name: 'Сдаться' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(realtime.sendCommand).not.toHaveBeenCalled();
  });

  it('uses the current mobile gameplay controls without exposing the reserve tray', async () => {
    useMobileViewport();
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom()),
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot(),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    expect(await screen.findByRole('grid', { name: 'Игровое поле' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Бросить кубик' })).toBeVisible();
    expect(screen.queryByLabelText('Ваши пешки')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Чат/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /^История$/ })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ещё' }));
    expect(screen.getByRole('menuitem', { name: /Правила игры/ })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /Настройки комнаты/ })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Сдаться' })).toBeVisible();

    fireEvent.click(screen.getByRole('menuitem', { name: /Правила игры/ }));
    expect(await screen.findByRole('dialog', { name: 'Правила игры' })).toBeVisible();
    expect(screen.getByRole('grid', { name: 'Игровое поле' })).toBeVisible();
  });

  it('keeps the reserve tray hidden for a legal 1-5 board move on mobile', async () => {
    useMobileViewport();
    const snapshot = activeSnapshot({
      turnPhase: 'WAITING_FOR_ACTION',
      diceValue: 4,
      pawns: activeSnapshot().pawns.map((pawn, index) =>
        index === 0 ? { ...pawn, position: { zone: 'PERIMETER', progress: 0 } } : pawn,
      ),
    });
    const api = createRoomApi({
      getRoom: vi.fn().mockResolvedValue(activeRoom()),
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot,
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });

    expect(await screen.findByText('Выпало: 4')).toBeVisible();
    expect(screen.queryByLabelText('Ваши пешки')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Переместить красную пешку 1/ })).toBeVisible();
  });

  it('shows a short russian room error instead of internal invalid response text', async () => {
    const api = createRoomApi({
      reconnect: vi.fn().mockRejectedValue(new RoomApiError(500, 'INVALID_RESPONSE')),
      getRoom: vi.fn().mockResolvedValue(roomState()),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api });

    expect(await screen.findByText('Не удалось подключиться к комнате.')).toBeVisible();
    expect(screen.queryByText('Загрузка комнаты…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Начать матч/ })).toBeDisabled();
    expect(screen.queryByText('Не удалось обработать ответ комнаты.')).not.toBeInTheDocument();
  });

  it('clears a finished presentation and reloads the current room after returning', async () => {
    const waitingRoom = roomState({
      version: 8,
      counts: { memberCount: 2, seatedCount: 0, readyCount: 0 },
    });
    const api = createRoomApi({
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
      getRoom: vi.fn().mockResolvedValue(waitingRoom),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot({
          status: 'FINISHED',
          currentPlayerId: null,
          winnerPlayerId: 'user-1',
          winReason: 'LAST_ACTIVE_PLAYER',
        }),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });
    fireEvent.click(await screen.findByTestId('return-to-room'));

    await waitFor(() => expect(api.getRoom).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Игроков: 0 / 4')).toBeVisible();
    expect(screen.queryByTestId('return-to-room')).not.toBeInTheDocument();
  });

  it('does not let a late Room A response overwrite the current Room B route', async () => {
    const roomA = deferred<Awaited<ReturnType<RoomApi['reconnect']>>>();
    const roomB = roomState({ id: 'room-2', code: 'WXYZ' }) as Awaited<
      ReturnType<RoomApi['reconnect']>
    >;
    const api = createRoomApi({
      reconnect: vi.fn((roomId: string) =>
        roomId === 'room-1' ? roomA.promise : Promise.resolve(roomB),
      ),
      getRoom: vi.fn(),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api });
    await waitFor(() =>
      expect(api.reconnect).toHaveBeenCalledWith('room-1', expect.any(AbortSignal)),
    );

    window.location.hash = '#/rooms/room-2';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('heading', { name: 'Комната WXYZ' })).toBeVisible();

    roomA.resolve(
      roomState({ id: 'room-1', code: 'ABCD' }) as Awaited<ReturnType<RoomApi['reconnect']>>,
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Комната WXYZ' })).toBeVisible(),
    );
    expect(screen.queryByRole('heading', { name: 'Комната ABCD' })).not.toBeInTheDocument();
  });

  it('does not let a late rooms-list membership projection from Room A replace Room B context', async () => {
    const listA = deferred<Awaited<ReturnType<RoomApi['listRooms']>>>();
    const roomB = roomState({
      id: 'room-2',
      code: 'WXYZ',
      currentUser: {
        ...roomState().currentUser,
        isMember: false,
        seatIndex: null,
        canLeave: false,
      },
    });
    const api = createRoomApi({
      reconnect: vi.fn((roomId: string) =>
        Promise.resolve(roomId === 'room-1' ? roomState() : roomB),
      ),
      listRooms: vi
        .fn()
        .mockImplementationOnce(() => listA.promise)
        .mockResolvedValueOnce({ rooms: [], currentMembershipRoom: null }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api });
    await waitFor(() => expect(api.listRooms).toHaveBeenCalledTimes(1));

    window.location.hash = '#/rooms/room-2';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('heading', { name: 'Комната WXYZ' })).toBeVisible();
    await waitFor(() => expect(api.listRooms).toHaveBeenCalledTimes(2));

    listA.resolve({
      rooms: [],
      currentMembershipRoom: {
        roomId: 'room-1',
        code: 'ABCD',
        status: 'WAITING',
        version: 1,
        currentMatchId: null,
      },
    });

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Комната WXYZ' })).toBeVisible(),
    );
    expect(screen.queryByText('Вы уже находитесь в комнате ABCD.')).not.toBeInTheDocument();
  });

  it('keeps Room B chat when an aborted Room A chat request resolves late', async () => {
    const chatA = deferred<Awaited<ReturnType<RoomApi['getChat']>>>();
    const roomA = activeRoom({ id: 'room-1', code: 'ABCD', currentMatchId: 'match-1' });
    const roomB = activeRoom({ id: 'room-2', code: 'WXYZ', currentMatchId: 'match-2' });
    const api = createRoomApi({
      reconnect: vi.fn((roomId: string) => Promise.resolve(roomId === 'room-1' ? roomA : roomB)),
      getChat: vi.fn((roomId: string) =>
        roomId === 'room-1'
          ? chatA.promise
          : Promise.resolve({
              messages: [
                {
                  id: 'message-b',
                  roomId: 'room-2',
                  userId: 'user-2',
                  displayName: 'Таисия',
                  text: 'Сообщение B',
                  createdAt: '2026-09-02T10:00:00.000Z',
                },
              ],
            }),
      ),
    });
    const realtime = createRealtimeClient();

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });
    await waitFor(() => expect(api.getChat).toHaveBeenCalledWith('room-1', expect.any(AbortSignal)));

    window.location.hash = '#/rooms/room-2';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByText('Сообщение B')).toBeVisible();

    chatA.resolve({
      messages: [
        {
          id: 'message-a',
          roomId: 'room-1',
          userId: 'user-1',
          displayName: 'Алексей',
          text: 'Сообщение A',
          createdAt: '2026-09-02T10:00:00.000Z',
        },
      ],
    });

    await waitFor(() => expect(screen.getByText('Сообщение B')).toBeVisible());
    expect(screen.queryByText('Сообщение A')).not.toBeInTheDocument();
  });

  it('ignores a late Match A realtime transition after Match B becomes current', async () => {
    const roomA = activeRoom({ id: 'room-1', code: 'ABCD', currentMatchId: 'match-1' });
    const roomB = activeRoom({ id: 'room-2', code: 'WXYZ', currentMatchId: 'match-2' });
    const api = createRoomApi({
      reconnect: vi.fn((roomId: string) => Promise.resolve(roomId === 'room-1' ? roomA : roomB)),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn((request) =>
        Promise.resolve({
          mode: 'snapshot' as const,
          snapshot: activeSnapshot({ diceValue: request.matchId === 'match-1' ? 6 : 3 }),
          watermark: { stateVersion: 0, lastSequence: 0 },
        }),
      ),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });
    expect(await screen.findByText('Выпало: 6')).toBeVisible();

    window.location.hash = '#/rooms/room-2';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByText('Выпало: 3')).toBeVisible();

    realtime.__emitTransition?.(
      transitionEnvelope({
        matchId: 'match-1',
        snapshot: activeSnapshot({ diceValue: 1 }),
      }),
    );

    await waitFor(() => expect(screen.getByText('Выпало: 3')).toBeVisible());
    expect(screen.queryByText('Выпало: 1')).not.toBeInTheDocument();
  });

  it('keeps Room B displayed while current membership identifies Room A', async () => {
    const roomB = roomState({ id: 'room-2', code: 'WXYZ', currentUser: { ...roomState().currentUser, isMember: false, seatIndex: null, canLeave: false } });
    const api = createRoomApi({
      reconnect: vi.fn().mockResolvedValue(roomB),
      listRooms: vi.fn().mockResolvedValue({
        rooms: [],
        currentMembershipRoom: {
          roomId: 'room-1',
          code: 'ABCD',
          status: 'WAITING',
          version: 7,
          currentMatchId: null,
        },
      }),
    });

    renderAuthenticated('#/rooms/room-2', { roomApi: api });

    expect(await screen.findByRole('heading', { name: 'Комната WXYZ' })).toBeVisible();
    expect(await screen.findByText('Вы уже находитесь в комнате ABCD.')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Комната ABCD' })).not.toBeInTheDocument();
    expect(screen.queryByText('USER_ALREADY_IN_ANOTHER_ROOM')).not.toBeInTheDocument();
  });

  it('does not join Room B when leaving the fresh Room A membership fails', async () => {
    const source = roomState({ id: 'room-1', code: 'ABCD', version: 14 });
    const target = roomState({ id: 'room-2', code: 'WXYZ', currentUser: { ...roomState().currentUser, isMember: false, seatIndex: null, canLeave: false } });
    const api = createRoomApi({
      reconnect: vi.fn().mockResolvedValue(target),
      listRooms: vi.fn().mockResolvedValue({ rooms: [], currentMembershipRoom: { roomId: 'room-1', code: 'ABCD', status: 'WAITING', version: 10, currentMatchId: null } }),
      getRoom: vi.fn().mockResolvedValue(source),
      leaveRoom: vi.fn().mockRejectedValue(new RoomApiError(409, 'STALE_ROOM_VERSION', 'STALE_ROOM_VERSION')),
      joinRoom: vi.fn(),
    });
    renderAuthenticated('#/rooms/room-2', { roomApi: api });
    fireEvent.click(await screen.findByRole('button', { name: 'Покинуть её и войти сюда' }));
    await waitFor(() => expect(api.leaveRoom).toHaveBeenCalledWith('room-1', 14, expect.any(AbortSignal)));
    expect(api.joinRoom).not.toHaveBeenCalled();
    expect(screen.queryByText('STALE_ROOM_VERSION')).not.toBeInTheDocument();
  });

  it('blocks a switch when the fresh source room became active', async () => {
    const active = activeRoom({ id: 'room-1', code: 'ABCD' });
    const target = roomState({ id: 'room-2', code: 'WXYZ', currentUser: { ...roomState().currentUser, isMember: false, seatIndex: null, canLeave: false } });
    const api = createRoomApi({
      reconnect: vi.fn().mockResolvedValue(target),
      listRooms: vi.fn().mockResolvedValue({ rooms: [], currentMembershipRoom: { roomId: 'room-1', code: 'ABCD', status: 'WAITING', version: 10, currentMatchId: null } }),
      getRoom: vi.fn().mockResolvedValue(active), leaveRoom: vi.fn(), joinRoom: vi.fn(),
    });
    renderAuthenticated('#/rooms/room-2', { roomApi: api });
    fireEvent.click(await screen.findByRole('button', { name: 'Покинуть её и войти сюда' }));
    expect(await screen.findByRole('button', { name: 'Вернуться в матч' })).toBeVisible();
    expect(api.leaveRoom).not.toHaveBeenCalled();
    expect(api.joinRoom).not.toHaveBeenCalled();
  });

  it('offers return to the authoritative active Room A without leaving or joining Room B', async () => {
    const target = roomState({ id: 'room-2', code: 'WXYZ', currentUser: { ...roomState().currentUser, isMember: false, seatIndex: null, canLeave: false } });
    const api = createRoomApi({
      reconnect: vi.fn().mockResolvedValue(target),
      listRooms: vi.fn().mockResolvedValue({ rooms: [], currentMembershipRoom: { roomId: 'room-1', code: 'ABCD', status: 'ACTIVE', version: 11, currentMatchId: 'match-1' } }),
      leaveRoom: vi.fn(), joinRoom: vi.fn(),
    });
    renderAuthenticated('#/rooms/room-2', { roomApi: api });
    expect(await screen.findByText('У вас идёт активный матч в другой комнате.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Вернуться в матч' }));
    expect(window.location.hash).toBe('#/rooms/room-1');
    expect(api.leaveRoom).not.toHaveBeenCalled();
    expect(api.joinRoom).not.toHaveBeenCalled();
  });

  it('leaves a terminally reset room with the freshly loaded room version', async () => {
    const resetRoom = roomState({
      version: 8,
      counts: { memberCount: 2, seatedCount: 0, readyCount: 0 },
    });
    const api = createRoomApi({
      reconnect: vi.fn().mockResolvedValue(resetRoom),
      getRoom: vi.fn().mockResolvedValue(resetRoom),
      leaveRoom: vi.fn().mockResolvedValue({ ok: true, room: resetRoom }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api });
    fireEvent.click(await screen.findByRole('button', { name: 'Покинуть комнату' }));

    await waitFor(() =>
      expect(api.leaveRoom).toHaveBeenCalledWith('room-1', 8, expect.any(AbortSignal)),
    );
    expect(await screen.findByRole('heading', { name: 'Комнаты' })).toBeVisible();
  });

  it('opens settings for the authoritative room after leaving a finished match', async () => {
    const waitingRoom = roomState({
      version: 8,
      counts: { memberCount: 2, seatedCount: 0, readyCount: 0 },
    });
    const api = createRoomApi({
      reconnect: vi.fn().mockResolvedValue(activeRoom()),
      getRoom: vi.fn().mockResolvedValue(waitingRoom),
    });
    const realtime = createRealtimeClient({
      sync: vi.fn().mockResolvedValue({
        mode: 'snapshot',
        snapshot: activeSnapshot({
          status: 'FINISHED',
          currentPlayerId: null,
          winnerPlayerId: 'user-1',
          winReason: 'LAST_ACTIVE_PLAYER',
        }),
        watermark: { stateVersion: 0, lastSequence: 0 },
      }),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api, realtime });
    fireEvent.click(await screen.findByTestId('return-to-room'));
    await screen.findByText('Игроков: 0 / 4');
    fireEvent.click(screen.getByRole('button', { name: /Настройки комнаты/ }));

    expect(await screen.findByText('Код комнаты: ABCD')).toBeVisible();
    expect(screen.queryByTestId('return-to-room')).not.toBeInTheDocument();
  });
});
