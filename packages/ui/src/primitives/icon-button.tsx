import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: ReactNode;
  label: string;
  selected?: boolean;
};

export function IconButton({
  className,
  disabled,
  icon,
  label,
  selected = false,
  type = 'button',
  ...props
}: IconButtonProps) {
  const classes = [
    'ui-icon-button',
    'ui-interactive-hover',
    'ui-focus-ring',
    selected ? 'is-selected' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...props}
      type={type}
      className={classes}
      disabled={disabled}
      aria-label={label}
      data-selected={selected ? 'true' : undefined}
    >
      <span aria-hidden="true" className="ui-icon-button__icon">
        {icon}
      </span>
    </button>
  );
}
