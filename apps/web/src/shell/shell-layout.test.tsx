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
});

describe('EPIC-02 shell placeholder routes', () => {
  it('renders the authenticated home placeholder in the shell', async () => {
    renderAuthenticatedApp('#/');

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeVisible();
    expect(screen.getByText('This area is reserved for shell and spacing verification only.')).toBeVisible();
  });

  it('renders the rooms placeholder', async () => {
    renderAuthenticatedApp('#/rooms');

    expect(await screen.findByRole('heading', { name: 'Rooms' })).toBeVisible();
  });

  it('renders the chat placeholder', async () => {
    renderAuthenticatedApp('#/chat');

    expect(await screen.findByRole('heading', { name: 'Chat' })).toBeVisible();
  });

  it('renders the collection placeholder', async () => {
    renderAuthenticatedApp('#/collection');

    expect(await screen.findByRole('heading', { name: 'Collection' })).toBeVisible();
  });

  it('renders the profile placeholder', async () => {
    renderAuthenticatedApp('#/profile');

    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeVisible();
  });

  it('marks the active shell navigation item for the current placeholder route', async () => {
    renderAuthenticatedApp('#/chat');

    const navigation = await screen.findByRole('navigation', { name: 'Primary navigation' });
    const current = within(navigation).getByRole('link', { name: 'Chat' });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(within(navigation).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('keeps placeholders feature-empty and layout-only', async () => {
    renderAuthenticatedApp('#/rooms');

    const main = await screen.findByRole('main');
    expect(within(main).getByRole('heading', { name: 'Rooms' })).toBeVisible();
    expect(within(main).queryByRole('list')).not.toBeInTheDocument();
    expect(within(main).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(main).queryByRole('button', { name: 'Create room' })).not.toBeInTheDocument();
    expect(within(main).queryByText('Matchmaking')).not.toBeInTheDocument();
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

    const chatLink = await screen.findByRole('link', { name: 'Chat' });
    fireEvent.click(chatLink);
    fireEvent(window, new HashChangeEvent('hashchange'));

    expect(await screen.findByRole('heading', { name: 'Chat' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Chat' })).toHaveAttribute('aria-current', 'page');
  });
});
