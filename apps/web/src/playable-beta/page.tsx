import {
  getLegalActions,
  resolvePawnCoordinate,
  type BoardCoord,
  type GameState,
  type LegalAction,
} from '@zamanushka/game-engine';
import type { MatchSnapshot, RoomState, TransitionEnvelope } from '@zamanushka/shared';
import { Button, EmptyState, Panel } from '@zamanushka/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AuthState } from '../auth/bootstrap.js';
import type { RealtimeClient } from './realtime-client.js';
import type { RoomApi, RoomApiError } from './room-api.js';

type Variant = 'home' | 'rooms';

interface PlayableBetaPageProps {
  variant: Variant;
  authState: Extract<AuthState, { status: 'AUTHENTICATED' }>;
  routeHash: string;
  roomApi: RoomApi;
  realtimeClient: RealtimeClient;
}

type MatchViewState =
  | { status: 'idle' | 'loading' }
  | {
      status: 'ready';
      matchId: string;
      snapshot: MatchSnapshot;
      lastSequence: number;
      error: string | null;
      pending: boolean;
    }
  | { status: 'error'; message: string };

const seatLabels = ['Место 1', 'Место 2', 'Место 3', 'Место 4'] as const;
const colorLabels = {
  RED: 'Красные',
  BLUE: 'Синие',
  GREEN: 'Зелёные',
  YELLOW: 'Жёлтые',
} as const;

function seatLabel(index: 0 | 1 | 2 | 3) {
  return seatLabels[index];
}

function boardKey(coord: BoardCoord) {
  return `${coord.row}:${coord.col}`;
}

function roomRoute(roomId: string) {
  return `#/rooms/${roomId}`;
}

function navigateTo(hash: string) {
  if (window.location.hash === hash) return;
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function parseRoomId(hash: string) {
  const match = /^#\/rooms\/([^/?#]+)/.exec(hash);
  return match?.[1] ?? null;
}

function roomErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as RoomApiError).message === 'string'
  ) {
    return (error as RoomApiError).message;
  }

  return fallback;
}

function buildCellOccupants(snapshot: MatchSnapshot) {
  const players = new Map(snapshot.players.map((player) => [player.playerId, player]));
  const occupied = new Map<string, typeof snapshot.pawns>();

  for (const pawn of snapshot.pawns) {
    const owner = players.get(pawn.playerId);
    if (!owner) continue;

    const coord = resolvePawnCoordinate(pawn.position, owner);
    if (!coord) continue;

    const key = boardKey(coord);
    occupied.set(key, [...(occupied.get(key) ?? []), pawn]);
  }

  return occupied;
}

function actionLabel(action: LegalAction) {
  switch (action.type) {
    case 'ROLL_DICE':
      return 'Бросить кубик';
    case 'SURRENDER':
      return 'Сдаться';
    case 'ENTER_PAWN':
      return 'Вывести пешку';
    case 'MOVE_PAWN':
      return `Ход ${action.pawnId.split('-').at(-1) ?? 'пешкой'}`;
  }
}

function commandFromAction(action: LegalAction, matchId: string, expectedStateVersion: number) {
  const actionId = crypto.randomUUID();

  switch (action.type) {
    case 'ROLL_DICE':
      return { type: 'ROLL_DICE', matchId, actionId, expectedStateVersion } as const;
    case 'SURRENDER':
      return { type: 'SURRENDER', matchId, actionId, expectedStateVersion } as const;
    case 'ENTER_PAWN':
      return {
        type: 'ENTER_PAWN',
        matchId,
        pawnId: action.pawnId,
        actionId,
        expectedStateVersion,
      } as const;
    case 'MOVE_PAWN':
      return {
        type: 'MOVE_PAWN',
        matchId,
        pawnId: action.pawnId,
        actionId,
        expectedStateVersion,
      } as const;
  }
}

