import type { HTMLAttributes, ReactNode } from 'react';

type ChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  tone?: ChipTone;
};

export function Chip({ children, className, tone = 'neutral', ...props }: ChipProps) {
  const classes = ['ui-chip', `ui-chip--${tone}`, className ?? ''].filter(Boolean).join(' ');

  return (
    <span {...props} className={classes}>
      {children}
    </span>
  );
}
