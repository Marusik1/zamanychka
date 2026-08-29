import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthApi } from '../auth/api.js';
import { App } from '../app.js';
import type { ProfileApi } from '../profile/api.js';
import type { TelegramAdapter } from '../telegram/adapter.js';

function adapter(): TelegramAdapter {
  return {
    isAvailable: false,
    isTelegram: false,
    initData: undefined,
    shellReady: vi.fn(),
    dispose: vi.fn(),
  };
}

function authenticatedApi(): AuthApi {
  return {
    me: vi
      .fn()
      .mockResolvedValue({ user: { id: 'one', displayName: 'One', authProvider: 'DEVELOPMENT' } }),
    loginTelegram: vi.fn(),
    developmentCapability: vi.fn(),
    loginDevelopment: vi.fn(),
    logout: vi.fn(),
  };
}

function profileApi(overrides?: Partial<ProfileApi>): ProfileApi {
  return {
    profile: vi.fn().mockResolvedValue({
      user: {
        id: 'one',
        displayName: 'Алексей Dev',
        telegramUsername: 'alexey_dev',
        avatarUrl: null,
      },
      stats: {
        gamesPlayed: 12,
        wins: 7,
        losses: 5,
        winRate: 7 / 12,
      },
      recentResults: [
        {
          id: 'recent-1',
          matchId: 'match-1',
          startedAt: '2026-08-24T10:00:00.000Z',
          finishedAt: '2026-08-24T10:12:00.000Z',
          participantCount: 4,
          winnerUserId: 'one',
          winnerDisplayName: 'Алексей Dev',
          victoryReason: 'HOME_DIAGONAL_COMPLETED',
          currentUserOutcome: 'WIN',
          participants: [
            { userId: 'one', displayName: 'Алексей Dev', color: 'GREEN' },
            { userId: 'two', displayName: 'Мария', color: 'RED' },
            { userId: 'three', displayName: 'Дмитрий', color: 'BLUE' },
            { userId: 'four', displayName: 'Ольга', color: 'YELLOW' },
          ],
        },
      ],
    }),
    history: vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            id: 'history-1',
            matchId: 'match-11',
            startedAt: '2026-08-20T10:00:00.000Z',
            finishedAt: '2026-08-20T10:08:00.000Z',
            participantCount: 2,
            winnerUserId: 'two',
            winnerDisplayName: 'Мария',
            victoryReason: 'LAST_ACTIVE_PLAYER',
            currentUserOutcome: 'LOSS',
            participants: [
              { userId: 'one', displayName: 'Алексей Dev', color: 'GREEN' },
              { userId: 'two', displayName: 'Мария', color: 'RED' },
            ],
          },
          {
            id: 'history-2',
            matchId: 'match-12',
            startedAt: '2026-08-18T10:00:00.000Z',
            finishedAt: '2026-08-18T10:10:00.000Z',
            participantCount: 3,
            winnerUserId: 'one',
            winnerDisplayName: 'Алексей Dev',
            victoryReason: 'HOME_DIAGONAL_COMPLETED',
            currentUserOutcome: 'WIN',
            participants: [
              { userId: 'one', displayName: 'Алексей Dev', color: 'GREEN' },
              { userId: 'two', displayName: 'Мария', color: 'RED' },
              { userId: 'three', displayName: 'Дмитрий', color: 'BLUE' },
            ],
          },
        ],
        nextCursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'history-3',
            matchId: 'match-13',
            startedAt: '2026-08-15T10:00:00.000Z',
            finishedAt: '2026-08-15T10:12:00.000Z',
            participantCount: 4,
            winnerUserId: 'four',
            winnerDisplayName: 'Ольга',
            victoryReason: 'LAST_ACTIVE_PLAYER',
            currentUserOutcome: 'SURRENDERED',
            participants: [
              { userId: 'one', displayName: 'Алексей Dev', color: 'GREEN' },
              { userId: 'two', displayName: 'Мария', color: 'RED' },
              { userId: 'three', displayName: 'Дмитрий', color: 'BLUE' },
              { userId: 'four', displayName: 'Ольга', color: 'YELLOW' },
            ],
          },
        ],
        nextCursor: null,
      }),
    ...overrides,
  };
}

