import type { PropsWithChildren } from 'react';

export type DesktopAppShellProps = PropsWithChildren<{ title: string }>;
export type AppFrameProps = DesktopAppShellProps;

// EPIC-02 keeps the desktop shell generic. Gameplay-specific side rails belong to future work.
export function DesktopAppShell({ children, title }: DesktopAppShellProps) {
  return (
    <div className="app-frame" data-testid="desktop-app-shell">
      <header className="app-frame__header" data-testid="desktop-app-shell-header">
        <span className="app-frame__mark" aria-hidden="true" />
        <strong>{title}</strong>
      </header>
      <main className="app-frame__main" data-testid="desktop-app-shell-main">
        {children}
      </main>
    </div>
  );
}

// Compatibility alias for existing consumers. DesktopAppShell remains the canonical EPIC-02 shell contract.
export function AppFrame(props: AppFrameProps) {
  return <DesktopAppShell {...props} />;
}
