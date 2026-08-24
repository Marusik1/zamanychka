import type { ComponentPropsWithoutRef, ReactNode } from 'react';

export interface NavigationItem {
  key: string;
  label: string;
  href: string;
  icon?: ReactNode;
}

export type TopNavProps = Omit<ComponentPropsWithoutRef<'nav'>, 'aria-label'> & {
  items: readonly NavigationItem[];
  activeKey?: string;
  ariaLabel?: string;
};

export function TopNav({
  activeKey,
  ariaLabel = 'Primary navigation',
  className,
  items,
  ...props
}: TopNavProps) {
  const classes = ['ui-top-nav', className ?? ''].filter(Boolean).join(' ');

  return (
    <nav {...props} aria-label={ariaLabel} className={classes}>
      <ul className="ui-top-nav__list">
        {items.map((item) => {
          const selected = item.key === activeKey;

          return (
            <li key={item.key} className="ui-top-nav__item">
              <a
                href={item.href}
                aria-current={selected ? 'page' : undefined}
                className={[
                  'ui-top-nav__link',
                  'ui-interactive-hover',
                  'ui-focus-ring',
                  selected ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {item.icon ? (
                  <span className="ui-top-nav__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                ) : null}
                <span className="ui-top-nav__label">{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
