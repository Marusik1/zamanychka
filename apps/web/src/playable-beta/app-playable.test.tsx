import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthApi } from '../auth/api.js';
import { App } from '../app.js';
import type { ProfileApi } from '../profile/api.js';
import type { TelegramAdapter } from '../telegram/adapter.js';
import type { RealtimeClient, RealtimeSubscription } from './realtime-client.js';
import { RoomApiError, type RoomApi } from './room-api.js';

function transitionEnvelope(overrides: Record<string, unknown> = {}) {
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
  };
}

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
  };
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
    setReady: vi.fn(),
    startMatch: vi.fn(),
    reconnect: vi.fn().mockResolvedValue(currentRoom),
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
  options?: { roomApi?: RoomApi; realtime?: RealtimeClient },
) {
  window.location.hash = hash;
  const props = {
    ...(options?.roomApi ? { roomApi: options.roomApi } : {}),
    ...(options?.realtime ? { realtimeClient: options.realtime } : {}),
  };

  return render(
    <App createAdapter={adapter} api={authenticatedApi()} profileApi={profileApi()} {...props} />,
  );
}

afterEach(() => {
  window.location.hash = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('playable beta room flow', () => {
  it('renders the room list on #/rooms and opens a room through the canonical route', async () => {
    const api = createRoomApi();
    renderAuthenticated('#/rooms', { roomApi: api });

    expect(await screen.findByRole('heading', { name: 'Комнаты' })).toBeVisible();
    expect(await screen.findByText('Комната ABCD')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Открыть комнату' }));

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
    const api = createRoomApi({
      listRooms: vi.fn().mockResolvedValue({ rooms: [] }),
      createRoom: vi.fn().mockResolvedValue({ ok: true, room: createdRoom }),
      joinRoom: vi.fn().mockResolvedValue({ ok: true, room: joinedRoom }),
      getRoom: vi.fn().mockResolvedValue(joinedRoom),
    });

    renderAuthenticated('#/rooms', { roomApi: api });

    fireEvent.click(await screen.findByRole('button', { name: 'Создать комнату' }));

    await waitFor(() => expect(api.createRoom).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(api.joinRoom).toHaveBeenCalledWith('room-2', expect.any(AbortSignal)),
    );
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
    expect(document.querySelector('.game-board-scene__room')).not.toBeNull();
    expect(document.querySelector('.game-board-scene__turn-card')).not.toBeNull();
    expect(document.querySelector('.game-board-scene__chat-card')).not.toBeNull();
    expect(document.querySelector('.beta-board')).toBeNull();
    expect(screen.queryByText(/match\/realtime/i)).toBeNull();
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
    expect(screen.getByRole('heading', { name: 'Игроки' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Чат комнаты' })).toBeVisible();
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

    expect(
      await screen.findAllByText((content) => content.toLowerCase().includes('соперник')),
    ).not.toHaveLength(0);
    expect(
      screen.queryAllByText((content) => content.toLowerCase().includes('соперник')).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('ROOM_ALREADY_ACTIVE')).not.toBeInTheDocument();
    expect(screen.queryByText('NOT_CURRENT_PLAYER')).not.toBeInTheDocument();
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

  it('shows a short russian room error instead of internal invalid response text', async () => {
    const api = createRoomApi({
      reconnect: vi.fn().mockRejectedValue(new RoomApiError(500, 'INVALID_RESPONSE')),
      getRoom: vi.fn().mockResolvedValue(roomState()),
    });

    renderAuthenticated('#/rooms/room-1', { roomApi: api });

    expect(await screen.findByText('Не удалось подключиться к комнате.')).toBeVisible();
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
    fireEvent.click(screen.getByRole('button', { name: '⚙ Настройки комнаты' }));

    expect(await screen.findByText('Код комнаты: ABCD')).toBeVisible();
    expect(screen.queryByTestId('return-to-room')).not.toBeInTheDocument();
  });
});
