import {
  REALTIME_PROTOCOL_VERSION,
  ZAMANUSHKA_BUILD_ID,
  ZAMANUSHKA_BUILD_TIMESTAMP,
  ZAMANUSHKA_GIT_SHA,
  ZAMANUSHKA_RELEASE_ID,
} from '@zamanushka/shared';

export type FrontendBuildInfo = {
  releaseId: string;
  buildId: string;
  gitSha: string;
  builtAt: string;
  realtimeProtocolVersion: string;
};

export const frontendBuildInfo: FrontendBuildInfo = {
  releaseId: import.meta.env.VITE_RELEASE_ID || ZAMANUSHKA_RELEASE_ID,
  buildId: import.meta.env.VITE_BUILD_ID || ZAMANUSHKA_BUILD_ID,
  gitSha: import.meta.env.VITE_GIT_SHA || ZAMANUSHKA_GIT_SHA,
  builtAt: import.meta.env.VITE_BUILD_TIMESTAMP || ZAMANUSHKA_BUILD_TIMESTAMP,
  realtimeProtocolVersion: REALTIME_PROTOCOL_VERSION,
};
