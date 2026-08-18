import { buildApp } from './app.js';
import { parseEnv } from './config/env.js';
import { createLiveDependencies } from './health/dependency-probes.js';

const env = parseEnv(process.env);
const dependencies = createLiveDependencies(env);
const app = buildApp({ probes: dependencies.probes, logger: true });
app.addHook('onClose', async () => dependencies.close());

const shutdown = async () => {
  await app.close();
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

await app.listen({ host: env.API_HOST, port: env.API_PORT });
