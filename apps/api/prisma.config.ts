import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

loadEnv({ path: new URL('../../.env', import.meta.url) });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
