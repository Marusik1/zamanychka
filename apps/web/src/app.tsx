import { AppFrame, AppShell, Button, EmptyState, Panel } from '@zamanushka/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { createAuthApi, type AuthApi } from './auth/api.js';
import { AuthShell } from './auth/auth-shell.js';
import { bootstrapAuth, type AuthState } from './auth/bootstrap.js';
import { createProfileApi, type ProfileApi } from './profile/api.js';
import { HistoryPage } from './profile/history-page.js';
import { ProfilePage } from './profile/profile-page.js';
import { RulesPage } from './rules/rules-page.js';
import { renderShellRoute, shellNavigationItems } from './shell/routes.js';
import { createTelegramAdapter, type TelegramAdapter } from './telegram/adapter.js';

interface AppProps {
  api?: AuthApi;
  profileApi?: ProfileApi;
  createAdapter?: () => TelegramAdapter;
}

type ShellViewport = 'mobile' | 'desktop';
type ProfileData = Awaited<ReturnType<ProfileApi['profile']>>;
type HistoryItems = Awaited<ReturnType<ProfileApi['history']>>['items'];
type ProfileScreenState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: ProfileData | null;
  historyItems: HistoryItems;
  historyCursor: string | null;
};

const DESKTOP_SHELL_BREAKPOINT = 1024;
const defaultApi = createAuthApi();
const defaultProfileApi = createProfileApi();
const bootstrapFailure: AuthState = {
  status: 'ERROR',
  message: 'Не удалось проверить вход. Попробуйте ещё раз.',
  retryable: true,
};
const initialProfileState: ProfileScreenState = {
  status: 'idle',
  data: null,
  historyItems: [],
  historyCursor: null,
};

function resolveShellViewport(width: number): ShellViewport {
  return width >= DESKTOP_SHELL_BREAKPOINT ? 'desktop' : 'mobile';
}

