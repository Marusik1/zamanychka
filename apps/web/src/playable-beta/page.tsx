import { getLegalActions, type GameState, type LegalAction } from '@zamanushka/game-engine';
import type {
  GameCommandResult,
  MatchSnapshot,
  RoomChatMessage,
  RoomState,
  TransitionEnvelope,
} from '@zamanushka/shared';
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
import {
  latestGameplayTelemetryEvent,
  recordGameplayTelemetry,
  type GameplayTelemetryEvent,
} from '../game/gameplay-telemetry.js';
import { formatMatchDuration, matchDurationMilliseconds } from '../game/match-duration.js';
import { createGameplayPresentationPlan } from '../game/event-presentation.js';
import { HomeScreen, RoomLobbyScreen, RoomsScreen, type MatchSummary, type NavTab, type RoomDetails, type RoomSummary } from '../redesign-v1/index.js';
import {
  acceptCommittedTransition,
  completeActivePresentation,
  createPresentationController,
  getActivePresentationToken,
  reconcileAuthoritativeSnapshot,
  type PresentationControllerState,
} from '../game/presentation-controller.js';
import { playPremiumTransition, type PremiumPresentationHandle } from '../game/premium-runtime.js';
import { GAMEPLAY_SOUND_ENABLED_KEY } from '../game/premium3d/audio.js';
import { RulesPage } from '../rules/rules-page.js';
import { defaultTelegramShareConfig, shareRoomInvite } from '../telegram/share.js';
import { RealtimeClientError, type RealtimeClient } from './realtime-client.js';
import { canShowRoomSettings } from './room-domain-actions.js';
import { recordRoomTelemetry, RoomApiError, type RoomApi } from './room-api.js';

type Variant = 'home' | 'rooms';

