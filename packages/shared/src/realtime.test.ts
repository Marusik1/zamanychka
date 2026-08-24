import { describe, expect, it } from 'vitest';
import {
  gameEventEnvelopeSchema,
  gameCommandRequestSchema,
  gameCommandResultSchema,
  gameSyncRequestSchema,
  gameSyncResponseSchema,
  transitionEnvelopeSchema,
} from './realtime.js';

const snapshot = {
  status: 'ACTIVE',
  stateVersion: 2,
  turnNumber: 1,
  turnPhase: 'WAITING_FOR_ROLL',
  currentPlayerId: 'p1',
  diceValue: null,
  winnerPlayerId: null,
  winReason: null,
  players: [
    { playerId: 'p1', color: 'RED', seatIndex: 0, status: 'ACTIVE' },
    { playerId: 'p2', color: 'BLUE', seatIndex: 1, status: 'ACTIVE' },
  ],
  pawns: [
    { pawnId: 'pawn-1', playerId: 'p1', color: 'RED', position: { zone: 'OFF_BOARD' } },
    { pawnId: 'pawn-2', playerId: 'p1', color: 'RED', position: { zone: 'PERIMETER', progress: 0 } },
    { pawnId: 'pawn-3', playerId: 'p1', color: 'RED', position: { zone: 'HOME', homeIndex: 0 } },
    { pawnId: 'pawn-4', playerId: 'p1', color: 'RED', position: { zone: 'REMOVED' } },
    { pawnId: 'pawn-5', playerId: 'p2', color: 'BLUE', position: { zone: 'OFF_BOARD' } },
    { pawnId: 'pawn-6', playerId: 'p2', color: 'BLUE', position: { zone: 'PERIMETER', progress: 27 } },
    { pawnId: 'pawn-7', playerId: 'p2', color: 'BLUE', position: { zone: 'HOME', homeIndex: 3 } },
    { pawnId: 'pawn-8', playerId: 'p2', color: 'BLUE', position: { zone: 'REMOVED' } },
  ],
  lastSequence: 3,
};

describe('realtime contracts', () => {
  it('accepts intent-only gameplay commands and sync requests', () => {
    expect(gameCommandRequestSchema.parse({
      type: 'ROLL_DICE', matchId: 'm1', actionId: 'a1', expectedStateVersion: 0,
    })).toEqual(expect.objectContaining({ type: 'ROLL_DICE' }));
    expect(gameCommandRequestSchema.parse({
      type: 'ENTER_PAWN', matchId: 'm1', actionId: 'a2', expectedStateVersion: 1, pawnId: 'pawn-1',
    })).toEqual(expect.objectContaining({ pawnId: 'pawn-1' }));
    expect(gameCommandRequestSchema.parse({
      type: 'MOVE_PAWN', matchId: 'm1', actionId: 'a3', expectedStateVersion: 2, pawnId: 'pawn-1',
    })).toEqual(expect.objectContaining({ type: 'MOVE_PAWN' }));
    expect(gameCommandRequestSchema.parse({
      type: 'SURRENDER', matchId: 'm1', actionId: 'a4', expectedStateVersion: 2,
    })).toEqual(expect.objectContaining({ type: 'SURRENDER' }));
    expect(gameSyncRequestSchema.parse({ matchId: 'm1', stateVersion: 2, lastSequence: 3 })).toEqual({
      matchId: 'm1', stateVersion: 2, lastSequence: 3,
    });
  });

  it('rejects client-controlled authority fields', () => {
    expect(() => gameCommandRequestSchema.parse({
      type: 'ROLL_DICE', matchId: 'm1', actionId: 'a1', expectedStateVersion: 0,
      actorPlayerId: 'attacker', diceValue: 6, firstPlayerId: 'attacker', seatOrder: ['attacker'],
    })).toThrow();
  });

  it('models committed event payloads and transition identity, ordered range, and watermark', () => {
    expect(gameEventEnvelopeSchema.parse({
      matchId: 'm1',
      eventId: 'e1',
      sequence: 1,
      stateVersion: 2,
      type: 'diceRolled',
      payload: { playerId: 'p1', diceValue: 6 },
      createdAt: '2026-08-24T00:00:00.000Z',
    })).toEqual(expect.objectContaining({ type: 'diceRolled' }));

    const transition = transitionEnvelopeSchema.parse({
      matchId: 'm1',
      transitionId: 'm1:a1',
      stateVersion: 2,
      fromSequence: 2,
      toSequence: 3,
      events: [{
        matchId: 'm1',
        eventId: 'e1',
        sequence: 2,
        stateVersion: 2,
        type: 'diceRolled',
        payload: { playerId: 'p1', diceValue: 6 },
        createdAt: '2026-08-24T00:00:00.000Z',
      }, {
        matchId: 'm1',
        eventId: 'e2',
        sequence: 3,
        stateVersion: 2,
        type: 'turnChanged',
        payload: { fromPlayerId: 'p1', toPlayerId: 'p2' },
        createdAt: '2026-08-24T00:00:00.000Z',
      }],
      watermark: { stateVersion: 2, lastSequence: 3 },
      snapshot,
    });
    expect(transition.transitionId).toBe('m1:a1');
  });

  it('rejects invalid transition ranges', () => {
    expect(() => transitionEnvelopeSchema.parse({
      matchId: 'm1',
      transitionId: 'm1:a1',
      stateVersion: 2,
      fromSequence: 3,
      toSequence: 2,
      events: [{
        matchId: 'm1',
        eventId: 'e1',
        sequence: 3,
        stateVersion: 2,
        type: 'turnChanged',
        payload: { fromPlayerId: 'p1', toPlayerId: 'p2' },
        createdAt: '2026-08-24T00:00:00.000Z',
      }],
      watermark: { stateVersion: 2, lastSequence: 2 },
      snapshot,
    })).toThrow();
  });

  it('discriminates command results and sync modes', () => {
    expect(gameCommandResultSchema.parse({
      ok: true, matchId: 'm1', actionId: 'a1', stateVersion: 2, lastSequence: 3,
      snapshot,
      events: [{
        matchId: 'm1',
        eventId: 'e1',
        sequence: 3,
        stateVersion: 2,
        type: 'turnChanged',
        payload: { fromPlayerId: 'p1', toPlayerId: 'p2' },
        createdAt: '2026-08-24T00:00:00.000Z',
      }],
      ack: { actionId: 'a1', stateVersion: 2, lastSequence: 3 },
    })).toEqual(expect.objectContaining({ ok: true }));
    expect(gameCommandResultSchema.parse({
      ok: false, matchId: 'm1', actionId: 'a1', code: 'STALE_STATE_VERSION',
      message: 'stale', stateVersion: 2,
    })).toEqual(expect.objectContaining({ ok: false }));
    expect(gameSyncResponseSchema.parse({
      mode: 'events', transitions: [], watermark: { stateVersion: 2, lastSequence: 3 },
    })).toEqual(expect.objectContaining({ mode: 'events' }));
    expect(gameSyncResponseSchema.parse({ mode: 'snapshot', snapshot, watermark: { stateVersion: 2, lastSequence: 3 } }))
      .toEqual(expect.objectContaining({ mode: 'snapshot' }));
  });
});
