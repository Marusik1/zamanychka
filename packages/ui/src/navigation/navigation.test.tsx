import { render, within } from '@testing-library/react';
import type { ComponentPropsWithoutRef } from 'react';
import { describe, expect, it } from 'vitest';

import type { DesktopAppShellProps } from '../app-frame.js';
import { AppShell, DesktopAppShell } from '../app-frame.js';
import * as ui from '../index.js';

type Assert<T extends true> = T;
type ExtraKeys<T, Allowed extends PropertyKey> = Exclude<keyof T, Allowed>;
type DesktopShellAllowedKeys =
  | keyof ComponentPropsWithoutRef<'div'>
  | 'title'
  | 'children'
  | 'navigation'
  | 'activeNavigationKey'
  | 'eyebrow'
  | 'navigationAriaLabel';

type DesktopShellHasNoCustomKeys = Assert<
  ExtraKeys<DesktopAppShellProps, DesktopShellAllowedKeys> extends never ? true : false
>;

const desktopShellHasNoCustomKeys: DesktopShellHasNoCustomKeys = true;

describe('DesktopAppShell shell boundaries', () => {
  it('renders non-game pages in a generic desktop shell without complementary gameplay rails', () => {
    expect(desktopShellHasNoCustomKeys).toBe(true);

    const view = render(
      <DesktopAppShell
        title="Boards Collection"
        navigation={[
          { key: 'overview', label: 'Overview', href: '/overview' },
          { key: 'boards', label: 'Boards', href: '/boards' },
        ]}
        activeNavigationKey="boards"
      >
        <section>
          <h1>Boards Collection</h1>
          <p>Generic desktop content stays inside the primary page region.</p>
        </section>
      </DesktopAppShell>,
    );

    expect(within(view.container).getByRole('banner')).toHaveTextContent('Boards Collection');
    expect(within(view.container).getByRole('main')).toHaveTextContent('Boards Collection');
    expect(within(view.container).queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('uses the main ui package barrel for the canonical desktop shell contract', () => {
    expect(ui.DesktopAppShell).toBe(DesktopAppShell);
    expect(ui.AppFrame).not.toBe(ui.DesktopAppShell);
  });
});

describe('AppShell navigation', () => {
  const items = [
    {
      key: 'home',
      label: 'Home',
      href: '/home',
      icon: <span aria-hidden="true">H</span>,
    },
    {
      key: 'rooms',
      label: 'Rooms',
      href: '/rooms',
      icon: <span aria-hidden="true">R</span>,
    },
    {
      key: 'profile',
      label: 'Profile',
      href: '/profile',
      icon: <span aria-hidden="true">P</span>,
    },
  ] as const;

  it('renders desktop top navigation without mobile bottom navigation after desktop takeover', () => {
    const view = render(
      <AppShell
        viewport="desktop"
        title="Reference Library"
        navigation={items}
        activeNavigationKey="rooms"
        navigationAriaLabel="Section navigation"
      >
        <section>Desktop shell content</section>
      </AppShell>,
    );

    expect(
      within(view.container).getByRole('navigation', { name: 'Section navigation' }),
    ).toHaveClass('ui-top-nav');
    expect(within(view.container).getByRole('link', { name: 'Rooms' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      within(view.container).queryByRole('navigation', { name: 'Bottom navigation' }),
    ).not.toBeInTheDocument();
  });

  it('renders mobile bottom navigation with the active item selected', () => {
    const view = render(
      <AppShell
        viewport="mobile"
        title="Reference Library"
        navigation={items}
        activeNavigationKey="home"
      >
        <section>Mobile shell content</section>
      </AppShell>,
    );

    expect(
      within(view.container).getByRole('navigation', { name: 'Bottom navigation' }),
    ).toHaveClass('ui-bottom-nav');
    expect(within(view.container).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      within(view.container).queryByRole('navigation', { name: 'Primary navigation' }),
    ).not.toBeInTheDocument();
  });

  it('renders icons alongside labels in both navigation patterns', () => {
    const desktopView = render(
      <AppShell
        viewport="desktop"
        title="Reference Library"
        navigation={items}
        activeNavigationKey="home"
      >
        <section>Desktop shell content</section>
      </AppShell>,
    );

    expect(within(desktopView.container).getByText('H')).toHaveAttribute('aria-hidden', 'true');
    expect(within(desktopView.container).getByText('Rooms')).toBeInTheDocument();

    const mobileView = render(
      <AppShell
        viewport="mobile"
        title="Reference Library"
        navigation={items}
        activeNavigationKey="home"
      >
        <section>Mobile shell content</section>
      </AppShell>,
    );

    expect(within(mobileView.container).getByText('P')).toHaveAttribute('aria-hidden', 'true');
    expect(within(mobileView.container).getByText('Profile')).toBeInTheDocument();
  });

  it('keeps keyboard focus on navigation links with real focusable elements', () => {
    const view = render(
      <AppShell
        viewport="desktop"
        title="Reference Library"
        navigation={items}
        activeNavigationKey="home"
      >
        <section>Keyboard shell content</section>
      </AppShell>,
    );

    const link = within(view.container).getByRole('link', { name: 'Rooms' });
    link.focus();

    expect(link).toHaveFocus();
    expect(link).toHaveClass('ui-focus-ring');
  });
});
