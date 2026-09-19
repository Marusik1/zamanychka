import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MobileHome } from './mobile-home.js';

describe('MobileHome', () => {
  it('renders real identity and profile values without unsupported product concepts', () => {
    render(
      <MobileHome
        displayName="Player One"
        initials="PO"
        stats={{ games: 5, wins: 2, winRate: 40 }}
        onLogout={vi.fn()}
        onOpenRooms={vi.fn()}
        onOpenRules={vi.fn()}
      />,
    );

    expect(screen.getByText('Player One, добро пожаловать!')).toHaveClass('z-home__welcome-title');
    expect(screen.getByText('Player One, добро пожаловать!')).not.toHaveClass('beta-home-page__welcome');
    expect(screen.getByText('5')).toBeVisible();
    expect(screen.getByText('40%')).toBeVisible();
    expect(screen.getByText('2')).toBeVisible();
    expect(screen.queryByText(/PRO|рейтинг|турнир|быстрая игра/i)).not.toBeInTheDocument();
  });

  it('uses the supplied application actions', () => {
    const onLogout = vi.fn();
    const onOpenRooms = vi.fn();
    const onOpenRules = vi.fn();

    render(
      <MobileHome
        displayName="Player One"
        initials="PO"
        stats={{ games: 5, wins: 2, winRate: 40 }}
        onLogout={onLogout}
        onOpenRooms={onOpenRooms}
        onOpenRules={onOpenRules}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));
    fireEvent.click(screen.getByRole('button', { name: /Открыть комнаты/i }));
    fireEvent.click(screen.getByRole('button', { name: /Правила игры/i }));

    expect(onLogout).toHaveBeenCalledOnce();
    expect(onOpenRooms).toHaveBeenCalledOnce();
    expect(onOpenRules).toHaveBeenCalledOnce();
  });

  it('opens an existing current room through the supplied room navigation', () => {
    const onOpenCurrentRoom = vi.fn();

    render(
      <MobileHome
        displayName="Player One"
        initials="PO"
        stats={{ games: 5, wins: 2, winRate: 40 }}
        currentRoom={{ roomId: 'room-1', code: '248C', statusLabel: 'Матч продолжается' }}
        onLogout={vi.fn()}
        onOpenRooms={vi.fn()}
        onOpenRules={vi.fn()}
        onOpenCurrentRoom={onOpenCurrentRoom}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Комната 248C/i }));
    expect(onOpenCurrentRoom).toHaveBeenCalledWith('room-1');
  });
});
