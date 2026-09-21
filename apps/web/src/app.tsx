import { AppFrame, AppShell, Button, Dialog, EmptyState, Panel } from '@zamanushka/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { createAuthApi, type AuthApi } from './auth/api.js';
import { AuthShell } from './auth/auth-shell.js';
import { bootstrapAuth, type AuthState } from './auth/bootstrap.js';
import { FullscreenIntroGate, IntroHero } from './intro';
import { PlayableBetaPage } from './playable-beta/page.js';
import { GameplayRuntimePreview } from './game/runtime-preview.js';
import { createRealtimeClient, type RealtimeClient } from './playable-beta/realtime-client.js';
import { createRoomApi, type RoomApi } from './playable-beta/room-api.js';
import { createProfileApi, type ProfileApi } from './profile/api.js';
import { HistoryPage } from './profile/history-page.js';
import { ProfilePage } from './profile/profile-page.js';
import { ProfileScreen, type MatchSummary as RedesignMatchSummary, type ProfileSummary as RedesignProfileSummary, type NavTab as RedesignNavTab } from './redesign-v1/index.js';
import './redesign-v1/styles/tokens.css';
import { RulesPage } from './rules/rules-page.js';
import { resolveShellRoute, shellNavigationItems } from './shell/routes.js';
import { createTelegramAdapter, type TelegramAdapter } from './telegram/adapter.js';

