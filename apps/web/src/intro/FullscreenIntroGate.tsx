import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { INTRO_ASSETS } from './introSequenceConfig';
import './fullscreen-intro.css';
import './fullscreen-scrub-portal.css';

export type IntroScrubRenderProps = {
  /** false = keep the existing scrub frozen at progress 0; true = run the existing approved scrub */
  running: boolean;
  /** call this ONLY when the existing scrub/capture sequence is fully complete */
  onComplete: () => void;
};

export type FullscreenIntroGateProps = {
  /** Map this render-prop to the EXISTING working scrub component. Do not rewrite the scrub here. */
  renderScrub: (props: IntroScrubRenderProps) => React.ReactNode;
  /** Called after the scrub finishes. The parent should then mount the normal AppShell/Home. */
  onComplete: () => void;
  posterSrc?: string;
  playLabel?: string;
};

const POSTER_FADE_MS = 140;

type FullscreenScrubPortalProps = {
  active: boolean;
  children: ReactNode;
};

export function FullscreenScrubPortal({ active, children }: FullscreenScrubPortalProps) {
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

function preloadImage(src: string) {
  return new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => {
      void image.decode?.().catch(() => undefined).finally(resolve);
      if (!image.decode) resolve();
    };
    image.onerror = () => resolve();
    image.src = src;
  });
}

function introAssetSources(posterSrc: string) {
  return Array.from(
    new Set([
      posterSrc,
      ...Object.values(INTRO_ASSETS).flatMap((frame) => [frame.mobile, frame.desktop]),
    ]),
  );
}

export function FullscreenIntroGate({
  renderScrub,
  onComplete,
  posterSrc = '/intro/approved-start.png',
  playLabel = 'Играть',
}: FullscreenIntroGateProps) {
  const [running, setRunning] = useState(false);
  const [posterVisible, setPosterVisible] = useState(true);
  const [assetsReady, setAssetsReady] = useState(false);
  const completedRef = useRef(false);
  const fadeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.dataset.introActive = 'true';

    return () => {
      if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      delete document.documentElement.dataset.introActive;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all(introAssetSources(posterSrc).map(preloadImage)).then(() => {
      if (alive) setAssetsReady(true);
    });
    return () => {
      alive = false;
    };
  }, [posterSrc]);

  const start = useCallback(() => {
    if (running || completedRef.current || !assetsReady) return;

    // Start the EXISTING scrub first; fade the poster only after the scrub has entered progress 0.
    setRunning(true);

    fadeTimerRef.current = window.setTimeout(() => {
      setPosterVisible(false);
    }, POSTER_FADE_MS);
  }, [assetsReady, running]);

  const handleScrubComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  return (
    <section className="z-fullscreen-intro" aria-label="Заманушка — заставка">
      <FullscreenScrubPortal active={running}>
        {renderScrub({ running, onComplete: handleScrubComplete })}
      </FullscreenScrubPortal>

      {posterVisible && (
        <div
          className={`z-fullscreen-intro__poster${running ? ' z-fullscreen-intro__poster--leaving' : ''}`}
          aria-hidden="true"
        >
          <img
            className="z-fullscreen-intro__poster-image"
            src={posterSrc}
            alt=""
            draggable={false}
            decoding="async"
            fetchPriority="high"
          />
        </div>
      )}

      {!running && (
        <button
          type="button"
          className="z-fullscreen-intro__play-hitbox"
          onClick={start}
          disabled={!assetsReady}
          aria-label={playLabel}
        >
          <span className="z-fullscreen-intro__sr-only">{playLabel}</span>
        </button>
      )}
    </section>
  );
}
