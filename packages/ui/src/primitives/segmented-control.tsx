import { forwardRef, useEffect, useRef } from 'react';
import type { ButtonHTMLAttributes, KeyboardEvent } from 'react';

export interface SegmentedControlItem {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface SegmentedControlProps {
  ariaLabel: string;
  items: SegmentedControlItem[];
  onValueChange?: (value: string) => void;
  value: string;
}

type SegmentedControlOptionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>;

const SegmentedControlOption = forwardRef<HTMLButtonElement, SegmentedControlOptionProps>(
  function SegmentedControlOption({ className, disabled, ...props }, ref) {
    return <button {...props} ref={ref} type="button" className={className} disabled={disabled} />;
  },
);

export function SegmentedControl({
  ariaLabel,
  items,
  onValueChange,
  value,
}: SegmentedControlProps) {
  const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pendingFocusValueRef = useRef<string | null>(null);
  const resolvedValue =
    items.find((item) => item.value === value && !item.disabled)?.value ??
    items.find((item) => !item.disabled)?.value ??
    items[0]?.value;
  const enabledItems = items.filter((item) => !item.disabled);

  useEffect(() => {
    if (resolvedValue && pendingFocusValueRef.current === resolvedValue) {
      optionRefs.current[resolvedValue]?.focus();
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
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(itemValue, -1);
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(itemValue, 1);
    }
  }

  return (
    <div className="ui-segmented-control" role="radiogroup" aria-label={ariaLabel}>
      {items.map((item) => {
        const selected = item.value === resolvedValue;
        const classes = [
          'ui-segmented-control__option',
          'ui-interactive-hover',
          'ui-focus-ring',
          selected ? 'is-selected' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <SegmentedControlOption
            key={item.value}
            ref={(node) => {
              optionRefs.current[item.value] = node;
            }}
            role="radio"
            aria-checked={selected ? 'true' : 'false'}
            className={classes}
            disabled={item.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange?.(item.value)}
            onKeyDown={(event) => handleKeyDown(event, item.value)}
          >
            {item.label}
          </SegmentedControlOption>
        );
      })}
    </div>
  );
}
