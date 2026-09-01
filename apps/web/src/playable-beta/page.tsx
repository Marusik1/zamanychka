import {
  getLegalActions,
  type GameState,
  type LegalAction,
} from '@zamanushka/game-engine';
import type { MatchSnapshot, RoomChatMessage, RoomState, TransitionEnvelope } from '@zamanushka/shared';
import { BottomSheet, Button, Dialog, EmptyState, Panel } from '@zamanushka/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AuthState } from '../auth/bootstrap.js';
import {
  buildGameplayAnimationFrames,
  createIdleAnimationState,
  runGameplayAnimationFrames,
  type GameplayAnimationRuntimeState,
} from '../game/animation-director.js';
import { GameAvatar } from '../game/avatar.js';
import { GameBoard } from '../game/board.js';
import type { DieValue } from '../game/dice.js';
import { projectGameScreenModel } from '../game/domain.js';
import { createGameplayPresentationPlan } from '../game/event-presentation.js';
import {
  acceptCommittedTransition,
  completeActivePresentation,
  createPresentationController,
  getActivePresentationToken,
  reconcileAuthoritativeSnapshot,
  type PresentationControllerState,
} from '../game/presentation-controller.js';
import { playPremiumTransition, type PremiumPresentationHandle } from '../game/premium-runtime.js';
import { RulesPage } from '../rules/rules-page.js';
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

type MatchHistoryItem = Readonly<{
  id: string;
  title: string;
  detail: string;
  createdAt: string;
}>;

type UtilityPanel = 'rules' | 'history' | 'settings' | null;

const seatLabels = ['Место 1', 'Место 2', 'Место 3', 'Место 4'] as const;
const colorLabels = {
  RED: 'Красные',
  BLUE: 'Синие',
  GREEN: 'Зелёные',
  YELLOW: 'Жёлтые',
} as const;
const colorActionLabels = {
  RED: 'красную',
  BLUE: 'синюю',
  GREEN: 'зелёную',
  YELLOW: 'жёлтую',
} as const;

function seatLabel(index: 0 | 1 | 2 | 3) {
  return seatLabels[index];
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
    const roomError = error as RoomApiError;
    return roomError.code === 'INVALID_RESPONSE' ? fallback : roomError.message;
  }

  return fallback;
}

function friendlyRoomError(code: string, fallback: string) {
  switch (code) {
    case 'ROOM_ALREADY_ACTIVE':
      return 'Матч уже идёт. Возвращаем вас в текущую игру.';
    default:
      return fallback;
  }
}

function friendlyGameError(code: string, fallback: string) {
  switch (code) {
    case 'NOT_YOUR_TURN':
      return 'Ход соперника. Ждём его действие.';
    case 'STALE_STATE_VERSION':
      return 'Состояние матча обновилось. Синхронизируем текущий ход.';
    case 'MATCH_FINISHED':
      return 'Матч уже завершён.';
    case 'PAWN_NOT_MOVABLE':
    case 'INVALID_ACTION':
      return 'Это действие сейчас недоступно.';
    default:
      return fallback;
  }
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

function pawnOrdinal(pawnId: string) {
  return pawnId.split('-').at(-1) ?? '1';
}

function pawnActionLabel(action: Extract<LegalAction, { pawnId: string }>, snapshot: MatchSnapshot) {
  const pawn = snapshot.pawns.find((candidate) => candidate.pawnId === action.pawnId);
  const colorLabel = pawn ? colorActionLabels[pawn.color] : 'эту';

  if (action.type === 'ENTER_PAWN') {
    return `Вывести ${colorLabel} пешку на поле`;
  }

  return `Переместить ${colorLabel} пешку ${pawnOrdinal(action.pawnId)}`;
}

function finishedReason(snapshot: MatchSnapshot) {
  if (snapshot.winReason === 'HOME_DIAGONAL_COMPLETED') {
    return 'Все 4 пешки дома.';
  }

  if (snapshot.winReason === 'LAST_ACTIVE_PLAYER') {
    return 'Соперники выбыли из матча.';
  }

  return 'Матч завершён.';
}

function useCompactViewport() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 900px)');
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return compact;
}

function mergeHistoryItems(
  current: readonly MatchHistoryItem[],
  incoming: readonly MatchHistoryItem[],
): MatchHistoryItem[] {
  const seen = new Set<string>();
  const merged: MatchHistoryItem[] = [];

  for (const item of [...current, ...incoming]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }

  return merged
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(-120);
}

