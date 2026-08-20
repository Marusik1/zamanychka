import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AuthApi } from './auth/api.js';
import { App } from './app.js';
import type { TelegramAdapter } from './telegram/adapter.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
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

  it('does not render arbitrary identity controls or future product navigation', async () => {
    const telegram = adapter();
    render(<App createAdapter={() => telegram} api={authenticatedApi()} />);
    await screen.findByText('Один');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
