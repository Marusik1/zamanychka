import type { HTMLAttributes, ReactNode } from 'react';

export type EmptyStateProps = HTMLAttributes<HTMLElement> & {
  action?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
};

export function EmptyState({ action, className, description, title, ...props }: EmptyStateProps) {
  const classes = ['ui-empty-state', className ?? ''].filter(Boolean).join(' ');

  return (
    <section {...props} className={classes}>
      <h2 className="ui-empty-state__title">{title}</h2>
      {description ? <p className="ui-empty-state__description">{description}</p> : null}
      {action ? <div className="ui-empty-state__action">{action}</div> : null}
    </section>
  );
}
