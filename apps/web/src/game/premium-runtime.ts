import { resolvePawnCoordinate, type BoardCoord, type PlayerState } from '@zamanushka/game-engine';
import type { MatchSnapshot, TransitionEnvelope } from '@zamanushka/shared';

import type { GameScreenPlayerView } from './domain.js';
import type { DieValue } from './dice.js';
import type { GameplayPresentationPlan } from './event-presentation.js';
import { recordGameplayTelemetry } from './gameplay-telemetry.js';
import type {
  PremiumBoardCoord,
  PremiumHomeCompletionAnimation,
  PremiumPawnColor,
} from './premium3d/index.js';

export type PremiumPresentationHandle = Readonly<{
  ready: boolean;
  unlockAudio: () => void;
  syncToSnapshot: (snapshot: MatchSnapshot) => void;
  snapToAuthoritativeState: (snapshot: MatchSnapshot) => void;
  diceRolled: (value: 1 | 2 | 3 | 4 | 5 | 6, signal?: AbortSignal) => Promise<void>;
  pawnEntered: (animation: { pawnId: string; destination: PremiumBoardCoord }, signal?: AbortSignal) => Promise<void>;
  pawnMoved: (
    animation: {
      pawnId: string;
      path: readonly PremiumBoardCoord[];
      capture: boolean;
    },
    signal?: AbortSignal,
  ) => Promise<void>;
  pawnCaptured: (
    animation: { attackerPawnId: string; victimPawnId: string; destination: PremiumBoardCoord },
    signal?: AbortSignal,
  ) => Promise<void>;
  pawnEnteredHome: (pawnId: string, signal?: AbortSignal) => Promise<void>;
  homeCompleted: (animation: PremiumHomeCompletionAnimation, signal?: AbortSignal) => Promise<void>;
  playerSurrendered: (pawnIds: readonly string[], signal?: AbortSignal) => Promise<void>;
  gameWon: (
    animation: {
      winnerName: string;
      winnerColor: PremiumPawnColor;
      reason: 'HOME_DIAGONAL_COMPLETED' | 'LAST_ACTIVE_PLAYER';
      isLocalWinner: boolean;
    },
    signal?: AbortSignal,
  ) => Promise<void>;
}>;

const FIXTURE_NAMES: Record<PremiumPawnColor, string> = {
  RED: 'Мария',
  BLUE: 'Дмитрий',
  YELLOW: 'Ольга',
  GREEN: 'Алексей',
};

function toPremiumCoord(coord: BoardCoord): PremiumBoardCoord {
  return {
    row: coord.row as PremiumBoardCoord['row'],
    col: coord.col as PremiumBoardCoord['col'],
  };
}

function resolveSnapshotCoord(snapshot: MatchSnapshot, pawnId: string): PremiumBoardCoord | null {
  const pawn = snapshot.pawns.find((candidate) => candidate.pawnId === pawnId);
  if (!pawn) return null;
  const owner = snapshot.players.find((candidate) => candidate.playerId === pawn.playerId) as
    | PlayerState
    | undefined;
  if (!owner) return null;
  const coord = resolvePawnCoordinate(pawn.position, owner);
  return coord ? toPremiumCoord(coord) : null;
}

function winnerName(players: readonly GameScreenPlayerView[], winnerPlayerId: string): string {
  const player = players.find((candidate) => candidate.playerId === winnerPlayerId);
  return player ? FIXTURE_NAMES[player.color] : 'Игрок';
}

function buildHomeCompletionAnimation(
  snapshot: MatchSnapshot,
  winnerPlayerId: string,
): PremiumHomeCompletionAnimation | null {
  const winner = snapshot.players.find((player) => player.playerId === winnerPlayerId);
  if (!winner) return null;

  const ordered = snapshot.pawns
    .filter(
      (pawn) =>
        pawn.playerId === winnerPlayerId &&
        pawn.position.zone === 'HOME' &&
        pawn.position.homeIndex >= 0 &&
        pawn.position.homeIndex <= 3,
    )
    .sort((left, right) => {
      const leftIndex = left.position.zone === 'HOME' ? left.position.homeIndex : 0;
      const rightIndex = right.position.zone === 'HOME' ? right.position.homeIndex : 0;
      return leftIndex - rightIndex;
    });

  if (ordered.length !== 4) return null;

  const coords = ordered.map((pawn) => resolveSnapshotCoord(snapshot, pawn.pawnId));
  if (coords.some((coord) => coord === null)) return null;

  return {
    pawnIdsByHomeIndex: [
      ordered[0]!.pawnId,
      ordered[1]!.pawnId,
      ordered[2]!.pawnId,
      ordered[3]!.pawnId,
    ],
    homeCoords: [
      coords[0]!,
      coords[1]!,
      coords[2]!,
      coords[3]!,
    ],
    color: winner.color,
  };
}