function renderAvatar(displayName: string) {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

function isProfileRoute(hash: string) {
  return hash === '#/profile' || hash === '#/profile/history' || hash === '#/profile/rules';
}

function mergeUniqueResults(current: HistoryItems, incoming: HistoryItems): HistoryItems {
  const seen = new Set(current.map((item) => item.id));
  const appended = incoming.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return current.concat(appended);
}

export function App({
  api = defaultApi,
  profileApi = defaultProfileApi,
  createAdapter = createTelegramAdapter,
}: AppProps) {
  const [state, setState] = useState<AuthState>({ status: 'BOOTSTRAPPING' });
  const [routeHash, setRouteHash] = useState(() => window.location.hash || '#/');
  const [shellViewport, setShellViewport] = useState<ShellViewport>(() =>
    resolveShellViewport(window.innerWidth),
  );
  const [profileState, setProfileState] = useState<ProfileScreenState>(initialProfileState);
  const mounted = useRef(false);
  const adapter = useRef<TelegramAdapter | undefined>(undefined);
  const request = useRef<{ controller?: AbortController; epoch: number }>({ epoch: 0 });
  const profileRequest = useRef<{ controller?: AbortController; epoch: number }>({ epoch: 0 });

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

  const beginProfileRequest = useCallback(() => {
    profileRequest.current.controller?.abort();
    const controller = new AbortController();
    const epoch = profileRequest.current.epoch + 1;
    profileRequest.current = { controller, epoch };
    return { controller, epoch };
  }, []);

  const loadProfile = useCallback(async () => {
    const { controller, epoch } = beginProfileRequest();
    setProfileState((current) => ({ ...current, status: 'loading' }));

    try {
      const data = await profileApi.profile(controller.signal);
      if (profileRequest.current.epoch !== epoch || controller.signal.aborted) return;
      setProfileState({
        status: 'ready',
        data,
        historyItems: [],
        historyCursor: null,
      });
    } catch {
      if (profileRequest.current.epoch !== epoch || controller.signal.aborted) return;
      setProfileState({
        status: 'error',
        data: null,
        historyItems: [],
        historyCursor: null,
      });
    }
  }, [beginProfileRequest, profileApi]);

  const loadHistory = useCallback(
    async (cursor?: string) => {
      const { controller, epoch } = beginProfileRequest();
      setProfileState((current) => ({ ...current, status: 'loading' }));

      try {
        const page = await profileApi.history(cursor ? { cursor } : {}, controller.signal);
        if (profileRequest.current.epoch !== epoch || controller.signal.aborted) return;
        setProfileState((current) => ({
          status: 'ready',
          data: current.data,
          historyItems: cursor ? mergeUniqueResults(current.historyItems, page.items) : page.items,
          historyCursor: page.nextCursor,
        }));
      } catch {
        if (profileRequest.current.epoch !== epoch || controller.signal.aborted) return;
        setProfileState((current) => ({
          ...current,
          status: 'error',
        }));
      }
    },
    [beginProfileRequest, profileApi],
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
      profileRequest.current.epoch += 1;
      profileRequest.current.controller?.abort();
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

  useEffect(() => {
    if (state.status !== 'AUTHENTICATED') {
      profileRequest.current.epoch += 1;
      profileRequest.current.controller?.abort();
      setProfileState(initialProfileState);
      return;
    }

    if (routeHash === '#/profile') {
      void loadProfile();
      return;
    }

    if (routeHash === '#/profile/history') {
      void loadHistory();
    }
  }, [loadHistory, loadProfile, routeHash, state.status]);

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
    const route =
      routeHash === '#/profile' && profileState.status === 'ready' && profileState.data
        ? {
            activeKey: 'profile' as const,
            page: <ProfilePage data={profileState.data} />,
          }
        : routeHash === '#/profile/rules'
          ? {
              activeKey: 'profile' as const,
              page: <RulesPage />,
            }
        : routeHash === '#/profile' && profileState.status === 'error'
          ? {
              activeKey: 'profile' as const,
              page: (
                <EmptyState
                  title="Профиль временно недоступен"
                  description="Попробуйте открыть раздел ещё раз."
                />
              ),
            }
          : routeHash === '#/profile/history' &&
              (profileState.status === 'ready' || profileState.status === 'error')
            ? {
                activeKey: 'profile' as const,
                page: (
                  <>
                    {profileState.status === 'error' ? (
                      <EmptyState
                        className="profile-page__inline-state"
                        title="Не удалось загрузить историю"
                        description="Уже загруженные результаты сохранены."
                        action={
                          <Button
                            variant="secondary"
                            onClick={() => void loadHistory(profileState.historyCursor ?? undefined)}
                          >
                            Повторить
                          </Button>
                        }
                      />
                    ) : null}
                    <HistoryPage
                      items={profileState.historyItems}
                      nextCursor={profileState.historyCursor}
                      onLoadMore={() => void loadHistory(profileState.historyCursor ?? undefined)}
                    />
                  </>
                ),
              }
            : isProfileRoute(routeHash)
              ? {
                  activeKey: 'profile' as const,
                  page: <Panel as="section">Загрузка…</Panel>,
                }
              : renderShellRoute(routeHash);

    return (
      <AppShell
        title="ЗАМАНУШКА"
        navigation={shellNavigationItems}
        activeNavigationKey={route.activeKey}
        viewport={shellViewport}
      >
        <div className="shell-authenticated-layout">
          <div className="shell-authenticated-layout__page">{route.page}</div>
          <Panel as="section" className="shell-session-panel">
            <div className="shell-session-panel__identity">
              <div className="shell-session-panel__avatar" aria-hidden="true">
                {renderAvatar(state.user.displayName)}
              </div>
              <div className="shell-session-panel__identity-copy">
                <p className="shell-session-panel__eyebrow">Активная сессия</p>
                <p className="shell-session-panel__name">{state.user.displayName}</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => void logout()}>
              Выйти
            </Button>
          </Panel>
        </div>
      </AppShell>
    );
  }

  return (
    <AppFrame title="ЗАМАНУШКА" navigation={[]}>
      <AuthShell
        state={state}
        onSelectDevUser={(key) => void selectDevelopmentUser(key)}
        onRetry={() => void start()}
        onLogout={() => void logout()}
      />
    </AppFrame>
  );
}
