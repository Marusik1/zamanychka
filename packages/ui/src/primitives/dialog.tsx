import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  children: ReactNode;
  description?: string;
  onOpenChange?: (open: boolean) => void;
  open: boolean;
  title: string;
}

function getFocusableElements(container: HTMLElement | null) {
  return Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
}

export function Dialog({ children, description, onOpenChange, open, title }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isClosingRef = useRef(false);
  const instanceId = useId().replace(/:/g, '');
  const titleId = `${instanceId}-title`;
  const descriptionId = description ? `${instanceId}-description` : undefined;

  useEffect(() => {
    if (open) {
      isClosingRef.current = false;
      document.body.classList.add('ui-scroll-locked');
      const handleFocusIn = (event: FocusEvent) => {
        if (isClosingRef.current) {
          return;
        }

        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target || !dialogRef.current || dialogRef.current.contains(target)) {
          return;
        }

        const focusable = getFocusableElements(dialogRef.current);
        if (focusable.length > 0) {
          focusable[0]?.focus();
          return;
        }

        dialogRef.current.focus();
      };

      document.addEventListener('focusin', handleFocusIn);

      return () => {
        document.removeEventListener('focusin', handleFocusIn);
        document.body.classList.remove('ui-scroll-locked');
      };
    }

    document.body.classList.remove('ui-scroll-locked');
    previousFocusRef.current?.focus();
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length > 0) {
      focusable[0]?.focus();
      return;
    }

    dialogRef.current?.focus();
  }, [open]);

  if (!open) {
    return null;
  }

  function restoreFocus() {
    previousFocusRef.current?.focus();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      isClosingRef.current = true;
      onOpenChange?.(false);
      restoreFocus();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getFocusableElements(dialogRef.current);
    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const currentElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!currentElement || !dialogRef.current?.contains(currentElement)) {
      event.preventDefault();
      focusableElements[0]?.focus();
      return;
    }

    const activeIndex = focusableElements.findIndex((element) => element === currentElement);
    const nextIndex = event.shiftKey
      ? activeIndex <= 0
        ? focusableElements.length - 1
        : activeIndex - 1
      : activeIndex === focusableElements.length - 1
        ? 0
        : activeIndex + 1;

    event.preventDefault();
    focusableElements[nextIndex]?.focus();
  }

  return (
    <div className="ui-dialog-backdrop" data-state="open">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="ui-dialog ui-panel-surface"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="ui-dialog__header">
          <h2 className="ui-dialog__title" id={titleId}>
            {title}
          </h2>
          {description ? (
            <p className="ui-dialog__description" id={descriptionId}>
              {description}
            </p>
          ) : null}
        </div>
        <div className="ui-dialog__body">{children}</div>
      </div>
    </div>
  );
}
