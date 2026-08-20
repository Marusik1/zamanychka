import type { HTMLAttributes, ReactNode } from 'react';

type StatusTone = 'info' | 'success' | 'warning' | 'danger';

export type StatusProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  tone?: StatusTone;
};

export function Status({ children, className, tone = 'info', ...props }: StatusProps) {
  const classes = ['ui-status', `ui-status--${tone}`, className ?? ''].filter(Boolean).join(' ');

  return (
    <div {...props} className={classes}>
      {children}
    </div>
  );
}
