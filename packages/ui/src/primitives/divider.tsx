import type { HTMLAttributes } from 'react';

export type DividerProps = HTMLAttributes<HTMLHRElement> & {
  label?: string;
};

export function Divider({ className, label, ...props }: DividerProps) {
  const classes = ['ui-divider', className ?? ''].filter(Boolean).join(' ');

  return <hr {...props} className={classes} role="separator" aria-label={label} />;
}
