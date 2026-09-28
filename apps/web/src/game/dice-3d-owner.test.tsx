import { render } from '@testing-library/react';
import { createRef } from 'react';
import type { ElementRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { GameDie } from './dice.js';

const mocks = vi.hoisted(() => ({
  beginRoll: vi.fn(),
  throwCommitted: vi.fn(),
  snapToValue: vi.fn(),
  premiumDice3D: vi.fn((props: { ref?: { current: unknown } }) => {
    if (props.ref) {
      props.ref.current = {
        beginRoll: mocks.beginRoll,
        throwCommitted: mocks.throwCommitted,
        snapToValue: mocks.snapToValue,
      };
    }
    return <div data-testid="premium-die" />;
  }),
  premiumDieV2: vi.fn(() => <div data-testid="fallback-die" />),
}));

vi.mock('./premium3d/index.js', () => ({
  PremiumDice3D: mocks.premiumDice3D,
}));

vi.mock('./premium-die-v2.js', () => ({
  PremiumDieV2: mocks.premiumDieV2,
}));

describe('GameDie 3D orientation ownership', () => {
  it('does not let the React rolling prop drive the real 3D mesh orientation', () => {
    render(<GameDie value={4} rolling />);

    expect(mocks.premiumDice3D).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 4,
      }),
      undefined,
    );
    expect(mocks.premiumDice3D.mock.calls.at(-1)?.[0]).not.toHaveProperty('rolling');
    expect(mocks.premiumDieV2).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 4,
        rolling: true,
      }),
      undefined,
    );
  });

  it('keeps beginRoll away from the real 3D die so committed throw remains the only 3D owner', () => {
    const ref = createRef<ElementRef<typeof GameDie>>();
    render(<GameDie ref={ref} value={4} />);

    ref.current?.beginRoll();

    expect(mocks.beginRoll).not.toHaveBeenCalled();
  });
});