interface AppProps {
  api?: AuthApi;
  profileApi?: ProfileApi;
  roomApi?: RoomApi;
  realtimeClient?: RealtimeClient;
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
const defaultRoomApi = createRoomApi();
const defaultRealtimeClient = createRealtimeClient();

function profileInitials(displayName: string) {
  return displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function redesignMatchResult(result: ProfileData['recentResults'][number]): RedesignMatchSummary {
  return {
    id: result.id,
    result:
      result.currentUserOutcome === 'WIN'
        ? 'win'
        : result.currentUserOutcome === 'SURRENDERED'
          ? 'surrender'
          : 'loss',
    roomName: 'Матч',
    playerCount: result.participantCount,
    dateLabel: new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(result.finishedAt)),
  };
}

function redesignProfile(data: ProfileData): RedesignProfileSummary {
  return {
    displayName: data.user.displayName,
    initials: profileInitials(data.user.displayName),
    games: data.stats.gamesPlayed,
    wins: data.stats.wins,
    winRate: Math.round(data.stats.winRate * 100),
    recentMatches: data.recentResults.map(redesignMatchResult),
  };
}

function navigateRedesignTab(tab: RedesignNavTab) {
  window.location.hash = tab === 'home' ? '#/' : tab === 'rooms' ? '#/rooms' : '#/profile';
}
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

function IntroScrubLayer({
  running,
  onComplete,
  routeHash,
}: {
  running: boolean;
  onComplete: () => void;
  routeHash: string;
}) {
  if (import.meta.env.DEV && routeHash === '#/__debug/game-presentation') {
    return (
      <AppFrame title="Р—РђРњРђРќРЈРЁРљРђ" navigation={[]}>
        <Panel as="section">
          <h1>Game presentation debug harness</h1>
          <p>DEV ONLY: synthetic events, production presentation code.</p>
          <GameplayRuntimePreview localPlayerId="debug-local-player" mode="manual" />
        </Panel>
      </AppFrame>
    );
  }

  return (
    <IntroHero
      autoStart={running}
      className="z-intro--scrub-layer z-existingScrubRoot"
      showUi={false}
      onComplete={onComplete}
    />
  );
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
  roomApi = defaultRoomApi,
  realtimeClient = defaultRealtimeClient,
  createAdapter = createTelegramAdapter,
}: AppProps) {
  const [state, setState] = useState<AuthState>({ status: 'BOOTSTRAPPING' });
  const [routeHash, setRouteHash] = useState(() => window.location.hash || '#/');
  const [shellViewport, setShellViewport] = useState<ShellViewport>(() =>
    resolveShellViewport(window.innerWidth),
  );
  const [profileState, setProfileState] = useState<ProfileScreenState>(initialProfileState);
  const [rulesOnboardingDismissed, setRulesOnboardingDismissed] = useState(false);
  const [rulesGuidedStartKey, setRulesGuidedStartKey] = useState(0);
  const [introComplete, setIntroComplete] = useState(import.meta.env.MODE === 'test');
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
      realtimeClient.disconnect();
      ownedAdapter.dispose();
    };
  }, [createAdapter, realtimeClient, start]);

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
      setRulesOnboardingDismissed(false);
      return;
    }

    if (routeHash === '#/' || routeHash === '#/profile') {
      void loadProfile();
      return;
    }

    if (routeHash === '#/profile/history') {
      void loadHistory();
    }
  }, [loadHistory, loadProfile, routeHash, state.status]);

  useEffect(() => {
    if (state.status !== 'AUTHENTICATED') return;

    const authenticatedUserId = state.user.id;
    const refreshFocusedSession = async () => {
      const { controller, epoch } = beginRequest();
      try {
        const current = await api.me(controller.signal);
        if (controller.signal.aborted || current.user.id === authenticatedUserId) return;

        realtimeClient.disconnect();
        commit(epoch, {
          status: 'AUTHENTICATED',
          user: current.user,
          rulesOnboardingSeenAt: current.rulesOnboardingSeenAt,
        });
      } catch {
        // A transient focus refresh must not discard an otherwise usable session.
      }
    };

    window.addEventListener('focus', refreshFocusedSession);
    document.addEventListener('visibilitychange', refreshFocusedSession);
    return () => {
      window.removeEventListener('focus', refreshFocusedSession);
      document.removeEventListener('visibilitychange', refreshFocusedSession);
    };
  }, [api, beginRequest, commit, realtimeClient, state]);

  const completeRulesOnboarding = useCallback(async () => {
    try {
      const result = await api.markRulesOnboardingSeen();
      setState((current) =>
        current.status === 'AUTHENTICATED'
          ? { ...current, rulesOnboardingSeenAt: result.rulesOnboardingSeenAt }
          : current,
      );
    } catch {}
  }, [api]);

  async function selectDevelopmentUser(devUserKey: string) {
    const { controller, epoch } = beginRequest();
    commit(epoch, { status: 'AUTHENTICATING' });
    try {
      const result = await api.loginDevelopment(devUserKey, controller.signal);
      commit(epoch, {
        status: 'AUTHENTICATED',
        user: result.user,
        rulesOnboardingSeenAt: result.rulesOnboardingSeenAt,
      });
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
    const showRulesOnboarding = !state.rulesOnboardingSeenAt && !rulesOnboardingDismissed;
    const shellRoute = resolveShellRoute(routeHash);
    const route =
      routeHash === '#/__debug/game-presentation'
        ? {
            activeKey: 'rooms' as const,
            page: (
              <Panel as="section">
                <h1>Game presentation debug harness</h1>
                <p>DEV ONLY: synthetic events, production presentation code.</p>
                <GameplayRuntimePreview localPlayerId={state.user.id} mode="manual" />
              </Panel>
            ),
          }
        : routeHash === '#/profile' && profileState.status === 'ready' && profileState.data
        ? {
            activeKey: 'profile' as const,
            page: shellViewport === 'mobile' ? (
              <ProfileScreen
                profile={redesignProfile(profileState.data)}
                onOpenSettings={() => { window.location.hash = '#/profile'; }}
                onOpenRules={() => { window.location.hash = '#/profile/rules'; }}
                onOpenHistory={() => { window.location.hash = '#/profile/history'; }}
                onNavigate={navigateRedesignTab}
              />
            ) : <ProfilePage data={profileState.data} />,
          }
        : routeHash === '#/profile/rules'
          ? {
              activeKey: 'profile' as const,
              page: <RulesPage guidedStartKey={rulesGuidedStartKey} onBack={() => window.history.back()} />,
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
                              onClick={() =>
                                void loadHistory(profileState.historyCursor ?? undefined)
                              }
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
                : shellRoute.key === 'home'
                  ? {
                      activeKey: 'home' as const,
                      page: (
                        <PlayableBetaPage
                          key={state.user.id}
                          variant="home"
                          authState={state}
                          routeHash={routeHash}
                          roomApi={roomApi}
                          realtimeClient={realtimeClient}
                          onLogout={() => void logout()}
                          {...(profileState.data?.recentResults[0]
                            ? { homeLastMatch: redesignMatchResult(profileState.data.recentResults[0]) }
                            : {})}
                        />
                      ),
                    }
                  : {
                      activeKey: 'rooms' as const,
                      page: (
                        <PlayableBetaPage
                          key={state.user.id}
                          variant="rooms"
                          authState={state}
                          routeHash={routeHash}
                          roomApi={roomApi}
                          realtimeClient={realtimeClient}
                        />
                      ),
                    };

    if (route.activeKey === 'home' && !introComplete) {
      return (
        <FullscreenIntroGate
          onComplete={() => setIntroComplete(true)}
          renderScrub={(props) => <IntroScrubLayer {...props} routeHash={routeHash} />}
        />
      );
    }

    return (
      <AppShell
        title="ЗАМАНУШКА"
        navigation={shellNavigationItems}
        activeNavigationKey={route.activeKey}
        viewport={shellViewport}
      >
        <>
          <div className="shell-authenticated-layout">
            <div className="shell-authenticated-layout__page">{route.page}</div>
            {route.activeKey !== 'home' && shellViewport !== 'mobile' ? <Panel as="section" className="shell-session-panel">
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
            </Panel> : null}
          </div>
          <Dialog
            open={showRulesOnboarding}
            title="Как играть в «Заманушку»"
            description="Семь коротких шагов помогут быстро разобраться в правилах и откроют уже существующее обучение."
          >
            <div className="shell-onboarding-dialog">
              <Button
                onClick={() => {
                  setRulesOnboardingDismissed(true);
                  setRulesGuidedStartKey((key) => key + 1);
                  window.location.hash = '#/profile/rules';
                  void completeRulesOnboarding();
                }}
              >
                Начать обучение
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setRulesOnboardingDismissed(true);
                  void completeRulesOnboarding();
                }}
              >
                Позже
              </Button>
            </div>
          </Dialog>
        </>
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