interface PlayableBetaPageProps {
  variant: Variant;
  authState: Extract<AuthState, { status: 'AUTHENTICATED' }>;
  routeHash: string;
  roomApi: RoomApi;
  realtimeClient: RealtimeClient;
  homeLastMatch?: MatchSummary;
  onLogout?: () => void;
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
type RoomFilter = 'ALL' | 'WAITING' | 'ACTIVE';

const MATCH_START_SYNC_RETRY_DELAYS_MS = [100, 250, 500] as const;

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

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function seatLabel(index: 0 | 1 | 2 | 3) {
  return seatLabels[index];
}

function roomRoute(roomId: string) {
  return `#/rooms/${roomId}`;
}

const REDESIGN_HOME_HERO = '/assets/zamanushka-redesign-v1/home/home-hero.webp';
const REDESIGN_ROOM_IMAGES = [
  '/assets/zamanushka-redesign-v1/rooms/room-main.webp',
  '/assets/zamanushka-redesign-v1/rooms/room-248c.webp',
  '/assets/zamanushka-redesign-v1/rooms/room-lucky.webp',
  '/assets/zamanushka-redesign-v1/rooms/room-friends.webp',
] as const;

function initialsFor(displayName: string) {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

function redesignNavigate(tab: NavTab) {
  navigateTo(tab === 'home' ? '#/' : tab === 'rooms' ? '#/rooms' : '#/profile');
}

function roomImageForId(roomId: string) {
  let hash = 0;
  for (const char of roomId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return REDESIGN_ROOM_IMAGES[hash % REDESIGN_ROOM_IMAGES.length] ?? REDESIGN_ROOM_IMAGES[0];
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
    return roomError.code === 'INVALID_RESPONSE'
      ? fallback
      : friendlyRoomError(roomError.code, roomError.message);
  }

  return fallback;
}

function matchErrorMessage(error: unknown) {
  if (error instanceof RealtimeClientError) {
    switch (error.code) {
      case 'MATCH_NOT_FOUND':
        return `Не удалось найти матч. Код: ${error.code}.`;
      case 'MATCH_ACCESS_DENIED':
        return `Вы не участник этого матча. Код: ${error.code}.`;
      case 'REALTIME_PROTOCOL_MISMATCH':
        return `Версия приложения устарела. Обновите страницу. Код: ${error.code}.`;
      case 'VALIDATION_ERROR':
        return `Не удалось синхронизировать матч. Код: ${error.code}.`;
      default:
        return `Не удалось подключить матч. Код: ${error.code}.`;
    }
  }

  return 'Не удалось подключить матч. Код: SYNC_FAILED.';
}

function friendlyRoomError(code: string, fallback: string) {
  switch (code) {
    case 'ROOM_ALREADY_ACTIVE':
      return 'Матч уже идёт. Возвращаем вас в текущую игру.';
    case 'USER_ALREADY_IN_ANOTHER_ROOM':
      return 'Вы уже находитесь в другой комнате.';
    case 'STALE_ROOM_VERSION':
      return 'Состояние комнаты изменилось. Обновляем данные…';
    case 'SEAT_TAKEN':
      return 'Это место уже занято.';
    case 'NOT_ROOM_MEMBER':
      return 'Сначала войдите в комнату.';
    case 'ROOM_NOT_READY':
      return 'Для начала матча все игроки за местами должны быть готовы.';
    case 'ROOM_FULL':
      return 'В комнате больше нет свободных мест.';
    case 'ROOM_CLOSED':
      return 'Эта комната сейчас недоступна.';
    case 'NOT_ALLOWED':
      return 'Это действие сейчас недоступно.';
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

function pawnActionLabel(
  action: Extract<LegalAction, { pawnId: string }>,
  snapshot: MatchSnapshot,
) {
  const pawn = snapshot.pawns.find((candidate) => candidate.pawnId === action.pawnId);
  const colorLabel = pawn ? colorActionLabels[pawn.color] : 'эту';

  if (action.type === 'ENTER_PAWN') {
    return `Вывести ${colorLabel} пешку на поле`;
  }

  return `Переместить ${colorLabel} пешку ${pawnOrdinal(action.pawnId)}`;
}

function useMatchDuration(snapshot: MatchSnapshot | null): string {
  const [now, setNow] = useState(() => new Date());
  const startedAt = snapshot?.startedAt ?? null;
  const finishedAt = snapshot?.finishedAt ?? null;
  const active = snapshot?.status === 'ACTIVE';

  useEffect(() => {
    setNow(new Date());
    if (!active || !startedAt) return;

    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, [active, startedAt, finishedAt]);

  return formatMatchDuration(matchDurationMilliseconds(startedAt, finishedAt, now));
}

function useCompactViewport() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 768px)');
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

  return merged.sort((left, right) => left.createdAt.localeCompare(right.createdAt)).slice(-120);
}

function toRedesignRoomSummary(entry: Awaited<ReturnType<RoomApi['listRooms']>>['rooms'][number]): RoomSummary {
  return {
    id: entry.id,
    name: `Комната ${entry.code}`,
    status: entry.status === 'ACTIVE' ? 'playing' : 'waiting',
    players: entry.counts.seatedCount,
    maxPlayers: 4,
    readyCount: entry.counts.readyCount,
    imageUrl: roomImageForId(entry.id),
  };
}

function toRedesignRoomDetails(room: RoomState, membersById: Map<string, RoomState['members'][number]>): RoomDetails {
  return {
    id: room.id,
    code: room.code,
    name: `Комната ${room.code}`,
    status: room.status === 'ACTIVE' ? 'playing' : 'waiting',
    players: room.counts.seatedCount,
    maxPlayers: 4,
    readyCount: room.counts.readyCount,
    imageUrl: roomImageForId(room.id),
    playersList: room.seats.map((seat) => {
      const member = seat.userId ? membersById.get(seat.userId) : null;
      if (seat.participantKind === 'BOT') {
        return {
          id: seat.participantId ?? `bot-${seat.seatIndex}`,
          seatIndex: seat.seatIndex,
          name: 'Бот',
          initials: 'BOT',
          ready: seat.ready,
          participantKind: 'BOT' as const,
        };
      }
      return member
        ? {
            id: member.userId,
            seatIndex: seat.seatIndex,
            name: member.displayName,
            initials: initialsFor(member.displayName),
            ready: seat.ready,
            participantKind: 'HUMAN' as const,
          }
        : { seatIndex: seat.seatIndex, participantKind: null };
    }),
  };
}

function actorLabel(snapshot: MatchSnapshot, playerId: string) {
  const player = snapshot.players.find((candidate) => candidate.playerId === playerId);
  return player ? colorLabels[player.color] : 'Игрок';
}

function describeEvent(
  snapshot: MatchSnapshot,
  event: TransitionEnvelope['events'][number],
): MatchHistoryItem {
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
        detail: event.payload.capture
          ? 'Ход завершился взятием.'
          : `Путь: ${event.payload.physicalPath.length} клеток.`,
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
        detail:
          event.payload.reason === 'CAPTURE'
            ? 'Пешка сбита — бросайте ещё раз.'
            : 'После шестёрки ход сохраняется.',
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
      subtitle: 'Итоги матча',
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
          : 'Выберите пешку.'
        : 'Соперник выбирает действие.',
    };
  }

  return {
    title: isMyTurn ? 'Ваш ход' : 'Ход соперника',
    subtitle: isMyTurn ? 'Выберите действие.' : 'Соперник выбирает действие.',
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

function latestClientTelemetryEvent(predicate: (event: GameplayTelemetryEvent) => boolean) {
  return latestGameplayTelemetryEvent(predicate);
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
  homeLastMatch,
  onLogout,
}: PlayableBetaPageProps) {
  const selectedRoomId = variant === 'rooms' ? parseRoomId(routeHash) : null;
  const [roomList, setRoomList] = useState<Awaited<ReturnType<RoomApi['listRooms']>>['rooms']>([]);
  const [roomFilter, setRoomFilter] = useState<RoomFilter>('ALL');
  const [currentMembershipRoom, setCurrentMembershipRoom] = useState<
    Awaited<ReturnType<RoomApi['listRooms']>>['currentMembershipRoom']
  >(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(
    () => typeof localStorage === 'undefined' || localStorage.getItem(GAMEPLAY_SOUND_ENABLED_KEY) !== 'false',
  );
  const [roomPending, setRoomPending] = useState(false);
  const [sharePending, setSharePending] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [createRoomConflict, setCreateRoomConflict] = useState<{
    roomId: string;
    matchId: string;
  } | null>(null);
  const selectedRoomIdRef = useRef<string | null>(selectedRoomId);
  const roomScopeRef = useRef(0);
  const matchScopeRef = useRef(0);
  selectedRoomIdRef.current = selectedRoomId;
  const [match, setMatch] = useState<MatchViewState>({ status: 'idle' });
  const activeMatchRef = useRef<string | null>(null);
  const matchWatermarkRef = useRef<{
    matchId: string;
    stateVersion: number;
    lastSequence: number;
  } | null>(null);
  const hydrationRef = useRef<{
    matchId: string;
    scope: number;
    buffer: TransitionEnvelope[];
  } | null>(null);
  const syncInFlightRef = useRef<{
    matchId: string;
    promise: Promise<void>;
    pending: null | {
      stateVersion: number;
      lastSequence: number;
      options: { retryStartup?: boolean };
    };
  } | null>(null);
  const boardRef = useRef<PremiumPresentationHandle | null>(null);
  const ackSyncTimeoutRef = useRef<number | null>(null);
  const [presentationController, setPresentationController] =
    useState<PresentationControllerState | null>(null);
  const presentationControllerRef = useRef<PresentationControllerState | null>(null);
  presentationControllerRef.current = presentationController;
  const [presentationRuntime, setPresentationRuntime] =
    useState<GameplayAnimationRuntimeState | null>(null);
  const [localDiceRolling, setLocalDiceRolling] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const compactViewport = useCompactViewport();
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel>(null);
  const [chatMessages, setChatMessages] = useState<readonly RoomChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatPending, setChatPending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [lastSeenChatMessageId, setLastSeenChatMessageId] = useState<string | null>(null);
  const chatInitializedRoomIdRef = useRef<string | null>(null);
  const [historyItems, setHistoryItems] = useState<readonly MatchHistoryItem[]>([]);

  const isCurrentRoomScope = useCallback(
    (roomId: string, scope: number) =>
      selectedRoomIdRef.current === roomId && roomScopeRef.current === scope,
    [],
  );

  const clearMatchPresentation = useCallback(() => {
    const controller = presentationControllerRef.current;
    if (controller) {
      recordGameplayTelemetry('PRESENTATION_CONTROLLER_DISPOSE', {
        matchId: controller.matchId,
        stateVersion: controller.authoritativeSnapshot.stateVersion,
        reason: 'clear-match-presentation',
      });
    }
    matchScopeRef.current += 1;
    activeMatchRef.current = null;
    matchWatermarkRef.current = null;
    hydrationRef.current = null;
    syncInFlightRef.current = null;
    if (ackSyncTimeoutRef.current !== null) {
      window.clearTimeout(ackSyncTimeoutRef.current);
      ackSyncTimeoutRef.current = null;
    }
    setMatch({ status: 'idle' });
    setPresentationController(null);
    setPresentationRuntime(null);
    setLocalDiceRolling(false);
    setHistoryItems([]);
  }, []);

  useEffect(() => {
    roomScopeRef.current += 1;
    clearMatchPresentation();
    setRoom(null);
    setCurrentMembershipRoom(null);
    setRoomError(null);
    setCreateRoomConflict(null);
    setRoomPending(Boolean(selectedRoomId));
    setSharePending(false);
    setUtilityPanel(null);
    setMobileChatOpen(false);
    setMobileMoreOpen(false);
    setChatMessages([]);
    setChatDraft('');
    setChatError(null);
    setChatPending(false);
    setLastSeenChatMessageId(null);
    chatInitializedRoomIdRef.current = null;
  }, [clearMatchPresentation, selectedRoomId]);

  const loadRoomList = useCallback(
    async (signal?: AbortSignal) => {
      const scope = roomScopeRef.current;
      const next = await roomApi.listRooms(signal);
      if (roomScopeRef.current === scope) {
        setRoomList(next.rooms);
        setCurrentMembershipRoom(next.currentMembershipRoom ?? null);
        setRoomError(null);
        setCreateRoomConflict(null);
      }
      return next.rooms;
    },
    [roomApi],
  );

  const loadRoom = useCallback(
    async (roomId: string, signal?: AbortSignal) => {
      const scope = roomScopeRef.current;
      const next = await roomApi.getRoom(roomId, signal);
      if (isCurrentRoomScope(roomId, scope)) {
        setRoom(next);
        setRoomError(null);
      }
      return next;
    },
    [isCurrentRoomScope, roomApi],
  );

  const loadChat = useCallback(
    async (roomId: string, signal?: AbortSignal) => {
      const scope = roomScopeRef.current;
      const next = await roomApi.getChat(roomId, signal);
      if (isCurrentRoomScope(roomId, scope)) {
        setChatMessages(next.messages);
        setChatError(null);
      }
      return next.messages;
    },
    [isCurrentRoomScope, roomApi],
  );

  useEffect(() => {
    if (variant !== 'home') return;
    const controller = new AbortController();
    void loadRoomList(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [loadRoomList, variant]);

  const refreshRoom = useCallback(
    async (roomId: string, signal?: AbortSignal) => {
      const scope = roomScopeRef.current;
      setRoomPending(true);

      try {
        return await loadRoom(roomId, signal);
      } catch (error) {
        if (isCurrentRoomScope(roomId, scope)) {
          setRoomError(roomErrorMessage(error, 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РєРѕРјРЅР°С‚Сѓ.'));
          setRoom(null);
        }
        return null;
      } finally {
        if (isCurrentRoomScope(roomId, scope)) setRoomPending(false);
      }
    },
    [isCurrentRoomScope, loadRoom],
  );

  function reconcilePresentation(matchId: string, snapshot: MatchSnapshot) {
    setPresentationController((current) => {
      if (current && current.matchId === matchId) {
        return reconcileAuthoritativeSnapshot(current, matchId, snapshot);
      }
      recordGameplayTelemetry('PRESENTATION_CONTROLLER_CREATE', {
        matchId,
        stateVersion: snapshot.stateVersion,
        reason: 'reconcile-presentation',
      });
      return createPresentationController(matchId, snapshot);
    });
    setPresentationRuntime(createIdleAnimationState(snapshot));
  }

  function applyAuthoritativeTransitionToMatch(
    current: MatchViewState,
    transition: TransitionEnvelope,
  ): MatchViewState {
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
      mergeHistoryItems(
        items,
        transition.events.map((event) => describeEvent(transition.snapshot, event)),
      ),
    );

    matchWatermarkRef.current = {
      matchId: transition.matchId,
      stateVersion: transition.snapshot.stateVersion,
      lastSequence: transition.toSequence,
    };

    return {
      ...current,
      snapshot: transition.snapshot,
      lastSequence: transition.toSequence,
      error: null,
      pending: false,
    };
  }

  function applyCommittedTransition(transition: TransitionEnvelope, reason: 'realtime-event' | 'command-ack') {
    if (transition.events.some((event) => event.type === 'diceRolled')) {
      setLocalDiceRolling(false);
    }

    setPresentationController((current) => {
      if (!current || current.matchId !== transition.matchId) {
        return current;
      }

      recordGameplayTelemetry('PRESENTATION_TRANSITION_ENQUEUE', {
        matchId: transition.matchId,
        eventId: transition.transitionId,
        actionId: transition.actionId,
        sequence: transition.toSequence,
        stateVersion: transition.stateVersion,
        transitionType: transition.events.map((event) => event.type).join('+'),
        reason,
      });
      const accepted = acceptCommittedTransition(current, transition);
      if (
        accepted.kind === 'recovery_required' &&
        matchWatermarkRef.current?.matchId !== transition.matchId
      ) {
        void syncMatch(
          transition.matchId,
          current.authoritativeSnapshot.stateVersion,
          current.authoritativeWatermark.lastSequence,
        );
      }
      return accepted.state;
    });

    setMatch((current) => applyAuthoritativeTransitionToMatch(current, transition));
  }

  function transitionFromCommandResult(result: Extract<GameCommandResult, { ok: true }>): TransitionEnvelope | null {
    const firstEvent = result.events[0];
    const lastEvent = result.events.at(-1);
    if (!firstEvent || !lastEvent) return null;
    return {
      matchId: result.matchId,
      transitionId: result.actionId,
      actionId: result.actionId,
      stateVersion: result.stateVersion,
      fromSequence: firstEvent.sequence,
      toSequence: result.lastSequence,
      events: result.events,
      watermark: {
        stateVersion: result.stateVersion,
        lastSequence: result.lastSequence,
      },
      snapshot: result.snapshot,
    };
  }

  const syncMatch = useCallback(
    async (
      matchId: string,
      stateVersion = 0,
      lastSequence = 0,
      options: { retryStartup?: boolean } = {},
    ) => {
      if (activeMatchRef.current !== matchId) return;
      const isInitialHydration = stateVersion === 0 && lastSequence === 0;
      const inFlight = syncInFlightRef.current;
      if (inFlight?.matchId === matchId) {
        if (!isInitialHydration) {
          inFlight.pending = { stateVersion, lastSequence, options };
        }
        await inFlight.promise;
        return;
      }

      const run = (async () => {
      const scope = matchScopeRef.current;
      if (activeMatchRef.current !== matchId) return;
      if (isInitialHydration) {
        hydrationRef.current = { matchId, scope, buffer: [] };
      }
      setMatch((current) =>
        current.status === 'ready'
          ? { ...current, pending: true, error: null }
          : { status: 'loading' },
      );

      const retryDelays = options.retryStartup ? MATCH_START_SYNC_RETRY_DELAYS_MS : [];

      for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
        try {
          await realtimeClient.ensureConnected();
          await realtimeClient.joinMatch(matchId);
          const response = await realtimeClient.sync({ matchId, stateVersion, lastSequence });
          if (matchScopeRef.current !== scope || activeMatchRef.current !== matchId) return;

          const bufferedTransitions =
            isInitialHydration && hydrationRef.current?.matchId === matchId && hydrationRef.current.scope === scope
              ? [...hydrationRef.current.buffer].sort(
                  (left, right) =>
                    left.fromSequence - right.fromSequence ||
                    left.toSequence - right.toSequence ||
                    left.transitionId.localeCompare(right.transitionId),
                )
              : [];
          if (isInitialHydration && hydrationRef.current?.matchId === matchId) {
            hydrationRef.current = null;
          }

          const applySyncedState = (
            snapshot: MatchSnapshot,
            syncedLastSequence: number,
            syncedHistoryTransitions: readonly TransitionEnvelope[] = [],
          ) => {
            const currentWatermark = matchWatermarkRef.current;
            if (
              currentWatermark?.matchId === matchId &&
              (snapshot.stateVersion < currentWatermark.stateVersion ||
                syncedLastSequence < currentWatermark.lastSequence)
            ) {
              return;
            }

            let authoritativeSnapshot = snapshot;
            let authoritativeLastSequence = syncedLastSequence;
            const replayTransitions: TransitionEnvelope[] = [];
            let needsResync = false;

            for (const transition of bufferedTransitions) {
              if (transition.matchId !== matchId) continue;
              if (transition.toSequence <= authoritativeLastSequence) continue;

              if (transition.fromSequence === authoritativeLastSequence + 1) {
                authoritativeSnapshot = transition.snapshot;
                authoritativeLastSequence = transition.toSequence;
                replayTransitions.push(transition);
                continue;
              }

              needsResync = true;
              break;
            }

            recordGameplayTelemetry('PRESENTATION_CONTROLLER_CREATE', {
              matchId,
              stateVersion: snapshot.stateVersion,
              lastSequence: syncedLastSequence,
              reason: isInitialHydration ? 'initial-sync' : 'sync',
            });
            let nextController = createPresentationController(matchId, snapshot);
            for (const transition of replayTransitions) {
              recordGameplayTelemetry('PRESENTATION_TRANSITION_ENQUEUE', {
                matchId: transition.matchId,
                eventId: transition.transitionId,
                actionId: transition.actionId,
                sequence: transition.toSequence,
                stateVersion: transition.stateVersion,
                transitionType: transition.events.map((event) => event.type).join('+'),
                reason: 'hydration-buffer-drain',
              });
              const accepted = acceptCommittedTransition(nextController, transition);
              if (accepted.kind === 'recovery_required') {
                needsResync = true;
                break;
              }
              nextController = accepted.state;
            }

            setPresentationController(nextController);
            setPresentationRuntime(createIdleAnimationState(nextController.presentationSnapshot));
            setHistoryItems((current) =>
              mergeHistoryItems(
                current,
                [...syncedHistoryTransitions, ...replayTransitions].flatMap((transition) =>
                  transition.events.map((event) => describeEvent(transition.snapshot, event)),
                ),
              ),
            );

            matchWatermarkRef.current = {
              matchId,
              stateVersion: authoritativeSnapshot.stateVersion,
              lastSequence: authoritativeLastSequence,
            };

            setMatch({
              status: 'ready',
              matchId,
              snapshot: authoritativeSnapshot,
              lastSequence: authoritativeLastSequence,
              error: null,
              pending: false,
            });

            if (needsResync) {
              void syncMatch(matchId, snapshot.stateVersion, syncedLastSequence);
            }
          };

          if (response.mode === 'events') {
            const latest = response.transitions.at(-1);
            if (!latest) throw new Error('SYNC_EMPTY_EVENTS');
            applySyncedState(latest.snapshot, latest.toSequence, response.transitions);
            return;
          }

          applySyncedState(response.snapshot, response.watermark.lastSequence);
          return;
        } catch (error) {
          if (matchScopeRef.current !== scope || activeMatchRef.current !== matchId) return;
          const delay = retryDelays[attempt];
          if (delay !== undefined) {
            await sleep(delay);
            continue;
          }

          console.warn('match sync failed', {
            matchId,
            stateVersion,
            lastSequence,
            attempt: attempt + 1,
            errorCode: error instanceof RealtimeClientError ? error.code : 'SYNC_FAILED',
            retryable: error instanceof RealtimeClientError ? error.retryable : false,
            error,
          });
          setMatch({ status: 'error', message: matchErrorMessage(error) });
        }
      }
      })();

      syncInFlightRef.current = { matchId, promise: run, pending: null };
      try {
        await run;
      } finally {
        const current = syncInFlightRef.current;
        if (current?.promise === run) {
          const pending = current.pending;
          syncInFlightRef.current = null;
          if (pending && activeMatchRef.current === matchId) {
            void syncMatch(matchId, pending.stateVersion, pending.lastSequence, pending.options);
          }
        }
      }
    },
    [realtimeClient],
  );
  useEffect(() => {
    if (variant !== 'rooms') return;

    const controller = new AbortController();

    if (selectedRoomId) {
      const scope = roomScopeRef.current;
      void loadRoomList(controller.signal).catch(() => undefined);
      void roomApi
        .reconnect(selectedRoomId, controller.signal)
        .then((next) => {
          if (!isCurrentRoomScope(selectedRoomId, scope)) return;
          setRoom(next);
          setRoomError(null);
          setRoomPending(false);
        })
        .catch((error) => {
          if (!isCurrentRoomScope(selectedRoomId, scope)) return;
          setRoomError(roomErrorMessage(error, 'Не удалось подключиться к комнате.'));
          setRoom(null);
          setRoomPending(false);
        });
    } else {
      void loadRoomList(controller.signal).catch((error) => {
        setRoomError(roomErrorMessage(error, 'Не удалось загрузить список комнат.'));
      });
    }

    return () => controller.abort();
  }, [isCurrentRoomScope, loadRoomList, roomApi, selectedRoomId, variant]);

  useEffect(() => {
    if (variant !== 'rooms') return;

    let activeRequest: AbortController | null = null;
    const intervalId = window.setInterval(() => {
      activeRequest?.abort();
      const controller = new AbortController();
      activeRequest = controller;
      const scope = roomScopeRef.current;

      if (selectedRoomId && !room?.currentMatchId) {
        void roomApi
          .getRoom(selectedRoomId, controller.signal)
          .then((next) => {
            if (!isCurrentRoomScope(selectedRoomId, scope)) return;
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
            if (roomScopeRef.current !== scope || selectedRoomIdRef.current !== null) return;
            setRoomList(next.rooms);
            setRoomError(null);
          })
          .catch(() => undefined);
      }
    }, 2_000);

    return () => {
      window.clearInterval(intervalId);
      activeRequest?.abort();
    };
  }, [isCurrentRoomScope, room?.currentMatchId, roomApi, selectedRoomId, variant]);

  useEffect(() => {
    if (!room?.currentMatchId) {
      const controller = presentationControllerRef.current;
      if (controller) {
        recordGameplayTelemetry('PRESENTATION_CONTROLLER_DISPOSE', {
          matchId: controller.matchId,
          stateVersion: controller.authoritativeSnapshot.stateVersion,
          reason: 'room-current-match-cleared',
        });
      }
      activeMatchRef.current = null;
      matchWatermarkRef.current = null;
      hydrationRef.current = null;
      setPresentationController(null);
      setPresentationRuntime(null);
      if (ackSyncTimeoutRef.current !== null) {
        window.clearTimeout(ackSyncTimeoutRef.current);
        ackSyncTimeoutRef.current = null;
      }
      setMatch((current) =>
        current.status === 'ready' && current.snapshot.status === 'FINISHED'
          ? current
          : { status: 'idle' },
      );
      return;
    }

    if (activeMatchRef.current === room.currentMatchId) return;

    activeMatchRef.current = room.currentMatchId;
    void syncMatch(room.currentMatchId, 0, 0, { retryStartup: true });
  }, [room?.currentMatchId, syncMatch]);

  const presentedSnapshot =
    presentationController?.presentationSnapshot ??
    (match.status === 'ready' ? match.snapshot : null);
  const presentedPlayers = useMemo(
    () =>
      presentedSnapshot
        ? projectGameScreenModel(presentedSnapshot as GameState, authState.user.id).players
        : [],
    [authState.user.id, presentedSnapshot],
  );
  const activePresentationToken = presentationController
    ? getActivePresentationToken(presentationController)
    : null;
  const activePresentationRunKey = activePresentationToken
    ? [
        activePresentationToken.matchId,
        activePresentationToken.generation,
        activePresentationToken.transitionId,
        activePresentationToken.stateVersion,
        activePresentationToken.toSequence,
      ].join(':')
    : null;

  useEffect(() => {
    if (!presentationController) return;

    const active = presentationController.queue.active;
    const token = activePresentationToken;

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
    const received = latestClientTelemetryEvent(
      (entry) =>
        entry.event === 'game-event-received' &&
        entry.transitionId === active.transitionId &&
        entry.matchId === active.matchId,
    );
    const receiveToAnimationMs =
      typeof received?.clientNowMs === 'number'
        ? Math.round((performance.now() - received.clientNowMs) * 100) / 100
        : null;
    recordGameplayTelemetry('PRESENTATION_START', {
      matchId: active.matchId,
      eventId: active.transitionId,
      actionId: active.actionId,
      sequence: active.toSequence,
      stateVersion: active.stateVersion,
      transitionType: active.events.map((event) => event.type).join('+'),
      fromSequence: active.fromSequence,
      toSequence: active.toSequence,
      receiveToAnimationMs,
      estimatedDurationMs: plan.estimatedDurationMs,
      queuedCount: presentationController.queue.queued.length,
    });

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
        if (completion.kind === 'completed') {
          recordGameplayTelemetry('PRESENTATION_COMPLETE', {
            matchId: active.matchId,
            eventId: active.transitionId,
            actionId: active.actionId,
            sequence: active.toSequence,
            stateVersion: active.stateVersion,
            transitionType: active.events.map((event) => event.type).join('+'),
          });
        }
        return completion.kind === 'completed' ? completion.state : current;
      });
    });

    return () => {
      recordGameplayTelemetry('PRESENTATION_CANCEL', {
        matchId: active.matchId,
        eventId: active.transitionId,
        actionId: active.actionId,
        sequence: active.toSequence,
        stateVersion: active.stateVersion,
        transitionType: active.events.map((event) => event.type).join('+'),
        reason: 'effect-cleanup',
      });
      abort.abort();
    };
  }, [activePresentationRunKey, reducedMotion]);

  useEffect(() => {
    return realtimeClient.subscribe((transition: TransitionEnvelope) => {
      if (ackSyncTimeoutRef.current !== null) {
        window.clearTimeout(ackSyncTimeoutRef.current);
        ackSyncTimeoutRef.current = null;
      }
      setLocalDiceRolling(false);

      const hydration = hydrationRef.current;
      if (hydration?.matchId === transition.matchId) {
        hydration.buffer.push(transition);
        return;
      }

      applyCommittedTransition(transition, 'realtime-event');
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
  const soloDebugStartAvailable = Boolean(
    room?.currentUser.canStart && occupiedCount === 1 && readyCount === 1,
  );
  const unreadChatCount = useMemo(() => {
    if (!compactViewport || mobileChatOpen || !lastSeenChatMessageId) return 0;
    const seenIndex = chatMessages.findIndex((message) => message.id === lastSeenChatMessageId);
    return seenIndex < 0 ? 0 : Math.max(0, chatMessages.length - seenIndex - 1);
  }, [chatMessages, compactViewport, lastSeenChatMessageId, mobileChatOpen]);

  const displaySnapshot = presentedSnapshot;
  const matchDuration = useMatchDuration(displaySnapshot);
  const legalActions = displaySnapshot
    ? getLegalActions(displaySnapshot as GameState, authState.user.id)
    : [];
  const nonSurrenderActions = legalActions.filter((action) => action.type !== 'SURRENDER');
  const rollAction = nonSurrenderActions.find((action) => action.type === 'ROLL_DICE') ?? null;
  const surrenderAction = legalActions.find((action) => action.type === 'SURRENDER') ?? null;
  const debugDummyTurn =
    displaySnapshot?.debugMode === 'SOLO' &&
    displaySnapshot.players.some(
      (player) =>
        player.participantKind === 'DEBUG_DUMMY' &&
        player.playerId === displaySnapshot.currentPlayerId,
    );
  const pawnActions = nonSurrenderActions.filter(
    (action): action is Extract<LegalAction, { pawnId: string }> =>
      action.type === 'ENTER_PAWN' || action.type === 'MOVE_PAWN',
  );
  const pawnActionsById = useMemo(
    () => new Map(pawnActions.map((action) => [action.pawnId, action])),
    [pawnActions],
  );
  const gameScreen = displaySnapshot
    ? projectGameScreenModel(displaySnapshot as GameState, authState.user.id)
    : null;
  const playerNamesById = useMemo(
    () =>
      Object.fromEntries(
        (room?.members ?? []).map((member) => [member.userId, member.displayName]),
      ),
    [room?.members],
  );
  const winnerName = useMemo(() => {
    const winnerId = displaySnapshot?.winnerPlayerId;
    if (!winnerId) return 'Игрок';
    return room?.members.find((member) => member.userId === winnerId)?.displayName ?? 'Игрок';
  }, [displaySnapshot?.winnerPlayerId, room?.members]);
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
    () =>
      displaySnapshot
        ? Object.fromEntries(
            pawnActions.map((action) => [action.pawnId, pawnActionLabel(action, displaySnapshot)]),
          )
        : {},
    [displaySnapshot, pawnActions],
  );
  const status = displaySnapshot
    ? statusCopy(displaySnapshot, authState.user.id, nonSurrenderActions.length)
    : null;
  const showFinishedMatch = displaySnapshot?.status === 'FINISHED';
  const activeDiceEvent = presentationController?.queue.active?.events.find(
    (event) => event.type === 'diceRolled',
  );
  const activePresentationDieValue =
    activeDiceEvent?.type === 'diceRolled'
      ? (activeDiceEvent.payload.diceValue as DieValue)
      : null;
  const baseBoardPresentationRuntime =
    presentationRuntime ??
    (presentationController ? createIdleAnimationState(presentationController.presentationSnapshot) : null);
  const boardPresentationRuntime =
    baseBoardPresentationRuntime
      ? {
          ...baseBoardPresentationRuntime,
          dieRolling: localDiceRolling || baseBoardPresentationRuntime.dieRolling,
          dieValue: activePresentationDieValue ?? baseBoardPresentationRuntime.dieValue,
        }
      : baseBoardPresentationRuntime;
  const boardDieValue =
    activePresentationDieValue ??
    (displaySnapshot?.diceValue !== null ? (displaySnapshot?.diceValue as DieValue | undefined) : undefined);
  const readyMatchBoardProps =
    boardDieValue !== undefined
      ? { dieValue: boardDieValue }
      : {};
  const utilityActions = room ? (
    <div className="beta-room-page__utility-actions">
      <button type="button" onClick={() => setUtilityPanel('rules')}>
        ▤ Правила игры
      </button>
      <button type="button" onClick={() => setUtilityPanel('history')}>
        ◴ История ходов
      </button>
      <button type="button" onClick={() => setUtilityPanel('settings')}>
        ⚙ Настройки комнаты
      </button>
      {compactViewport ? (
        <button type="button" onClick={() => setMobileChatOpen(true)}>
          💬 {unreadChatCount > 0 ? `Чат • ${unreadChatCount}` : 'Чат'}
        </button>
      ) : null}
    </div>
  ) : null;
  const mobileGameplayTools = room && compactViewport ? (
    <div className="beta-room-page__mobile-tools" aria-label="Дополнительные действия">
      <button type="button" onClick={() => setMobileChatOpen(true)}>
        <span aria-hidden="true" className="beta-room-page__mobile-tool-icon">
          <svg viewBox="0 0 24 24"><path d="M5 5.5h14v10H9l-4 3v-13Z" /></svg>
        </span>
        {unreadChatCount > 0 ? `Чат · ${unreadChatCount}` : 'Чат'}
      </button>
      <button type="button" onClick={() => setUtilityPanel('history')}>
        <span aria-hidden="true" className="beta-room-page__mobile-tool-icon">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>
        </span>
        История
      </button>
      <div className="beta-room-page__mobile-more">
        <button
          type="button"
          aria-expanded={mobileMoreOpen}
          aria-controls="mobile-gameplay-more-menu"
          onClick={() => setMobileMoreOpen((open) => !open)}
        >
          <span aria-hidden="true" className="beta-room-page__mobile-tool-icon beta-room-page__mobile-tool-icon--more">
            <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
          </span>
          Ещё
        </button>
        {mobileMoreOpen ? (
          <div id="mobile-gameplay-more-menu" className="beta-room-page__mobile-more-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { setMobileMoreOpen(false); setUtilityPanel('rules'); }}>
              Правила игры
            </button>
            <button type="button" role="menuitem" onClick={() => { setMobileMoreOpen(false); setUtilityPanel('settings'); }}>
              Настройки комнаты
            </button>
            {displaySnapshot?.status !== 'FINISHED' && surrenderAction ? (
              <button
                type="button"
                role="menuitem"
                className="beta-room-page__mobile-more-danger"
                disabled={match.status === 'ready' && match.pending}
                onClick={() => { setMobileMoreOpen(false); void submitAction(surrenderAction); }}
              >
                Сдаться
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  ) : null;
  const soundControl = (
    <Button
      variant="secondary"
      onClick={() => {
        const next = !soundEnabled;
        setSoundEnabled(next);
        localStorage.setItem(GAMEPLAY_SOUND_ENABLED_KEY, String(next));
      }}
    >
      {`Звуки: ${soundEnabled ? 'Вкл' : 'Выкл'}`}
    </Button>
  );
  const chatPanel = room ? (
    <section className="game-board-scene__chat-card game-board-scene__chat-card--live">
      <div className="game-board-scene__panel-heading">
        <h2>Чат комнаты</h2>
        <span>{room.code}</span>
      </div>
      <div className="game-board-scene__messages">
        {chatMessages.length === 0 ? (
          <p className="game-board-scene__chat-empty">Пока нет сообщений. Начните разговор.</p>
        ) : null}
        {chatMessages.map((message) => (
          <div className="game-board-scene__message" key={message.id}>
            <GameAvatar
              color={
                gameScreen?.players.find((player) => player.playerId === message.userId)?.color ??
                'GREEN'
              }
              name={message.displayName}
              photoUrl={
                message.userId === authState.user.id ? (authState.user.photoUrl ?? null) : null
              }
            />
            <div>
              <strong>{message.displayName}</strong>
              <p>{message.text}</p>
            </div>
            <time>
              {new Date(message.createdAt).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
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

  async function returnToRoom() {
    if (!selectedRoomId) return;

    clearMatchPresentation();
    setUtilityPanel(null);
    await refreshRoom(selectedRoomId);
  }

  async function leaveCurrentRoom() {
    if (!room || !selectedRoomId || roomPending) return;
    const roomId = selectedRoomId;
    const scope = roomScopeRef.current;
    const controller = new AbortController();
    setRoomPending(true);
    setRoomError(null);

    try {
      const result = await roomApi.leaveRoom(roomId, room.version, controller.signal);
      if (!result.ok || !isCurrentRoomScope(roomId, scope)) return;
      navigateTo('#/rooms');
    } catch (error) {
      if (isCurrentRoomScope(roomId, scope)) {
        setRoomError(
          roomErrorMessage(error, 'Не удалось покинуть комнату.'),
        );
      }
    } finally {
      if (isCurrentRoomScope(roomId, scope)) setRoomPending(false);
    }
  }

  async function deleteCurrentRoom() {
    recordRoomTelemetry('ROOM_DELETE_CLICK', {
      routeHash,
      roomId: selectedRoomId,
      canDelete: Boolean(room && selectedRoomId && !roomPending && room.currentUser.canManageBots),
    });
    if (!room || !selectedRoomId || roomPending || !room.currentUser.canManageBots) return;
    if (room.status === 'ACTIVE' || room.currentMatchId) {
      setRoomError('Нельзя удалить комнату во время активного матча.');
      return;
    }
    if (!window.confirm('Удалить комнату? Это действие закроет комнату для всех участников.')) {
      return;
    }

    const roomId = selectedRoomId;
    const scope = roomScopeRef.current;
    const controller = new AbortController();
    setRoomPending(true);
    setRoomError(null);

    try {
      recordRoomTelemetry('ROOM_DELETE_REQUEST', { routeHash, roomId });
      const result = await roomApi.deleteRoom(roomId, room.version, controller.signal);
      recordRoomTelemetry('ROOM_DELETE_RESPONSE', {
        routeHash,
        roomId,
        ok: result.ok,
        code: result.ok ? undefined : result.error.code,
      });
      if (!result.ok || !isCurrentRoomScope(roomId, scope)) return;
      setRoom(null);
      setCurrentMembershipRoom(null);
      await loadRoomList(controller.signal).catch(() => undefined);
      navigateTo('#/rooms');
    } catch (error) {
      recordRoomTelemetry('ROOM_DELETE_RESPONSE', {
        routeHash,
        roomId,
        ok: false,
        code: error instanceof RoomApiError ? error.code : undefined,
        status: error instanceof RoomApiError ? error.status : undefined,
      });
      if (isCurrentRoomScope(roomId, scope)) {
        setRoomError(roomErrorMessage(error, 'Не удалось удалить комнату.'));
      }
    } finally {
      if (isCurrentRoomScope(roomId, scope)) setRoomPending(false);
    }
  }

  async function shareCurrentRoom() {
    recordRoomTelemetry('ROOM_SHARE_CLICK', {
      routeHash,
      roomId: selectedRoomId,
      canShare: Boolean(room && selectedRoomId && !sharePending),
    });
    if (!room || !selectedRoomId || sharePending) return;
    const roomId = selectedRoomId;
    const scope = roomScopeRef.current;
    const controller = new AbortController();
    setSharePending(true);
    setRoomError(null);

    try {
      recordRoomTelemetry('ROOM_SHARE_REQUEST', { routeHash, roomId });
      const invite = await roomApi.createInvite(roomId, controller.signal);
      if (!isCurrentRoomScope(roomId, scope)) return;
      const result = await shareRoomInvite({
        token: invite.token,
        config: defaultTelegramShareConfig,
        openTelegramLink: (url) => {
          window.Telegram?.WebApp?.openTelegramLink?.(url);
          return window.Telegram?.WebApp?.openTelegramLink !== undefined;
        },
        clipboard: navigator.clipboard,
        openPopup: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
      });

      if (!result.ok) {
        recordRoomTelemetry('ROOM_SHARE_RESPONSE', {
          routeHash,
          roomId,
          ok: false,
          code: result.code,
        });
        setRoomError(
          result.code === 'MISSING_BOT_USERNAME'
            ? 'Не настроен Telegram bot username для ссылки-приглашения.'
            : 'Не удалось открыть Telegram. Ссылка не была скопирована.',
        );
        return;
      }

      recordRoomTelemetry('ROOM_SHARE_RESPONSE', {
        routeHash,
        roomId,
        ok: true,
        method: result.method,
      });
      if (result.method === 'clipboard') setRoomError('Ссылка на комнату скопирована.');
    } catch (error) {
      recordRoomTelemetry('ROOM_SHARE_RESPONSE', {
        routeHash,
        roomId,
        ok: false,
        code: error instanceof RoomApiError ? error.code : undefined,
        status: error instanceof RoomApiError ? error.status : undefined,
      });
      if (isCurrentRoomScope(roomId, scope)) {
        setRoomError(roomErrorMessage(error, 'Не удалось создать ссылку-приглашение.'));
      }
    } finally {
      if (isCurrentRoomScope(roomId, scope)) setSharePending(false);
    }
  }

  async function switchFromCurrentMembershipTo(targetRoomId: string) {
    const membership = currentMembershipRoom;
    if (!membership || membership.roomId === targetRoomId) return;
    if (membership.status === 'ACTIVE' || membership.currentMatchId) {
      setRoomError('У вас идёт активный матч в другой комнате.');
      return;
    }

    const controller = new AbortController();
    setRoomPending(true);
    setRoomError(null);
    try {
      const source = await roomApi.getRoom(membership.roomId, controller.signal);
      if (!source.currentUser.isMember || source.status === 'ACTIVE' || source.currentMatchId) {
        setCurrentMembershipRoom({
          roomId: source.id,
          code: source.code,
          status: source.status,
          version: source.version,
          currentMatchId: source.currentMatchId,
        });
        setRoomError('У вас идёт активный матч в другой комнате.');
        return;
      }
      const left = await roomApi.leaveRoom(source.id, source.version, controller.signal);
      if (!left.ok) throw new RoomApiError(409, left.error.code, left.error.message);
      setCurrentMembershipRoom(null);
      const joined = await roomApi.joinRoom(targetRoomId, controller.signal);
      if (!joined.ok) throw new RoomApiError(409, joined.error.code, joined.error.message);
      navigateTo(roomRoute(targetRoomId));
    } catch (error) {
      setRoomError(roomErrorMessage(error, 'Не удалось сменить комнату.'));
      await loadRoomList(controller.signal).catch(() => undefined);
    } finally {
      setRoomPending(false);
    }
  }

  async function mutateRoom(action: (signal: AbortSignal) => Promise<unknown>) {
    const roomId = selectedRoomId;
    const scope = roomScopeRef.current;
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
        if (!roomId || isCurrentRoomScope(roomId, scope)) {
          setRoom(result.room as RoomState);
        }
      }
      if (roomId) {
        await loadRoom(roomId, controller.signal);
      } else {
        await loadRoomList(controller.signal);
      }
    } catch (error) {
      if (!roomId || isCurrentRoomScope(roomId, scope)) {
        setRoomError(roomErrorMessage(error, 'Команду комнаты не удалось выполнить.'));
      }
    } finally {
      if (!roomId || isCurrentRoomScope(roomId, scope)) setRoomPending(false);
    }
  }

  async function createAndJoinRoom() {
    recordRoomTelemetry('ROOM_CREATE_CLICK', { routeHash });
    const controller = new AbortController();
    setRoomPending(true);
    setRoomError(null);
    setCreateRoomConflict(null);

    try {
      recordRoomTelemetry('ROOM_CREATE_REQUEST', { routeHash });
      const created = await roomApi.createRoom(controller.signal);
      recordRoomTelemetry('ROOM_CREATE_RESPONSE', {
        routeHash,
        ok: created.ok,
        kind: created.kind,
        roomId: created.ok ? created.room.id : created.roomId,
        matchId: created.ok ? undefined : created.matchId,
      });
      if (!created.ok) {
        if (created.kind === 'ACTIVE_MATCH_EXISTS') {
          setCreateRoomConflict({ roomId: created.roomId, matchId: created.matchId });
          setRoomError('У вас уже есть активная игра.');
        }
        return;
      }

      const joined = await roomApi.joinRoom(created.room.id, controller.signal);
      if (!joined.ok) {
        setRoomError(joined.error.message);
        return;
      }

      let nextRoom = joined.room;
      if (nextRoom.currentUser.seatIndex === null) {
        const firstOpenSeat = nextRoom.seats.find((seat) => seat.userId === null);
        if (firstOpenSeat) {
          const seated = await roomApi.takeSeat(
            nextRoom.id,
            firstOpenSeat.seatIndex,
            nextRoom.version,
            controller.signal,
          );
          if (!seated.ok) {
            setRoomError(seated.error.message);
            return;
          }
          nextRoom = seated.room;
        }
      }

      setRoom(nextRoom);
      navigateTo(roomRoute(created.room.id));
    } catch (error) {
      setRoomError(roomErrorMessage(error, 'Не удалось создать комнату.'));
    } finally {
      setRoomPending(false);
    }
  }

  async function startMatch() {
    if (!room || !selectedRoomId || roomPending) return;

    const roomId = selectedRoomId;
    const scope = roomScopeRef.current;
    const controller = new AbortController();
    setRoomPending(true);
    setRoomError(null);

    try {
      const result = await roomApi.startMatch(roomId, room.version, controller.signal);
      if (!isCurrentRoomScope(roomId, scope)) return;
      if (!result.ok) {
        if (result.error.code === 'ROOM_ALREADY_ACTIVE' && room.currentMatchId) {
          setRoomError(null);
          await syncMatch(room.currentMatchId, 0, 0, { retryStartup: true });
          return;
        }
        setRoomError(friendlyRoomError(result.error.code, result.error.message));
        return;
      }

      activeMatchRef.current = result.matchId;
      setRoom(result.room);
      await syncMatch(result.matchId, 0, 0, { retryStartup: true });
    } catch (error) {
      if (isCurrentRoomScope(roomId, scope)) {
        setRoomError(roomErrorMessage(error, 'Не удалось начать матч.'));
      }
    } finally {
      if (isCurrentRoomScope(roomId, scope)) setRoomPending(false);
    }
  }

  async function submitAction(action: LegalAction) {
    if (match.status !== 'ready' || match.pending) return;

    boardRef.current?.unlockAudio();
    if (action.type === 'SURRENDER') {
      recordGameplayTelemetry('SURRENDER_UI_CLICK', {
        matchId: match.matchId,
        stateVersion: match.snapshot.stateVersion,
      });
    }

    if (
      action.type === 'SURRENDER' &&
      !window.confirm('Сдаться?\nМатч будет засчитан как поражение.')
    ) {
      return;
    }

    if (action.type === 'SURRENDER') {
      recordGameplayTelemetry('SURRENDER_CONFIRMED', {
        matchId: match.matchId,
        stateVersion: match.snapshot.stateVersion,
      });
    }

    const command = commandFromAction(action, match.matchId, match.snapshot.stateVersion);
    const tappedAt = performance.now();
    recordGameplayTelemetry('COMMAND_CREATED', {
      matchId: command.matchId,
      actionId: command.actionId,
      type: command.type,
      stateVersion: command.expectedStateVersion,
    });
    recordGameplayTelemetry('command-tap', {
      matchId: command.matchId,
      actionId: command.actionId,
      type: command.type,
      expectedStateVersion: command.expectedStateVersion,
    });
    setMatch({ ...match, pending: true, error: null });
    if (action.type === 'ROLL_DICE') {
      setLocalDiceRolling(true);
      recordGameplayTelemetry('LOCAL_DICE_VISUAL_START', {
        matchId: match.matchId,
        stateVersion: match.snapshot.stateVersion,
        sequence: match.lastSequence,
      });
    }
    recordGameplayTelemetry('command-local-feedback', {
      matchId: command.matchId,
      actionId: command.actionId,
      type: command.type,
      tapToLocalFeedbackMs: Math.round((performance.now() - tappedAt) * 100) / 100,
    });

    try {
      recordGameplayTelemetry('COMMAND_SENT', {
        matchId: command.matchId,
        actionId: command.actionId,
        type: command.type,
        stateVersion: command.expectedStateVersion,
      });
      const result = await realtimeClient.sendCommand(command);
      recordGameplayTelemetry('COMMAND_ACK', {
        matchId: command.matchId,
        actionId: command.actionId,
        type: command.type,
        ok: result.ok,
        code: result.ok ? undefined : result.code,
        stateVersion: result.ok ? result.stateVersion : undefined,
        sequence: result.ok ? result.lastSequence : undefined,
      });

      if (!result.ok) {
        setLocalDiceRolling(false);
        setMatch({
          ...match,
          pending: false,
          error: friendlyGameError(result.code, result.message),
        });
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
      const ackTransition = transitionFromCommandResult(result);
      if (ackTransition) {
        applyCommittedTransition(ackTransition, 'command-ack');
      }
      if (ackSyncTimeoutRef.current !== null) {
        window.clearTimeout(ackSyncTimeoutRef.current);
      }
      ackSyncTimeoutRef.current = window.setTimeout(() => {
        setMatch((current) => {
          const controller = presentationControllerRef.current;
          const hasPresentationWork =
            controller?.matchId === result.matchId &&
            (controller.queue.active !== null || controller.queue.queued.length > 0);
          if (
            current.status === 'ready' &&
            current.matchId === result.matchId &&
            current.lastSequence < result.lastSequence &&
            !hasPresentationWork
          ) {
            recordGameplayTelemetry('ACK_EVENT_TIMEOUT_RECOVERY_SYNC', {
              matchId: current.matchId,
              stateVersion: current.snapshot.stateVersion,
              sequence: current.lastSequence,
              expectedSequence: result.lastSequence,
            });
            void syncMatch(current.matchId, current.snapshot.stateVersion, current.lastSequence);
          }
          return current;
        });
      }, 5000);
    } catch {
      setLocalDiceRolling(false);
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
    const currentRoomName = currentMembershipRoom ? `Комната ${currentMembershipRoom.code}` : null;

    return (
      <HomeScreen
        displayName={authState.user.displayName}
        initials={initialsFor(authState.user.displayName)}
        heroImageUrl={REDESIGN_HOME_HERO}
        {...(currentRoomName ? { currentRoomName } : {})}
        {...(homeLastMatch ? { lastMatch: homeLastMatch, onOpenLastMatch: () => navigateTo('#/profile/history') } : {})}
        onPrimaryAction={() =>
          currentMembershipRoom
            ? navigateTo(roomRoute(currentMembershipRoom.roomId))
            : navigateTo('#/rooms')
        }
        {...(onLogout ? { onLogout } : {})}
        onNavigate={redesignNavigate}
      />
    );
  }

  async function skipDebugDummyTurn() {
    if (match.status !== 'ready' || match.pending) return;

    setMatch({ ...match, pending: true, error: null });

    try {
      const result = await realtimeClient.skipDebugDummyTurn({
        matchId: match.matchId,
        stateVersion: match.snapshot.stateVersion,
      });

      if (!result.ok) {
        setLocalDiceRolling(false);
        setMatch({
          ...match,
          pending: false,
          error: friendlyGameError(result.code, result.message),
        });
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
    } catch {
      setLocalDiceRolling(false);
      setMatch({ ...match, pending: false, error: 'Не удалось пропустить debug-ход.' });
    }
  }

  function renderRoomStatusBanner() {
    if (!roomError) return null;
    return (
      <Panel as="section" className="beta-status-banner">
        <p>{roomError}</p>
        {createRoomConflict ? (
          <Button
            variant="secondary"
            onClick={() => {
              activeMatchRef.current = createRoomConflict.matchId;
              navigateTo(roomRoute(createRoomConflict.roomId));
              void syncMatch(createRoomConflict.matchId, 0, 0, { retryStartup: true });
            }}
          >
            Продолжить матч
          </Button>
        ) : null}
      </Panel>
    );
  }

  if (!selectedRoomId) {
    if (compactViewport) {
      return <>
        <RoomsScreen
          rooms={roomList.filter((entry) => entry.status !== 'CLOSED').map(toRedesignRoomSummary)}
          onCreateRoom={() => void createAndJoinRoom()}
          onRefresh={() => void mutateRoom((signal) => loadRoomList(signal))}
          onOpenRoom={(roomId) => navigateTo(roomRoute(roomId))}
          onNavigate={redesignNavigate}
        />
        {renderRoomStatusBanner()}
      </>;
    }
    return (
      <section className="beta-room-page beta-room-page--list">
        <header className="beta-room-page__header">
          <div>
            <p className="beta-room-page__eyebrow">Multi-room beta</p>
            <h1>Комнаты</h1>
          </div>

          <div className="beta-room-page__header-actions">
            <Button onClick={() => void createAndJoinRoom()} loading={roomPending}>
              Создать комнату
            </Button>
            <Button
              variant="secondary"
              onClick={() => void mutateRoom((signal) => loadRoomList(signal))}
              loading={roomPending}
            >
              Обновить
            </Button>
          </div>
        </header>

        <div className="beta-room-page__filters" aria-label="Фильтр комнат">
          {([
            ['ALL', 'Все'],
            ['WAITING', 'Ожидают'],
            ['ACTIVE', 'Играют'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={roomFilter === value ? 'is-selected' : undefined}
              aria-pressed={roomFilter === value}
              onClick={() => setRoomFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {renderRoomStatusBanner()}

        <div className="beta-room-page__lobby">
          <Panel as="section" className="beta-room-page__seats">
            <h2>Доступные комнаты</h2>

            <div className="beta-room-page__seat-grid">
              {roomList
                .filter((entry) => roomFilter === 'ALL' || entry.status === roomFilter)
                .map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`beta-room-page__seat-card beta-room-page__seat-card--${entry.status.toLowerCase()}`}
                  aria-label={`Открыть комнату ${entry.code}`}
                  onClick={() => navigateTo(roomRoute(entry.id))}
                >
                  <div className="beta-room-page__seat-copy">
                    <strong>{`Комната ${entry.code}`}</strong>
                    <span className="beta-room-page__room-status">
                      {entry.status === 'ACTIVE' ? 'Идёт матч' : 'Ожидает игроков'}
                    </span>
                    <span className="beta-room-page__room-counts">
                      <span>{`${entry.counts.memberCount} участн.`}</span>
                      <span>{`${entry.counts.seatedCount} / 4 места`}</span>
                      <span>{`${entry.counts.readyCount} готовы`}</span>
                    </span>
                  </div>
                  <span className="beta-room-page__room-chevron" aria-hidden="true">›</span>
                </button>
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
          <EmptyState
            title="Матч временно недоступен"
            description="Не удалось подготовить игровой экран. Обновите комнату."
          />
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
          mobileLayout={compactViewport}
          showMobilePawnTray={
            compactViewport &&
            displaySnapshot?.status === 'ACTIVE' &&
            displaySnapshot.currentPlayerId === authState.user.id &&
            displaySnapshot.turnPhase === 'WAITING_FOR_ACTION' &&
            displaySnapshot.diceValue === 6 &&
            pawnActions.length > 0
          }
          dieRolling={match.pending && Boolean(rollAction)}
          presentation={boardPresentationRuntime ?? undefined}
          victoryPlayerId={displaySnapshot?.winnerPlayerId ?? null}
          victoryReason={displaySnapshot?.winReason ?? null}
          turnPanel={{
            heading: 'Матч',
            badge: compactViewport ? matchDuration : `Время ${matchDuration}`,
            tone:
              displaySnapshot?.status === 'FINISHED'
                ? 'finished'
                : displaySnapshot?.currentPlayerId === authState.user.id
                  ? 'local'
                  : 'opponent',
            title:
              compactViewport && displaySnapshot?.currentPlayerId === authState.user.id
                ? 'Ваш ход'
                : status?.title,
            subtitle:
              compactViewport &&
              displaySnapshot?.currentPlayerId === authState.user.id &&
              displaySnapshot.turnPhase === 'WAITING_FOR_ACTION'
                ? 'Выберите пешку'
                : compactViewport &&
                    displaySnapshot?.currentPlayerId === authState.user.id &&
                    displaySnapshot.turnPhase === 'WAITING_FOR_ROLL'
                  ? ''
                  : status?.subtitle,
            dieLabel:
              boardDieValue === undefined
                ? 'Кубик: ожидание броска'
                : `Кубик: ${boardDieValue}`,
            dieValueText:
              boardDieValue === undefined
                ? compactViewport && displaySnapshot?.currentPlayerId === authState.user.id
                  ? ''
                  : 'Кубик ещё не брошен'
                : `Выпало: ${boardDieValue}`,
            primaryAction:
              displaySnapshot?.status === 'FINISHED' ? undefined : rollAction ? (
                <Button
                  onClick={() => void submitAction(rollAction)}
                  loading={match.pending}
                  disabled={match.pending}
                >
                  {actionLabel(rollAction)}
                </Button>
              ) : debugDummyTurn ? (
                <Button
                  onClick={() => void skipDebugDummyTurn()}
                  loading={match.pending}
                  disabled={match.pending}
                >
                  Пропустить ход бота
                </Button>
              ) : undefined,
            secondaryActions:
              displaySnapshot?.status === 'FINISHED' || compactViewport ? undefined : surrenderAction ? (
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
                  <p>
                    {displaySnapshot.winnerPlayerId === authState.user.id
                      ? `${winnerName} Ты победил(а)! Время игры ${matchDuration}`
                      : `Победитель — ${winnerName}. Время игры ${matchDuration}`}
                  </p>
                  <Button data-testid="return-to-room" onClick={() => void returnToRoom()}>
                    Вернуться в комнату
                  </Button>
                  {compactViewport ? mobileGameplayTools : utilityActions}
                </div>
              ) : (
                <div className="beta-room-page__controls">
                  {!compactViewport && !rollAction && pawnActions.length > 0 ? (
                    <p>Доступные пешки подсвечены на поле и в резерве.</p>
                  ) : null}
                  {compactViewport ? mobileGameplayTools : utilityActions}
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
            <Button variant="secondary" onClick={() => setUtilityPanel(null)}>
              Назад к игре
            </Button>
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
              {historyItems.length === 0 ? (
                <p>История появится после первых событий матча.</p>
              ) : null}
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
              {historyItems.length === 0 ? (
                <p>История появится после первых событий матча.</p>
              ) : null}
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
              <p>{`Мест занято: ${room.counts.seatedCount} / 4`}</p>
              {soundControl}
              <Button variant="secondary" onClick={() => setUtilityPanel(null)}>
                Закрыть
              </Button>
              <Button
                variant="secondary"
                onClick={() => void navigator.clipboard?.writeText(room.code)}
              >
                Копировать код
              </Button>
              {displaySnapshot?.status !== 'ACTIVE' && room.currentUser.isMember ? (
                <Button variant="ghost" onClick={() => void leaveCurrentRoom()}>
                  Покинуть комнату
                </Button>
              ) : room.currentUser.isMember ? (
                <p>Сначала завершите матч или сдайте партию.</p>
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
              <p>{`Мест занято: ${room.counts.seatedCount} / 4`}</p>
              {soundControl}
              <Button variant="secondary" onClick={() => setUtilityPanel(null)}>
                Закрыть
              </Button>
              <Button
                variant="secondary"
                onClick={() => void navigator.clipboard?.writeText(room.code)}
              >
                Копировать код
              </Button>
              {displaySnapshot?.status !== 'ACTIVE' && room.currentUser.isMember ? (
                <Button variant="ghost" onClick={() => void leaveCurrentRoom()}>
                  Покинуть комнату
                </Button>
              ) : room.currentUser.isMember ? (
                <p>Сначала завершите матч или сдайте партию.</p>
              ) : null}
            </div>
          </Dialog>
        )}
      </section>
    );
  }

  if (compactViewport && room && !room.currentMatchId && !showFinishedMatch) {
    const availableSeats = room.seats.filter((seat) => !seat.participantId);
    const mine = room.seats.find((seat) => seat.seatIndex === mySeatIndex) ?? null;
    const membershipConflict = !room.currentUser.isMember && currentMembershipRoom && currentMembershipRoom.roomId !== room.id
      ? currentMembershipRoom
      : null;
    const primaryAction = membershipConflict
      ? {
          label: membershipConflict.status === 'ACTIVE' || membershipConflict.currentMatchId ? 'Продолжить матч' : 'Вернуться в мою комнату',
          onClick: () => navigateTo(roomRoute(membershipConflict.roomId)),
        }
      : !room.currentUser.isMember
        ? { label: 'Войти в комнату', onClick: () => void mutateRoom((signal) => roomApi.joinRoom(selectedRoomId, signal)), disabled: roomPending }
        : mySeatIndex === null && availableSeats[0]
          ? { label: `Занять место ${availableSeats[0].seatIndex + 1}`, onClick: () => void mutateRoom((signal) => roomApi.takeSeat(selectedRoomId, availableSeats[0]!.seatIndex, room.version, signal)), disabled: roomPending }
          : soloDebugStartAvailable
            ? { label: 'Начать тестовый матч', onClick: () => void startMatch(), disabled: roomPending }
          : room.currentUser.canStart
            ? { label: 'Начать игру', onClick: () => void startMatch(), disabled: roomPending }
            : mine
              ? { label: mine.ready ? 'Снять готовность' : 'Готов', onClick: () => void mutateRoom((signal) => roomApi.setReady(selectedRoomId, !mine.ready, room.version, signal)), disabled: roomPending }
              : null;
    const secondaryActions = [
      ...(room.currentUser.isMember && !room.currentMatchId ? [{ label: 'Поделиться', onClick: () => void shareCurrentRoom(), disabled: roomPending || sharePending }] : []),
      ...(membershipConflict && membershipConflict.status !== 'ACTIVE' && !membershipConflict.currentMatchId ? [{ label: 'Перейти в эту комнату', onClick: () => void switchFromCurrentMembershipTo(selectedRoomId), disabled: roomPending }] : []),
      ...(room.currentUser.isMember && mySeatIndex === null ? availableSeats.slice(1).map((seat) => ({ label: `Занять место ${seat.seatIndex + 1}`, onClick: () => void mutateRoom((signal) => roomApi.takeSeat(selectedRoomId, seat.seatIndex, room.version, signal)), disabled: roomPending })) : []),
      ...(mine && room.currentUser.canStart ? [{ label: mine.ready ? 'Снять готовность' : 'Готов', onClick: () => void mutateRoom((signal) => roomApi.setReady(selectedRoomId, !mine.ready, room.version, signal)), disabled: roomPending }] : []),
      ...(mine ? [{ label: 'Покинуть место', onClick: () => void mutateRoom((signal) => roomApi.leaveSeat(selectedRoomId, room.version, signal)), disabled: roomPending }] : []),
      ...(room.currentUser.isMember ? [{ label: 'Настройки комнаты', onClick: () => setUtilityPanel('settings') }, { label: 'Покинуть комнату', onClick: () => void leaveCurrentRoom(), disabled: roomPending, destructive: true }] : []),
    ];

    return <>
      <RoomLobbyScreen
        room={toRedesignRoomDetails(room, membersById)}
        isOwner={Boolean(room.currentUser.canManageBots)}
        canStart={room.currentUser.canStart}
        busy={roomPending}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        onBack={() => navigateTo('#/rooms')}
        onCopyCode={() => void navigator.clipboard?.writeText(room.code)}
        onMore={() => setUtilityPanel('settings')}
        onStart={() => void startMatch()}
        onLeave={() => void leaveCurrentRoom()}
        onAddBot={(seatIndex) =>
          void mutateRoom((signal) => roomApi.addBot!(selectedRoomId, seatIndex, room.version, signal))
        }
        onRemoveBot={(seatIndex) =>
          void mutateRoom((signal) => roomApi.removeBot!(selectedRoomId, seatIndex, room.version, signal))
        }
      />
      {roomError ? <Panel as="section" className="beta-status-banner">{roomError}</Panel> : null}
      <Dialog open={utilityPanel === 'settings'} onOpenChange={(open) => setUtilityPanel(open ? 'settings' : null)} title="Настройки комнаты" description={`Код комнаты: ${room.code}`}>
        <div className="beta-room-page__settings-dialog-actions">
          {room.currentUser.canManageBots && !room.currentMatchId ? (
            <Button variant="ghost" onClick={() => void deleteCurrentRoom()} loading={roomPending}>
              Удалить комнату
            </Button>
          ) : null}
          {room.currentUser.isMember && !room.currentMatchId ? (
            <Button variant="secondary" onClick={() => void shareCurrentRoom()} loading={sharePending}>
              Поделиться
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(room.code)}>Скопировать код</Button>
          <Button variant="ghost" onClick={() => setUtilityPanel(null)}>Закрыть</Button>
        </div>
      </Dialog>
    </>;
  }

  return (
    <section className="beta-room-page">
      <header className="beta-room-page__header">
        <div>
          <p className="beta-room-page__eyebrow">Multi-room beta</p>
          <h1>{room ? `Комната ${room.code}` : 'Комната'}</h1>
        </div>

        <div className="beta-room-page__header-actions">
          <Button
            variant="secondary"
            onClick={() => void refreshRoom(selectedRoomId)}
            loading={roomPending}
          >
            Обновить
          </Button>

          {room?.currentUser.isMember && !room.currentMatchId ? (
            <Button variant="ghost" onClick={() => setUtilityPanel('settings')}>
              ⚙ Настройки комнаты
            </Button>
          ) : null}

          {soloDebugStartAvailable ? (
            <Button
              onClick={() => void startMatch()}
              loading={roomPending}
              disabled={!room?.currentUser.canStart}
            >
              Начать тестовый матч
            </Button>
          ) : room?.currentMatchId ? null : (
            <Button
              onClick={() => void startMatch()}
              loading={roomPending}
              disabled={!room?.currentUser.canStart}
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

      {!room ? (
        roomError ? null : <Panel as="section">Загрузка комнаты…</Panel>
      ) : !room.currentMatchId && !showFinishedMatch ? (
        <div className="beta-room-page__lobby">
          <Panel as="section" className="beta-room-page__seats">
            <h2>Игроки</h2>

            {!room.currentUser.isMember && currentMembershipRoom && currentMembershipRoom.roomId !== room.id ? (
              <div className="beta-room-page__seat-actions">
                <p>
                  {currentMembershipRoom.status === 'ACTIVE' || currentMembershipRoom.currentMatchId
                    ? 'У вас идёт активный матч в другой комнате.'
                    : `Вы уже находитесь в комнате ${currentMembershipRoom.code}.`}
                </p>
                <Button onClick={() => navigateTo(roomRoute(currentMembershipRoom.roomId))}>
                  {currentMembershipRoom.status === 'ACTIVE' || currentMembershipRoom.currentMatchId
                    ? 'Вернуться в матч'
                    : 'Перейти в мою комнату'}
                </Button>
                {currentMembershipRoom.status !== 'ACTIVE' && !currentMembershipRoom.currentMatchId ? (
                  <Button
                    variant="secondary"
                    loading={roomPending}
                    onClick={() => void switchFromCurrentMembershipTo(selectedRoomId)}
                  >
                    Покинуть её и войти сюда
                  </Button>
                ) : null}
              </div>
            ) : !room.currentUser.isMember ? (
              <div className="beta-room-page__seat-actions">
                <Button
                  onClick={() =>
                    void mutateRoom((signal) => roomApi.joinRoom(selectedRoomId, signal))
                  }
                  loading={roomPending}
                >
                  Войти в комнату
                </Button>
              </div>
            ) : null}

            <div className="beta-room-page__seat-grid">
              {room.seats.map((seat) => {
                const member = seat.userId ? (membersById.get(seat.userId) ?? null) : null;
                const isMine = seat.seatIndex === mySeatIndex;

                return (
                  <Panel
                    key={seat.seatIndex}
                    as="article"
                    className="beta-room-page__seat-card"
                    selected={isMine}
                  >
                    <div className="beta-room-page__seat-copy">
                      <strong>{seatLabel(seat.seatIndex)}</strong>
                      {member ? (
                        <>
                          <span>
                            {member.userId === authState.user.id
                              ? `${member.displayName} (Вы)`
                              : member.displayName}
                          </span>
                          <span>{seat.ready ? 'Готов' : 'Не готов'}</span>
                        </>
                      ) : (
                        <span>Свободно</span>
                      )}
                    </div>

                    {!member && room.currentUser.isMember && mySeatIndex === null ? (
                      <Button
                        onClick={() =>
                          void mutateRoom((signal) =>
                            roomApi.takeSeat(selectedRoomId, seat.seatIndex, room.version, signal),
                          )
                        }
                      >
                        {`Занять место ${seat.seatIndex + 1}`}
                      </Button>
                    ) : null}

                    {isMine ? (
                      <div className="beta-room-page__seat-actions">
                        <Button
                          variant={seat.ready ? 'secondary' : 'primary'}
                          onClick={() =>
                            void mutateRoom((signal) =>
                              roomApi.setReady(selectedRoomId, !seat.ready, room.version, signal),
                            )
                          }
                        >
                          {seat.ready ? 'Снять готовность' : 'Готов'}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            void mutateRoom((signal) =>
                              roomApi.leaveSeat(selectedRoomId, room.version, signal),
                            )
                          }
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
            <p>{`Участников: ${room.counts.memberCount}`}</p>
            {soundControl}
            <Button variant="secondary" onClick={() => setUtilityPanel(null)}>
              Закрыть
            </Button>
            <p>{`Игроков: ${occupiedCount} / 4`}</p>
            <p>{`Готовы: ${readyCount} / ${occupiedCount}`}</p>
            <p>{room.currentUser.startBlockedReason ?? 'Можно начинать матч.'}</p>

            {room.currentUser.isMember ? (
              <Button variant="secondary" onClick={() => void leaveCurrentRoom()}>
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

      {canShowRoomSettings(room, showFinishedMatch) && room ? (
        <Dialog
          open={utilityPanel === 'settings'}
          onOpenChange={(open) => setUtilityPanel(open ? 'settings' : null)}
          title="Настройки комнаты"
        >
          <div className="beta-room-page__settings-panel">
            {room.currentUser.canManageBots ? (
              <Button variant="ghost" onClick={() => void deleteCurrentRoom()} loading={roomPending}>
                Удалить комнату
              </Button>
            ) : null}
            <p>{`Код комнаты: ${room.code}`}</p>
            <p>{`Участников: ${room.counts.memberCount}`}</p>
            <Button
              variant="secondary"
              onClick={() => void navigator.clipboard?.writeText(room.code)}
            >
              Копировать код
            </Button>
            {room.currentUser.isMember ? (
              <Button variant="ghost" onClick={() => void leaveCurrentRoom()}>
                Покинуть комнату
              </Button>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
