import type { Prisma } from '../generated/prisma/client.js';
import type { AppPrismaClient } from '../infrastructure/prisma.js';

type TxClient = Prisma.TransactionClient;
type Json = Prisma.InputJsonValue;

export interface OrderedMatchEventInput {
  sequence: number;
  stateVersion: number;
  payload: Json;
}

export interface MatchSyncEventInput {
  sequence: number;
  stateVersion: number;
  payload: Json;
}

export interface MatchResultPersistenceInput {
  roomKey: string;
  winnerUserId: string;
  victoryReason: string;
  startedAt: Date;
  finishedAt: Date;
  participantCount: number;
  participants: ReadonlyArray<{
    userId: string;
    displayName: string;
    color: string;
    outcome: string;
  }>;
}

export function createMatchRepository(prisma: AppPrismaClient) {
  const lockedMatchIds = new WeakMap<object, string>();

  function assertLockedMatch(tx: TxClient, matchId: string) {
    const lockedMatchId = lockedMatchIds.get(tx);
    if (lockedMatchId !== matchId) {
      throw new Error('match persistence input does not match the locked match');
    }
  }

  return {
    async loadCurrentMatch(matchId: string) {
      return prisma.match.findUnique({ where: { id: matchId } });
    },

    async withLockedMatch<T>(
      matchId: string,
      handler: (
        tx: TxClient,
        match: Awaited<ReturnType<typeof prisma.match.findUnique>>,
      ) => Promise<T>,
    ): Promise<T> {
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "Match"
          WHERE "id" = ${matchId}
          FOR UPDATE
        `;
        lockedMatchIds.set(tx, matchId);
        try {
          return await handler(tx, await tx.match.findUnique({ where: { id: matchId } }));
        } finally {
          lockedMatchIds.delete(tx);
        }
      });
    },

    async updateCurrentSnapshot(
      tx: TxClient,
      input: {
        matchId: string;
        snapshot: Json;
        stateVersion: number;
        terminalResult?: Json;
      },
    ) {
      assertLockedMatch(tx, input.matchId);
      return tx.match.update({
        where: { id: input.matchId },
        data: {
          snapshot: input.snapshot,
          stateVersion: input.stateVersion,
          ...(input.terminalResult === undefined
            ? {}
            : {
                status: 'FINISHED',
                terminalResult: input.terminalResult,
                finishedAt: new Date(),
              }),
        },
      });
    },

    async appendOrderedEvents(
      tx: TxClient,
      input: { matchId: string; events: readonly OrderedMatchEventInput[] },
    ) {
      assertLockedMatch(tx, input.matchId);
      if (input.events.length === 0) return [];
      const match = await tx.match.findUniqueOrThrow({
        where: { id: input.matchId },
        select: { lastSequence: true },
      });
      const expectedFirstSequence = match.lastSequence + 1;
      if (input.events.some((event, index) => event.sequence !== expectedFirstSequence + index)) {
        throw new Error(`match events must begin at ${expectedFirstSequence} and be contiguous`);
      }
      const created = await Promise.all(
        input.events.map((event) =>
          tx.matchEvent.create({
            data: {
              matchId: input.matchId,
              sequence: event.sequence,
              stateVersion: event.stateVersion,
              payload: event.payload,
            },
          }),
        ),
      );
      await tx.match.update({
        where: { id: input.matchId },
        data: { lastSequence: expectedFirstSequence + input.events.length - 1 },
      });
      return created;
    },

    async recordProcessedAction(
      tx: TxClient,
      input: { matchId: string; actionId: string; requestFingerprint: string; result: Json },
    ) {
      assertLockedMatch(tx, input.matchId);
      return tx.processedAction.create({ data: input });
    },

    async findProcessedAction(tx: TxClient, input: { matchId: string; actionId: string }) {
      assertLockedMatch(tx, input.matchId);
      return tx.processedAction.findUnique({
        where: { matchId_actionId: input },
      });
    },

    async insertOutboxRow(
      tx: TxClient,
      input: { matchId: string; resultingStateVersion: number; payload: Json },
    ) {
      assertLockedMatch(tx, input.matchId);
      return tx.outboxRow.create({ data: input });
    },

    async loadMatchUsers(tx: TxClient, input: { matchId: string; userIds: readonly string[] }) {
      assertLockedMatch(tx, input.matchId);
      return tx.user.findMany({
        where: {
          id: {
            in: [...input.userIds],
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      });
    },

    async persistMatchResult(
      tx: TxClient,
      input: { matchId: string; result: MatchResultPersistenceInput },
    ) {
      assertLockedMatch(tx, input.matchId);
      return tx.matchResult.create({
        data: {
          matchId: input.matchId,
          roomKey: input.result.roomKey,
          winnerUserId: input.result.winnerUserId,
          victoryReason: input.result.victoryReason,
          startedAt: input.result.startedAt,
          finishedAt: input.result.finishedAt,
          participantCount: input.result.participantCount,
          participants: {
            create: input.result.participants.map((participant) => ({
              userId: participant.userId,
              displayName: participant.displayName,
              color: participant.color,
              outcome: participant.outcome,
            })),
          },
        },
      });
    },

    async findMatchResult(tx: TxClient, input: { matchId: string }) {
      assertLockedMatch(tx, input.matchId);
      return tx.matchResult.findUnique({
        where: { matchId: input.matchId },
        include: {
          participants: {
            orderBy: { userId: 'asc' },
          },
        },
      });
    },

    async loadSyncMaterial(matchId: string, afterSequence: number) {
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        select: {
          id: true,
          status: true,
          stateVersion: true,
          lastSequence: true,
          snapshot: true,
          seatOrder: true,
        },
      });
      if (!match) return null;
      const events = await prisma.matchEvent.findMany({
        where: { matchId, sequence: { gt: afterSequence } },
        orderBy: { sequence: 'asc' },
      });
      return { match, events };
    },
  };
}

export type MatchRepository = ReturnType<typeof createMatchRepository>;
