import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AuthShell } from './auth-shell.js';

const user = { id: 'internal-42', displayName: 'Анна', authProvider: 'DEVELOPMENT' as const };
const handlers = { onSelectDevUser: vi.fn(), onRetry: vi.fn(), onLogout: vi.fn() };

describe('AuthShell', () => {
  it('renders explicit loading and authenticating states', () => {
    const { rerender } = render(<AuthShell state={{ status: 'BOOTSTRAPPING' }} {...handlers} />);
    expect(screen.getByRole('status')).toHaveTextContent('Проверяем вход');

    rerender(<AuthShell state={{ status: 'AUTHENTICATING' }} {...handlers} />);
    expect(screen.getByRole('status')).toHaveTextContent('Выполняем вход');
  });

  it('shows authenticated internal identity and provider with logout', () => {
    render(<AuthShell state={{ status: 'AUTHENTICATED', user }} {...handlers} />);

    expect(screen.getByText('Анна')).toBeVisible();
    expect(screen.getByText(/internal-42/)).toBeVisible();
    expect(screen.getByText(/режим разработки/i)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));
    expect(handlers.onLogout).toHaveBeenCalledTimes(1);
  });

  it('renders exactly the two configured development choices and sends the selected key', () => {
    const users = [
      { devUserKey: 'dev-one', displayName: 'Игрок один' },
      { devUserKey: 'dev-two', displayName: 'Игрок два' },
    ];
    render(<AuthShell state={{ status: 'DEV_AUTH_REQUIRED', users }} {...handlers} />);

    const choices = screen.getAllByRole('button');
    expect(choices).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Игрок два' }));
    expect(handlers.onSelectDevUser).toHaveBeenCalledWith('dev-two');
  });

  it('offers retry for errors', () => {
    render(
      <AuthShell
        state={{ status: 'ERROR', message: 'Не удалось войти.', retryable: true }}
        {...handlers}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
  });

  it('contains no arbitrary identity inputs or EPIC-02 product navigation', () => {
    render(
      <AuthShell
        state={{
          status: 'DEV_AUTH_REQUIRED',
          users: [
            { devUserKey: 'one', displayName: 'Один' },
            { devUserKey: 'two', displayName: 'Два' },
          ],
        }}
        {...handlers}
      />,
    );

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/профиль|играть|комната|матч/i)).not.toBeInTheDocument();
  });
});
