import { useCallback, useEffect, useId, useLayoutEffect, useReducer, useRef } from 'react';
import type {
  AnimationEvent as ReactAnimationEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type BottomSheetState = 'opening' | 'open' | 'dismissing';

type BottomSheetLabelProps =
  | { ariaLabel: string; title?: undefined }
  | { ariaLabel?: string; title: string };

interface BottomSheetRenderState {
  phase: BottomSheetState;
  rendered: boolean;
}

type BottomSheetAction =
  | { type: 'openRequested' }
  | { type: 'closeRequested' }
  | { type: 'opened' }
  | { type: 'closed' };

function bottomSheetReducer(
  state: BottomSheetRenderState,
  action: BottomSheetAction,
): BottomSheetRenderState {
  switch (action.type) {
    case 'openRequested':
      if (state.rendered && state.phase !== 'dismissing') {
        return state;
      }

      return {
        rendered: true,
        phase: 'opening',
      };
    case 'closeRequested':
      if (!state.rendered || state.phase === 'dismissing') {
        return state;
      }

      return {
        rendered: true,
        phase: 'dismissing',
      };
    case 'opened':
      if (!state.rendered || state.phase !== 'opening') {
        return state;
      }

      return {
        rendered: true,
        phase: 'open',
      };
    case 'closed':
      if (!state.rendered) {
        return state;
      }

      return {
        rendered: false,
        phase: 'open',
      };
  }
}

export type BottomSheetProps = BottomSheetLabelProps & {
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open: boolean;
};

function getFocusableElements(container: HTMLElement | null) {
  return Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
}

function getBottomSheetTransitionDelay() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 160;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160;
}

export function BottomSheet({ ariaLabel, children, onOpenChange, open, title }: BottomSheetProps) {
  const sheetRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isClosingRef = useRef(false);
  const instanceId = useId().replace(/:/g, '');
  const titleId = title ? `${instanceId}-title` : undefined;
  const [{ phase, rendered }, dispatch] = useReducer(bottomSheetReducer, {
    rendered: open,
    phase: 'open',
  });

  useEffect(() => {
    if (open) {
      dispatch({ type: 'openRequested' });
      return;
    }

    if (rendered) {
      dispatch({ type: 'closeRequested' });
    }
  }, [open, rendered]);

  useEffect(() => {
    if (!rendered) {
      document.body.classList.remove('ui-scroll-locked');
      previousFocusRef.current?.focus();
      return;
    }

    isClosingRef.current = phase === 'dismissing';
    document.body.classList.add('ui-scroll-locked');

    const handleFocusIn = (event: FocusEvent) => {
      if (isClosingRef.current) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target || !sheetRef.current || sheetRef.current.contains(target)) {
        return;
      }

      const focusable = getFocusableElements(sheetRef.current);
      if (focusable.length > 0) {
        focusable[0]?.focus();
        return;
      }

      sheetRef.current.focus();
    };

    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.body.classList.remove('ui-scroll-locked');
    };
  }, [phase, rendered]);

  useLayoutEffect(() => {
    if (!rendered || phase === 'dismissing') {
      return;
    }

    if (phase === 'opening') {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }

    const focusable = getFocusableElements(sheetRef.current);
    if (focusable.length > 0) {
      focusable[0]?.focus();
      return;
    }

    sheetRef.current?.focus();
  }, [phase, rendered]);

  function restoreFocus() {
    previousFocusRef.current?.focus();
  }

  const finalizeState = useCallback(
    (currentState: BottomSheetState) => {
      if (currentState === 'opening') {
        dispatch({ type: 'opened' });
        return;
      }

      if (currentState === 'dismissing') {
        dispatch({ type: 'closed' });
        restoreFocus();
      }
    },
    [],
  );

  useEffect(() => {
    if (!rendered) {
      return;
    }

    if (phase === 'open') {
      return;
    }

    const transitionDelay = phase === 'opening' ? 0 : getBottomSheetTransitionDelay();
    const transitionTimer = window.setTimeout(() => {
      finalizeState(phase);
    }, transitionDelay);

    return () => {
      window.clearTimeout(transitionTimer);
    };
  }, [finalizeState, phase, rendered]);

  if (!rendered) {
    return null;
  }

  function dismiss() {
    if (phase === 'dismissing') {
      return;
    }

    isClosingRef.current = true;
    dispatch({ type: 'closeRequested' });
    onOpenChange?.(false);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getFocusableElements(sheetRef.current);
    if (focusableElements.length === 0) {
      event.preventDefault();
      sheetRef.current?.focus();
      return;
    }

    const currentElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!currentElement || !sheetRef.current?.contains(currentElement)) {
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

  function handleBackdropMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      dismiss();
    }
  }

  function handleAnimationEnd(event: ReactAnimationEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    const nextState = phase === 'opening' ? 'open' : phase;
    event.currentTarget.parentElement?.setAttribute('data-state', nextState);
    finalizeState(phase);
  }

  return (
    <div
      className="ui-bottom-sheet-backdrop"
      data-state={phase}
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        ref={sheetRef}
        className="ui-bottom-sheet ui-panel-surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onAnimationEnd={handleAnimationEnd}
      >
        <div className="ui-bottom-sheet__handle" aria-hidden="true" />
        {title ? (
          <h2 className="ui-bottom-sheet__title" id={titleId}>
            {title}
          </h2>
        ) : null}
        <div className="ui-bottom-sheet__body">{children}</div>
      </section>
    </div>
  );
}
