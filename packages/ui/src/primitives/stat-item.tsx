import type { HTMLAttributes, ReactNode } from 'react';

export type StatItemProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
};

export function StatItem({ className, label, value, ...props }: StatItemProps) {
  const classes = ['ui-stat-item', className ?? ''].filter(Boolean).join(' ');

  return (
    <div {...props} className={classes}>
      <span className="ui-stat-item__value">{value}</span>
      <span className="ui-stat-item__label">{label}</span>
    </div>
  );
}
