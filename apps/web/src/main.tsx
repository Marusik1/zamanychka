import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@zamanushka/ui/foundation.css';
import { App } from './app.js';
import { frontendBuildInfo } from './build-info.js';
import './styles/premium-game-motion.css';
import './styles/premium-three.css';
import './styles.css';

const root = document.querySelector('#root');
if (!root) throw new Error('Root element was not found');

declare global {
  interface Window {
    __ZAMANUSHKA_BUILD__?: typeof frontendBuildInfo;
    __zRealtimeDiagnostics?: {
      releaseId: string;
      buildId: string;
      protocolVersion: string;
      hydrationBufferEnabled: true;
      sequenceOrderedDrain: true;
      staleSyncMonotonicGuard: true;
      singleAuthoritativeResync: true;
      socketUrl: string;
    };
  }
}

window.__ZAMANUSHKA_BUILD__ = frontendBuildInfo;
window.__zRealtimeDiagnostics = {
  releaseId: frontendBuildInfo.releaseId,
  buildId: frontendBuildInfo.buildId,
  protocolVersion: frontendBuildInfo.realtimeProtocolVersion,
  hydrationBufferEnabled: true,
  sequenceOrderedDrain: true,
  staleSyncMonotonicGuard: true,
  singleAuthoritativeResync: true,
  socketUrl: `${window.location.origin}/socket.io`,
};

void fetch('/health/version', { credentials: 'include', cache: 'no-store' })
  .then((response) => (response.ok ? response.json() : null))
  .then((apiBuild: unknown) => {
    if (
      apiBuild &&
      typeof apiBuild === 'object' &&
      'releaseId' in apiBuild &&
      apiBuild.releaseId !== frontendBuildInfo.releaseId
    ) {
      console.info('[ZAMANUSHKA BUILD_MISMATCH]', {
        frontendReleaseId: frontendBuildInfo.releaseId,
        apiReleaseId: apiBuild.releaseId,
      });
    }
    console.info('[ZAMANUSHKA BUILD]', {
      frontend: frontendBuildInfo,
      api: apiBuild,
    });
  })
  .catch((error: unknown) => {
    console.info('[ZAMANUSHKA BUILD]', {
      frontend: frontendBuildInfo,
      api: null,
      apiVersionError: error instanceof Error ? error.message : String(error),
    });
  });

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
