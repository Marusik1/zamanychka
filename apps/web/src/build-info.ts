import {
  REALTIME_PROTOCOL_VERSION,
  ZAMANUSHKA_BUILD_ID,
  ZAMANUSHKA_BUILD_TIMESTAMP,
  ZAMANUSHKA_GIT_SHA,
} from '@zamanushka/shared';

export type FrontendBuildInfo = {
  buildId: string;
  gitSha: string;
  builtAt: string;
  realtimeProtocolVersion: string;
};

export const frontendBuildInfo: FrontendBuildInfo = {
  buildId: import.meta.env.VITE_BUILD_ID || ZAMANUSHKA_BUILD_ID,
  gitSha: import.meta.env.VITE_GIT_SHA || ZAMANUSHKA_GIT_SHA,
  builtAt: import.meta.env.VITE_BUILD_TIMESTAMP || ZAMANUSHKA_BUILD_TIMESTAMP,
  realtimeProtocolVersion: REALTIME_PROTOCOL_VERSION,
};
