import type { AppPrismaClient } from '../infrastructure/prisma.js';

export function getGuardedTestDatabaseUrl(): string {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error('TEST_DATABASE_URL is required');

  const databaseName = new URL(connectionString).pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error('Refusing database cleanup: database name must end in _test');
  }
  return connectionString;
}

export async function cleanTestDatabase(prisma: AppPrismaClient): Promise<void> {
  getGuardedTestDatabaseUrl();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuthSession", "User" CASCADE');
}
