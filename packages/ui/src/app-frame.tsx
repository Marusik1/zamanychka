import type { PropsWithChildren } from 'react';

export type AppFrameProps = PropsWithChildren<{ title: string }>;

export function AppFrame({ children, title }: AppFrameProps) {
  return (
    <div className="app-frame">
      <header className="app-frame__header">
        <span className="app-frame__mark" aria-hidden="true" />
        <strong>{title}</strong>
      </header>
      <main className="app-frame__main">{children}</main>
    </div>
  );
}
