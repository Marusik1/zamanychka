import { Button, Panel, Status, UserChip } from '@zamanushka/ui';

import type { AuthState } from './bootstrap.js';

interface AuthShellProps {
  state: AuthState;
  onSelectDevUser(devUserKey: string): void;
  onRetry(): void;
  onLogout(): void;
}

export function AuthShell({ state, onSelectDevUser, onRetry, onLogout }: AuthShellProps) {
  const errorTone = state.status === 'ERROR' && state.retryable ? 'warning' : 'danger';

  return (
    <section className="auth-shell" aria-labelledby="auth-title">
      <div className="auth-shell__hero">
        <p className="auth-shell__eyebrow">ЗАМАНУШКА</p>
        <h1 id="auth-title">Добро пожаловать</h1>
        <p className="auth-shell__lede">
          Авторизация остаётся серверной. Продолжите через Telegram или разрешённый режим
          разработки.
        </p>
      </div>

      {(state.status === 'BOOTSTRAPPING' || state.status === 'AUTHENTICATING') && (
        <Status className="auth-shell__status" role="status" tone="info">
          {state.status === 'BOOTSTRAPPING' ? 'Проверяем вход…' : 'Выполняем вход…'}
        </Status>
      )}

      {state.status === 'AUTHENTICATED' && (
        <Panel as="section" className="auth-shell__panel auth-shell__panel--identity">
          <div className="auth-shell__panel-header">
            <p className="auth-shell__label">Активная сессия</p>
            <UserChip name={state.user.displayName} className="auth-shell__user-chip" />
          </div>
          <Button variant="secondary" size="lg" onClick={onLogout}>
            Выйти
          </Button>
        </Panel>
      )}

      {state.status === 'DEV_AUTH_REQUIRED' && (
        <Panel as="section" className="auth-shell__panel auth-shell__panel--choices">
          <div className="auth-shell__panel-header">
            <p className="auth-shell__label">Режим разработки</p>
            <p className="auth-shell__body">Выберите тестового пользователя для продолжения.</p>
          </div>
          <div className="auth-shell__choices">
            {state.users.map((choice) => (
              <Button
                key={choice.devUserKey}
                variant="secondary"
                size="lg"
                onClick={() => onSelectDevUser(choice.devUserKey)}
              >
                {choice.displayName}
              </Button>
            ))}
          </div>
        </Panel>
      )}

      {state.status === 'ERROR' && (
        <div className="auth-shell__feedback">
          <Status className="auth-shell__status" role="alert" tone={errorTone}>
            {state.message}
          </Status>
          {state.retryable && (
            <Button variant="secondary" size="lg" onClick={onRetry}>
              Повторить
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
