import { useEffect, useMemo, useState } from 'react';
import { INTRO_ASSETS, type IntroFrameName } from './introSequenceConfig';
import { frameWeights, phaseAt, sceneScale, sceneTranslateY, uiOpacity } from './introSequence';
import { useIntroSequence } from './useIntroSequence';
import './IntroHero.css';

export interface IntroHeroProps {
  onComplete: () => void;
  title?: string;
  ctaLabel?: string;
  className?: string;
  autoStart?: boolean;
  showUi?: boolean;
  onPhaseChange?: (phase: ReturnType<typeof phaseAt>) => void;
}

const frameOrder: IntroFrameName[] = ['idle', 'approach', 'impact', 'result'];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);
  return reduced;
}

function preload(src: string) {
  return new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = image.onerror = () => resolve();
    image.src = src;
  });
}

export function IntroHero({
  onComplete,
  title = 'ЗАМАНУШКА',
  ctaLabel = 'Играть',
  className = '',
  autoStart = false,
  showUi = true,
  onPhaseChange,
}: IntroHeroProps) {
  const reducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);
  const { progress, started, start } = useIntroSequence({ onComplete, reducedMotion });
  const weights = useMemo(() => frameWeights(progress, started), [progress, started]);
  const phase = phaseAt(progress, started);
  const opacity = uiOpacity(progress, started);
  const scale = sceneScale(progress, started);
  const translateY = sceneTranslateY(progress, started);

  useEffect(() => {
    let alive = true;
    const sources = Object.values(INTRO_ASSETS).flatMap((frame) => [frame.mobile, frame.desktop]);
    Promise.all(sources.map(preload)).then(() => {
      if (alive) setReady(true);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (autoStart && ready && !started) start();
  }, [autoStart, ready, start, started]);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [onPhaseChange, phase]);

  return (
    <section
      className={`z-intro ${started ? 'is-running' : 'is-idle'} ${className}`.trim()}
      data-scrub-root
      data-testid="z-intro-experience"
      data-phase={phase}
      aria-label="Заставка игры Заманушка"
    >
      <div
        className="z-intro__scene"
        style={{ transform: `translate3d(0, ${translateY}px, 0) scale(${scale})` }}
        aria-hidden="true"
      >
        {frameOrder.map((name) => (
          <picture
            className="z-intro__frame"
            key={name}
            style={{ opacity: weights[name] }}
          >
            <source media="(max-width: 680px)" srcSet={INTRO_ASSETS[name].mobile} />
            <img data-scrub-frame src={INTRO_ASSETS[name].desktop} alt="" draggable={false} />
          </picture>
        ))}
        <div className="z-intro__vignette" />
      </div>

      {showUi ? (
        <div className="z-intro__ui" style={{ opacity }}>
          <h1 className="z-intro__title">{title}</h1>
          <button
            type="button"
            className="z-intro__play"
            onClick={start}
            disabled={!ready || started}
            aria-label={ready ? `${ctaLabel}. Запустить вступительную анимацию` : 'Загрузка заставки'}
          >
            <span className="z-intro__playGlow" aria-hidden="true" />
            <span className="z-intro__playIcon" aria-hidden="true" />
            <span>{ready ? ctaLabel : 'Загрузка'}</span>
          </button>
        </div>
      ) : null}

      <span className="z-intro__sr" aria-live="polite">
        {started ? 'Вступительная анимация' : ''}
      </span>
    </section>
  );
}
