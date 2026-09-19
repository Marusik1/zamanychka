import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileProfile } from './mobile-profile.js';

describe('MobileProfile', () => {
  it('renders real profile data and readable result presentation only', () => {
    const onOpenRules = vi.fn();
    const onOpenHistory = vi.fn();
    render(<MobileProfile displayName="Player One" initials="PO" stats={{ games: 3, wins: 1, losses: 2, winRate: 33 }} recentMatches={[
      { id: 'win', result: 'WIN', primaryText: 'Победитель: Player One', secondaryText: '2 игрока', meta: '31.08, 18:43' },
      { id: 'loss', result: 'LOSS', primaryText: 'Победитель: Player Two', secondaryText: '2 игрока', meta: '31.08, 17:00' },
      { id: 'surrender', result: 'SURRENDERED', primaryText: 'Против Player Two', secondaryText: '2 игрока', meta: '31.08, 16:00' },
    ]} onOpenRules={onOpenRules} onOpenHistory={onOpenHistory} />);
    expect(screen.getByText('Player One')).toBeVisible();
    for (const value of ['3', '1', '2', '33%']) expect(screen.getByText(value)).toBeVisible();
    expect(screen.getByText('Победа')).toBeVisible();
    expect(screen.getByText('Поражение')).toBeVisible();
    expect(screen.getByText('Сдался')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Все/i }));
    fireEvent.click(screen.getByRole('button', { name: /Правила игры/i }));
    expect(onOpenHistory).toHaveBeenCalledOnce();
    expect(onOpenRules).toHaveBeenCalledOnce();
    expect(screen.queryByText(/rating|рейтинг|достижен|ранг|HOME_DIAGONAL_COMPLETED|LAST_ACTIVE_PLAYER/i)).not.toBeInTheDocument();
  });
});