export function PlayableBetaPage({
  variant,
  authState,
  routeHash,
  roomApi,
  realtimeClient,
}: PlayableBetaPageProps) {
  const selectedRoomId = variant === 'rooms' ? parseRoomId(routeHash) : null;
  const [roomList, setRoomList] = useState<Awaited<ReturnType<RoomApi['listRooms']>>['rooms']>([]);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [roomPending, setRoomPending] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchViewState>({ status: 'idle' });
  const activeMatchRef = useRef<string | null>(null);

  const loadRoomList = useCallback(
    async (signal?: AbortSignal) => {
      const next = await roomApi.listRooms(signal);
      setRoomList(next.rooms);
      setRoomError(null);
      return next.rooms;
    },
    [roomApi],
  );

  const loadRoom = useCallback(
    async (roomId: string, signal?: AbortSignal) => {
      const next = await roomApi.getRoom(roomId, signal);
      setRoom(next);
      setRoomError(null);
      return next;
    },
    [roomApi],
  );

  const refreshRoom = useCallback(
    async (roomId: string, signal?: AbortSignal) => {
      setRoomPending(true);

      try {
        return await loadRoom(roomId, signal);
      } catch (error) {
        setRoomError(roomErrorMessage(error, 'Не удалось загрузить комнату.'));
        return null;
      } finally {
        setRoomPending(false);
      }
    },
    [loadRoom],
  );

  const syncMatch = useCallback(
    async (matchId: string, stateVersion = 0, lastSequence = 0) => {
      setMatch((current) =>
        current.status === 'ready'
          ? { ...current, pending: true, error: null }
          : { status: 'loading' },
      );

      try {
        await realtimeClient.ensureConnected();
        await realtimeClient.joinMatch(matchId);
        const response = await realtimeClient.sync({ matchId, stateVersion, lastSequence });

        if (response.mode === 'events') {
          const latest = response.transitions.at(-1);
          if (!latest) throw new Error('SYNC_EMPTY_EVENTS');

          setMatch({
            status: 'ready',
            matchId,
            snapshot: latest.snapshot,
            lastSequence: latest.toSequence,
            error: null,
            pending: false,
          });
          return;
        }

        setMatch({
          status: 'ready',
          matchId,
          snapshot: response.snapshot,
          lastSequence: response.watermark.lastSequence,
          error: null,
          pending: false,
        });
      } catch {
        setMatch({ status: 'error', message: 'Не удалось подключить матч.' });
      }
    },
    [realtimeClient],
  );

  useEffect(() => {
    if (variant !== 'rooms') return;

    const controller = new AbortController();

    if (selectedRoomId) {
      void roomApi
        .reconnect(selectedRoomId, controller.signal)
        .then((next) => {
          setRoom(next);
          setRoomError(null);
        })
        .catch((error) => {
          setRoomError(roomErrorMessage(error, 'Не удалось подключиться к комнате.'));
        });
    } else {
      void loadRoomList(controller.signal).catch((error) => {
        setRoomError(roomErrorMessage(error, 'Не удалось загрузить список комнат.'));
      });
    }

    return () => controller.abort();
  }, [loadRoomList, roomApi, selectedRoomId, variant]);

  useEffect(() => {
    if (variant !== 'rooms') return;

    const intervalId = window.setInterval(() => {
      const controller = new AbortController();

      if (selectedRoomId && !room?.currentMatchId) {
        void roomApi
          .getRoom(selectedRoomId, controller.signal)
          .then((next) => {
            setRoom(next);
            setRoomError(null);
          })
          .catch(() => undefined);
        return;
      }

      if (!selectedRoomId) {
        void roomApi
          .listRooms(controller.signal)
          .then((next) => {
            setRoomList(next.rooms);
            setRoomError(null);
          })
          .catch(() => undefined);
      }
    }, 2_000);

    return () => window.clearInterval(intervalId);
  }, [room?.currentMatchId, roomApi, selectedRoomId, variant]);

  useEffect(() => {
    if (!room?.currentMatchId) {
      activeMatchRef.current = null;
      setMatch({ status: 'idle' });
      return;
    }

    if (activeMatchRef.current === room.currentMatchId) return;

    activeMatchRef.current = room.currentMatchId;
    void syncMatch(room.currentMatchId);
  }, [room?.currentMatchId, syncMatch]);

  useEffect(() => {
    return realtimeClient.subscribe((transition: TransitionEnvelope) => {
      setMatch((current) => {
        if (current.status !== 'ready' || current.matchId !== transition.matchId) {
          return current;
        }

        if (transition.toSequence <= current.lastSequence) {
          return current;
        }

        if (transition.fromSequence !== current.lastSequence + 1) {
          void syncMatch(current.matchId, current.snapshot.stateVersion, current.lastSequence);
          return current;
        }

        return {
          ...current,
          snapshot: transition.snapshot,
          lastSequence: transition.toSequence,
          error: null,
          pending: false,
        };
      });
    });
  }, [realtimeClient, syncMatch]);

  useEffect(() => {
    if (match.status !== 'ready' || match.snapshot.status !== 'FINISHED' || !selectedRoomId) {
      return;
    }

    void refreshRoom(selectedRoomId);
  }, [match, refreshRoom, selectedRoomId]);

  const membersById = useMemo(
    () => new Map((room?.members ?? []).map((member) => [member.userId, member])),
    [room?.members],
  );
  const mySeatIndex = room?.currentUser.seatIndex ?? null;
  const occupiedCount = room?.counts.seatedCount ?? 0;
  const readyCount = room?.counts.readyCount ?? 0;

  const legalActions =
    match.status === 'ready'
      ? getLegalActions(match.snapshot as GameState, authState.user.id)
      : [];

  const cellOccupants =
    match.status === 'ready'
      ? buildCellOccupants(match.snapshot)
      : new Map<string, MatchSnapshot['pawns']>();

  const offBoardByPlayer =
    match.status === 'ready'
      ? match.snapshot.pawns.reduce<Record<string, MatchSnapshot['pawns']>>((acc, pawn) => {
          if (pawn.position.zone !== 'OFF_BOARD') return acc;
          acc[pawn.playerId] = [...(acc[pawn.playerId] ?? []), pawn];
          return acc;
        }, {})
      : {};

  const topPlayers = match.status === 'ready' ? match.snapshot.players.slice(0, 2) : [];
  const bottomPlayers = match.status === 'ready' ? match.snapshot.players.slice(2, 4) : [];

  async function mutateRoom(action: (signal: AbortSignal) => Promise<unknown>) {
    const controller = new AbortController();
    setRoomPending(true);
    setRoomError(null);

    try {
      await action(controller.signal);
      if (selectedRoomId) {
        await loadRoom(selectedRoomId, controller.signal);
      } else {
        await loadRoomList(controller.signal);
      }
    } catch (error) {
      setRoomError(roomErrorMessage(error, 'Команду комнаты не удалось выполнить.'));
    } finally {
      setRoomPending(false);
    }
  }

  async function createAndJoinRoom() {
    const controller = new AbortController();
    setRoomPending(true);
    setRoomError(null);

    try {
      const created = await roomApi.createRoom(controller.signal);
      if (!created.ok) {
        setRoomError(created.error.message);
        return;
      }

      const joined = await roomApi.joinRoom(created.room.id, controller.signal);
      if (!joined.ok) {
        setRoomError(joined.error.message);
        return;
      }

      setRoom(joined.room);
      navigateTo(roomRoute(created.room.id));
    } catch (error) {
      setRoomError(roomErrorMessage(error, 'Не удалось создать комнату.'));
    } finally {
      setRoomPending(false);
    }
  }

  async function startMatch() {
    if (!room || !selectedRoomId) return;

    const controller = new AbortController();
    setRoomPending(true);
    setRoomError(null);

    try {
      const result = await roomApi.startMatch(selectedRoomId, room.version, controller.signal);
      if (!result.ok) {
        setRoomError(result.error.message);
        return;
      }

      setRoom(result.room);
      await syncMatch(result.matchId);
    } catch (error) {
      setRoomError(roomErrorMessage(error, 'Не удалось начать матч.'));
    } finally {
      setRoomPending(false);
    }
  }

  async function submitAction(action: LegalAction) {
    if (match.status !== 'ready') return;

    setMatch({ ...match, pending: true, error: null });

    try {
      const result = await realtimeClient.sendCommand(
        commandFromAction(action, match.matchId, match.snapshot.stateVersion),
      );

      if (!result.ok) {
        setMatch({ ...match, pending: false, error: result.message });
        if (result.code === 'STALE_STATE_VERSION') {
          await syncMatch(match.matchId, match.snapshot.stateVersion, match.lastSequence);
        }
        return;
      }

      setMatch({
        status: 'ready',
        matchId: result.matchId,
        snapshot: result.snapshot,
        lastSequence: result.lastSequence,
        error: null,
        pending: false,
      });
    } catch {
      setMatch({ ...match, pending: false, error: 'Не удалось выполнить игровой ход.' });
    }
  }

  if (variant === 'home') {
    return (
      <section className="beta-home-page">
        <Panel as="section" className="beta-home-page__hero">
          <p className="beta-home-page__eyebrow">Бета</p>
          <h1>Играть</h1>
          <p className="beta-home-page__copy">
            Откройте список комнат, войдите в нужную и продолжайте матч через существующий игровой экран.
          </p>
          <div className="beta-home-page__actions">
            <Button onClick={() => navigateTo('#/rooms')}>Открыть комнаты</Button>
          </div>
        </Panel>
      </section>
    );
  }

  if (!selectedRoomId) {
    return (
      <section className="beta-room-page">
        <header className="beta-room-page__header">
          <div>
            <p className="beta-room-page__eyebrow">Multi-room beta</p>
            <h1>Комнаты</h1>
          </div>

          <div className="beta-room-page__header-actions">
            <Button variant="secondary" onClick={() => void mutateRoom((signal) => loadRoomList(signal))} loading={roomPending}>
              Обновить
            </Button>
            <Button onClick={() => void createAndJoinRoom()} loading={roomPending}>
              Создать комнату
            </Button>
          </div>
        </header>

        {roomError ? (
          <Panel as="section" className="beta-status-banner">
            {roomError}
          </Panel>
        ) : null}

        <div className="beta-room-page__lobby">
          <Panel as="section" className="beta-room-page__seats">
            <h2>Доступные комнаты</h2>

            <div className="beta-room-page__seat-grid">
              {roomList.map((entry) => (
                <Panel key={entry.id} as="article" className="beta-room-page__seat-card">
                  <div className="beta-room-page__seat-copy">
                    <strong>{`Комната ${entry.code}`}</strong>
                    <span>{`Участники: ${entry.counts.memberCount}`}</span>
                    <span>{`Места: ${entry.counts.seatedCount} / 4`}</span>
                    <span>{`Готовы: ${entry.counts.readyCount} / ${entry.counts.seatedCount}`}</span>
                  </div>

                  <Button onClick={() => navigateTo(roomRoute(entry.id))}>Открыть комнату</Button>
                </Panel>
              ))}
            </div>

            {roomList.length === 0 ? <p>Комнат пока нет. Создайте первую.</p> : null}
          </Panel>
        </div>
      </section>
    );
  }

  return (
    <section className="beta-room-page">
      <header className="beta-room-page__header">
        <div>
          <p className="beta-room-page__eyebrow">Room {room?.id ?? selectedRoomId}</p>
          <h1>{room ? `Комната ${room.code}` : 'Комната'}</h1>
        </div>

        <div className="beta-room-page__header-actions">
          <Button variant="secondary" onClick={() => void refreshRoom(selectedRoomId)} loading={roomPending}>
            Обновить
          </Button>

          {room?.currentMatchId ? null : (
            <Button onClick={() => void startMatch()} loading={roomPending} disabled={!room?.currentUser.canStart}>
              Начать матч
            </Button>
          )}
        </div>
      </header>

      {roomError ? (
        <Panel as="section" className="beta-status-banner">
          {roomError}
        </Panel>
      ) : null}

      {!room ? (
        <Panel as="section">Загрузка комнаты…</Panel>
      ) : !room.currentMatchId ? (
        <div className="beta-room-page__lobby">
          <Panel as="section" className="beta-room-page__seats">
            <h2>Игроки</h2>

            {!room.currentUser.isMember ? (
              <div className="beta-room-page__seat-actions">
                <Button onClick={() => void mutateRoom((signal) => roomApi.joinRoom(selectedRoomId, signal))} loading={roomPending}>
                  Войти в комнату
                </Button>
              </div>
            ) : null}

            <div className="beta-room-page__seat-grid">
              {room.seats.map((seat) => {
                const member = seat.userId ? membersById.get(seat.userId) ?? null : null;
                const isMine = seat.seatIndex === mySeatIndex;

                return (
                  <Panel key={seat.seatIndex} as="article" className="beta-room-page__seat-card" selected={isMine}>
                    <div className="beta-room-page__seat-copy">
                      <strong>{seatLabel(seat.seatIndex)}</strong>
                      {member ? (
                        <>
                          <span>{member.userId === authState.user.id ? `${member.displayName} (Вы)` : member.displayName}</span>
                          <span>{seat.ready ? 'Готов' : 'Не готов'}</span>
                        </>
                      ) : (
                        <span>Свободно</span>
                      )}
                    </div>

                    {!member && room.currentUser.isMember && mySeatIndex === null ? (
                      <Button onClick={() => void mutateRoom((signal) => roomApi.takeSeat(selectedRoomId, seat.seatIndex, room.version, signal))}>
                        {`Занять место ${seat.seatIndex + 1}`}
                      </Button>
                    ) : null}

                    {isMine ? (
                      <div className="beta-room-page__seat-actions">
                        <Button
                          variant={seat.ready ? 'secondary' : 'primary'}
                          onClick={() => void mutateRoom((signal) => roomApi.setReady(selectedRoomId, !seat.ready, room.version, signal))}
                        >
                          {seat.ready ? 'Снять готовность' : 'Готов'}
                        </Button>
                        <Button variant="ghost" onClick={() => void mutateRoom((signal) => roomApi.leaveSeat(selectedRoomId, room.version, signal))}>
                          Покинуть место
                        </Button>
                      </div>
                    ) : null}
                  </Panel>
                );
              })}
            </div>
          </Panel>

          <Panel as="section" className="beta-room-page__status-panel">
            <h2>Статус комнаты</h2>
            <p>{`Участников: ${room.counts.memberCount}`}</p>
            <p>{`Игроков: ${occupiedCount} / 4`}</p>
            <p>{`Готовы: ${readyCount} / ${occupiedCount}`}</p>
            <p>{room.currentUser.startBlockedReason ?? 'Можно начинать матч.'}</p>

            {room.currentUser.isMember ? (
              <Button variant="secondary" onClick={() => void mutateRoom((signal) => roomApi.leaveRoom(selectedRoomId, room.version, signal))}>
                Покинуть комнату
              </Button>
            ) : null}
          </Panel>
        </div>
      ) : match.status === 'error' ? (
        <EmptyState title="Матч временно недоступен" description={match.message} />
      ) : match.status !== 'ready' ? (
        <Panel as="section">Подключение к матчу…</Panel>
      ) : (
        <div className="beta-room-page__match">
          <Panel as="section" className="beta-room-page__board-panel">
            <div className="beta-room-page__match-header">
              <div>
                <h2>Матч</h2>
                <p>
                  {match.snapshot.currentPlayerId === authState.user.id
                    ? 'Ваш ход'
                    : match.snapshot.currentPlayerId
                      ? `Ход игрока ${(match.snapshot.players.find((player) => player.playerId === match.snapshot.currentPlayerId)?.seatIndex ?? 0) + 1}`
                      : 'Матч завершён'}
                </p>
              </div>

              <div className="beta-room-page__dice">
                <span>{`Выпало: ${match.snapshot.diceValue ?? '—'}`}</span>
                <span>{`Ход #${match.snapshot.turnNumber}`}</span>
              </div>
            </div>

            <div className="beta-board">
              <div className="beta-board__reserves beta-board__reserves--top">
                {topPlayers.map((player) => (
                  <div
                    key={player.playerId}
                    className={`beta-board__reserve beta-board__reserve--${player.color.toLowerCase()}`}
                  >
                    <strong>{colorLabels[player.color]}</strong>
                    <div className="beta-board__pawn-strip">
                      {(offBoardByPlayer[player.playerId] ?? []).map((pawn) => {
                        const enterAction = legalActions.find(
                          (candidate) => candidate.type === 'ENTER_PAWN' && candidate.pawnId === pawn.pawnId,
                        );

                        return (
                          <button
                            key={pawn.pawnId}
                            type="button"
                            className={`beta-pawn beta-pawn--${player.color.toLowerCase()}`}
                            onClick={() => enterAction && void submitAction(enterAction)}
                            aria-label={enterAction ? 'Вывести пешку' : `Пешка ${pawn.pawnId}`}
                            disabled={!enterAction}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="beta-board__grid" role="grid" aria-label="Игровое поле">
                {Array.from({ length: 64 }, (_, index) => {
                  const row = Math.floor(index / 8) as BoardCoord['row'];
                  const col = (index % 8) as BoardCoord['col'];
                  const occupant = cellOccupants.get(`${row}:${col}`)?.[0];
                  const moveAction =
                    occupant &&
                    legalActions.find(
                      (candidate) =>
                        (candidate.type === 'MOVE_PAWN' || candidate.type === 'ENTER_PAWN') &&
                        candidate.pawnId === occupant.pawnId,
                    );

                  return (
                    <div
                      key={`${row}:${col}`}
                      role="gridcell"
                      className={`beta-board__cell ${(row + col) % 2 === 0 ? 'is-light' : 'is-dark'}`}
                    >
                      {occupant ? (
                        <button
                          type="button"
                          className={`beta-pawn beta-pawn--${occupant.color.toLowerCase()}`}
                          onClick={() => moveAction && void submitAction(moveAction)}
                          aria-label={moveAction ? actionLabel(moveAction) : occupant.pawnId}
                          disabled={!moveAction}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="beta-board__reserves beta-board__reserves--bottom">
                {bottomPlayers.map((player) => (
                  <div
                    key={player.playerId}
                    className={`beta-board__reserve beta-board__reserve--${player.color.toLowerCase()}`}
                  >
                    <strong>{colorLabels[player.color]}</strong>
                    <div className="beta-board__pawn-strip">
                      {(offBoardByPlayer[player.playerId] ?? []).map((pawn) => {
                        const enterAction = legalActions.find(
                          (candidate) => candidate.type === 'ENTER_PAWN' && candidate.pawnId === pawn.pawnId,
                        );

                        return (
                          <button
                            key={pawn.pawnId}
                            type="button"
                            className={`beta-pawn beta-pawn--${player.color.toLowerCase()}`}
                            onClick={() => enterAction && void submitAction(enterAction)}
                            aria-label={enterAction ? 'Вывести пешку' : `Пешка ${pawn.pawnId}`}
                            disabled={!enterAction}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel as="section" className="beta-room-page__controls-panel">
            <h2>Действия</h2>

            <div className="beta-room-page__controls">
              {legalActions.map((action, index) => (
                <Button
                  key={`${action.type}:${'pawnId' in action ? action.pawnId : index}`}
                  variant={action.type === 'SURRENDER' ? 'secondary' : 'primary'}
                  onClick={() => void submitAction(action)}
                  loading={match.pending}
                >
                  {actionLabel(action)}
                </Button>
              ))}
            </div>

            {match.error ? <p className="beta-room-page__error">{match.error}</p> : null}
          </Panel>
        </div>
      )}
    </section>
  );
}
