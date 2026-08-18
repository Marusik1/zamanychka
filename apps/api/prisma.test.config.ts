import { defineConfig } from 'prisma/config';

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error('TEST_DATABASE_URL is required');
}

const databaseName = new URL(connectionString).pathname.slice(1);
if (!databaseName.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must name a database ending in _test');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: connectionString },
});
