import type { AuthState } from './bootstrap.js';

interface AuthShellProps {
  state: AuthState;
  onSelectDevUser(devUserKey: string): void;
  onRetry(): void;
  onLogout(): void;
}

export function AuthShell({ state, onSelectDevUser, onRetry, onLogout }: AuthShellProps) {
  return (
    <section className="auth-shell" aria-labelledby="auth-title">
      <p className="auth-shell__eyebrow">ЗАМАНУШКА</p>
      <h1 id="auth-title">Добро пожаловать</h1>
      {state.status === 'BOOTSTRAPPING' && <p role="status">Проверяем вход…</p>}
      {state.status === 'AUTHENTICATING' && <p role="status">Выполняем вход…</p>}
      {state.status === 'AUTHENTICATED' && (
        <div className="auth-shell__content">
          <p className="auth-shell__name">{state.user.displayName}</p>
          <dl className="auth-shell__identity">
            <div>
              <dt>ID</dt>
              <dd>{state.user.id}</dd>
            </div>
            <div>
              <dt>Вход</dt>
              <dd>{state.user.authProvider === 'TELEGRAM' ? 'Telegram' : 'Режим разработки'}</dd>
            </div>
          </dl>
          <button type="button" onClick={onLogout}>
            Выйти
          </button>
        </div>
      )}
      {state.status === 'DEV_AUTH_REQUIRED' && (
        <div className="auth-shell__content">
          <p>Выберите тестового пользователя</p>
          <div className="auth-shell__choices">
            {state.users.map((choice) => (
              <button
                key={choice.devUserKey}
                type="button"
                onClick={() => onSelectDevUser(choice.devUserKey)}
              >
                {choice.displayName}
              </button>
            ))}
          </div>
        </div>
      )}
      {state.status === 'ERROR' && (
        <div className="auth-shell__content" role="alert">
          <p>{state.message}</p>
          {state.retryable && (
            <button type="button" onClick={onRetry}>
              Повторить
            </button>
          )}
        </div>
      )}
    </section>
  );
}
