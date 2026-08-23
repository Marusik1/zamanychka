import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthApi } from '../auth/api.js';
import { App } from '../app.js';
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

function renderAuthenticatedApp(hash = '#/') {
  window.location.hash = hash;
  return render(<App createAdapter={adapter} api={authenticatedApi()} />);
}

afterEach(() => {
  window.location.hash = '';
  window.innerWidth = 1024;
});

describe('EPIC-02 shell placeholder routes', () => {
  it('renders the authenticated home placeholder in the shell', async () => {
    renderAuthenticatedApp('#/');

    expect(await screen.findByRole('heading', { name: 'Главная' })).toBeVisible();
    expect(screen.getByText('Этот экран зарезервирован только для проверки оболочки и ритма отступов.')).toBeVisible();
  });

  it('renders the rooms placeholder', async () => {
    renderAuthenticatedApp('#/rooms');

    expect(await screen.findByRole('heading', { name: 'Комнаты' })).toBeVisible();
  });

  it('renders the chat placeholder', async () => {
    renderAuthenticatedApp('#/chat');

    expect(await screen.findByRole('heading', { name: 'Чат' })).toBeVisible();
  });

  it('renders the collection placeholder', async () => {
    renderAuthenticatedApp('#/collection');

    expect(await screen.findByRole('heading', { name: 'Коллекция' })).toBeVisible();
  });

  it('renders the profile placeholder', async () => {
    renderAuthenticatedApp('#/profile');

    expect(await screen.findByRole('heading', { name: 'Профиль' })).toBeVisible();
  });

  it('marks the active desktop shell navigation item for the current placeholder route', async () => {
    renderAuthenticatedApp('#/chat');

    await screen.findByRole('heading', { name: 'Чат' });
    const navigation = await screen.findByRole('navigation', { name: 'Primary navigation' });
    const current = within(navigation).getByRole('link', { name: 'Чат' });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(within(navigation).getByRole('link', { name: 'Главная' })).not.toHaveAttribute('aria-current');
  });

  it('keeps placeholders feature-empty and layout-only', async () => {
    renderAuthenticatedApp('#/rooms');

    await screen.findByRole('heading', { name: 'Комнаты' });
    const main = screen.getByRole('main');
    expect(screen.getByRole('heading', { name: 'Комнаты' })).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Создать комнату' })).not.toBeInTheDocument();
    expect(screen.queryByText('Подбор игроков')).not.toBeInTheDocument();
    expect(main.querySelector('.shell-placeholder-page__scaffold')).not.toBeNull();
  });

  it('does not render gameplay-only three-column topology on non-game placeholders', async () => {
    renderAuthenticatedApp('#/profile');

    const main = await screen.findByRole('main');
    expect(main.querySelector('[data-layout="gameplay-three-column"]')).toBeNull();
    expect(main.querySelector('[data-region="left-rail"]')).toBeNull();
    expect(main.querySelector('[data-region="right-rail"]')).toBeNull();
  });

  it('updates placeholder content and navigation state after hash navigation', async () => {
    renderAuthenticatedApp('#/');

    const chatLink = await screen.findByRole('link', { name: 'Чат' });
    fireEvent.click(chatLink);
    fireEvent(window, new HashChangeEvent('hashchange'));

    expect(await screen.findByRole('heading', { name: 'Чат' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Чат' })).toHaveAttribute('aria-current', 'page');
  });

  it('uses mobile bottom navigation for authenticated placeholder routes below desktop takeover', async () => {
    window.innerWidth = 390;
    renderAuthenticatedApp('#/chat');

    await screen.findByRole('heading', { name: 'Чат' });
    const navigation = await screen.findByRole('navigation', { name: 'Bottom navigation' });
    expect(within(navigation).getByRole('link', { name: 'Чат' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('navigation', { name: 'Primary navigation' })).not.toBeInTheDocument();
  });

  it('uses desktop top navigation for authenticated placeholder routes at desktop takeover and above', async () => {
    window.innerWidth = 1280;
    renderAuthenticatedApp('#/chat');

    await screen.findByRole('heading', { name: 'Чат' });
    const navigation = await screen.findByRole('navigation', { name: 'Primary navigation' });
    expect(within(navigation).getByRole('link', { name: 'Чат' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('navigation', { name: 'Bottom navigation' })).not.toBeInTheDocument();
  });
});
