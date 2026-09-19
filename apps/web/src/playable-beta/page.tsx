import { getLegalActions, type GameState, type LegalAction } from '@zamanushka/game-engine';
import type {
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
import { formatMatchDuration, matchDurationMilliseconds } from '../game/match-duration.js';
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
import { GAMEPLAY_SOUND_ENABLED_KEY } from '../game/premium3d/audio.js';
import { RulesPage } from '../rules/rules-page.js';
import type { MatchSummary as RedesignMatchSummary } from '../redesign-v1/index.js';
import type { RealtimeClient } from './realtime-client.js';
import { RoomApiError, type RoomApi } from './room-api.js';

type Variant = 'home' | 'rooms';

interface PlayableBetaPageProps {
  variant: Variant;
  authState: Extract<AuthState, { status: 'AUTHENTICATED' }>;
  routeHash: string;
  roomApi: RoomApi;
  realtimeClient: RealtimeClient;
  onLogout?: () => void;
  homeLastMatch?: RedesignMatchSummary;
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
const MATCH_START_SYNC_RETRY_DELAYS_MS = [100, 250, 500] as const;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

const seatLabels = ['РњРµСЃС‚Рѕ 1', 'РњРµСЃС‚Рѕ 2', 'РњРµСЃС‚Рѕ 3', 'РњРµСЃС‚Рѕ 4'] as const;
const colorLabels = {
  RED: 'РљСЂР°СЃРЅС‹Рµ',
  BLUE: 'РЎРёРЅРёРµ',
  GREEN: 'Р—РµР»С‘РЅС‹Рµ',
  YELLOW: 'Р–С‘Р»С‚С‹Рµ',
} as const;
const colorActionLabels = {
  RED: 'РєСЂР°СЃРЅСѓСЋ',
  BLUE: 'СЃРёРЅСЋСЋ',
  GREEN: 'Р·РµР»С‘РЅСѓСЋ',
  YELLOW: 'Р¶С‘Р»С‚СѓСЋ',
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
    return roomError.code === 'INVALID_RESPONSE'
      ? fallback
      : friendlyRoomError(roomError.code, roomError.message);
  }

  return fallback;
}

function friendlyRoomError(code: string, fallback: string) {
  switch (code) {
    case 'ROOM_ALREADY_ACTIVE':
      return 'РњР°С‚С‡ СѓР¶Рµ РёРґС‘С‚. Р’РѕР·РІСЂР°С‰Р°РµРј РІР°СЃ РІ С‚РµРєСѓС‰СѓСЋ РёРіСЂСѓ.';
    case 'USER_ALREADY_IN_ANOTHER_ROOM':
      return 'Р’С‹ СѓР¶Рµ РЅР°С…РѕРґРёС‚РµСЃСЊ РІ РґСЂСѓРіРѕР№ РєРѕРјРЅР°С‚Рµ.';
    case 'STALE_ROOM_VERSION':
      return 'РЎРѕСЃС‚РѕСЏРЅРёРµ РєРѕРјРЅР°С‚С‹ РёР·РјРµРЅРёР»РѕСЃСЊ. РћР±РЅРѕРІР»СЏРµРј РґР°РЅРЅС‹РµвЂ¦';
    case 'SEAT_TAKEN':
      return 'Р­С‚Рѕ РјРµСЃС‚Рѕ СѓР¶Рµ Р·Р°РЅСЏС‚Рѕ.';
    case 'NOT_ROOM_MEMBER':
      return 'РЎРЅР°С‡Р°Р»Р° РІРѕР№РґРёС‚Рµ РІ РєРѕРјРЅР°С‚Сѓ.';
    case 'ROOM_NOT_READY':
      return 'Р”Р»СЏ РЅР°С‡Р°Р»Р° РјР°С‚С‡Р° РІСЃРµ РёРіСЂРѕРєРё Р·Р° РјРµСЃС‚Р°РјРё РґРѕР»Р¶РЅС‹ Р±С‹С‚СЊ РіРѕС‚РѕРІС‹.';
    case 'ROOM_FULL':
      return 'Р’ РєРѕРјРЅР°С‚Рµ Р±РѕР»СЊС€Рµ РЅРµС‚ СЃРІРѕР±РѕРґРЅС‹С… РјРµСЃС‚.';
    case 'ROOM_CLOSED':
      return 'Р­С‚Р° РєРѕРјРЅР°С‚Р° СЃРµР№С‡Р°СЃ РЅРµРґРѕСЃС‚СѓРїРЅР°.';
    case 'NOT_ALLOWED':
      return 'Р­С‚Рѕ РґРµР№СЃС‚РІРёРµ СЃРµР№С‡Р°СЃ РЅРµРґРѕСЃС‚СѓРїРЅРѕ.';
    default:
      return fallback;
  }
}

function friendlyGameError(code: string, fallback: string) {
  switch (code) {
    case 'NOT_YOUR_TURN':
      return 'РҐРѕРґ СЃРѕРїРµСЂРЅРёРєР°. Р–РґС‘Рј РµРіРѕ РґРµР№СЃС‚РІРёРµ.';
    case 'STALE_STATE_VERSION':
      return 'РЎРѕСЃС‚РѕСЏРЅРёРµ РјР°С‚С‡Р° РѕР±РЅРѕРІРёР»РѕСЃСЊ. РЎРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµРј С‚РµРєСѓС‰РёР№ С…РѕРґ.';
    case 'MATCH_FINISHED':
      return 'РњР°С‚С‡ СѓР¶Рµ Р·Р°РІРµСЂС€С‘РЅ.';
    case 'PAWN_NOT_MOVABLE':
    case 'INVALID_ACTION':
      return 'Р­С‚Рѕ РґРµР№СЃС‚РІРёРµ СЃРµР№С‡Р°СЃ РЅРµРґРѕСЃС‚СѓРїРЅРѕ.';
    default:
      return fallback;
  }
}

function actionLabel(action: LegalAction) {
  switch (action.type) {
    case 'ROLL_DICE':
      return 'Р‘СЂРѕСЃРёС‚СЊ РєСѓР±РёРє';
    case 'SURRENDER':
      return 'РЎРґР°С‚СЊСЃСЏ';
    case 'ENTER_PAWN':
      return 'Р’С‹РІРµСЃС‚Рё РїРµС€РєСѓ';
    case 'MOVE_PAWN':
      return `РҐРѕРґ ${action.pawnId.split('-').at(-1) ?? 'РїРµС€РєРѕР№'}`;
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
  const colorLabel = pawn ? colorActionLabels[pawn.color] : 'СЌС‚Сѓ';

  if (action.type === 'ENTER_PAWN') {
    return `Р’С‹РІРµСЃС‚Рё ${colorLabel} РїРµС€РєСѓ РЅР° РїРѕР»Рµ`;
  }

  return `РџРµСЂРµРјРµСЃС‚РёС‚СЊ ${colorLabel} РїРµС€РєСѓ ${pawnOrdinal(action.pawnId)}`;
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

  return merged.sort((left, right) => left.createdAt.localeCompare(right.createdAt)).slice(-120);
}

function actorLabel(snapshot: MatchSnapshot, playerId: string) {
  const player = snapshot.players.find((candidate) => candidate.playerId === playerId);
  return player ? colorLabels[player.color] : 'РРіСЂРѕРє';
}

function describeEvent(
  snapshot: MatchSnapshot,
  event: TransitionEnvelope['events'][number],
): MatchHistoryItem {
  switch (event.type) {
    case 'diceRolled':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.playerId)} Р±СЂРѕСЃРёР»Рё РєСѓР±РёРє`,
        detail: `Р’С‹РїР°Р»Рѕ ${event.payload.diceValue}.`,
        createdAt: event.createdAt,
      };
    case 'pawnEntered':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.playerId)} РІС‹РІРµР»Рё РїРµС€РєСѓ`,
        detail: 'РџРµС€РєР° РІРѕС€Р»Р° РЅР° РїРѕР»Рµ.',
        createdAt: event.createdAt,
      };
    case 'pawnMoved':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.playerId)} СЃРґРµР»Р°Р»Рё С…РѕРґ`,
        detail: event.payload.capture
          ? 'РҐРѕРґ Р·Р°РІРµСЂС€РёР»СЃСЏ РІР·СЏС‚РёРµРј.'
          : `РџСѓС‚СЊ: ${event.payload.physicalPath.length} РєР»РµС‚РѕРє.`,
        createdAt: event.createdAt,
      };
    case 'pawnCaptured':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.byPlayerId)} СЃР±РёР»Рё РїРµС€РєСѓ`,
        detail: 'РџРµС€РєР° СЃРѕРїРµСЂРЅРёРєР° СЃРЅСЏС‚Р° СЃ РїРѕР»СЏ.',
        createdAt: event.createdAt,
      };
    case 'pawnEnteredHome':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.playerId)} РІРѕС€Р»Рё РІ РґРѕРј`,
        detail: `Р”РѕРјР°С€РЅСЏСЏ РїРѕР·РёС†РёСЏ ${event.payload.homeIndex + 1}.`,
        createdAt: event.createdAt,
      };
    case 'playerSurrendered':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.playerId)} СЃРґР°Р»РёСЃСЊ`,
        detail: 'РРіСЂРѕРє Р±РѕР»СЊС€Рµ РЅРµ СѓС‡Р°СЃС‚РІСѓРµС‚ РІ РјР°С‚С‡Рµ.',
        createdAt: event.createdAt,
      };
    case 'pawnRemoved':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.playerId)} РїРѕС‚РµСЂСЏР»Рё РїРµС€РєСѓ`,
        detail: 'РџРµС€РєР° СѓР±СЂР°РЅР° РёР· Р°РєС‚РёРІРЅРѕР№ РёРіСЂС‹.',
        createdAt: event.createdAt,
      };
    case 'extraRollGranted':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.playerId)} РїРѕР»СѓС‡Р°СЋС‚ РµС‰С‘ Р±СЂРѕСЃРѕРє`,
        detail:
          event.payload.reason === 'CAPTURE'
            ? 'РџРµС€РєР° СЃР±РёС‚Р° вЂ” Р±СЂРѕСЃР°Р№С‚Рµ РµС‰С‘ СЂР°Р·.'
            : 'РџРѕСЃР»Рµ С€РµСЃС‚С‘СЂРєРё С…РѕРґ СЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ.',
        createdAt: event.createdAt,
      };
    case 'turnChanged':
      return {
        id: event.eventId,
        title: `РҐРѕРґ РїРµСЂРµС…РѕРґРёС‚ Рє ${actorLabel(snapshot, event.payload.toPlayerId)}`,
        detail: 'РћС‡РµСЂРµРґСЊ С…РѕРґР° РѕР±РЅРѕРІР»РµРЅР°.',
        createdAt: event.createdAt,
      };
    case 'gameWon':
      return {
        id: event.eventId,
        title: `${actorLabel(snapshot, event.payload.winnerPlayerId)} РїРѕР±РµРґРёР»Рё`,
        detail:
          event.payload.reason === 'LAST_ACTIVE_PLAYER'
            ? 'РџРѕР±РµРґР° РєР°Рє РїРѕСЃР»РµРґРЅРёР№ Р°РєС‚РёРІРЅС‹Р№ РёРіСЂРѕРє.'
            : 'РџРѕР±РµРґР° РїРѕ РґРѕРјР°С€РЅРµР№ РґРёР°РіРѕРЅР°Р»Рё.',
        createdAt: event.createdAt,
      };
  }
}

