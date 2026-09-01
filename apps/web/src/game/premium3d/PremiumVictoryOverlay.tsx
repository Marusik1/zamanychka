import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

import { PREMIUM_MOTION } from './motion-tokens.js';
import { tween } from './tween.js';
import type { PremiumVictoryAnimation } from './types.js';

export type PremiumVictoryOverlayHandle = Readonly<{
  reveal: (animation: PremiumVictoryAnimation, signal?: AbortSignal) => Promise<void>;
  clear: () => void;
}>;

export const PremiumVictoryOverlay = forwardRef<PremiumVictoryOverlayHandle>(
  function PremiumVictoryOverlay(_props, forwardedRef) {
    const [content, setContent] = useState<PremiumVictoryAnimation | null>(null);
    const hostRef = useRef<HTMLDivElement | null>(null);
    const cardRef = useRef<HTMLDivElement | null>(null);

    useImperativeHandle(forwardedRef, () => ({
      clear() {
        setContent(null);
        if (hostRef.current) hostRef.current.style.opacity = '0';
      },
      async reveal(animation, signal) {
        setContent(animation);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const host = hostRef.current;
        const card = cardRef.current;
        if (!host || !card) return;

        await tween(PREMIUM_MOTION.victoryOverlayDelayMs, () => undefined, signal);
        await tween(430, (t) => {
          host.style.opacity = String(t);
          const scale = 0.955 + 0.045 * t;
          card.style.opacity = String(t);
          card.style.transform = `translateY(${10 * (1 - t)}px) scale(${scale})`;
        }, signal);
      },
    }), []);

    if (!content) return null;

    const subtitle =
      content.reason === 'HOME_DIAGONAL_COMPLETED'
        ? 'Первым заполнил домашнюю диагональ'
        : 'Остался последним активным игроком';

    return (
      <div ref={hostRef} className="premium-victory-overlay" aria-live="polite">
        <div ref={cardRef} className={`premium-victory-card premium-victory-card--${content.winnerColor.toLowerCase()}`}>
          <div className="premium-victory-card__crown" aria-hidden="true">♛</div>
          <strong>ПОБЕДА!</strong>
          <b>{content.winnerName} победил</b>
          <span>{subtitle}</span>
        </div>
      </div>
    );
  },
);
