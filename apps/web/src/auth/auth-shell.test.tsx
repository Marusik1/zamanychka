import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AuthShell } from './auth-shell.js';

const user = { id: 'internal-42', displayName: 'Анна', authProvider: 'DEVELOPMENT' as const };
const handlers = { onSelectDevUser: vi.fn(), onRetry: vi.fn(), onLogout: vi.fn() };

describe('AuthShell', () => {
  it('renders the auth region without product navigation', () => {
    render(<AuthShell state={{ status: 'BOOTSTRAPPING' }} {...handlers} />);

    expect(screen.getByRole('region', { name: 'Добро пожаловать' })).toBeVisible();
    expect(screen.getByText('ЗАМАНУШКА')).toBeVisible();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('renders explicit loading and authenticating states', () => {
    const { rerender } = render(<AuthShell state={{ status: 'BOOTSTRAPPING' }} {...handlers} />);
    expect(screen.getByRole('status')).toHaveTextContent('Проверяем вход');
    expect(screen.getByRole('status')).toHaveClass('ui-status');

    rerender(<AuthShell state={{ status: 'AUTHENTICATING' }} {...handlers} />);
    expect(screen.getByRole('status')).toHaveTextContent('Выполняем вход');
    expect(screen.getByRole('status')).toHaveClass('ui-status');
  });

  it('shows authenticated identity without raw metadata and with logout', () => {
    render(
      <AuthShell
        state={{
          status: 'AUTHENTICATED',
          user,
          rulesOnboardingSeenAt: '2026-08-29T10:00:00.000Z',
        }}
        {...handlers}
      />,
    );

    expect(screen.getByText('Анна')).toBeVisible();
    expect(screen.queryByText(/internal-42/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти' })).toHaveClass('ui-button');
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));
    expect(handlers.onLogout).toHaveBeenCalledTimes(1);
  });

  it('does not render provider labels in the ordinary authenticated shell', () => {
    render(
      <AuthShell
        state={{
          status: 'AUTHENTICATED',
          user: {
            id: 'telegram-1',
            displayName: 'Телеграм',
            authProvider: 'TELEGRAM',
          },
          rulesOnboardingSeenAt: '2026-08-29T10:00:00.000Z',
        }}
        {...handlers}
      />,
    );

    expect(screen.getByText('Телеграм')).toBeVisible();
  });

  it('renders exactly the two configured development choices and sends the selected key', () => {
    const users = [
      { devUserKey: 'dev-one', displayName: 'Игрок один' },
      { devUserKey: 'dev-two', displayName: 'Игрок два' },
    ];
    render(<AuthShell state={{ status: 'DEV_AUTH_REQUIRED', users }} {...handlers} />);

    expect(screen.getByText('Игрок один').closest('.ui-panel-surface')).not.toBeNull();
    const choices = screen.getAllByRole('button');
    expect(choices).toHaveLength(2);
    expect(choices[0]).toHaveClass('ui-button');
    fireEvent.click(screen.getByRole('button', { name: 'Игрок два' }));
    expect(handlers.onSelectDevUser).toHaveBeenCalledWith('dev-two');
  });

  it('shows the browser fallback error with a retry action', () => {
    render(
      <AuthShell
        state={{
          status: 'ERROR',
          message: 'Вход доступен только внутри Telegram.',
          retryable: true,
        }}
        {...handlers}
      />,
    );

    expect(screen.getByRole('alert')).toHaveClass('ui-status');
    expect(screen.getByRole('alert')).toHaveTextContent('Telegram');
    expect(screen.getByRole('button', { name: 'Повторить' })).toHaveClass('ui-button');
  });

  it('offers retry for recoverable errors', () => {
    render(
      <AuthShell
        state={{ status: 'ERROR', message: 'Не удалось войти.', retryable: true }}
        {...handlers}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides retry when the error is not recoverable', () => {
    render(
      <AuthShell
        state={{ status: 'ERROR', message: 'Необратимая ошибка.', retryable: false }}
        {...handlers}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Необратимая ошибка.');
    expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument();
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