export async function playPremiumTransition(
  handle: PremiumPresentationHandle | null,
  transition: TransitionEnvelope,
  initialSnapshot: MatchSnapshot,
  players: readonly GameScreenPlayerView[],
  plan: GameplayPresentationPlan,
  signal: AbortSignal,
) {
  if (!handle) return;

  let homeCompletionPlayed = false;

  for (let index = 0; index < transition.events.length; index += 1) {
    if (signal.aborted) return;
    const event = transition.events[index]!;

    switch (event.type) {
      case 'diceRolled':
        recordGameplayTelemetry('DICE_ROLL_VISUAL_START', {
          matchId: transition.matchId,
          eventId: transition.transitionId,
          actionId: transition.actionId,
          sequence: transition.toSequence,
          stateVersion: transition.stateVersion,
          transitionType: event.type,
          diceValue: event.payload.diceValue,
        });
        await handle.diceRolled(event.payload.diceValue as DieValue, signal);
        recordGameplayTelemetry('DICE_SETTLE', {
          matchId: transition.matchId,
          eventId: transition.transitionId,
          actionId: transition.actionId,
          sequence: transition.toSequence,
          stateVersion: transition.stateVersion,
          transitionType: event.type,
          diceValue: event.payload.diceValue,
          aborted: signal.aborted,
        });
        break;
      case 'pawnEntered':
        recordGameplayTelemetry('PAWN_ANIMATION_START', {
          matchId: transition.matchId,
          eventId: transition.transitionId,
          actionId: transition.actionId,
          sequence: transition.toSequence,
          stateVersion: transition.stateVersion,
          transitionType: event.type,
          pawnId: event.payload.pawnId,
        });
        await handle.pawnEntered(
          {
            pawnId: event.payload.pawnId,
            destination: toPremiumCoord(event.payload.toCoord as BoardCoord),
          },
          signal,
        );
        recordGameplayTelemetry('PAWN_ANIMATION_COMPLETE', {
          matchId: transition.matchId,
          eventId: transition.transitionId,
          actionId: transition.actionId,
          sequence: transition.toSequence,
          stateVersion: transition.stateVersion,
          transitionType: event.type,
          pawnId: event.payload.pawnId,
        });
        break;
      case 'pawnMoved':
        recordGameplayTelemetry('PAWN_ANIMATION_START', {
          matchId: transition.matchId,
          eventId: transition.transitionId,
          actionId: transition.actionId,
          sequence: transition.toSequence,
          stateVersion: transition.stateVersion,
          transitionType: event.type,
          pawnId: event.payload.pawnId,
        });
        await handle.pawnMoved(
          {
            pawnId: event.payload.pawnId,
            path: [
              toPremiumCoord(event.payload.fromCoord as BoardCoord),
              ...(event.payload.physicalPath as readonly BoardCoord[]).map((coord) =>
                toPremiumCoord(coord),
              ),
            ],
            capture: Boolean(event.payload.capture),
          },
          signal,
        );
        recordGameplayTelemetry('PAWN_ANIMATION_COMPLETE', {
          matchId: transition.matchId,
          eventId: transition.transitionId,
          actionId: transition.actionId,
          sequence: transition.toSequence,
          stateVersion: transition.stateVersion,
          transitionType: event.type,
          pawnId: event.payload.pawnId,
        });
        break;
      case 'pawnCaptured':
        await handle.pawnCaptured(
          {
            attackerPawnId: event.payload.byPawnId,
            victimPawnId: event.payload.capturedPawnId,
            destination: toPremiumCoord(event.payload.atCoord as BoardCoord),
          },
          signal,
        );
        break;
      case 'pawnEnteredHome':
        await handle.pawnEnteredHome(event.payload.pawnId, signal);
        break;
      case 'playerSurrendered': {
        const removedPawnIds: string[] = [];
        for (let next = index + 1; next < transition.events.length; next += 1) {
          const candidate = transition.events[next]!;
          if (candidate.type !== 'pawnRemoved') break;
          if (candidate.payload.playerId === event.payload.playerId) {
            removedPawnIds.push(candidate.payload.pawnId);
          }
        }
        if (removedPawnIds.length > 0) {
          await handle.playerSurrendered(removedPawnIds, signal);
        }
        break;
      }
      case 'gameWon': {
        if (event.payload.reason === 'HOME_DIAGONAL_COMPLETED' && !homeCompletionPlayed) {
          const completion = buildHomeCompletionAnimation(
            transition.snapshot,
            event.payload.winnerPlayerId,
          );
          if (completion) {
            homeCompletionPlayed = true;
            await handle.homeCompleted(completion, signal);
          }
        }
        await handle.gameWon(
          {
            winnerName: winnerName(players, event.payload.winnerPlayerId),
            winnerColor:
              players.find((player) => player.playerId === event.payload.winnerPlayerId)?.color ??
              'GREEN',
            reason: event.payload.reason,
            isLocalWinner: players.find((player) => player.playerId === event.payload.winnerPlayerId)?.isLocalPlayer ?? false,
          },
          signal,
        );
        break;
      }
      case 'pawnRemoved':
      case 'extraRollGranted':
      case 'turnChanged':
        break;
    }
  }

  if (signal.aborted) return;
  if (plan.steps.length === 0) {
    handle.syncToSnapshot(transition.snapshot);
  }
}
