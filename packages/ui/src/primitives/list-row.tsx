import type { HTMLAttributes, ReactNode } from 'react';

export type ListRowProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'li' | 'button';
  description?: ReactNode;
  leading?: ReactNode;
  title: ReactNode;
  trailing?: ReactNode;
};

export function ListRow({
  as = 'li',
  className,
  description,
  leading,
  title,
  trailing,
  ...props
}: ListRowProps) {
  const Component = as;
  const classes = ['ui-list-row', className ?? ''].filter(Boolean).join(' ');
  const buttonSafetyProps =
    as === 'button' && !('type' in props) ? { type: 'button' as const } : {};

  return (
    <Component {...buttonSafetyProps} {...props} className={classes}>
      {leading ? <span className="ui-list-row__leading">{leading}</span> : null}
      <span className="ui-list-row__content">
        <span className="ui-list-row__title">{title}</span>
        {description ? <span className="ui-list-row__description">{description}</span> : null}
      </span>
      {trailing ? <span className="ui-list-row__trailing">{trailing}</span> : null}
    </Component>
  );
}