function renderAuthenticatedApp(hash = '#/', options: { profileApi?: ProfileApi } = {}) {
  window.location.hash = hash;
  return render(
    <App
      createAdapter={adapter}
      api={authenticatedApi()}
      profileApi={options.profileApi ?? profileApi()}
    />,
  );
}

afterEach(() => {
  window.location.hash = '';
  window.innerWidth = 1024;
});

describe('EPIC-08 shell profile and history routes', () => {
  it('keeps existing shell placeholders for non-profile routes', async () => {
    renderAuthenticatedApp('#/rooms');

    expect(await screen.findByRole('heading', { name: 'Комнаты' })).toBeVisible();
    expect(screen.getByText('Раздел появится в следующем этапе.')).toBeVisible();
  });

  it('renders the profile page with stats and recent results', async () => {
    renderAuthenticatedApp('#/profile');

    expect(await screen.findByRole('heading', { name: 'Профиль' })).toBeVisible();
    expect(screen.getByText('@alexey_dev')).toBeVisible();
    expect(screen.getByText('@alexey_dev')).toBeVisible();
    expect(screen.getByText('12')).toBeVisible();
    expect(screen.getByText('7')).toBeVisible();
    expect(screen.getByText('5')).toBeVisible();
    expect(screen.getByText('58%')).toBeVisible();
    expect(screen.getByText('Победа')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Вся история' })).toBeVisible();
  });

  it('renders the empty recent-results state and avatar fallback', async () => {
    renderAuthenticatedApp('#/profile', {
      profileApi: profileApi({
        profile: vi.fn().mockResolvedValue({
          user: {
            id: 'one',
            displayName: 'Алексей Dev',
            telegramUsername: null,
            avatarUrl: null,
          },
          stats: { gamesPlayed: 0, wins: 0, losses: 0, winRate: 0 },
          recentResults: [],
        }),
      }),
    });

    expect(await screen.findByText('АD')).toBeVisible();
    expect(screen.getByText('История пока пуста')).toBeVisible();
    expect(screen.getByText('Здесь появятся результаты завершённых игр.')).toBeVisible();
  });

  it('opens nested history from profile, loads more, and returns back to profile', async () => {
    const api = profileApi();
    renderAuthenticatedApp('#/profile', { profileApi: api });

    fireEvent.click(await screen.findByRole('link', { name: 'Вся история' }));
    fireEvent(window, new HashChangeEvent('hashchange'));

    expect(await screen.findByRole('heading', { name: 'История игр' })).toBeVisible();
    expect(api.history).toHaveBeenNthCalledWith(1, {}, expect.any(AbortSignal));
    expect(screen.getByText('Поражение')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));

    expect(api.history).toHaveBeenNthCalledWith(
      2,
      { cursor: 'cursor-2' },
      expect.any(AbortSignal),
    );
    expect(await screen.findByText('Сдался')).toBeVisible();
    expect(await screen.findAllByTestId('profile-result-card')).toHaveLength(3);

    fireEvent.click(screen.getByRole('link', { name: 'Назад в профиль' }));
    fireEvent(window, new HashChangeEvent('hashchange'));

    expect(await screen.findByRole('heading', { name: 'Профиль' })).toBeVisible();
  });

  it('keeps profile navigation active for nested history without adding a permanent history nav item', async () => {
    renderAuthenticatedApp('#/profile/history');

    expect(await screen.findByRole('heading', { name: 'История игр' })).toBeVisible();

    const topNav = screen.getByRole('navigation', { name: 'Primary navigation' });
    expect(within(topNav).getByRole('link', { name: 'Профиль' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(topNav).queryByRole('link', { name: 'История игр' })).not.toBeInTheDocument();

    const main = screen.getByRole('main');
    expect(main.querySelector('[data-layout="gameplay-three-column"]')).toBeNull();
    expect(main.querySelector('[data-region="left-rail"]')).toBeNull();
    expect(main.querySelector('[data-region="right-rail"]')).toBeNull();
  });

  it('uses mobile bottom navigation with profile active on nested history', async () => {
    window.innerWidth = 390;
    renderAuthenticatedApp('#/profile/history');

    expect(await screen.findByRole('heading', { name: 'История игр' })).toBeVisible();
    const navigation = screen.getByRole('navigation', { name: 'Bottom navigation' });
    expect(within(navigation).getByRole('link', { name: 'Профиль' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
