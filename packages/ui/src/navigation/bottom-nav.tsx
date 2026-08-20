import type { ComponentPropsWithoutRef } from 'react';

import type { NavigationItem } from './top-nav.js';

export type { NavigationItem } from './top-nav.js';

export type BottomNavProps = Omit<ComponentPropsWithoutRef<'nav'>, 'aria-label'> & {
  items: readonly NavigationItem[];
  activeKey?: string;
  ariaLabel?: string;
};

export function BottomNav({
  activeKey,
  ariaLabel = 'Bottom navigation',
  className,
  items,
  ...props
}: BottomNavProps) {
  const classes = ['ui-bottom-nav', className ?? ''].filter(Boolean).join(' ');

  return (
    <nav {...props} aria-label={ariaLabel} className={classes}>
      <ul className="ui-bottom-nav__list">
        {items.map((item) => {
          const selected = item.key === activeKey;

          return (
            <li key={item.key} className="ui-bottom-nav__item">
              <a
                href={item.href}
                aria-current={selected ? 'page' : undefined}
                className={[
                  'ui-bottom-nav__link',
                  'ui-interactive-hover',
                  'ui-focus-ring',
                  selected ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {item.icon ? (
                  <span className="ui-bottom-nav__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                ) : null}
                <span className="ui-bottom-nav__label">{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
