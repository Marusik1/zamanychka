import { type ReactNode, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

import './fullscreen-scrub-portal.css';

type Props = {
  active: boolean;
  children: ReactNode;
};

export function FullscreenScrubPortal({ active, children }: Props) {
  useLayoutEffect(() => {
    if (!active) return;

    const html = document.documentElement;
    const body = document.body;

    const updateViewportHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;

      html.style.setProperty('--zamanushka-viewport-height', `${height}px`);
    };

    updateViewportHeight();

    html.classList.add('zamanushka-scrub-active');
    body.classList.add('zamanushka-scrub-active');

    window.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('resize', updateViewportHeight);

    return () => {
      html.classList.remove('zamanushka-scrub-active');
      body.classList.remove('zamanushka-scrub-active');

      html.style.removeProperty('--zamanushka-viewport-height');

      window.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('resize', updateViewportHeight);
    };
  }, [active]);

  if (!active) return null;

  return createPortal(
    <div className="zScrubViewport">
      <div className="zScrubViewport__stage">{children}</div>
    </div>,
    document.body,
  );
}
