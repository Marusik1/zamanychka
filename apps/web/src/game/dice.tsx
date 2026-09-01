import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

import { PremiumDieV2 } from './premium-die-v2.js';
import { PremiumDice3D, type PremiumDice3DHandle } from './premium3d/index.js';

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

export type GameDieHandle = Readonly<{
  ready: boolean;
  snapToValue: (value: DieValue) => void;
  throwCommitted: (value: DieValue, signal?: AbortSignal) => Promise<void>;
}>;

export const GameDie = forwardRef<
  GameDieHandle,
  {
    value: DieValue;
    label?: string;
    rolling?: boolean;
  }
>(function GameDie({ value, label = `Выпало ${value}`, rolling = false }, forwardedRef) {
  const premiumRef = useRef<PremiumDice3DHandle | null>(null);
  const [premiumReady, setPremiumReady] = useState(false);

  useImperativeHandle(
    forwardedRef,
    () => ({
      ready: premiumReady,
      snapToValue(nextValue) {
        premiumRef.current?.snapToValue(nextValue);
      },
      async throwCommitted(nextValue, signal) {
        await premiumRef.current?.throwCommitted(nextValue, signal);
      },
    }),
    [premiumReady],
  );

  return (
    <div className="game-die-stack" data-premium-die-ready={premiumReady ? 'true' : undefined}>
      <PremiumDice3D
        ref={premiumRef}
        value={value}
        label={label}
        className={rolling ? 'game-die game-die--rolling' : 'game-die'}
        onReady={() => setPremiumReady(true)}
        onUnavailable={() => setPremiumReady(false)}
      />
      <PremiumDieV2
        value={value}
        label={label}
        rolling={rolling}
        className={
          rolling
            ? 'game-die game-die--rolling game-die__fallback'
            : 'game-die game-die__fallback'
        }
      />
    </div>
  );
});
