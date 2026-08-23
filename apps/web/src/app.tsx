import { AppFrame, AppShell, Button, Panel } from '@zamanushka/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { createAuthApi, type AuthApi } from './auth/api.js';
import { AuthShell } from './auth/auth-shell.js';
import { bootstrapAuth, type AuthState } from './auth/bootstrap.js';
import { renderShellRoute, shellNavigationItems } from './shell/routes.js';
import { createTelegramAdapter, type TelegramAdapter } from './telegram/adapter.js';

interface AppProps {
  api?: AuthApi;
  createAdapter?: () => TelegramAdapter;
}

type ShellViewport = 'mobile' | 'desktop';

function resolveShellViewport(width: number): ShellViewport {
  return width >= DESKTOP_SHELL_BREAKPOINT ? 'desktop' : 'mobile';
}

const DESKTOP_SHELL_BREAKPOINT = 1024;

const defaultApi = createAuthApi();
const bootstrapFailure: AuthState = {
  status: 'ERROR',
  message: 'Не удалось проверить вход. Попробуйте ещё раз.',
  retryable: true,
};

export function App({ api = defaultApi, createAdapter = createTelegramAdapter }: AppProps) {
  const [state, setState] = useState<AuthState>({ status: 'BOOTSTRAPPING' });
  const [routeHash, setRouteHash] = useState(() => window.location.hash || '#/');
  const [shellViewport, setShellViewport] = useState<ShellViewport>(() =>
    resolveShellViewport(window.innerWidth),
  );
  const mounted = useRef(false);
  const adapter = useRef<TelegramAdapter | undefined>(undefined);
  const request = useRef<{ controller?: AbortController; epoch: number }>({ epoch: 0 });

  const beginRequest = useCallback(() => {
    request.current.controller?.abort();
    const controller = new AbortController();
    const epoch = request.current.epoch + 1;
    request.current = { controller, epoch };
    return { controller, epoch };
  }, []);

  const commit = useCallback((epoch: number, next: AuthState) => {
    if (
      mounted.current &&
      request.current.epoch === epoch &&
      !request.current.controller?.signal.aborted
    ) {
      setState(next);
    }
  }, []);

  const start = useCallback(
    async (initData = adapter.current?.initData) => {
      const { controller, epoch } = beginRequest();
      commit(epoch, { status: 'BOOTSTRAPPING' });
      try {
        const next = await bootstrapAuth(api, initData, controller.signal, (transition) =>
          commit(epoch, transition),
        );
        commit(epoch, next);
      } catch {
        if (!controller.signal.aborted) commit(epoch, bootstrapFailure);
      }
    },
    [api, beginRequest, commit],
  );

  useEffect(() => {
    mounted.current = true;
    const ownedAdapter = createAdapter();
    adapter.current = ownedAdapter;
    void start(ownedAdapter.initData);
    ownedAdapter.shellReady();

    return () => {
      mounted.current = false;
      request.current.epoch += 1;
      request.current.controller?.abort();
      if (adapter.current === ownedAdapter) adapter.current = undefined;
      ownedAdapter.dispose();
    };
  }, [createAdapter, start]);

  useEffect(() => {
    function syncRoute() {
      setRouteHash(window.location.hash || '#/');
    }

    syncRoute();
    window.addEventListener('hashchange', syncRoute);

    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  useEffect(() => {
    function syncViewport() {
      setShellViewport(resolveShellViewport(window.innerWidth));
    }

    syncViewport();
    window.addEventListener('resize', syncViewport);

    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  async function selectDevelopmentUser(devUserKey: string) {
    const { controller, epoch } = beginRequest();
    commit(epoch, { status: 'AUTHENTICATING' });
    try {
      const result = await api.loginDevelopment(devUserKey, controller.signal);
      commit(epoch, { status: 'AUTHENTICATED', user: result.user });
    } catch {
      if (!controller.signal.aborted) {
        commit(epoch, {
          status: 'ERROR',
          message: 'Не удалось выполнить вход. Попробуйте ещё раз.',
          retryable: true,
        });
      }
    }
  }

  async function logout() {
    const { controller, epoch } = beginRequest();
    commit(epoch, { status: 'AUTHENTICATING' });
    try {
      await api.logout(controller.signal);
      if (request.current.epoch === epoch && !controller.signal.aborted) await start();
    } catch {
      if (!controller.signal.aborted) {
        commit(epoch, {
          status: 'ERROR',
          message: 'Не удалось выйти. Попробуйте ещё раз.',
          retryable: true,
        });
      }
    }
  }

  if (state.status === 'AUTHENTICATED') {
    const route = renderShellRoute(routeHash);

    return (
      <AppShell
        title="Заманушка"
        navigation={shellNavigationItems}
        activeNavigationKey={route.activeKey}
        viewport={shellViewport}
      >
        <div className="shell-authenticated-layout">
          <div className="shell-authenticated-layout__page">{route.page}</div>
          <Panel as="section" className="shell-session-panel">
            <p className="shell-session-panel__eyebrow">Authenticated session</p>
            <p className="shell-session-panel__name">{state.user.displayName}</p>
            <p className="shell-session-panel__meta">ID: {state.user.id}</p>
            <p className="shell-session-panel__meta">
              Provider: {state.user.authProvider === 'TELEGRAM' ? 'Telegram' : 'Development'}
            </p>
            <Button variant="secondary" onClick={() => void logout()}>
              Выйти
            </Button>
          </Panel>
        </div>
      </AppShell>
    );
  }

  return (
    <AppFrame title="Заманушка" navigation={[]}>
      <AuthShell
        state={state}
        onSelectDevUser={(key) => void selectDevelopmentUser(key)}
        onRetry={() => void start()}
        onLogout={() => void logout()}
      />
    </AppFrame>
  );
}
