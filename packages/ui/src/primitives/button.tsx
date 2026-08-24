import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'md' | 'lg';

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  selected?: boolean;
};

export function Button({
  children,
  className,
  disabled,
  loading = false,
  selected = false,
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  const resolvedDisabled = disabled || loading;
  const classes = [
    'ui-button',
    `ui-button--${variant}`,
    `ui-button--${size}`,
    'ui-interactive-hover',
    'ui-focus-ring',
    selected ? 'is-selected' : '',
    loading ? 'is-loading' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...props}
      type={type}
      className={classes}
      disabled={resolvedDisabled}
      aria-busy={loading || undefined}
      data-selected={selected ? 'true' : undefined}
    >
      <span className="ui-button__content">
        <span className="ui-button__label">{children}</span>
        <span className="ui-button__spinner" aria-hidden="true" />
      </span>
    </button>
  );
}
