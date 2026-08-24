import type { HTMLAttributes, ReactNode } from 'react';

export type UserChipProps = HTMLAttributes<HTMLDivElement> & {
  avatar?: ReactNode;
  detail?: ReactNode;
  name: string;
};

export function UserChip({ avatar, className, detail, name, ...props }: UserChipProps) {
  const classes = ['ui-user-chip', className ?? ''].filter(Boolean).join(' ');

  return (
    <div {...props} className={classes}>
      <span className="ui-user-chip__avatar" aria-hidden="true">
        {avatar ?? (
          <span className="ui-user-chip__avatar-fallback">{String(name).slice(0, 1)}</span>
        )}
      </span>
      <span className="ui-user-chip__content">
        <span className="ui-user-chip__name">{name}</span>
        {detail ? <span className="ui-user-chip__detail">{detail}</span> : null}
      </span>
    </div>
  );
}
