import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppFrame, AppShell, DesktopAppShell } from './index.js';

describe('DesktopAppShell', () => {
  const navigation = [
    {
      key: 'overview',
      label: 'Overview',
      href: '/overview',
      icon: <span aria-hidden="true">O</span>,
    },
    {
      key: 'archive',
      label: 'Archive',
      href: '/archive',
      icon: <span aria-hidden="true">A</span>,
    },
  ] as const;

  it('wraps the real desktop shell contract with banner, top navigation, and main landmarks', () => {
    const view = render(
      <DesktopAppShell
        title="Reference Library"
        eyebrow="Curated sections"
        navigation={navigation}
        activeNavigationKey="archive"
      >
        <section aria-label="Page content">
          <h1>Archive</h1>
          <p>Desktop pages stay inside the canonical shell instead of a stale frame wrapper.</p>
        </section>
      </DesktopAppShell>,
    );

    expect(within(view.container).getByRole('banner')).toHaveTextContent('Reference Library');
    expect(
      within(view.container).getByRole('navigation', { name: 'Primary navigation' }),
    ).toHaveClass('ui-top-nav');
    expect(
      within(view.container).queryByRole('navigation', { name: 'Bottom navigation' }),
    ).not.toBeInTheDocument();
    expect(within(view.container).getByRole('main')).toHaveTextContent('Archive');
    expect(within(view.container).queryByRole('complementary')).not.toBeInTheDocument();
  });
});

describe('AppFrame compatibility alias', () => {
  it('remains available as a compatibility alias over the desktop shell contract', () => {
    const view = render(
      <AppFrame
        title="Reference Library"
        navigation={[{ key: 'overview', label: 'Overview', href: '/overview' }]}
      >
        Compatibility
      </AppFrame>,
    );

    expect(within(view.container).getByRole('banner')).toHaveTextContent('Reference Library');
    expect(
      within(view.container).getByRole('navigation', { name: 'Primary navigation' }),
    ).toBeInTheDocument();
    expect(within(view.container).getByRole('main')).toHaveTextContent('Compatibility');
  });
});

describe('AppShell landmarks', () => {
  const navigation = [
    { key: 'home', label: 'Home', href: '/home' },
    { key: 'chat', label: 'Chat', href: '/chat' },
  ] as const;

  it('provides banner, main, and content region landmarks inside a safe shell container', () => {
    const view = render(
      <AppShell
        viewport="mobile"
        title="Reference Library"
        eyebrow="Curated sections"
        navigation={navigation}
        activeNavigationKey="home"
      >
        <section aria-label="Page content">
          <h1>Home</h1>
          <p>Safe page composition for Telegram and browser surfaces.</p>
        </section>
      </AppShell>,
    );

    expect(within(view.container).getByRole('banner')).toBeInTheDocument();
    expect(within(view.container).getByText('Curated sections')).toBeInTheDocument();
    expect(within(view.container).getByRole('main')).toBeInTheDocument();
    expect(within(view.container).getByRole('region', { name: 'Page content' })).toHaveTextContent(
      'Home',
    );
    expect(view.container.querySelector('.ui-app-shell__container')).not.toBeNull();
  });
});
