import { describe, expect, it, vi } from 'vitest';

import { createBotRuntimeAdapter } from './runtime-adapter.js';

describe('bot runtime adapter', () => {
  it('submits commands for solo debug dummy participants through the normal command processor', async () => {
    const processCommand = vi.fn(async () => ({
      ok: true as const,
      matchId: 'match-1',
      actionId: 'bot:debug-dummy:action-1',
      stateVersion: 8,
      lastSequence: 3,
      events: [],
      snapshot: {} as never,
      ack: {
        actionId: 'bot:debug-dummy:action-1',
        stateVersion: 8,
        lastSequence: 3,
      },
    }));
    const adapter = createBotRuntimeAdapter({
      matchRepository: {
        loadCurrentMatch: vi.fn(async () => ({
          id: 'match-1',
          stateVersion: 7,
          snapshot: {
            status: 'ACTIVE',
            stateVersion: 7,
            currentPlayerId: 'debug-dummy:room-1',
            players: [
              { playerId: 'human-1', color: 'RED', seatIndex: 0, status: 'ACTIVE', participantKind: 'HUMAN' },
              {
                playerId: 'debug-dummy:room-1',
                color: 'YELLOW',
                seatIndex: 1,
                status: 'ACTIVE',
                participantKind: 'DEBUG_DUMMY',
              },
            ],
            pawns: [],
            turnPhase: 'WAITING_FOR_ROLL',
            diceValue: null,
            winnerPlayerId: null,
            winReason: null,
          },
        })),
      } as never,
      processCommand,
    });

    const result = await adapter.submitCommand({
      type: 'ROLL_DICE',
      matchId: 'match-1',
      actionId: 'bot:debug-dummy:action-1',
      expectedStateVersion: 7,
    });

    expect(result).toMatchObject({ ok: true, stateVersion: 8 });
    expect(processCommand).toHaveBeenCalledWith({
      authenticatedUserId: 'debug-dummy:room-1',
      command: {
        type: 'ROLL_DICE',
        matchId: 'match-1',
        actionId: 'bot:debug-dummy:action-1',
        expectedStateVersion: 7,
      },
    });
  });

  it('treats legacy bot player ids as BOT when participantKind is missing from the snapshot', async () => {
    const processCommand = vi.fn(async () => ({
      ok: true as const,
      matchId: 'match-1',
      actionId: 'bot:room-1:1:action-1',
      stateVersion: 8,
      lastSequence: 3,
      events: [],
      snapshot: {} as never,
      ack: {
        actionId: 'bot:room-1:1:action-1',
        stateVersion: 8,
        lastSequence: 3,
      },
    }));
    const adapter = createBotRuntimeAdapter({
      matchRepository: {
        loadCurrentMatch: vi.fn(async () => ({
          id: 'match-1',
          stateVersion: 7,
          snapshot: {
            status: 'ACTIVE',
            stateVersion: 7,
            currentPlayerId: 'bot:room-1:1',
            players: [
              { playerId: 'human-1', color: 'RED', seatIndex: 0, status: 'ACTIVE', participantKind: 'HUMAN' },
              {
                playerId: 'bot:room-1:1',
                color: 'YELLOW',
                seatIndex: 1,
                status: 'ACTIVE',
              },
            ],
            pawns: [],
            turnPhase: 'WAITING_FOR_ROLL',
            diceValue: null,
            winnerPlayerId: null,
            winReason: null,
          },
        })),
      } as never,
      processCommand,
    });

    const turn = await adapter.readTurn('match-1');
    expect(turn?.activeParticipantKind).toBe('BOT');

    const result = await adapter.submitCommand({
      type: 'ROLL_DICE',
      matchId: 'match-1',
      actionId: 'bot:room-1:1:action-1',
      expectedStateVersion: 7,
    });

    expect(result).toMatchObject({ ok: true, stateVersion: 8 });
    expect(processCommand).toHaveBeenCalledWith({
      authenticatedUserId: 'bot:room-1:1',
      command: {
        type: 'ROLL_DICE',
        matchId: 'match-1',
        actionId: 'bot:room-1:1:action-1',
        expectedStateVersion: 7,
      },
    });
  });
});