function actorLabel(snapshot: MatchSnapshot, playerId: string) {
  const player = snapshot.players.find((candidate) => candidate.playerId === playerId);
  return player ? colorLabels[player.color] : 'Игрок';
}

function describeEvent(snapshot: MatchSnapshot, event: TransitionEnvelope['events'][number]): MatchHistoryItem {
  switch (event.type) {
    case 'diceRolled':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.playerId)} бросили кубик`,
        detail: `Выпало ${event.payload.diceValue}.`,
        createdAt: event.createdAt,
      };
    case 'pawnEntered':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.playerId)} вывели пешку`,
        detail: 'Пешка вошла на поле.',
        createdAt: event.createdAt,
      };
    case 'pawnMoved':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.playerId)} сделали ход`,
        detail: event.payload.capture ? 'Ход завершился взятием.' : `Путь: ${event.payload.physicalPath.length} клеток.`,
        createdAt: event.createdAt,
      };
    case 'pawnCaptured':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.byPlayerId)} сбили пешку`,
        detail: 'Пешка соперника снята с поля.',
        createdAt: event.createdAt,
      };
    case 'pawnEnteredHome':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.playerId)} вошли в дом`,
        detail: `Домашняя позиция ${event.payload.homeIndex + 1}.`,
        createdAt: event.createdAt,
      };
    case 'playerSurrendered':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.playerId)} сдались`,
        detail: 'Игрок больше не участвует в матче.',
        createdAt: event.createdAt,
      };
    case 'pawnRemoved':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.playerId)} потеряли пешку`,
        detail: 'Пешка убрана из активной игры.',
        createdAt: event.createdAt,
      };
    case 'extraRollGranted':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.playerId)} получают ещё бросок`,
        detail: 'После шестёрки ход сохраняется.',
        createdAt: event.createdAt,
      };
    case 'turnChanged':
      return {
        id: event.eventId,
        title: `Ход переходит к ${actorLabel(snapshot, event.payload.toPlayerId)}`,
        detail: 'Очередь хода обновлена.',
        createdAt: event.createdAt,
      };
    case 'gameWon':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.winnerPlayerId)} победили`,
        detail:
          event.payload.reason === 'LAST_ACTIVE_PLAYER'
            ? 'Победа как последний активный игрок.'
            : 'Победа по домашней диагонали.',
        createdAt: event.createdAt,
      };
  }
}

function statusCopy(snapshot: MatchSnapshot, currentUserId: string, actionCount: number) {
  const isMyTurn = snapshot.currentPlayerId === currentUserId;

  if (snapshot.status === 'FINISHED') {
    return {
      title: 'Матч завершён',
      subtitle: finishedReason(snapshot),
    };
  }

  if (snapshot.turnPhase === 'WAITING_FOR_ROLL') {
    return {
      title: isMyTurn ? 'Ваш ход' : 'Ход соперника',
      subtitle: isMyTurn ? 'Бросьте кубик.' : 'Ждём бросок соперника.',
    };
  }

  if (snapshot.turnPhase === 'WAITING_FOR_ACTION') {
    return {
      title: isMyTurn ? 'Выберите пешку' : 'Ход соперника',
      subtitle: isMyTurn
        ? actionCount > 0
          ? 'Доступные пешки подсвечены на поле и в резерве.'
          : 'Ожидаем следующее состояние матча.'
        : 'Соперник выбирает действие.',
    };
  }

  return {
    title: isMyTurn ? 'Ваш ход' : 'Ход соперника',
    subtitle: 'Состояние матча обновляется.',
  };
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return reduced;
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
  const boardRef = useRef<PremiumPresentationHandle | null>(null);
  const ackSyncTimeoutRef = useRef<number | null>(null);
  const [presentationController, setPresentationController] = useState<PresentationControllerState | null>(null);
  const [presentationRuntime, setPresentationRuntime] = useState<GameplayAnimationRuntimeState | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const compactViewport = useCompactViewport();
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel>(null);
  const [chatMessages, setChatMessages] = useState<readonly RoomChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatPending, setChatPending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [lastSeenChatMessageId, setLastSeenChatMessageId] = useState<string | null>(null);
  const chatInitializedRoomIdRef = useRef<string | null>(null);
  const [historyItems, setHistoryItems] = useState<readonly MatchHistoryItem[]>([]);

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

  const loadChat = useCallback(
    async (roomId: string, signal?: AbortSignal) => {
      const next = await roomApi.getChat(roomId, signal);
      setChatMessages(next.messages);
      setChatError(null);
      return next.messages;
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

  function reconcilePresentation(matchId: string, snapshot: MatchSnapshot) {
    setPresentationController((current) =>
      current && current.matchId === matchId
        ? reconcileAuthoritativeSnapshot(current, matchId, snapshot)
        : createPresentationController(matchId, snapshot),
    );
    setPresentationRuntime(createIdleAnimationState(snapshot));
  }

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
          reconcilePresentation(matchId, latest.snapshot);
          setHistoryItems((current) =>
            mergeHistoryItems(
              current,
              response.transitions.flatMap((transition) =>
                transition.events.map((event) => describeEvent(transition.snapshot, event)),
              ),
            ),
          );

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

        reconcilePresentation(matchId, response.snapshot);
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
      setPresentationController(null);
      setPresentationRuntime(null);
      if (ackSyncTimeoutRef.current !== null) {
        window.clearTimeout(ackSyncTimeoutRef.current);
        ackSyncTimeoutRef.current = null;
      }
      setMatch((current) =>
        current.status === 'ready' && current.snapshot.status === 'FINISHED' ? current : { status: 'idle' },
      );
      return;
    }

    if (activeMatchRef.current === room.currentMatchId) return;

    activeMatchRef.current = room.currentMatchId;
    void syncMatch(room.currentMatchId);
  }, [room?.currentMatchId, syncMatch]);

  const presentedSnapshot =
    presentationController?.presentationSnapshot ?? (match.status === 'ready' ? match.snapshot : null);
  const presentedPlayers = useMemo(
    () =>
      presentedSnapshot
        ? projectGameScreenModel(presentedSnapshot as GameState, authState.user.id).players
        : [],
    [authState.user.id, presentedSnapshot],
  );

  useEffect(() => {
    if (!presentationController) return;

    const active = presentationController.queue.active;
    const token = getActivePresentationToken(presentationController);

    if (!active || !token) {
      setPresentationRuntime(createIdleAnimationState(presentationController.presentationSnapshot));
      return;
    }

    const abort = new AbortController();
    const frames = buildGameplayAnimationFrames({
      transition: active,
      initialSnapshot: presentationController.presentationSnapshot,
      reducedMotion,
    });

    const plan = createGameplayPresentationPlan(active);

    void Promise.all([
      runGameplayAnimationFrames(frames, {
        signal: abort.signal,
        onFrame: setPresentationRuntime,
      }),
      playPremiumTransition(
        boardRef.current,
        active,
        presentationController.presentationSnapshot,
        presentedPlayers,
        plan,
        abort.signal,
      ),
    ]).then(() => {
      if (abort.signal.aborted) return;
      setPresentationController((current) => {
        if (!current) return current;
        const completion = completeActivePresentation(current, token);
        return completion.kind === 'completed' ? completion.state : current;
      });
    });

    return () => {
      abort.abort();
      boardRef.current?.snapToAuthoritativeState(presentationController.authoritativeSnapshot);
    };
  }, [presentationController, presentedPlayers, reducedMotion]);

  useEffect(() => {
    return realtimeClient.subscribe((transition: TransitionEnvelope) => {
      if (ackSyncTimeoutRef.current !== null) {
        window.clearTimeout(ackSyncTimeoutRef.current);
        ackSyncTimeoutRef.current = null;
      }

      setPresentationController((current) => {
        if (!current || current.matchId !== transition.matchId) {
          return current;
        }

        const accepted = acceptCommittedTransition(current, transition);
        if (accepted.kind === 'recovery_required') {
          void syncMatch(transition.matchId, current.authoritativeSnapshot.stateVersion, current.authoritativeWatermark.lastSequence);
        }
        return accepted.state;
      });

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

        setHistoryItems((items) =>
          mergeHistoryItems(items, transition.events.map((event) => describeEvent(transition.snapshot, event))),
        );

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

  useEffect(() => {
    if (!selectedRoomId || !room?.currentUser.isMember) {
      setChatMessages([]);
      setChatError(null);
      setLastSeenChatMessageId(null);
      chatInitializedRoomIdRef.current = null;
      return;
    }

    const controller = new AbortController();
    void loadChat(selectedRoomId, controller.signal).catch(() => {
      setChatError('Не удалось загрузить сообщения комнаты.');
    });

    return () => controller.abort();
  }, [loadChat, room?.currentUser.isMember, selectedRoomId]);

  useEffect(() => {
    if (!selectedRoomId || !room?.currentUser.isMember) return;
    if (compactViewport && !mobileChatOpen) return;

    const intervalId = window.setInterval(() => {
      const controller = new AbortController();
      void loadChat(selectedRoomId, controller.signal).catch(() => undefined);
    }, 2_000);

    return () => window.clearInterval(intervalId);
  }, [compactViewport, loadChat, mobileChatOpen, room?.currentUser.isMember, selectedRoomId]);

  useEffect(() => {
    const newestMessageId = chatMessages.at(-1)?.id ?? null;
    if (!selectedRoomId || !newestMessageId) return;

    if (chatInitializedRoomIdRef.current !== selectedRoomId || mobileChatOpen) {
      chatInitializedRoomIdRef.current = selectedRoomId;
      setLastSeenChatMessageId(newestMessageId);
    }
  }, [chatMessages, mobileChatOpen, selectedRoomId]);

  const membersById = useMemo(
    () => new Map((room?.members ?? []).map((member) => [member.userId, member])),
    [room?.members],
  );
  const mySeatIndex = room?.currentUser.seatIndex ?? null;
  const occupiedCount = room?.counts.seatedCount ?? 0;
  const readyCount = room?.counts.readyCount ?? 0;
  const unreadChatCount = useMemo(() => {
    if (!compactViewport || mobileChatOpen || !lastSeenChatMessageId) return 0;
    const seenIndex = chatMessages.findIndex((message) => message.id === lastSeenChatMessageId);
    return seenIndex < 0 ? 0 : Math.max(0, chatMessages.length - seenIndex - 1);
  }, [chatMessages, compactViewport, lastSeenChatMessageId, mobileChatOpen]);

  const displaySnapshot = presentedSnapshot;
  const legalActions = displaySnapshot ? getLegalActions(displaySnapshot as GameState, authState.user.id) : [];
  const nonSurrenderActions = legalActions.filter((action) => action.type !== 'SURRENDER');
  const rollAction = nonSurrenderActions.find((action) => action.type === 'ROLL_DICE') ?? null;
  const surrenderAction = legalActions.find((action) => action.type === 'SURRENDER') ?? null;
  const pawnActions = nonSurrenderActions.filter(
    (action): action is Extract<LegalAction, { pawnId: string }> =>
      action.type === 'ENTER_PAWN' || action.type === 'MOVE_PAWN',
  );
  const pawnActionsById = useMemo(() => new Map(pawnActions.map((action) => [action.pawnId, action])), [pawnActions]);
  const gameScreen = displaySnapshot ? projectGameScreenModel(displaySnapshot as GameState, authState.user.id) : null;
  const playerNamesById = useMemo(
    () =>
      Object.fromEntries(
        (room?.members ?? []).map((member) => [
          member.userId,
          member.userId === authState.user.id ? `${member.displayName} (Вы)` : member.displayName,
        ]),
      ),
    [authState.user.id, room?.members],
  );
  const playerAvatarUrlsById = useMemo(
    () =>
      Object.fromEntries(
        (room?.members ?? []).map((member) => [
          member.userId,
          member.userId === authState.user.id ? (authState.user.photoUrl ?? null) : null,
        ]),
      ),
    [authState.user.photoUrl, authState.user.id, room?.members],
  );
  const pawnActionLabels = useMemo(
    () => (displaySnapshot
      ? Object.fromEntries(pawnActions.map((action) => [action.pawnId, pawnActionLabel(action, displaySnapshot)]))
      : {}),
    [displaySnapshot, pawnActions],
  );
  const status = displaySnapshot ? statusCopy(displaySnapshot, authState.user.id, nonSurrenderActions.length) : null;
  const showFinishedMatch = displaySnapshot?.status === 'FINISHED';
  const readyMatchBoardProps =
    displaySnapshot && displaySnapshot.diceValue !== null
      ? { dieValue: displaySnapshot.diceValue as DieValue }
      : {};
  const utilityActions = room ? (
    <div className="beta-room-page__utility-actions">
      <button type="button" onClick={() => setUtilityPanel('rules')}>▤ Правила игры</button>
      <button type="button" onClick={() => setUtilityPanel('history')}>◴ История ходов</button>
      <button type="button" onClick={() => setUtilityPanel('settings')}>⚙ Настройки комнаты</button>
      {compactViewport ? (
        <button type="button" onClick={() => setMobileChatOpen(true)}>
          💬 {unreadChatCount > 0 ? `Чат • ${unreadChatCount}` : 'Чат'}
        </button>
      ) : null}
    </div>
  ) : null;
  const chatPanel = room ? (
    <section className="game-board-scene__chat-card game-board-scene__chat-card--live">
      <div className="game-board-scene__panel-heading">
        <h2>Чат комнаты</h2>
        <span>{room.code}</span>
      </div>
      <div className="game-board-scene__messages">
        {chatMessages.length === 0 ? <p className="game-board-scene__chat-empty">Пока нет сообщений. Начните разговор.</p> : null}
        {chatMessages.map((message) => (
          <div className="game-board-scene__message" key={message.id}>
            <GameAvatar
              color={gameScreen?.players.find((player) => player.playerId === message.userId)?.color ?? 'GREEN'}
              name={message.displayName}
              photoUrl={message.userId === authState.user.id ? authState.user.photoUrl ?? null : null}
            />
            <div>
              <strong>{message.displayName}</strong>
              <p>{message.text}</p>
            </div>
            <time>{new Date(message.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time>
          </div>
        ))}
      </div>
      <label className="game-board-scene__chat-input">
        <input
          type="text"
          value={chatDraft}
          onChange={(event) => setChatDraft(event.currentTarget.value)}
          placeholder={room.currentUser.isMember ? 'Сообщение' : 'Войдите в комнату для чата'}
          maxLength={1000}
          disabled={!room.currentUser.isMember || chatPending}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submitChat();
            }
          }}
        />
        <button
          type="button"
          aria-label="Отправить"
          onClick={() => void submitChat()}
          disabled={!room.currentUser.isMember || chatPending || !chatDraft.trim()}
        >
          ➤
        </button>
      </label>
      {chatError ? <p className="beta-room-page__error">{chatError}</p> : null}
    </section>
  ) : null;

  async function mutateRoom(action: (signal: AbortSignal) => Promise<unknown>) {
    const controller = new AbortController();
    setRoomPending(true);
    setRoomError(null);

    try {
      const result = await action(controller.signal);
      if (
        typeof result === 'object' &&
        result !== null &&
        'ok' in result &&
        result.ok === true &&
        'room' in result
      ) {
        setRoom(result.room as RoomState);
      }
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
    if (!room || !selectedRoomId || roomPending) return;

    const controller = new AbortController();
    setRoomPending(true);
    setRoomError(null);

    try {
      const result = await roomApi.startMatch(selectedRoomId, room.version, controller.signal);
      if (!result.ok) {
        if (result.error.code === 'ROOM_ALREADY_ACTIVE' && room.currentMatchId) {
          setRoomError(null);
          await syncMatch(room.currentMatchId);
          return;
        }
        setRoomError(friendlyRoomError(result.error.code, result.error.message));
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
    if (match.status !== 'ready' || match.pending) return;

    if (action.type === 'SURRENDER' && !window.confirm('Сдаться?\nМатч будет засчитан как поражение.')) {
      return;
    }

    setMatch({ ...match, pending: true, error: null });

    try {
      const result = await realtimeClient.sendCommand(
        commandFromAction(action, match.matchId, match.snapshot.stateVersion),
      );

      if (!result.ok) {
        setMatch({ ...match, pending: false, error: friendlyGameError(result.code, result.message) });
        if (result.code === 'STALE_STATE_VERSION') {
          await syncMatch(match.matchId, match.snapshot.stateVersion, match.lastSequence);
        }
        return;
      }

      setMatch((current) =>
        current.status === 'ready' && current.matchId === result.matchId
          ? { ...current, pending: false, error: null }
          : current,
      );
      if (ackSyncTimeoutRef.current !== null) {
        window.clearTimeout(ackSyncTimeoutRef.current);
      }
      ackSyncTimeoutRef.current = window.setTimeout(() => {
        setMatch((current) => {
          if (
            current.status === 'ready' &&
            current.matchId === result.matchId &&
            current.lastSequence < result.lastSequence
          ) {
            void syncMatch(current.matchId, current.snapshot.stateVersion, current.lastSequence);
          }
          return current;
        });
      }, 1200);
    } catch {
      setMatch({ ...match, pending: false, error: 'Не удалось выполнить игровой ход.' });
    }
  }

  async function submitChat() {
    if (!selectedRoomId || !room?.currentUser.isMember || !chatDraft.trim() || chatPending) return;

    const controller = new AbortController();
    const text = chatDraft.trim();
    setChatPending(true);
    setChatError(null);

    try {
      const message = await roomApi.sendChat(selectedRoomId, text, controller.signal);
      setChatMessages((current) =>
        current.some((candidate) => candidate.id === message.id) ? current : [...current, message],
      );
      setChatDraft('');
    } catch {
      setChatError('Не удалось отправить сообщение.');
    } finally {
      setChatPending(false);
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

  if (room && match.status === 'ready') {
    if (!gameScreen) {
      return (
        <section className="beta-room-page">
          <EmptyState title="Матч временно недоступен" description="Не удалось подготовить игровой экран. Обновите комнату." />
        </section>
      );
    }

    return (
      <section className="beta-room-page">
        <GameBoard
          pawns={gameScreen.pawns}
          players={gameScreen.players}
          {...readyMatchBoardProps}
          playerNamesById={playerNamesById}
          playerAvatarUrlsById={playerAvatarUrlsById}
          actionablePawnIds={pawnActions.map((action) => action.pawnId)}
          pawnActionLabels={pawnActionLabels}
          onPawnSelect={(pawnId) => {
            const action = pawnActionsById.get(pawnId);
            if (action) {
              void submitAction(action);
            }
          }}
          ref={boardRef}
          interactionDisabled={
            match.pending ||
            Boolean(presentationController?.queue.active) ||
            (presentationController?.queue.queued.length ?? 0) > 0
          }
          dieRolling={match.pending && Boolean(rollAction)}
          presentation={presentationRuntime ?? undefined}
          victoryPlayerId={displaySnapshot?.winnerPlayerId ?? null}
          victoryReason={displaySnapshot?.winReason ?? null}
          roomPanel={
            <section className="game-board-scene__room">
              <div className="game-board-scene__panel-heading">
                <h2>О комнате</h2>
                <span>{room.code}</span>
              </div>
              <div className="game-board-scene__room-meta">
                <p>{`Комната: ${room.code}`}</p>
                <p>{`Участники: ${room.counts.memberCount}`}</p>
                <p>{`Места: ${room.counts.seatedCount} / 4`}</p>
                <p>{`Готовы: ${room.counts.readyCount} / ${Math.max(room.counts.seatedCount, 1)}`}</p>
                <p>{room.currentUser.startBlockedReason ?? 'Матч можно продолжать по текущему authoritative состоянию.'}</p>
              </div>
            </section>
          }
          turnPanel={{
            heading: 'Матч',
            badge: `Ход #${displaySnapshot?.turnNumber ?? 1}`,
            title: status?.title,
            subtitle: status?.subtitle,
            dieLabel: displaySnapshot?.diceValue === null ? 'Кубик: ожидание броска' : `Кубик: ${displaySnapshot?.diceValue}`,
            dieValueText:
              displaySnapshot?.diceValue === null
                ? 'Кубик ещё не брошен'
                : `Выпало: ${displaySnapshot?.diceValue ?? '—'}`,
            primaryAction:
              displaySnapshot?.status === 'FINISHED' ? undefined : rollAction ? (
                <Button onClick={() => void submitAction(rollAction)} loading={match.pending} disabled={match.pending}>
                  {actionLabel(rollAction)}
                </Button>
              ) : undefined,
            secondaryActions:
              displaySnapshot?.status === 'FINISHED' ? undefined : surrenderAction ? (
                <Button
                  variant="secondary"
                  onClick={() => void submitAction(surrenderAction)}
                  loading={match.pending}
                  disabled={match.pending}
                >
                  {actionLabel(surrenderAction)}
                </Button>
              ) : undefined,
            footer:
              displaySnapshot?.status === 'FINISHED' ? (
                <div className="beta-room-page__controls">
                  <p>{finishedReason(displaySnapshot)}</p>
                  <Button onClick={() => navigateTo(roomRoute(selectedRoomId))}>Вернуться в комнату</Button>
                  {utilityActions}
                </div>
              ) : (
                <div className="beta-room-page__controls">
                  {!rollAction && pawnActions.length > 0 ? <p>Доступные пешки подсвечены на поле и в резерве.</p> : null}
                  {nonSurrenderActions.length === 0 && !match.pending ? <p>Ожидаем следующее состояние матча.</p> : null}
                  {utilityActions}
                </div>
              ),
            error: match.error ? <p className="beta-room-page__error">{match.error}</p> : null,
          }}
          chatPanel={chatPanel}
          mobileChatOpen={mobileChatOpen}
          onMobileChatClose={() => setMobileChatOpen(false)}
        />
        {compactViewport ? (
          <BottomSheet
            open={utilityPanel === 'rules'}
            onOpenChange={(open) => setUtilityPanel(open ? 'rules' : null)}
            title="Правила игры"
          >
            <RulesPage />
          </BottomSheet>
        ) : (
          <Dialog
            open={utilityPanel === 'rules'}
            onOpenChange={(open) => setUtilityPanel(open ? 'rules' : null)}
            title="Правила игры"
          >
            <RulesPage />
          </Dialog>
        )}
        {compactViewport ? (
          <BottomSheet
            open={utilityPanel === 'history'}
            onOpenChange={(open) => setUtilityPanel(open ? 'history' : null)}
            title="История ходов"
          >
            <div className="beta-room-page__history-panel">
              {historyItems.length === 0 ? <p>История появится после первых событий матча.</p> : null}
              {historyItems.map((item) => (
                <article key={item.id} className="beta-room-page__history-item">
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </BottomSheet>
        ) : (
          <Dialog
            open={utilityPanel === 'history'}
            onOpenChange={(open) => setUtilityPanel(open ? 'history' : null)}
            title="История ходов"
          >
            <div className="beta-room-page__history-panel">
              {historyItems.length === 0 ? <p>История появится после первых событий матча.</p> : null}
              {historyItems.map((item) => (
                <article key={item.id} className="beta-room-page__history-item">
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </Dialog>
        )}
        {compactViewport ? (
          <BottomSheet
            open={utilityPanel === 'settings'}
            onOpenChange={(open) => setUtilityPanel(open ? 'settings' : null)}
            title="Настройки комнаты"
          >
            <div className="beta-room-page__settings-panel">
              <p>{`Код комнаты: ${room.code}`}</p>
              <p>{`Участников: ${room.counts.memberCount}`}</p>
              <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(room.code)}>
                Копировать код
              </Button>
              {displaySnapshot?.status !== 'ACTIVE' && room.currentUser.isMember ? (
                <Button variant="ghost" onClick={() => void mutateRoom((signal) => roomApi.leaveRoom(selectedRoomId, room.version, signal))}>
                  Покинуть комнату
                </Button>
              ) : null}
            </div>
          </BottomSheet>
        ) : (
          <Dialog
            open={utilityPanel === 'settings'}
            onOpenChange={(open) => setUtilityPanel(open ? 'settings' : null)}
            title="Настройки комнаты"
          >
            <div className="beta-room-page__settings-panel">
              <p>{`Код комнаты: ${room.code}`}</p>
              <p>{`Участников: ${room.counts.memberCount}`}</p>
              <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(room.code)}>
                Копировать код
              </Button>
              {displaySnapshot?.status !== 'ACTIVE' && room.currentUser.isMember ? (
                <Button variant="ghost" onClick={() => void mutateRoom((signal) => roomApi.leaveRoom(selectedRoomId, room.version, signal))}>
                  Покинуть комнату
                </Button>
              ) : null}
            </div>
          </Dialog>
        )}
      </section>
    );
  }

  return (
    <section className="beta-room-page">
      <header className="beta-room-page__header">
        <div>
          <p className="beta-room-page__eyebrow">Multi-room beta</p>
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
      ) : !room.currentMatchId && !showFinishedMatch ? (
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
      ) : null}
    </section>
  );
}
