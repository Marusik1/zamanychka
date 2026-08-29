import {
  getLegalActions,
  resolvePawnCoordinate,
  type BoardCoord,
  type GameState,
  type LegalAction,
} from '@zamanushka/game-engine';
import type { MatchSnapshot, RoomParticipantView, TransitionEnvelope } from '@zamanushka/shared';
import { Button, EmptyState, Panel } from '@zamanushka/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AuthState } from '../auth/bootstrap.js';
import type { RealtimeClient } from './realtime-client.js';
import type { RoomApi, RoomApiError, RoomView } from './room-api.js';

type Variant = 'home' | 'rooms';

interface PlayableBetaPageProps {
  variant: Variant;
  authState: Extract<AuthState, { status: 'AUTHENTICATED' }>;
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

function participantLabel(participant: RoomParticipantView, currentUserId: string) {
  return participant.userId === currentUserId
    ? `${participant.displayName} (Вы)`
    : participant.displayName;
}

function boardKey(coord: BoardCoord) {
  return `${coord.row}:${coord.col}`;
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

export function PlayableBetaPage({
  variant,
  authState,
  roomApi,
  realtimeClient,
}: PlayableBetaPageProps) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [roomPending, setRoomPending] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchViewState>({ status: 'idle' });
  const activeMatchRef = useRef<string | null>(null);

  const refreshRoom = useCallback(async () => {
    setRoomPending(true);

    try {
      const next = await roomApi.view();
      setRoom(next);
      setRoomError(null);
      return next;
    } catch (error) {
      setRoomError(roomErrorMessage(error, 'Не удалось загрузить комнату.'));
      return null;
    } finally {
      setRoomPending(false);
    }
  }, [roomApi]);

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
          if (!latest) {
            throw new Error('SYNC_EMPTY_EVENTS');
          }

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
    void roomApi
      .reconnect()
      .then((next) => {
        setRoom(next);
        setRoomError(null);
      })
      .catch((error) => {
        setRoomError(roomErrorMessage(error, 'Не удалось подключиться к комнате.'));
      });
  }, [roomApi]);

  useEffect(() => {
    if (room?.currentMatchId) return;

    const intervalId = window.setInterval(() => {
      void roomApi
        .view()
        .then((next) => {
          setRoom(next);
          setRoomError(null);
        })
        .catch(() => undefined);
    }, 2_000);

    return () => window.clearInterval(intervalId);
  }, [room?.currentMatchId, roomApi]);

  useEffect(() => {
    if (!room?.currentMatchId) {
      activeMatchRef.current = null;
      setMatch({ status: 'idle' });
      return;
    }

    if (activeMatchRef.current === room.currentMatchId) {
      return;
    }

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
    if (match.status !== 'ready' || match.snapshot.status !== 'FINISHED') {
      return;
    }

    void refreshRoom();
  }, [match, refreshRoom]);

  const seatOwner = useMemo(() => {
    const map = new Map<number, RoomParticipantView>();

    for (const participant of room?.participantViews ?? []) {
      map.set(participant.seatIndex, participant);
    }

    return map;
  }, [room?.participantViews]);

  const mySeat =
    room?.participantViews.find((participant) => participant.userId === authState.user.id) ?? null;

  const occupiedCount = room?.participantViews.length ?? 0;
  const readyCount = room?.participantViews.filter((participant) => participant.ready).length ?? 0;
  const disconnectedCount =
    room?.participantViews.filter((participant) => !participant.connected).length ?? 0;
  const canStartMatch = Boolean(
    mySeat &&
      occupiedCount >= 2 &&
      occupiedCount <= 4 &&
      readyCount === occupiedCount &&
      disconnectedCount === 0,
  );

  const startBlockReason = !mySeat
    ? 'Сначала займите свободное место.'
    : occupiedCount < 2
      ? `Нужно минимум 2 игрока — сейчас ${occupiedCount}.`
      : readyCount !== occupiedCount
        ? 'Ожидаем готовность всех занятых мест.'
        : disconnectedCount > 0
          ? 'Ожидаем подключения всех игроков.'
          : null;

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
          if (pawn.position.zone !== 'OFF_BOARD') {
            return acc;
          }

          acc[pawn.playerId] = [...(acc[pawn.playerId] ?? []), pawn];
          return acc;
        }, {})
      : {};

  const topPlayers = match.status === 'ready' ? match.snapshot.players.slice(0, 2) : [];
  const bottomPlayers = match.status === 'ready' ? match.snapshot.players.slice(2, 4) : [];

  async function mutateRoom(action: () => Promise<unknown>) {
    setRoomPending(true);
    setRoomError(null);

    try {
      await action();
      await refreshRoom();
    } catch (error) {
      setRoomError(roomErrorMessage(error, 'Команду комнаты не удалось выполнить.'));
    } finally {
      setRoomPending(false);
    }
  }

  async function startMatch() {
    setRoomPending(true);
    setRoomError(null);

    try {
      const result = await roomApi.startMatch();
      if (!result.ok) {
        setRoomError(result.error.message);
        return;
      }

      setRoom((current) =>
        current
          ? { ...result.room, presence: current.presence, participantViews: current.participantViews }
          : null,
      );
      await syncMatch(result.matchId);
    } catch (error) {
      setRoomError(roomErrorMessage(error, 'Не удалось начать матч.'));
    } finally {
      setRoomPending(false);
    }
  }

  async function submitAction(action: LegalAction) {
    if (match.status !== 'ready') {
      return;
    }

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
            Откройте единственную комнату, займите место и начните матч без лишних промежуточных экранов.
          </p>
          <div className="beta-home-page__actions">
            <Button onClick={() => (window.location.hash = '#/rooms')}>Открыть комнату</Button>
          </div>
        </Panel>

        <Panel as="section" className="beta-home-page__status">
          <h2>Текущий стол</h2>
          <p>{room?.currentMatchId ? 'Матч уже идёт — можно вернуться к партии.' : 'Комната ждёт игроков.'}</p>
          <p>{room ? `Участников: ${room.participants.length}/4` : 'Загрузка комнаты…'}</p>
        </Panel>
      </section>
    );
  }

  return (
    <section className="beta-room-page">
      <header className="beta-room-page__header">
        <div>
          <p className="beta-room-page__eyebrow">Singleton room</p>
          <h1>{room?.currentMatchId ? 'Матч' : 'Комната'}</h1>
        </div>

        <div className="beta-room-page__header-actions">
          <Button variant="secondary" onClick={() => void refreshRoom()} loading={roomPending}>
            Обновить
          </Button>

          {room?.currentMatchId ? null : (
            <Button
              onClick={() => void startMatch()}
              loading={roomPending}
              disabled={!canStartMatch}
            >
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

      {!room?.currentMatchId ? (
        <div className="beta-room-page__lobby">
          <Panel as="section" className="beta-room-page__seats">
            <h2>Игроки</h2>

            <div className="beta-room-page__seat-grid">
              {[0, 1, 2, 3].map((index) => {
                const seat = seatOwner.get(index);
                const isMine = seat?.userId === authState.user.id;

                return (
                  <Panel
                    key={index}
                    as="article"
                    className="beta-room-page__seat-card"
                    selected={isMine}
                  >
                    <div className="beta-room-page__seat-copy">
                      <strong>{seatLabel(index as 0 | 1 | 2 | 3)}</strong>

                      {seat ? (
                        <>
                          <span>{participantLabel(seat, authState.user.id)}</span>
                          <span>{seat.ready ? 'Готов' : 'Не готов'}</span>
                          <span>{seat.connected ? 'В сети' : 'Отключён'}</span>
                        </>
                      ) : (
                        <span>Свободно</span>
                      )}
                    </div>

                    {!seat && !mySeat ? (
                      <Button
                        onClick={() =>
                          void mutateRoom(() => roomApi.takeSeat(index as 0 | 1 | 2 | 3))
                        }
                      >
                        {`Занять место ${index + 1}`}
                      </Button>
                    ) : null}

                    {isMine ? (
                      <div className="beta-room-page__seat-actions">
                        <Button
                          variant={seat.ready ? 'secondary' : 'primary'}
                          onClick={() => void mutateRoom(() => roomApi.setReady(!seat.ready))}
                        >
                          {seat.ready ? 'Снять готовность' : 'Готов'}
                        </Button>

                        <Button
                          variant="ghost"
                          onClick={() => void mutateRoom(() => roomApi.leaveSeat())}
                        >
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
            <p>{`Игроков: ${occupiedCount} / 4`}</p>
            <p>{`Готовы: ${readyCount} / ${occupiedCount}`}</p>
            {startBlockReason ? <p>{startBlockReason}</p> : <p>Можно начинать матч.</p>}
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
                <h2>Игровое поле</h2>
                <p>
                  {match.snapshot.currentPlayerId === authState.user.id
                    ? 'Ваш ход'
                    : match.snapshot.currentPlayerId
                      ? `Ход игрока ${
                          (match.snapshot.players.find(
                            (player) => player.playerId === match.snapshot.currentPlayerId,
                          )?.seatIndex ?? 0) + 1
                        }`
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
                          (candidate) =>
                            candidate.type === 'ENTER_PAWN' && candidate.pawnId === pawn.pawnId,
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
                          (candidate) =>
                            candidate.type === 'ENTER_PAWN' && candidate.pawnId === pawn.pawnId,
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
