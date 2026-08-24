import { act, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AuthApiError, type AuthApi } from './auth/api.js';
import { App } from './app.js';
import type { TelegramAdapter } from './telegram/adapter.js';
import type { TelegramEvent, TelegramWebApp } from './telegram/types.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function adapter(): TelegramAdapter {
  return {
    isAvailable: false,
    isTelegram: false,
    initData: undefined,
    shellReady: vi.fn(),
    dispose: vi.fn(),
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected test value');
  return value;
}

function authenticatedApi(
  me: AuthApi['me'] = vi
    .fn()
    .mockResolvedValue({ user: { id: 'one', displayName: 'Один', authProvider: 'DEVELOPMENT' } }),
): AuthApi {
  return {
    me,
    loginTelegram: vi.fn(),
    developmentCapability: vi.fn(),
    loginDevelopment: vi.fn(),
    logout: vi.fn(),
  };
}

describe('EPIC-01 app lifecycle', () => {
  it('leaves only the replayed StrictMode Telegram bridge listeners active', async () => {
    const listeners = new Map<TelegramEvent, Set<() => void>>();
    const webApp: TelegramWebApp = {
      initData: '',
      ready: vi.fn(),
      onEvent: vi.fn((event, listener) => {
        const active = listeners.get(event) ?? new Set();
        active.add(listener);
        listeners.set(event, active);
      }),
      offEvent: vi.fn((event, listener) => listeners.get(event)?.delete(listener)),
    };
    window.Telegram = { WebApp: webApp };

    const view = render(
      <StrictMode>
        <App api={authenticatedApi()} />
      </StrictMode>,
    );
    await waitFor(() => expect(webApp.onEvent).toHaveBeenCalledTimes(6));
    expect([...listeners.values()].reduce((count, active) => count + active.size, 0)).toBe(3);
    expect(webApp.offEvent).toHaveBeenCalledTimes(3);

    view.unmount();
    expect([...listeners.values()].reduce((count, active) => count + active.size, 0)).toBe(0);
    expect(webApp.offEvent).toHaveBeenCalledTimes(6);
    delete window.Telegram;
  });

  it('keeps only the active StrictMode adapter subscribed and disposes it on unmount', async () => {
    const adapters = [adapter(), adapter()];
    const createAdapter = vi.fn(() => required(adapters.shift()));
    const api = authenticatedApi();

    const view = render(
      <StrictMode>
        <App createAdapter={createAdapter} api={api} />
      </StrictMode>,
    );
    await waitFor(() => expect(createAdapter).toHaveBeenCalledTimes(2));

    const [first, second] = createAdapter.mock.results.map(({ value }) => value);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).not.toHaveBeenCalled();
    expect(first.shellReady).toHaveBeenCalledTimes(1);
    expect(second.shellReady).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).toHaveBeenCalledTimes(1);
  });

  it('performs at most one effective Telegram login after StrictMode aborts the first /me', async () => {
    const meRequests: ReturnType<typeof deferred<Awaited<ReturnType<AuthApi['me']>>>>[] = [];
    const api = authenticatedApi(
      vi.fn(() => {
        const request = deferred<Awaited<ReturnType<AuthApi['me']>>>();
        meRequests.push(request);
        return request.promise;
      }),
    );
    vi.mocked(api.loginTelegram).mockResolvedValue({
      user: { id: 'telegram', displayName: 'Телеграм', authProvider: 'TELEGRAM' },
      session: { expiresAt: '2026-09-20T00:00:00.000Z' },
    });

    render(
      <StrictMode>
        <App createAdapter={() => ({ ...adapter(), initData: 'signed' })} api={api} />
      </StrictMode>,
    );
    await waitFor(() => expect(meRequests).toHaveLength(2));

    required(meRequests[0]).reject(new AuthApiError(401));
    required(meRequests[1]).reject(new AuthApiError(401));
    await waitFor(() => expect(api.loginTelegram).toHaveBeenCalledTimes(1));
    expect(api.loginTelegram).toHaveBeenCalledWith('signed', expect.any(AbortSignal));
  });

  it('checks /api/me before attempting Telegram login', async () => {
    const api = authenticatedApi(vi.fn().mockRejectedValue(new AuthApiError(401)));
    vi.mocked(api.loginTelegram).mockResolvedValue({
      user: { id: 'telegram', displayName: 'Телеграм', authProvider: 'TELEGRAM' },
      session: { expiresAt: '2026-09-20T00:00:00.000Z' },
    });

    render(<App createAdapter={() => ({ ...adapter(), initData: 'signed' })} api={api} />);

    await waitFor(() => expect(api.loginTelegram).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.me).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.loginTelegram).mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it('aborts an outstanding authentication request on unmount', async () => {
    let signal: AbortSignal | undefined;
    const api = authenticatedApi(
      vi.fn((requestSignal?: AbortSignal) => {
        signal = requestSignal;
        return new Promise<Awaited<ReturnType<AuthApi['me']>>>(() => undefined);
      }),
    );
    const view = render(<App createAdapter={adapter} api={api} />);
    await waitFor(() => expect(signal).toBeDefined());

    view.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it('uses latest-request-wins when development logins overlap', async () => {
    const logins = new Map<
      string,
      ReturnType<typeof deferred<Awaited<ReturnType<AuthApi['loginDevelopment']>>>>
    >();
    const api = authenticatedApi(vi.fn().mockRejectedValue(new AuthApiError(401)));
    vi.mocked(api.developmentCapability).mockResolvedValue({
      enabled: true,
      users: [
        { devUserKey: 'one', displayName: 'Один' },
        { devUserKey: 'two', displayName: 'Два' },
      ],
    });
    vi.mocked(api.loginDevelopment).mockImplementation((key) => {
      const request = deferred<Awaited<ReturnType<AuthApi['loginDevelopment']>>>();
      logins.set(key, request);
      return request.promise;
    });
    render(<App createAdapter={adapter} api={api} />);
    const first = await screen.findByRole('button', { name: 'Один' });
    const second = screen.getByRole('button', { name: 'Два' });

    act(() => {
      first.click();
      second.click();
    });
    required(logins.get('two')).resolve({
      user: { id: 'two', displayName: 'Последний', authProvider: 'DEVELOPMENT' },
      session: { expiresAt: '2026-09-20T00:00:00.000Z' },
    });
    await screen.findByText('Последний');
    required(logins.get('one')).resolve({
      user: { id: 'one', displayName: 'Устаревший', authProvider: 'DEVELOPMENT' },
      session: { expiresAt: '2026-09-20T00:00:00.000Z' },
    });
    await act(() => Promise.resolve());

    expect(screen.queryByText('Устаревший')).not.toBeInTheDocument();
    expect(screen.getByText('Последний')).toBeVisible();
  });

  it('shows the browser fallback when Telegram is unavailable and development auth is disabled', async () => {
    const api = authenticatedApi(vi.fn().mockRejectedValue(new AuthApiError(401)));
    vi.mocked(api.developmentCapability).mockResolvedValue({ enabled: false, users: [] });

    render(<App createAdapter={adapter} api={api} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Telegram');
    expect(api.loginTelegram).not.toHaveBeenCalled();
  });

  it('shows the development chooser only after the browser bootstrap path rejects /api/me', async () => {
    const api = authenticatedApi(vi.fn().mockRejectedValue(new AuthApiError(401)));
    vi.mocked(api.developmentCapability).mockResolvedValue({
      enabled: true,
      users: [
        { devUserKey: 'one', displayName: 'Один' },
        { devUserKey: 'two', displayName: 'Два' },
      ],
    });

    render(<App createAdapter={adapter} api={api} />);

    await waitFor(() => expect(api.me).toHaveBeenCalledTimes(1));
    expect(api.developmentCapability).toHaveBeenCalledTimes(1);
    expect(api.loginTelegram).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Один' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Два' })).toBeVisible();
  });

  it('does not let a stale retry overwrite the latest bootstrap result', async () => {
    const retries: ReturnType<typeof deferred<Awaited<ReturnType<AuthApi['me']>>>>[] = [];
    const me = vi
      .fn()
      .mockRejectedValueOnce(new AuthApiError(500))
      .mockImplementation(() => {
        const pending = deferred<Awaited<ReturnType<AuthApi['me']>>>();
        retries.push(pending);
        return pending.promise;
      });
    const api = authenticatedApi(me);
    render(<App createAdapter={adapter} api={api} />);
    const retry = await screen.findByRole('button', { name: 'Повторить' });

    act(() => {
      retry.click();
      retry.click();
    });
    expect(retries).toHaveLength(2);
    required(retries[1]).resolve({
      user: { id: 'latest', displayName: 'Последний', authProvider: 'DEVELOPMENT' },
    });
    await screen.findByText('Последний');
    required(retries[0]).resolve({
      user: { id: 'stale', displayName: 'Устаревший', authProvider: 'DEVELOPMENT' },
    });
    await act(() => Promise.resolve());

    expect(screen.queryByText('Устаревший')).not.toBeInTheDocument();
  });

  it('does not let a stale logout restart bootstrap after a newer logout', async () => {
    const logouts: ReturnType<typeof deferred<Awaited<ReturnType<AuthApi['logout']>>>>[] = [];
    const api = authenticatedApi();
    vi.mocked(api.logout).mockImplementation(() => {
      const pending = deferred<Awaited<ReturnType<AuthApi['logout']>>>();
      logouts.push(pending);
      return pending.promise;
    });
    render(<App createAdapter={adapter} api={api} />);
    const logout = await screen.findByRole('button', { name: 'Выйти' });

    act(() => {
      logout.click();
      logout.click();
    });
    expect(logouts).toHaveLength(2);
    required(logouts[1]).resolve({ ok: true });
    await waitFor(() => expect(api.me).toHaveBeenCalledTimes(2));
    required(logouts[0]).resolve({ ok: true });
    await act(() => Promise.resolve());

    expect(api.me).toHaveBeenCalledTimes(2);
  });

  it('returns to the browser fallback after logout when Telegram is unavailable and development auth is disabled', async () => {
    const me = vi
      .fn()
      .mockResolvedValueOnce({
        user: { id: 'one', displayName: 'Один', authProvider: 'DEVELOPMENT' },
      })
      .mockRejectedValueOnce(new AuthApiError(401));
    const api = authenticatedApi(me);
    vi.mocked(api.developmentCapability).mockResolvedValue({ enabled: false, users: [] });
    vi.mocked(api.logout).mockResolvedValue({ ok: true });

    render(<App createAdapter={adapter} api={api} />);

    const logout = await screen.findByRole('button', { name: 'Выйти' });
    logout.click();

    expect(await screen.findByRole('alert')).toHaveTextContent('Telegram');
    expect(api.me).toHaveBeenCalledTimes(2);
    expect(api.loginTelegram).not.toHaveBeenCalled();
  });

  it('initializes bootstrap, renders the shell, and signals shell readiness exactly once', async () => {
    const pending = deferred<Awaited<ReturnType<AuthApi['me']>>>();
    const telegram = adapter();
    const api = authenticatedApi(vi.fn(() => pending.promise));

    render(<App createAdapter={() => telegram} api={api} />);

    expect(screen.getByRole('banner')).toHaveTextContent('Заманушка');
    expect(screen.getByRole('status')).toHaveTextContent('Проверяем вход');
    expect(telegram.shellReady).toHaveBeenCalledTimes(1);
    await act(() => {
      pending.resolve({ user: { id: 'one', displayName: 'Один', authProvider: 'DEVELOPMENT' } });
      return pending.promise;
    });
    expect(telegram.shellReady).toHaveBeenCalledTimes(1);
  });

  it('disposes Telegram listeners when the application unmounts', async () => {
    const telegram = adapter();
    const api = authenticatedApi();
    const view = render(<App createAdapter={() => telegram} api={api} />);
    await waitFor(() => expect(api.me).toHaveBeenCalledTimes(1));

    view.unmount();

    expect(telegram.dispose).toHaveBeenCalledTimes(1);
  });

  it('limits the authenticated app to shell-safe navigation without identity editors or gameplay topology', async () => {
    const telegram = adapter();
    render(<App createAdapter={() => telegram} api={authenticatedApi()} />);
    await screen.findByText('Один');

    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(navigation).getAllByRole('link')).toHaveLength(5);
    expect(within(navigation).getByRole('link', { name: 'Главная' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Создать комнату' })).not.toBeInTheDocument();
    expect(screen.queryByText('Подбор игроков')).not.toBeInTheDocument();
    expect(
      screen.getByRole('main').querySelector('[data-layout="gameplay-three-column"]'),
    ).toBeNull();
    expect(screen.getByRole('main').querySelector('[data-region="left-rail"]')).toBeNull();
    expect(screen.getByRole('main').querySelector('[data-region="right-rail"]')).toBeNull();
  });
});
