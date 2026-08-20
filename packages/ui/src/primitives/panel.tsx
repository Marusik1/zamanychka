import type { HTMLAttributes, ReactNode } from 'react';

export type PanelProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article';
  children: ReactNode;
  selected?: boolean;
};

export function Panel({
  as = 'div',
  children,
  className,
  selected = false,
  ...props
}: PanelProps) {
  const Component = as;
  const classes = ['ui-panel-surface', selected ? 'is-selected' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <Component {...props} className={classes} data-selected={selected ? 'true' : undefined}>
      {children}
    </Component>
  );
}
