import type { ComponentPropsWithoutRef, PropsWithChildren, ReactNode } from 'react';

import { AppShell, type AppShellProps, type AppShellViewport } from './shell/app-shell.js';

type DesktopAppShellBaseProps = ComponentPropsWithoutRef<'div'> & {
  title: string;
  navigation: AppShellProps['navigation'];
  activeNavigationKey?: string;
  eyebrow?: ReactNode;
  navigationAriaLabel?: string;
};

export type DesktopAppShellProps = PropsWithChildren<DesktopAppShellBaseProps>;
export type AppFrameProps = DesktopAppShellProps;

// EPIC-02 keeps the desktop shell generic. Gameplay-specific side rails belong to future work.
export function DesktopAppShell(props: DesktopAppShellProps) {
  return <AppShell {...props} viewport="desktop" />;
}

export type { AppShellProps, AppShellViewport };
export { AppShell } from './shell/app-shell.js';

// Compatibility alias for existing consumers. DesktopAppShell remains the canonical EPIC-02 shell contract.
export function AppFrame(props: AppFrameProps) {
  return <DesktopAppShell {...props} />;
}
