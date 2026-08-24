import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createRoomRepository } from './room-repository.js';
import { createRoomService, type RoomPresenceStore } from './room-service.js';
import { createMatchCompletionService } from './match-completion.js';
import { createTestDatabase } from '../test/test-database.js';

class InMemoryRoomPresenceStore implements RoomPresenceStore {
  private readonly states = new Map<string, Map<string, boolean>>();

  private room(roomId: string) {
    const current = this.states.get(roomId);
    if (current) return current;
    const created = new Map<string, boolean>();
    this.states.set(roomId, created);
    return created;
  }

  async connect(input: { roomId: string; userId: string }) {
    this.room(input.roomId).set(input.userId, true);
  }

  async disconnect(input: { roomId: string; userId: string }) {
    this.room(input.roomId).set(input.userId, false);
  }

  async snapshot(roomId: string) {
    return new Map(this.room(roomId));
  }
}

const database = createTestDatabase();
const repository = createRoomRepository(database.prisma);

function createService() {
  return createRoomService({
    repository,
    presenceStore: new InMemoryRoomPresenceStore(),
  });
}

async function seedUsers(ids: string[]) {
  await database.prisma.user.createMany({
    data: ids.map((id, index) => ({ id, firstName: `User ${index + 1}` })),
  });
}

async function seedReadyRoom(ids: string[]) {
  const service = createService();
  await seedUsers(ids);
  for (const [index, id] of ids.entries()) {
    await service.takeSeat(id, { seatIndex: index as 0 | 1 | 2 | 3 });
    await service.connectPresence(id);
    await service.setReady(id, { ready: true });
  }
  return service;
}

beforeEach(async () => {
  await database.clean();
});

afterAll(async () => {
  await database.prisma.$disconnect();
});

describe('room concurrency', () => {
  it('keeps one durable occupant when two users race for the same seat', async () => {
    await seedUsers(['user-1', 'user-2']);
    const service = createService();
    await repository.bootstrapSingletonRoom();

    const [first, second] = await Promise.all([
      service.takeSeat('user-1', { seatIndex: 0 }),
      service.takeSeat('user-2', { seatIndex: 0 }),
    ]);

    const room = await repository.loadSingletonRoom();
    expect(room?.seats.filter((seat) => seat.userId !== null)).toHaveLength(1);
    expect(first.ok !== second.ok).toBe(true);
  });

  it('keeps at most one seat for the same user when seat claims race', async () => {
    await seedUsers(['user-1']);
    const service = createService();
    await repository.bootstrapSingletonRoom();

    const [first, second] = await Promise.all([
      service.takeSeat('user-1', { seatIndex: 0 }),
      service.takeSeat('user-1', { seatIndex: 1 }),
    ]);

    const room = await repository.loadSingletonRoom();
    expect(room?.seats.filter((seat) => seat.userId === 'user-1')).toHaveLength(1);
    expect(first.ok || second.ok).toBe(true);
    expect(first.ok && second.ok).toBe(false);
  });

  it('keeps a deterministic final room when take-seat races leave-seat', async () => {
    await seedUsers(['user-1']);
    const service = createService();
    await service.takeSeat('user-1', { seatIndex: 0 });

    await Promise.all([service.takeSeat('user-1', { seatIndex: 0 }), service.leaveSeat('user-1')]);

    const room = await repository.loadSingletonRoom();
    expect(room?.seats).toEqual([
      { seatIndex: 0, userId: null, ready: false },
      { seatIndex: 1, userId: null, ready: false },
      { seatIndex: 2, userId: null, ready: false },
      { seatIndex: 3, userId: null, ready: false },
    ]);
  });

  it('does not keep ready without a seated participant when readiness races leave-seat', async () => {
    await seedUsers(['user-1']);
    const service = createService();
    await service.takeSeat('user-1', { seatIndex: 0 });

    await Promise.all([service.setReady('user-1', { ready: true }), service.leaveSeat('user-1')]);

    const room = await repository.loadSingletonRoom();
    expect(room?.seats[0]).toEqual({ seatIndex: 0, userId: null, ready: false });
  });

  it('creates exactly one match when two seated users race START_MATCH', async () => {
    const service = await seedReadyRoom(['user-1', 'user-2']);

    const [first, second] = await Promise.all([
      service.startMatch('user-1', {}),
      service.startMatch('user-2', {}),
    ]);

    const room = await repository.loadSingletonRoom();
    const matches = await database.prisma.match.findMany();
    expect(matches).toHaveLength(1);
    expect(room?.currentMatchId).toBe(matches[0]?.id ?? null);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
  });

  it('does not create a second match when START_MATCH is repeated after commit', async () => {
    const service = await seedReadyRoom(['user-1', 'user-2']);
    const first = await service.startMatch('user-1', {});
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('first start failed');

    const second = await service.startMatch('user-2', {});
    expect(second.ok).toBe(false);

    const matches = await database.prisma.match.findMany();
    expect(matches).toHaveLength(1);
  });

  it('blocks START_MATCH when a seated participant is disconnected and restores eligibility on reconnect', async () => {
    const service = await seedReadyRoom(['user-1', 'user-2']);
    await service.disconnectPresence('user-2');
    await expect(service.startMatch('user-1', {})).resolves.toEqual({
      ok: false,
      error: {
        code: 'SEATED_PARTICIPANT_DISCONNECTED',
        message: 'Seated participant is disconnected',
      },
    });
    await service.connectPresence('user-2');
    const started = await service.startMatch('user-1', {});
    expect(started.ok).toBe(true);
  });

  it('keeps already committed matches valid when disconnect happens after start', async () => {
    const service = await seedReadyRoom(['user-1', 'user-2']);
    const started = await service.startMatch('user-1', {});
    expect(started.ok).toBe(true);

    await service.disconnectPresence('user-1');
    const room = await repository.loadSingletonRoom();
    expect(room?.currentMatchId).toBeTruthy();
    const match = await database.prisma.match.findFirstOrThrow();
    expect(match.status).toBe('ACTIVE');
  });

  it('keeps Match A completion idempotent and stale after Match B starts', async () => {
    const firstLobby = await seedReadyRoom(['user-1', 'user-2']);
    const matchA = await firstLobby.startMatch('user-1', {});
    expect(matchA.ok).toBe(true);
    if (!matchA.ok) throw new Error('match A failed');
    await database.prisma.match.update({
      where: { id: matchA.matchId },
      data: { status: 'FINISHED' },
    });

    const completion = createMatchCompletionService({ repository });
    await completion.completeTerminalMatch(matchA.matchId);

    await seedUsers(['user-3', 'user-4']);
    const secondLobby = createService();
    await secondLobby.takeSeat('user-3', { seatIndex: 0 });
    await secondLobby.takeSeat('user-4', { seatIndex: 1 });
    await secondLobby.connectPresence('user-3');
    await secondLobby.connectPresence('user-4');
    await secondLobby.setReady('user-3', { ready: true });
    await secondLobby.setReady('user-4', { ready: true });
    const matchB = await secondLobby.startMatch('user-3', {});
    expect(matchB.ok).toBe(true);
    if (!matchB.ok) throw new Error('match B failed');

    await expect(completion.completeTerminalMatch(matchA.matchId)).resolves.toEqual({
      ok: false,
      error: { code: 'MATCH_NOT_CURRENT', message: 'Match is not the current room match' },
    });

    const room = await repository.loadSingletonRoom();
    expect(room?.currentMatchId).toBe(matchB.matchId);
    expect(room?.seats.filter((seat) => seat.userId !== null)).toHaveLength(2);
  });
});
