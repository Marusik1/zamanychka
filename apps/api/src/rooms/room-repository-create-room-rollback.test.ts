import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase } from '../test/test-database.js';

const randomUUIDMock = vi.hoisted(() => vi.fn<() => string>());

vi.mock('node:crypto', () => ({
  randomUUID: randomUUIDMock,
}));

const { createRoomRepository } = await import('./room-repository.js');

const database = createTestDatabase();
const repository = createRoomRepository(database.prisma);

beforeEach(async () => {
  randomUUIDMock.mockReset();
  await database.clean();
});

afterAll(async () => {
  await database.prisma.$disconnect();
});

describe('room repository createRoom rollback', () => {
  it('rolls back the old room transition if creating the new room fails', async () => {
    await database.prisma.user.createMany({
      data: [
        { id: 'owner', firstName: 'Owner' },
        { id: 'other', firstName: 'Other' },
      ],
    });

    randomUUIDMock
      .mockReturnValueOnce('room-a')
      .mockReturnValueOnce('aaaa-code')
      .mockReturnValueOnce('room-other')
      .mockReturnValueOnce('bbbb-code');

    const roomA = await repository.createRoom('owner');
    await repository.createRoom('other');

    await database.prisma.roomSeat.update({
      where: { roomKey_seatIndex: { roomKey: roomA.roomId, seatIndex: 0 } },
      data: {
        userId: 'owner',
        participantId: 'owner',
        participantKind: 'HUMAN',
        ready: true,
      },
    });

    randomUUIDMock.mockReturnValueOnce('room-b').mockReturnValueOnce('bbbb-collision');

    await expect(repository.createRoom('owner')).rejects.toBeDefined();

    await expect(
      database.prisma.roomMembership.findUnique({ where: { userId: 'owner' } }),
    ).resolves.toMatchObject({ roomKey: roomA.roomId, userId: 'owner' });

    await expect(repository.loadRoom(roomA.roomId)).resolves.toMatchObject({
      roomId: roomA.roomId,
      status: 'WAITING',
      members: [expect.objectContaining({ userId: 'owner' })],
      seats: expect.arrayContaining([
        expect.objectContaining({
          seatIndex: 0,
          userId: 'owner',
          participantId: 'owner',
          participantKind: 'HUMAN',
          ready: true,
        }),
      ]),
    });
  });
});
