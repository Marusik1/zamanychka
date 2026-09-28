import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { recordGameplayTelemetry } from './gameplay-telemetry.js';
import { PremiumDieV2 } from './premium-die-v2.js';
import { PremiumDice3D, type PremiumDice3DHandle } from './premium3d/index.js';

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

export type GameDieHandle = Readonly<{
  ready: boolean;
  beginRoll: () => void;
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
  const renderSignatureRef = useRef<Readonly<Record<string, unknown>> | null>(null);

  useEffect(() => {
    const props = { value, rolling, premiumReady, label };
    recordGameplayTelemetry('DICE_MOUNT', { component: 'GameDie', reason: 'GameBoard turn panel rendered', props });
    return () => {
      recordGameplayTelemetry('DICE_UNMOUNT', { component: 'GameDie', reason: 'GameBoard turn panel removed/unmounted', props });
    };
  }, []);

  useEffect(() => {
    const nextSignature = { value, rolling, premiumReady, label };
    const previous = renderSignatureRef.current;
    const changed = !previous
      ? nextSignature
      : Object.fromEntries(Object.entries(nextSignature).filter(([key, next]) => previous[key] !== next));
    if (Object.keys(changed).length > 0) {
      recordGameplayTelemetry('DICE_RENDER_PROPS_CHANGED', {
        component: 'GameDie',
        reason: 'props/state update',
        changed,
        props: nextSignature,
      });
    }
    renderSignatureRef.current = nextSignature;
  });

  useImperativeHandle(
    forwardedRef,
    () => ({
      ready: premiumReady,
      beginRoll() {},
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
        className="game-die"
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
