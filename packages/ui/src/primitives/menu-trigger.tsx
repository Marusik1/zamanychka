import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type MenuTriggerProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  ariaLabel: string;
  controls?: string;
  children: ReactNode;
  expanded?: boolean;
  popup?: 'menu' | 'listbox' | 'dialog';
};

export function MenuTrigger({
  ariaLabel,
  children,
  className,
  controls,
  expanded,
  popup = 'menu',
  type = 'button',
  ...props
}: MenuTriggerProps) {
  const classes = ['ui-menu-trigger', 'ui-interactive-hover', 'ui-focus-ring', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...props}
      type={type}
      className={classes}
      aria-label={ariaLabel}
      aria-controls={controls}
      aria-expanded={expanded}
      aria-haspopup={popup}
    >
      <span className="ui-menu-trigger__label" aria-hidden="true">
        {children}
      </span>
    </button>
  );
}
