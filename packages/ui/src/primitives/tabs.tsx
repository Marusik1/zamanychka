import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export type TabsItem = {
  disabled?: boolean;
  label: string;
  panel?: ReactNode;
  value: string;
};

export type TabsProps = {
  ariaLabel: string;
  items: TabsItem[];
  onValueChange?: (value: string) => void;
  value: string;
};

export function Tabs({ ariaLabel, items, onValueChange, value }: TabsProps) {
  const instanceId = useId().replace(/:/g, '');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pendingFocusValueRef = useRef<string | null>(null);
  const enabledItems = items.filter((item) => !item.disabled);
  const resolvedSelectedItem =
    items.find((item) => item.value === value && !item.disabled)
    ?? enabledItems[0]
    ?? items.find((item) => item.value === value)
    ?? items[0];
  const resolvedValue = resolvedSelectedItem?.value;

  useEffect(() => {
    if (resolvedValue && pendingFocusValueRef.current === resolvedValue) {
      tabRefs.current[resolvedValue]?.focus();
      pendingFocusValueRef.current = null;
    }
  }, [resolvedValue]);

  function moveSelection(currentValue: string, direction: -1 | 1) {
    const currentIndex = enabledItems.findIndex((item) => item.value === currentValue);
    if (currentIndex === -1 || enabledItems.length === 0) {
      return;
    }

    const nextIndex = (currentIndex + direction + enabledItems.length) % enabledItems.length;
    const nextValue = enabledItems[nextIndex]?.value ?? currentValue;
    pendingFocusValueRef.current = nextValue;
    onValueChange?.(nextValue);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, itemValue: string) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(itemValue, -1);
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(itemValue, 1);
    }
  }

  return (
    <div className="ui-tabs-root">
      <div className="ui-tabs" role="tablist" aria-label={ariaLabel}>
        {items.map((item) => {
          const selected = item.value === resolvedValue;
          const tabId = `${instanceId}-tab-${item.value}`;
          const selectedPanelId = resolvedSelectedItem
            ? `${instanceId}-panel-${resolvedSelectedItem.value}`
            : undefined;
          const classes = [
            'ui-tabs__tab',
            'ui-interactive-hover',
            'ui-focus-ring',
            selected ? 'is-selected' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={item.value}
              id={tabId}
              ref={(node) => {
                tabRefs.current[item.value] = node;
              }}
              type="button"
              role="tab"
              className={classes}
              aria-controls={selected ? selectedPanelId : undefined}
              aria-selected={selected ? 'true' : 'false'}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => onValueChange?.(item.value)}
              onKeyDown={(event) => handleKeyDown(event, item.value)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {resolvedSelectedItem ? (
        <div
          id={`${instanceId}-panel-${resolvedSelectedItem.value}`}
          className="ui-tabs__panel"
          role="tabpanel"
          aria-labelledby={`${instanceId}-tab-${resolvedSelectedItem.value}`}
          tabIndex={0}
        >
          {resolvedSelectedItem.panel}
        </div>
      ) : null}
    </div>
  );
}
