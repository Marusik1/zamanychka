import {
  REALTIME_PROTOCOL_VERSION,
  ZAMANUSHKA_BUILD_ID,
  ZAMANUSHKA_BUILD_TIMESTAMP,
  ZAMANUSHKA_GIT_SHA,
  ZAMANUSHKA_RELEASE_ID,
} from '@zamanushka/shared';

export type BuildInfo = {
  service: 'zamanushka-api';
  releaseId: string;
  buildId: string;
  gitSha: string;
  builtAt: string;
  realtimeProtocolVersion: string;
};

export function getApiBuildInfo(): BuildInfo {
  const gitSha = process.env.GIT_SHA?.trim() || ZAMANUSHKA_GIT_SHA;
  const builtAt = process.env.BUILD_TIMESTAMP?.trim() || ZAMANUSHKA_BUILD_TIMESTAMP;
  const buildId = process.env.BUILD_ID?.trim() || ZAMANUSHKA_BUILD_ID;
  const releaseId = process.env.RELEASE_ID?.trim() || ZAMANUSHKA_RELEASE_ID;
  return {
    service: 'zamanushka-api',
    releaseId,
    buildId,
    gitSha,
    builtAt,
    realtimeProtocolVersion: REALTIME_PROTOCOL_VERSION,
  };
}