function statusCopy(snapshot: MatchSnapshot, currentUserId: string, actionCount: number) {
  const isMyTurn = snapshot.currentPlayerId === currentUserId;

  if (snapshot.status === 'FINISHED') {
    return {
      title: 'РњР°С‚С‡ Р·Р°РІРµСЂС€С‘РЅ',
      subtitle: 'РС‚РѕРіРё РјР°С‚С‡Р°',
    };
  }

  if (snapshot.turnPhase === 'WAITING_FOR_ROLL') {
    return {
      title: isMyTurn ? 'Р’Р°С€ С…РѕРґ' : 'РҐРѕРґ СЃРѕРїРµСЂРЅРёРєР°',
      subtitle: isMyTurn ? 'Р‘СЂРѕСЃСЊС‚Рµ РєСѓР±РёРє.' : 'Р–РґС‘Рј Р±СЂРѕСЃРѕРє СЃРѕРїРµСЂРЅРёРєР°.',
    };
  }

  if (snapshot.turnPhase === 'WAITING_FOR_ACTION') {
    return {
      title: isMyTurn ? 'Р’С‹Р±РµСЂРёС‚Рµ РїРµС€РєСѓ' : 'РҐРѕРґ СЃРѕРїРµСЂРЅРёРєР°',
      subtitle: isMyTurn
        ? actionCount > 0
          ? 'Р”РѕСЃС‚СѓРїРЅС‹Рµ РїРµС€РєРё РїРѕРґСЃРІРµС‡РµРЅС‹ РЅР° РїРѕР»Рµ Рё РІ СЂРµР·РµСЂРІРµ.'
          : 'РћР¶РёРґР°РµРј СЃР»РµРґСѓСЋС‰РµРµ СЃРѕСЃС‚РѕСЏРЅРёРµ РјР°С‚С‡Р°.'
        : 'РЎРѕРїРµСЂРЅРёРє РІС‹Р±РёСЂР°РµС‚ РґРµР№СЃС‚РІРёРµ.',
    };
  }

  return {
    title: isMyTurn ? 'Р’Р°С€ С…РѕРґ' : 'РҐРѕРґ СЃРѕРїРµСЂРЅРёРєР°',
    subtitle: 'РЎРѕСЃС‚РѕСЏРЅРёРµ РјР°С‚С‡Р° РѕР±РЅРѕРІР»СЏРµС‚СЃСЏ.',
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
  onLogout: _onLogout,
  homeLastMatch: _homeLastMatch,
}: PlayableBetaPageProps) {
  const selectedRoomId = variant === 'rooms' ? parseRoomId(routeHash) : null;
  const [roomList, setRoomList] = useState<Awaited<ReturnType<RoomApi['listRooms']>>['rooms']>([]);
  const [currentMembershipRoom, setCurrentMembershipRoom] = useState<
    Awaited<ReturnType<RoomApi['listRooms']>>['currentMembershipRoom']
  >(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(
    () => typeof localStorage === 'undefined' || localStorage.getItem(GAMEPLAY_SOUND_ENABLED_KEY) !== 'false',
  );
  const [roomPending, setRoomPending] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
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
    pending: {
      stateVersion: number;
      lastSequence: number;
      options: { retryStartup?: boolean };
    } | null;
  } | null>(null);
  const boardRef = useRef<PremiumPresentationHandle | null>(null);
  const ackSyncTimeoutRef = useRef<number | null>(null);
  const [presentationController, setPresentationController] =
    useState<PresentationControllerState | null>(null);
  const [presentationRuntime, setPresentationRuntime] =
    useState<GameplayAnimationRuntimeState | null>(null);
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

  const isCurrentRoomScope = useCallback(
    (roomId: string, scope: number) =>
      selectedRoomIdRef.current === roomId && roomScopeRef.current === scope,
    [],
  );

  const clearMatchPresentation = useCallback(() => {
    matchScopeRef.current += 1;
    activeMatchRef.current = null;
    if (ackSyncTimeoutRef.current !== null) {
      window.clearTimeout(ackSyncTimeoutRef.current);
      ackSyncTimeoutRef.current = null;
    }
    matchWatermarkRef.current = null;
    hydrationRef.current = null;
    syncInFlightRef.current = null;
    setMatch({ status: 'idle' });
    setPresentationController(null);
    setPresentationRuntime(null);
    setHistoryItems([]);
  }, []);

  useEffect(() => {
    roomScopeRef.current += 1;
    clearMatchPresentation();
    setRoom(null);
    setCurrentMembershipRoom(null);
    setRoomError(null);
    setRoomPending(Boolean(selectedRoomId));
    setUtilityPanel(null);
    setMobileChatOpen(false);
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
    setPresentationController((current) =>
      current && current.matchId === matchId
        ? reconcileAuthoritativeSnapshot(current, matchId, snapshot)
        : createPresentationController(matchId, snapshot),
    );
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

            let nextController = createPresentationController(matchId, snapshot);
            for (const transition of replayTransitions) {
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
            error,
          });
          setMatch({ status: 'error', message: 'РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРєР»СЋС‡РёС‚СЊ РјР°С‚С‡.' });
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
      if (typeof window !== 'undefined' && window.localStorage.getItem('zamanushka:roomTelemetry') === 'true') {
        console.info('[room-entry]', {
          event: 'room-route-mounted',
          at: new Date().toISOString(),
          roomId: selectedRoomId,
          scope,
        });
      }
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
          setRoomError(roomErrorMessage(error, 'РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРєР»СЋС‡РёС‚СЊСЃСЏ Рє РєРѕРјРЅР°С‚Рµ.'));
          setRoom(null);
          setRoomPending(false);
        });
    } else {
      void loadRoomList(controller.signal).catch((error) => {
        setRoomError(roomErrorMessage(error, 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРїРёСЃРѕРє РєРѕРјРЅР°С‚.'));
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

      const hydration = hydrationRef.current;
      if (hydration?.matchId === transition.matchId) {
        hydration.buffer.push(transition);
        return;
      }

      setPresentationController((current) => {
        if (!current || current.matchId !== transition.matchId) {
          return current;
        }

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

      setMatch((current) => {
        return applyAuthoritativeTransitionToMatch(current, transition);
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
      setChatError('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРѕРѕР±С‰РµРЅРёСЏ РєРѕРјРЅР°С‚С‹.');
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
  const matchDuration = useMatchDuration(displaySnapshot);
  const legalActions = displaySnapshot
    ? getLegalActions(displaySnapshot as GameState, authState.user.id)
    : [];
  const nonSurrenderActions = legalActions.filter((action) => action.type !== 'SURRENDER');
  const rollAction = nonSurrenderActions.find((action) => action.type === 'ROLL_DICE') ?? null;
  const surrenderAction = legalActions.find((action) => action.type === 'SURRENDER') ?? null;
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
        (room?.members ?? []).map((member) => [
          member.userId,
          member.userId === authState.user.id ? `${member.displayName} (Р’С‹)` : member.displayName,
        ]),
      ),
    [authState.user.id, room?.members],
  );
  const winnerName = useMemo(() => {
    const winnerId = displaySnapshot?.winnerPlayerId;
    if (!winnerId) return 'РРіСЂРѕРє';
    return room?.members.find((member) => member.userId === winnerId)?.displayName ?? 'РРіСЂРѕРє';
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
  const readyMatchBoardProps =
    displaySnapshot && displaySnapshot.diceValue !== null
      ? { dieValue: displaySnapshot.diceValue as DieValue }
      : {};
  const utilityActions = room ? (
    <div className="beta-room-page__utility-actions">
      <button type="button" onClick={() => setUtilityPanel('rules')}>
        в–¤ РџСЂР°РІРёР»Р° РёРіСЂС‹
      </button>
      <button type="button" onClick={() => setUtilityPanel('history')}>
        в—ґ РСЃС‚РѕСЂРёСЏ С…РѕРґРѕРІ
      </button>
      <button type="button" onClick={() => setUtilityPanel('settings')}>
        вљ™ РќР°СЃС‚СЂРѕР№РєРё РєРѕРјРЅР°С‚С‹
      </button>
      {compactViewport ? (
        <button type="button" onClick={() => setMobileChatOpen(true)}>
          рџ’¬ {unreadChatCount > 0 ? `Р§Р°С‚ вЂў ${unreadChatCount}` : 'Р§Р°С‚'}
        </button>
      ) : null}
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
      {`Р—РІСѓРєРё: ${soundEnabled ? 'Р’РєР»' : 'Р’С‹РєР»'}`}
    </Button>
  );
  const chatPanel = room ? (
    <section className="game-board-scene__chat-card game-board-scene__chat-card--live">
      <div className="game-board-scene__panel-heading">
        <h2>Р§Р°С‚ РєРѕРјРЅР°С‚С‹</h2>
        <span>{room.code}</span>
      </div>
      <div className="game-board-scene__messages">
        {chatMessages.length === 0 ? (
          <p className="game-board-scene__chat-empty">РџРѕРєР° РЅРµС‚ СЃРѕРѕР±С‰РµРЅРёР№. РќР°С‡РЅРёС‚Рµ СЂР°Р·РіРѕРІРѕСЂ.</p>
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
          placeholder={room.currentUser.isMember ? 'РЎРѕРѕР±С‰РµРЅРёРµ' : 'Р’РѕР№РґРёС‚Рµ РІ РєРѕРјРЅР°С‚Сѓ РґР»СЏ С‡Р°С‚Р°'}
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
          aria-label="РћС‚РїСЂР°РІРёС‚СЊ"
          onClick={() => void submitChat()}
          disabled={!room.currentUser.isMember || chatPending || !chatDraft.trim()}
        >
          вћ¤
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
          roomErrorMessage(error, 'Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ Р С—Р С•Р С”Р С‘Р Р…РЎС“РЎвЂљРЎРЉ Р С”Р С•Р СР Р…Р В°РЎвЂљРЎС“.'),
        );
      }
    } finally {
      if (isCurrentRoomScope(roomId, scope)) setRoomPending(false);
    }
  }

  async function switchFromCurrentMembershipTo(targetRoomId: string) {
    const membership = currentMembershipRoom;
    if (!membership || membership.roomId === targetRoomId) return;
    if (membership.status === 'ACTIVE' || membership.currentMatchId) {
      setRoomError('РЈ РІР°СЃ РёРґС‘С‚ Р°РєС‚РёРІРЅС‹Р№ РјР°С‚С‡ РІ РґСЂСѓРіРѕР№ РєРѕРјРЅР°С‚Рµ.');
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
        setRoomError('РЈ РІР°СЃ РёРґС‘С‚ Р°РєС‚РёРІРЅС‹Р№ РјР°С‚С‡ РІ РґСЂСѓРіРѕР№ РєРѕРјРЅР°С‚Рµ.');
        return;
      }
      const left = await roomApi.leaveRoom(source.id, source.version, controller.signal);
      if (!left.ok) throw new RoomApiError(409, left.error.code, left.error.message);
      setCurrentMembershipRoom(null);
      const joined = await roomApi.joinRoom(targetRoomId, controller.signal);
      if (!joined.ok) throw new RoomApiError(409, joined.error.code, joined.error.message);
      navigateTo(roomRoute(targetRoomId));
    } catch (error) {
      setRoomError(roomErrorMessage(error, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРјРµРЅРёС‚СЊ РєРѕРјРЅР°С‚Сѓ.'));
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
        setRoomError(roomErrorMessage(error, 'РљРѕРјР°РЅРґСѓ РєРѕРјРЅР°С‚С‹ РЅРµ СѓРґР°Р»РѕСЃСЊ РІС‹РїРѕР»РЅРёС‚СЊ.'));
      }
    } finally {
      if (!roomId || isCurrentRoomScope(roomId, scope)) setRoomPending(false);
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
      setRoomError(roomErrorMessage(error, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РєРѕРјРЅР°С‚Сѓ.'));
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
        setRoomError(roomErrorMessage(error, 'РќРµ СѓРґР°Р»РѕСЃСЊ РЅР°С‡Р°С‚СЊ РјР°С‚С‡.'));
      }
    } finally {
      if (isCurrentRoomScope(roomId, scope)) setRoomPending(false);
    }
  }

  async function submitAction(action: LegalAction) {
    if (match.status !== 'ready' || match.pending) return;

    boardRef.current?.unlockAudio();

    if (
      action.type === 'SURRENDER' &&
      !window.confirm('РЎРґР°С‚СЊСЃСЏ?\nРњР°С‚С‡ Р±СѓРґРµС‚ Р·Р°СЃС‡РёС‚Р°РЅ РєР°Рє РїРѕСЂР°Р¶РµРЅРёРµ.')
    ) {
      return;
    }

    setMatch({ ...match, pending: true, error: null });

    try {
      const result = await realtimeClient.sendCommand(
        commandFromAction(action, match.matchId, match.snapshot.stateVersion),
      );

      if (!result.ok) {
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
      setMatch({ ...match, pending: false, error: 'РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹РїРѕР»РЅРёС‚СЊ РёРіСЂРѕРІРѕР№ С…РѕРґ.' });
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
      setChatError('РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РїСЂР°РІРёС‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ.');
    } finally {
      setChatPending(false);
    }
  }

  if (variant === 'home') {
    return (
      <section className="beta-home-page">
        <Panel as="section" className="beta-home-page__hero">
          <p className="beta-home-page__eyebrow">Р‘РµС‚Р°</p>
          <h1>РРіСЂР°С‚СЊ</h1>
          <p className="beta-home-page__copy">
            РћС‚РєСЂРѕР№С‚Рµ СЃРїРёСЃРѕРє РєРѕРјРЅР°С‚, РІРѕР№РґРёС‚Рµ РІ РЅСѓР¶РЅСѓСЋ Рё РїСЂРѕРґРѕР»Р¶Р°Р№С‚Рµ РјР°С‚С‡ С‡РµСЂРµР· СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёР№ РёРіСЂРѕРІРѕР№
            СЌРєСЂР°РЅ.
          </p>
          <div className="beta-home-page__actions">
            <Button onClick={() => navigateTo('#/rooms')}>РћС‚РєСЂС‹С‚СЊ РєРѕРјРЅР°С‚С‹</Button>
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
            <h1>РљРѕРјРЅР°С‚С‹</h1>
          </div>

          <div className="beta-room-page__header-actions">
            <Button
              variant="secondary"
              onClick={() => void mutateRoom((signal) => loadRoomList(signal))}
              loading={roomPending}
            >
              РћР±РЅРѕРІРёС‚СЊ
            </Button>
            <Button onClick={() => void createAndJoinRoom()} loading={roomPending}>
              РЎРѕР·РґР°С‚СЊ РєРѕРјРЅР°С‚Сѓ
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
            <h2>Р”РѕСЃС‚СѓРїРЅС‹Рµ РєРѕРјРЅР°С‚С‹</h2>

            <div className="beta-room-page__seat-grid">
              {roomList.map((entry) => (
                <Panel key={entry.id} as="article" className="beta-room-page__seat-card">
                  <div className="beta-room-page__seat-copy">
                    <strong>{`РљРѕРјРЅР°С‚Р° ${entry.code}`}</strong>
                    <span>{`РЈС‡Р°СЃС‚РЅРёРєРё: ${entry.counts.memberCount}`}</span>
                    <span>{`РњРµСЃС‚Р°: ${entry.counts.seatedCount} / 4`}</span>
                    <span>{`Р“РѕС‚РѕРІС‹: ${entry.counts.readyCount} / ${entry.counts.seatedCount}`}</span>
                  </div>

                  <Button onClick={() => navigateTo(roomRoute(entry.id))}>РћС‚РєСЂС‹С‚СЊ РєРѕРјРЅР°С‚Сѓ</Button>
                </Panel>
              ))}
            </div>

            {roomList.length === 0 ? <p>РљРѕРјРЅР°С‚ РїРѕРєР° РЅРµС‚. РЎРѕР·РґР°Р№С‚Рµ РїРµСЂРІСѓСЋ.</p> : null}
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
            title="РњР°С‚С‡ РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ"
            description="РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРіРѕС‚РѕРІРёС‚СЊ РёРіСЂРѕРІРѕР№ СЌРєСЂР°РЅ. РћР±РЅРѕРІРёС‚Рµ РєРѕРјРЅР°С‚Сѓ."
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
          dieRolling={match.pending && Boolean(rollAction)}
          presentation={presentationRuntime ?? undefined}
          victoryPlayerId={displaySnapshot?.winnerPlayerId ?? null}
          victoryReason={displaySnapshot?.winReason ?? null}
          turnPanel={{
            heading: 'РњР°С‚С‡',
            badge: `Р’СЂРµРјСЏ ${matchDuration}`,
            title: status?.title,
            subtitle: status?.subtitle,
            dieLabel:
              displaySnapshot?.diceValue === null
                ? 'РљСѓР±РёРє: РѕР¶РёРґР°РЅРёРµ Р±СЂРѕСЃРєР°'
                : `РљСѓР±РёРє: ${displaySnapshot?.diceValue}`,
            dieValueText:
              displaySnapshot?.diceValue === null
                ? 'РљСѓР±РёРє РµС‰С‘ РЅРµ Р±СЂРѕС€РµРЅ'
                : `Р’С‹РїР°Р»Рѕ: ${displaySnapshot?.diceValue ?? 'вЂ”'}`,
            primaryAction:
              displaySnapshot?.status === 'FINISHED' ? undefined : rollAction ? (
                <Button
                  onClick={() => void submitAction(rollAction)}
                  loading={match.pending}
                  disabled={match.pending}
                >
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
                  <p>
                    {displaySnapshot.winnerPlayerId === authState.user.id
                      ? `${winnerName} РўС‹ РїРѕР±РµРґРёР»(Р°)! Р’СЂРµРјСЏ РёРіСЂС‹ ${matchDuration}`
                      : `РџРѕР±РµРґРёС‚РµР»СЊ вЂ” ${winnerName}. Р’СЂРµРјСЏ РёРіСЂС‹ ${matchDuration}`}
                  </p>
                  <Button data-testid="return-to-room" onClick={() => void returnToRoom()}>
                    Р’РµСЂРЅСѓС‚СЊСЃСЏ РІ РєРѕРјРЅР°С‚Сѓ
                  </Button>
                  {utilityActions}
                </div>
              ) : (
                <div className="beta-room-page__controls">
                  {!rollAction && pawnActions.length > 0 ? (
                    <p>Р”РѕСЃС‚СѓРїРЅС‹Рµ РїРµС€РєРё РїРѕРґСЃРІРµС‡РµРЅС‹ РЅР° РїРѕР»Рµ Рё РІ СЂРµР·РµСЂРІРµ.</p>
                  ) : null}
                  {nonSurrenderActions.length === 0 && !match.pending ? (
                    <p>РћР¶РёРґР°РµРј СЃР»РµРґСѓСЋС‰РµРµ СЃРѕСЃС‚РѕСЏРЅРёРµ РјР°С‚С‡Р°.</p>
                  ) : null}
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
            title="РџСЂР°РІРёР»Р° РёРіСЂС‹"
          >
            <RulesPage />
          </BottomSheet>
        ) : (
          <Dialog
            open={utilityPanel === 'rules'}
            onOpenChange={(open) => setUtilityPanel(open ? 'rules' : null)}
            title="РџСЂР°РІРёР»Р° РёРіСЂС‹"
          >
            <RulesPage />
          </Dialog>
        )}
        {compactViewport ? (
          <BottomSheet
            open={utilityPanel === 'history'}
            onOpenChange={(open) => setUtilityPanel(open ? 'history' : null)}
            title="РСЃС‚РѕСЂРёСЏ С…РѕРґРѕРІ"
          >
            <div className="beta-room-page__history-panel">
              {historyItems.length === 0 ? (
                <p>РСЃС‚РѕСЂРёСЏ РїРѕСЏРІРёС‚СЃСЏ РїРѕСЃР»Рµ РїРµСЂРІС‹С… СЃРѕР±С‹С‚РёР№ РјР°С‚С‡Р°.</p>
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
            title="РСЃС‚РѕСЂРёСЏ С…РѕРґРѕРІ"
          >
            <div className="beta-room-page__history-panel">
              {historyItems.length === 0 ? (
                <p>РСЃС‚РѕСЂРёСЏ РїРѕСЏРІРёС‚СЃСЏ РїРѕСЃР»Рµ РїРµСЂРІС‹С… СЃРѕР±С‹С‚РёР№ РјР°С‚С‡Р°.</p>
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
            title="РќР°СЃС‚СЂРѕР№РєРё РєРѕРјРЅР°С‚С‹"
          >
            <div className="beta-room-page__settings-panel">
              <p>{`РљРѕРґ РєРѕРјРЅР°С‚С‹: ${room.code}`}</p>
              <p>{`РЈС‡Р°СЃС‚РЅРёРєРѕРІ: ${room.counts.memberCount}`}</p>
              <p>{`РњРµСЃС‚ Р·Р°РЅСЏС‚Рѕ: ${room.counts.seatedCount} / 4`}</p>
              {soundControl}
              <Button variant="secondary" onClick={() => setUtilityPanel(null)}>
                Р—Р°РєСЂС‹С‚СЊ
              </Button>
              <Button
                variant="secondary"
                onClick={() => void navigator.clipboard?.writeText(room.code)}
              >
                РљРѕРїРёСЂРѕРІР°С‚СЊ РєРѕРґ
              </Button>
              {displaySnapshot?.status !== 'ACTIVE' && room.currentUser.isMember ? (
                <Button variant="ghost" onClick={() => void leaveCurrentRoom()}>
                  РџРѕРєРёРЅСѓС‚СЊ РєРѕРјРЅР°С‚Сѓ
                </Button>
              ) : room.currentUser.isMember ? (
                <p>РЎРЅР°С‡Р°Р»Р° Р·Р°РІРµСЂС€РёС‚Рµ РјР°С‚С‡ РёР»Рё СЃРґР°Р№С‚Рµ РїР°СЂС‚РёСЋ.</p>
              ) : null}
            </div>
          </BottomSheet>
        ) : (
          <Dialog
            open={utilityPanel === 'settings'}
            onOpenChange={(open) => setUtilityPanel(open ? 'settings' : null)}
            title="РќР°СЃС‚СЂРѕР№РєРё РєРѕРјРЅР°С‚С‹"
          >
            <div className="beta-room-page__settings-panel">
              <p>{`РљРѕРґ РєРѕРјРЅР°С‚С‹: ${room.code}`}</p>
              <p>{`РЈС‡Р°СЃС‚РЅРёРєРѕРІ: ${room.counts.memberCount}`}</p>
              <p>{`РњРµСЃС‚ Р·Р°РЅСЏС‚Рѕ: ${room.counts.seatedCount} / 4`}</p>
              {soundControl}
              <Button variant="secondary" onClick={() => setUtilityPanel(null)}>
                Р—Р°РєСЂС‹С‚СЊ
              </Button>
              <Button
                variant="secondary"
                onClick={() => void navigator.clipboard?.writeText(room.code)}
              >
                РљРѕРїРёСЂРѕРІР°С‚СЊ РєРѕРґ
              </Button>
              {displaySnapshot?.status !== 'ACTIVE' && room.currentUser.isMember ? (
                <Button variant="ghost" onClick={() => void leaveCurrentRoom()}>
                  РџРѕРєРёРЅСѓС‚СЊ РєРѕРјРЅР°С‚Сѓ
                </Button>
              ) : room.currentUser.isMember ? (
                <p>РЎРЅР°С‡Р°Р»Р° Р·Р°РІРµСЂС€РёС‚Рµ РјР°С‚С‡ РёР»Рё СЃРґР°Р№С‚Рµ РїР°СЂС‚РёСЋ.</p>
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
          <h1>{room ? `РљРѕРјРЅР°С‚Р° ${room.code}` : 'РљРѕРјРЅР°С‚Р°'}</h1>
        </div>

        <div className="beta-room-page__header-actions">
          <Button
            variant="secondary"
            onClick={() => void refreshRoom(selectedRoomId)}
            loading={roomPending}
          >
            РћР±РЅРѕРІРёС‚СЊ
          </Button>

          {room?.currentUser.isMember && !room.currentMatchId ? (
            <Button variant="ghost" onClick={() => setUtilityPanel('settings')}>
              вљ™ РќР°СЃС‚СЂРѕР№РєРё РєРѕРјРЅР°С‚С‹
            </Button>
          ) : null}

          {room?.currentMatchId ? null : (
            <Button
              onClick={() => void startMatch()}
              loading={roomPending}
              disabled={!room?.currentUser.canStart || Boolean(roomError)}
            >
              РќР°С‡Р°С‚СЊ РјР°С‚С‡
            </Button>
          )}
        </div>
      </header>

      {roomError ? (
        <Panel as="section" className="beta-status-banner">
          {roomError}
        </Panel>
      ) : null}

      {!room && !roomError ? (
        <Panel as="section">Р—Р°РіСЂСѓР·РєР° РєРѕРјРЅР°С‚С‹вЂ¦</Panel>
      ) : room && !room.currentMatchId && !showFinishedMatch ? (
        <div className="beta-room-page__lobby">
          <Panel as="section" className="beta-room-page__seats">
            <h2>РРіСЂРѕРєРё</h2>

            {!room.currentUser.isMember && currentMembershipRoom && currentMembershipRoom.roomId !== room.id ? (
              <div className="beta-room-page__seat-actions">
                <p>
                  {currentMembershipRoom.status === 'ACTIVE' || currentMembershipRoom.currentMatchId
                    ? 'РЈ РІР°СЃ РёРґС‘С‚ Р°РєС‚РёРІРЅС‹Р№ РјР°С‚С‡ РІ РґСЂСѓРіРѕР№ РєРѕРјРЅР°С‚Рµ.'
                    : `Р’С‹ СѓР¶Рµ РЅР°С…РѕРґРёС‚РµСЃСЊ РІ РєРѕРјРЅР°С‚Рµ ${currentMembershipRoom.code}.`}
                </p>
                <Button onClick={() => navigateTo(roomRoute(currentMembershipRoom.roomId))}>
                  {currentMembershipRoom.status === 'ACTIVE' || currentMembershipRoom.currentMatchId
                    ? 'Р’РµСЂРЅСѓС‚СЊСЃСЏ РІ РјР°С‚С‡'
                    : 'РџРµСЂРµР№С‚Рё РІ РјРѕСЋ РєРѕРјРЅР°С‚Сѓ'}
                </Button>
                {currentMembershipRoom.status !== 'ACTIVE' && !currentMembershipRoom.currentMatchId ? (
                  <Button
                    variant="secondary"
                    loading={roomPending}
                    onClick={() => void switchFromCurrentMembershipTo(selectedRoomId)}
                  >
                    РџРѕРєРёРЅСѓС‚СЊ РµС‘ Рё РІРѕР№С‚Рё СЃСЋРґР°
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
                  Р’РѕР№С‚Рё РІ РєРѕРјРЅР°С‚Сѓ
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
                              ? `${member.displayName} (Р’С‹)`
                              : member.displayName}
                          </span>
                          <span>{seat.ready ? 'Р“РѕС‚РѕРІ' : 'РќРµ РіРѕС‚РѕРІ'}</span>
                        </>
                      ) : (
                        <span>РЎРІРѕР±РѕРґРЅРѕ</span>
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
                        {`Р—Р°РЅСЏС‚СЊ РјРµСЃС‚Рѕ ${seat.seatIndex + 1}`}
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
                          {seat.ready ? 'РЎРЅСЏС‚СЊ РіРѕС‚РѕРІРЅРѕСЃС‚СЊ' : 'Р“РѕС‚РѕРІ'}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            void mutateRoom((signal) =>
                              roomApi.leaveSeat(selectedRoomId, room.version, signal),
                            )
                          }
                        >
                          РџРѕРєРёРЅСѓС‚СЊ РјРµСЃС‚Рѕ
                        </Button>
                      </div>
                    ) : null}
                  </Panel>
                );
              })}
            </div>
          </Panel>

          <Panel as="section" className="beta-room-page__status-panel">
            <h2>РЎС‚Р°С‚СѓСЃ РєРѕРјРЅР°С‚С‹</h2>
            <p>{`РЈС‡Р°СЃС‚РЅРёРєРѕРІ: ${room.counts.memberCount}`}</p>
            {soundControl}
            <Button variant="secondary" onClick={() => setUtilityPanel(null)}>
              Р—Р°РєСЂС‹С‚СЊ
            </Button>
            <p>{`РРіСЂРѕРєРѕРІ: ${occupiedCount} / 4`}</p>
            <p>{`Р“РѕС‚РѕРІС‹: ${readyCount} / ${occupiedCount}`}</p>
            <p>{room.currentUser.startBlockedReason ?? 'РњРѕР¶РЅРѕ РЅР°С‡РёРЅР°С‚СЊ РјР°С‚С‡.'}</p>

            {room.currentUser.isMember ? (
              <Button variant="secondary" onClick={() => void leaveCurrentRoom()}>
                РџРѕРєРёРЅСѓС‚СЊ РєРѕРјРЅР°С‚Сѓ
              </Button>
            ) : null}
          </Panel>
        </div>
      ) : !room ? null : match.status === 'error' ? (
        <EmptyState title="РњР°С‚С‡ РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ" description={match.message} />
      ) : match.status !== 'ready' ? (
        <Panel as="section">РџРѕРґРєР»СЋС‡РµРЅРёРµ Рє РјР°С‚С‡СѓвЂ¦</Panel>
      ) : null}

      {room && !room.currentMatchId && !showFinishedMatch ? (
        <Dialog
          open={utilityPanel === 'settings'}
          onOpenChange={(open) => setUtilityPanel(open ? 'settings' : null)}
          title="РќР°СЃС‚СЂРѕР№РєРё РєРѕРјРЅР°С‚С‹"
        >
          <div className="beta-room-page__settings-panel">
            <p>{`РљРѕРґ РєРѕРјРЅР°С‚С‹: ${room.code}`}</p>
            <p>{`РЈС‡Р°СЃС‚РЅРёРєРѕРІ: ${room.counts.memberCount}`}</p>
            <Button
              variant="secondary"
              onClick={() => void navigator.clipboard?.writeText(room.code)}
            >
              РљРѕРїРёСЂРѕРІР°С‚СЊ РєРѕРґ
            </Button>
            {room.currentUser.isMember ? (
              <Button variant="ghost" onClick={() => void leaveCurrentRoom()}>
                РџРѕРєРёРЅСѓС‚СЊ РєРѕРјРЅР°С‚Сѓ
              </Button>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
