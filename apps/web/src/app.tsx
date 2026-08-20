import { AppFrame } from '@zamanushka/ui';
import { useCallback, useEffect, useState } from 'react';

import { createAuthApi, type AuthApi } from './auth/api.js';
import { AuthShell } from './auth/auth-shell.js';
import { bootstrapAuth, type AuthState } from './auth/bootstrap.js';
import { createTelegramAdapter, type TelegramAdapter } from './telegram/adapter.js';

interface AppProps {
  api?: AuthApi;
  createAdapter?: () => TelegramAdapter;
}

const defaultApi = createAuthApi();

export function App({ api = defaultApi, createAdapter = createTelegramAdapter }: AppProps) {
  const [adapter] = useState(createAdapter);
  const [state, setState] = useState<AuthState>({ status: 'BOOTSTRAPPING' });

  const start = useCallback(async () => {
    setState({ status: 'BOOTSTRAPPING' });
    setState(await bootstrapAuth(api, adapter.initData, setState));
  }, [adapter.initData, api]);

  useEffect(() => {
    let active = true;
    const transition = (next: AuthState) => {
      if (active) setState(next);
    };
    void bootstrapAuth(api, adapter.initData, transition).then((next) => {
      if (active) setState(next);
    });
    adapter.shellReady();
    return () => {
      active = false;
      adapter.dispose();
    };
  }, [adapter, api]);

  async function selectDevelopmentUser(devUserKey: string) {
    setState({ status: 'AUTHENTICATING' });
    try {
      const result = await api.loginDevelopment(devUserKey);
      setState({ status: 'AUTHENTICATED', user: result.user });
    } catch {
      setState({
        status: 'ERROR',
        message: 'Не удалось выполнить вход. Попробуйте ещё раз.',
        retryable: true,
      });
    }
  }

  async function logout() {
    setState({ status: 'AUTHENTICATING' });
    try {
      await api.logout();
      await start();
    } catch {
      setState({
        status: 'ERROR',
        message: 'Не удалось выйти. Попробуйте ещё раз.',
        retryable: true,
      });
    }
  }

  return (
    <AppFrame title="Заманушка">
      <AuthShell
        state={state}
        onSelectDevUser={(key) => void selectDevelopmentUser(key)}
        onRetry={() => void start()}
        onLogout={() => void logout()}
      />
    </AppFrame>
  );
}
