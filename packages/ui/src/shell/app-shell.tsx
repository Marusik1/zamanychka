import type { ComponentPropsWithoutRef, PropsWithChildren, ReactNode } from 'react';

import { BottomNav, type NavigationItem } from '../navigation/bottom-nav.js';
import { TopNav } from '../navigation/top-nav.js';

export type AppShellViewport = 'mobile' | 'desktop';

export type AppShellProps = PropsWithChildren<
  ComponentPropsWithoutRef<'div'> & {
    title: string;
    navigation: readonly NavigationItem[];
    activeNavigationKey?: string;
    viewport?: AppShellViewport;
    eyebrow?: ReactNode;
    navigationAriaLabel?: string;
  }
>;

export function AppShell({
  activeNavigationKey,
  children,
  className,
  eyebrow,
  navigation,
  navigationAriaLabel,
  title,
  viewport = 'desktop',
  ...props
}: AppShellProps) {
  const shellClasses = ['ui-app-shell', `ui-app-shell--${viewport}`, 'ui-canvas', className ?? '']
    .filter(Boolean)
    .join(' ');

  const resolvedNavigationAriaLabel =
    navigationAriaLabel ?? (viewport === 'desktop' ? 'Primary navigation' : 'Bottom navigation');
  const navigationProps =
    activeNavigationKey === undefined
      ? { items: navigation, ariaLabel: resolvedNavigationAriaLabel }
      : {
          items: navigation,
          activeKey: activeNavigationKey,
          ariaLabel: resolvedNavigationAriaLabel,
        };

  const navigationMarkup =
    viewport === 'desktop' ? <TopNav {...navigationProps} /> : <BottomNav {...navigationProps} />;

  return (
    <div {...props} className={shellClasses} data-viewport={viewport}>
      <header className="ui-app-shell__header" role="banner">
        <div className="ui-app-shell__container ui-app-shell__header-inner">
          <div className="ui-app-shell__brand">
            {eyebrow ? <span className="ui-app-shell__eyebrow">{eyebrow}</span> : null}
            <strong className="ui-app-shell__title">{title}</strong>
          </div>
          {viewport === 'desktop' ? navigationMarkup : null}
        </div>
      </header>
      <main className="ui-app-shell__main" role="main">
        <div className="ui-app-shell__container ui-app-shell__content">{children}</div>
      </main>
      {viewport === 'mobile' ? navigationMarkup : null}
    </div>
  );
}
